//! Exchanges a Creem license key for an offline `arkhe/entitlement/v1` token.
//! Holds the Creem secret API key and the Ed25519 signing key; neither ever
//! reaches the CLI. Creem enforces activation limits; this service only signs.
use anyhow::Context;
use arkhe_verify_core::entitlement::{self, Entitlement, PROFILE};
use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use clap::{Parser, Subcommand};
use ed25519_dalek::SigningKey;
use serde::Deserialize;
use std::{collections::HashMap, sync::Arc};

#[derive(Parser)]
#[command(name = "arkhe-license-issuer")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Print a new signing seed (keep secret) and its public key (bake into the CLI).
    Keygen,
    /// Serve POST /v1/activate using the environment configuration.
    Serve,
    /// Sign an entitlement by hand for an air-gapped customer.
    Sign {
        #[arg(long)]
        product: String,
        #[arg(long)]
        tier: String,
        #[arg(long)]
        license_id: String,
        #[arg(long, default_value = "manual")]
        instance_id: String,
        #[arg(long, default_value = "prod")]
        mode: String,
        /// Unix seconds; omit for no expiry.
        #[arg(long)]
        expires_at: Option<u64>,
    },
}

pub struct Config {
    pub creem_base: String,
    pub creem_key: String,
    pub signing: SigningKey,
    /// Creem product id -> (product, tier).
    pub products: HashMap<String, (String, String)>,
}

impl Config {
    fn from_env() -> anyhow::Result<Self> {
        let products = std::env::var("ARKHE_LICENSE_PRODUCTS")
            .context("ARKHE_LICENSE_PRODUCTS (prod_x=p1:personal,...)")?;
        Ok(Self {
            creem_base: std::env::var("CREEM_API_BASE")
                .unwrap_or_else(|_| "https://api.creem.io".into()),
            creem_key: std::env::var("CREEM_API_KEY").context("CREEM_API_KEY")?,
            signing: signing_key_from_env()?,
            products: parse_products(&products)?,
        })
    }
}

fn signing_key_from_env() -> anyhow::Result<SigningKey> {
    let seed: [u8; 32] = hex::decode(
        std::env::var("ARKHE_LICENSE_SIGNING_KEY").context("ARKHE_LICENSE_SIGNING_KEY")?,
    )?
    .try_into()
    .map_err(|_| anyhow::anyhow!("ARKHE_LICENSE_SIGNING_KEY must be 32 bytes hex"))?;
    Ok(SigningKey::from_bytes(&seed))
}

pub fn parse_products(spec: &str) -> anyhow::Result<HashMap<String, (String, String)>> {
    spec.split(',')
        .filter(|s| !s.trim().is_empty())
        .map(|entry| {
            let (id, rest) = entry
                .trim()
                .split_once('=')
                .context("expected id=product:tier")?;
            let (product, tier) = rest.split_once(':').context("expected product:tier")?;
            anyhow::ensure!(entitlement::TIERS.contains(&tier), "unknown tier {tier}");
            Ok((id.into(), (product.into(), tier.into())))
        })
        .collect()
}

/// Subset of Creem's `LicenseEntity` the issuer relies on.
#[derive(Deserialize)]
pub struct CreemLicense {
    pub id: String,
    pub mode: String,
    pub product_id: String,
    pub status: String,
    pub expires_at: Option<String>,
    pub instance: Option<CreemInstance>,
}
#[derive(Deserialize)]
pub struct CreemInstance {
    pub id: String,
    pub status: String,
}

/// Pure mapping from an activated Creem license to a signed token.
pub fn issue(
    license: &CreemLicense,
    cfg: &Config,
    now: u64,
) -> Result<entitlement::Token, &'static str> {
    let instance = license
        .instance
        .as_ref()
        .filter(|i| i.status == "active")
        .ok_or("license has no active instance")?;
    if license.status != "active" {
        return Err("license is not active");
    }
    let (product, tier) = cfg
        .products
        .get(&license.product_id)
        .ok_or("license product is not sold as an Arkhe kit")?;
    let expires_at = match &license.expires_at {
        None => None,
        Some(s) => Some(
            chrono::DateTime::parse_from_rfc3339(s)
                .map_err(|_| "unparseable license expiry")?
                .timestamp()
                .try_into()
                .map_err(|_| "license expiry before epoch")?,
        ),
    };
    let e = Entitlement {
        profile: PROFILE.into(),
        product: product.clone(),
        tier: tier.clone(),
        mode: if license.mode == "prod" {
            "prod"
        } else {
            "test"
        }
        .into(),
        license_id: license.id.clone(),
        instance_id: instance.id.clone(),
        issued_at: now,
        expires_at,
        key_id: hex::encode(cfg.signing.verifying_key().to_bytes()),
    };
    entitlement::sign(&e, &cfg.signing)
}

#[derive(Deserialize)]
struct ActivateRequest {
    key: String,
    instance_name: String,
}

type Reply = (StatusCode, Json<serde_json::Value>);

fn refuse(code: StatusCode, msg: &str) -> Reply {
    (code, Json(serde_json::json!({ "error": msg })))
}

async fn activate(
    State((cfg, http)): State<(Arc<Config>, reqwest::Client)>,
    Json(req): Json<ActivateRequest>,
) -> Reply {
    let key = req.key.trim();
    let name: String = req.instance_name.chars().take(64).collect();
    if key.is_empty() || key.len() > 128 || name.trim().is_empty() {
        return refuse(
            StatusCode::BAD_REQUEST,
            "key and instance_name are required",
        );
    }
    let resp = http
        .post(format!("{}/v1/licenses/activate", cfg.creem_base))
        .header("x-api-key", &cfg.creem_key)
        .json(&serde_json::json!({ "key": key, "instance_name": name }))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await;
    let resp = match resp {
        Ok(r) => r,
        Err(_) => return refuse(StatusCode::BAD_GATEWAY, "checkout provider unreachable"),
    };
    match resp.status().as_u16() {
        200..=299 => {}
        400 | 404 => return refuse(StatusCode::FORBIDDEN, "license key not accepted"),
        // Includes activation-limit refusals; the provider's text is not echoed.
        403 | 409 | 422 => return refuse(StatusCode::FORBIDDEN, "license cannot be activated"),
        s => {
            eprintln!("creem activate returned {s}");
            return refuse(StatusCode::BAD_GATEWAY, "checkout provider error");
        }
    }
    let license: CreemLicense = match resp.json().await {
        Ok(l) => l,
        Err(_) => return refuse(StatusCode::BAD_GATEWAY, "unexpected provider response"),
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    match issue(&license, &cfg, now) {
        Ok(token) => (StatusCode::OK, Json(serde_json::to_value(token).unwrap())),
        Err(msg) => refuse(StatusCode::FORBIDDEN, msg),
    }
}

pub fn router(cfg: Arc<Config>) -> Router {
    Router::new()
        .route("/v1/activate", post(activate))
        .layer(axum::extract::DefaultBodyLimit::max(4096))
        .with_state((cfg, reqwest::Client::new()))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Keygen => {
            let mut seed = [0u8; 32];
            getrandom::getrandom(&mut seed).map_err(|e| anyhow::anyhow!("{e}"))?;
            let key = SigningKey::from_bytes(&seed);
            println!("ARKHE_LICENSE_SIGNING_KEY={}", hex::encode(seed));
            println!(
                "ARKHE_LICENSE_PUBKEYS={}",
                hex::encode(key.verifying_key().to_bytes())
            );
        }
        Command::Sign {
            product,
            tier,
            license_id,
            instance_id,
            mode,
            expires_at,
        } => {
            let signing = signing_key_from_env()?;
            let e = Entitlement {
                profile: PROFILE.into(),
                product,
                tier,
                mode,
                license_id,
                instance_id,
                issued_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)?
                    .as_secs(),
                expires_at,
                key_id: hex::encode(signing.verifying_key().to_bytes()),
            };
            let token = entitlement::sign(&e, &signing).map_err(anyhow::Error::msg)?;
            println!("{}", serde_json::to_string(&token)?);
        }
        Command::Serve => {
            let cfg = Arc::new(Config::from_env()?);
            let listen =
                std::env::var("ARKHE_ISSUER_LISTEN").unwrap_or_else(|_| "127.0.0.1:8790".into());
            let listener = tokio::net::TcpListener::bind(&listen).await?;
            eprintln!(
                "arkhe-license-issuer listening on {listen} -> {}",
                cfg.creem_base
            );
            axum::serve(listener, router(cfg)).await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(base: String) -> Config {
        Config {
            creem_base: base,
            creem_key: "creem_test_mock".into(),
            signing: SigningKey::from_bytes(&[5; 32]),
            products: parse_products("prod_team=p1:team").unwrap(),
        }
    }
    fn license(product: &str, status: &str, instance: Option<&str>) -> CreemLicense {
        CreemLicense {
            id: "lic_1".into(),
            mode: "test".into(),
            product_id: product.into(),
            status: status.into(),
            expires_at: Some("2030-01-01T00:00:00.000Z".into()),
            instance: instance.map(|s| CreemInstance {
                id: "ins_1".into(),
                status: s.into(),
            }),
        }
    }

    #[test]
    fn maps_active_license_to_verifiable_token() {
        let c = cfg(String::new());
        let t = issue(
            &license("prod_team", "active", Some("active")),
            &c,
            1_800_000_000,
        )
        .unwrap();
        let pk = c.signing.verifying_key().to_bytes();
        let e = entitlement::verify(&serde_json::to_vec(&t).unwrap(), &[pk], 1_800_000_000, true)
            .unwrap();
        assert_eq!((e.tier.as_str(), e.mode.as_str()), ("team", "test"));
        assert_eq!(e.expires_at, Some(1_893_456_000));
    }

    #[test]
    fn refuses_unknown_products_and_inactive_licenses() {
        let c = cfg(String::new());
        assert!(issue(&license("prod_other", "active", Some("active")), &c, 0).is_err());
        assert!(issue(&license("prod_team", "disabled", Some("active")), &c, 0).is_err());
        assert!(issue(&license("prod_team", "active", Some("deactivated")), &c, 0).is_err());
        assert!(issue(&license("prod_team", "active", None), &c, 0).is_err());
        assert!(parse_products("prod_x=p1:enterprise").is_err());
    }

    /// Full HTTP path against a mock Creem that checks the secret header.
    #[tokio::test]
    async fn activate_endpoint_round_trip_with_mock_creem() {
        async fn mock(
            headers: axum::http::HeaderMap,
            Json(b): Json<serde_json::Value>,
        ) -> (StatusCode, Json<serde_json::Value>) {
            if headers.get("x-api-key").map(|v| v.as_bytes()) != Some(b"creem_test_mock") {
                return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({})));
            }
            if b["key"] != "GOOD-KEY" {
                return (StatusCode::NOT_FOUND, Json(serde_json::json!({})));
            }
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "id": "lic_1", "mode": "test", "object": "license", "product_id": "prod_team",
                    "status": "active", "key": "GOOD-KEY", "activation": 1, "activation_limit": 3,
                    "expires_at": null, "created_at": "2026-10-29T00:00:00.000Z",
                    "instance": { "id": "ins_9", "mode": "test", "object": "license-instance",
                        "name": b["instance_name"], "status": "active",
                        "created_at": "2026-10-29T00:00:00.000Z" }
                })),
            )
        }
        let creem = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let creem_addr = creem.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(
                creem,
                Router::new().route("/v1/licenses/activate", post(mock)),
            )
            .await
            .unwrap()
        });
        let c = Arc::new(cfg(format!("http://{creem_addr}")));
        let pk = c.signing.verifying_key().to_bytes();
        let issuer = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let issuer_addr = issuer.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(issuer, router(c)).await.unwrap() });

        let http = reqwest::Client::new();
        let call = |key: &'static str| {
            http.post(format!("http://{issuer_addr}/v1/activate"))
                .json(&serde_json::json!({ "key": key, "instance_name": "ci" }))
                .send()
        };
        let ok = call("GOOD-KEY").await.unwrap();
        assert_eq!(ok.status(), 200);
        let e =
            entitlement::verify(&ok.bytes().await.unwrap(), &[pk], 1_900_000_000, true).unwrap();
        assert_eq!((e.instance_id.as_str(), e.expires_at), ("ins_9", None));
        assert_eq!(call("BAD-KEY").await.unwrap().status(), 403);
    }
}
