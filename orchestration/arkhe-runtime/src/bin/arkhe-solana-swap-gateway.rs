//! Standalone Axum HTTP server and offline bundle verifier for the Arkhe x 0x Solana Swap backend.
//!
//! Usage:
//!   ARKHE_SOLANA_SWAP_TOKEN=<secret> arkhe-solana-swap-gateway serve \
//!       --bind 127.0.0.1:8090 \
//!       --db ops/local/solana-swap/state.sqlite \
//!       --policy config/solana-swap-policy.json \
//!       [--keys-dir ops/local/solana-swap/keys] \
//!       [--extra-0x-keys config/extra-0x-keys.json]
//!
//!   arkhe-solana-swap-gateway verify-bundle \
//!       --bundle receipt-bundle.json \
//!       --public-keys public-keys.json

use std::collections::BTreeMap;
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use arkhe_kernel::solana_swap_sqlite::SqliteSolanaSwapStore;
use arkhe_runtime::solana_swap_gateway::{
    openapi_spec, router, validate_solana_swap_policy, verify_solana_swap_confirmation_receipt,
    verify_solana_swap_receipt_bundle, PublicKeysDocument, SignedConfirmationReceipt,
    SolanaSwapGatewayState, SolanaSwapOfflineBundle,
};
use arkhe_runtime::solana_swap_upstream::{
    AltObserverSigner, SolanaRpcReadOnlyClient, ZeroXSwapClient,
};
use arkhe_verify_core::rfc9421::official_0x_prod_keys;
use arkhe_verify_core::solana_swap::SolanaSwapPolicy;
use clap::{Parser, Subcommand};
use ed25519_dalek::{SigningKey, VerifyingKey};
use serde_json::json;

#[derive(Parser)]
#[command(
    name = "arkhe-solana-swap-gateway",
    about = "Governed Rust HTTP gateway and offline verifier for Arkhe x 0x Solana swaps (zero real signatures, zero broadcast)"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the governed HTTP gateway backed by durable SQLite WAL.
    Serve {
        /// Listen address (e.g. 127.0.0.1:8090).
        #[arg(long, default_value = "127.0.0.1:8090")]
        bind: SocketAddr,
        /// Path to the durable SQLite WAL database file.
        #[arg(long)]
        db: PathBuf,
        /// Path to the server-pinned SolanaSwapPolicy JSON file.
        #[arg(long)]
        policy: PathBuf,
        /// Optional directory to load/persist Ed25519 signing seeds (auth, receipt, checkpoint).
        #[arg(long)]
        keys_dir: Option<PathBuf>,
        /// Optional JSON file mapping extra trusted 0x key IDs to 64-hex Ed25519 public keys.
        #[arg(long)]
        extra_0x_keys: Option<PathBuf>,
        /// Upstream 0x API base URL for shadow read-only quotes (activated when ZEROX_API_KEY env var is set).
        #[arg(long, default_value = "https://api.0x.org")]
        zerox_base_url: String,
        /// Optional read-only Solana JSON-RPC URL for finalized blockhash, ALT fetch, and getTransaction reconciliation.
        #[arg(long)]
        solana_rpc_url: Option<String>,
        /// Optional ALT observer key id (activated when ARKHE_ALT_OBSERVER_KEY_HEX env var is set).
        #[arg(long)]
        alt_observer_key_id: Option<String>,
    },
    /// Verify an exported SolanaSwapOfflineBundle completely offline against pinned public keys.
    VerifyBundle {
        /// Path to the exported SolanaSwapOfflineBundle JSON file.
        #[arg(long)]
        bundle: PathBuf,
        /// Path to the pinned PublicKeysDocument JSON file.
        #[arg(long)]
        public_keys: PathBuf,
    },
    /// Verify an exported SignedConfirmationReceipt (Evidence #3) completely offline.
    VerifyConfirmation {
        /// Path to the exported SignedConfirmationReceipt JSON file.
        #[arg(long)]
        confirmation: PathBuf,
        /// Path to the pinned PublicKeysDocument JSON file.
        #[arg(long)]
        public_keys: PathBuf,
    },
    /// Validate a SolanaSwapPolicy JSON file and print its canonical BLAKE3 policyDigest.
    ValidatePolicy {
        /// Path to the SolanaSwapPolicy JSON file.
        #[arg(long)]
        policy: PathBuf,
    },
    /// Print the gateway's OpenAPI 3.1.0 specification as JSON.
    PrintOpenapi,
}

fn decode_hex_32(hex_str: &str, label: &str) -> Result<[u8; 32], String> {
    let raw = hex::decode(hex_str.trim()).map_err(|e| format!("invalid hex for {label}: {e}"))?;
    raw.try_into()
        .map_err(|_| format!("{label} must be exactly 32 bytes (64 hex chars)"))
}

fn load_or_create_signing_key(
    env_var: &str,
    keys_dir: Option<&Path>,
    file_name: &str,
) -> Result<SigningKey, String> {
    if let Ok(val) = std::env::var(env_var) {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            let seed = decode_hex_32(trimmed, env_var)?;
            return Ok(SigningKey::from_bytes(&seed));
        }
    }
    if let Some(dir) = keys_dir {
        fs::create_dir_all(dir)
            .map_err(|e| format!("failed to create keys_dir {}: {e}", dir.display()))?;
        let path = dir.join(file_name);
        if path.exists() {
            let text = fs::read_to_string(&path)
                .map_err(|e| format!("failed reading key {}: {e}", path.display()))?;
            let seed = decode_hex_32(&text, file_name)?;
            return Ok(SigningKey::from_bytes(&seed));
        }
        // Generate new random 32-byte seed using two UUIDv4 values (OS CSPRNG via uuid::v4)
        let mut seed = [0u8; 32];
        seed[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
        seed[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
        fs::write(&path, hex::encode(seed))
            .map_err(|e| format!("failed writing key {}: {e}", path.display()))?;
        return Ok(SigningKey::from_bytes(&seed));
    }
    // Ephemeral in-memory key via OS CSPRNG
    let mut seed = [0u8; 32];
    seed[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    seed[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    Ok(SigningKey::from_bytes(&seed))
}

fn load_extra_0x_keys(path: &Path) -> Result<BTreeMap<String, [u8; 32]>, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("failed reading extra 0x keys {}: {e}", path.display()))?;
    let parsed: BTreeMap<String, String> = serde_json::from_str(&raw)
        .map_err(|e| format!("invalid extra 0x keys JSON: {e}"))?;
    let mut out = BTreeMap::new();
    for (kid, pub_hex) in parsed {
        let bytes = decode_hex_32(&pub_hex, &kid)?;
        VerifyingKey::from_bytes(&bytes)
            .map_err(|_| format!("invalid Ed25519 public key for {kid}"))?;
        out.insert(kid, bytes);
    }
    Ok(out)
}

fn run_verify_bundle(bundle_path: &Path, keys_path: &Path) -> Result<(), String> {
    let bundle_raw = fs::read_to_string(bundle_path)
        .map_err(|e| format!("failed reading bundle {}: {e}", bundle_path.display()))?;
    let bundle: SolanaSwapOfflineBundle = serde_json::from_str(&bundle_raw)
        .map_err(|e| format!("invalid bundle JSON: {e}"))?;

    let keys_raw = fs::read_to_string(keys_path)
        .map_err(|e| format!("failed reading public keys {}: {e}", keys_path.display()))?;
    let keys: PublicKeysDocument = serde_json::from_str(&keys_raw)
        .map_err(|e| format!("invalid public keys JSON: {e}"))?;

    let auth_vk = VerifyingKey::from_bytes(&decode_hex_32(
        &keys.auth_public_key_hex,
        "authPublicKeyHex",
    )?)
    .map_err(|_| "invalid auth VerifyingKey".to_string())?;
    let receipt_vk = VerifyingKey::from_bytes(&decode_hex_32(
        &keys.receipt_public_key_hex,
        "receiptPublicKeyHex",
    )?)
    .map_err(|_| "invalid receipt VerifyingKey".to_string())?;
    let checkpoint_vk = VerifyingKey::from_bytes(&decode_hex_32(
        &keys.checkpoint_public_key_hex,
        "checkpointPublicKeyHex",
    )?)
    .map_err(|_| "invalid checkpoint VerifyingKey".to_string())?;

    verify_solana_swap_receipt_bundle(&bundle, &auth_vk, &receipt_vk, &checkpoint_vk)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "verified": true,
            "receiptId": bundle.receipt_id,
            "provenance": bundle.receipt.provenance,
            "decisionAuthority": bundle.receipt.decision_authority,
            "policyVerdict": bundle.receipt.policy_verdict,
            "reasonCode": bundle.receipt.reason_code,
            "leafIndex": bundle.leaf_index,
            "leafCount": bundle.checkpoint.payload.leaf_count,
            "mmrRootHex": bundle.checkpoint.payload.root_hex,
            "realSignaturesProduced": bundle.receipt.real_signatures_produced,
            "broadcastCalls": bundle.receipt.broadcast_calls,
        }))
        .unwrap()
    );
    Ok(())
}

fn run_verify_confirmation(confirmation_path: &Path, keys_path: &Path) -> Result<(), String> {
    let conf_raw = fs::read_to_string(confirmation_path)
        .map_err(|e| format!("failed reading confirmation {}: {e}", confirmation_path.display()))?;
    let signed: SignedConfirmationReceipt = serde_json::from_str(&conf_raw)
        .map_err(|e| format!("invalid confirmation JSON: {e}"))?;

    let keys_raw = fs::read_to_string(keys_path)
        .map_err(|e| format!("failed reading public keys {}: {e}", keys_path.display()))?;
    let keys: PublicKeysDocument = serde_json::from_str(&keys_raw)
        .map_err(|e| format!("invalid public keys JSON: {e}"))?;

    let receipt_vk = VerifyingKey::from_bytes(&decode_hex_32(
        &keys.receipt_public_key_hex,
        "receiptPublicKeyHex",
    )?)
    .map_err(|_| "invalid receipt VerifyingKey".to_string())?;

    verify_solana_swap_confirmation_receipt(&signed, &receipt_vk)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "verified": true,
            "receiptId": signed.receipt.receipt_id,
            "authId": signed.receipt.auth_id,
            "status": signed.receipt.reconciliation.status,
            "reasonCode": signed.receipt.reconciliation.reason_code,
            "txSignature": signed.receipt.reconciliation.tx_signature,
            "slot": signed.receipt.reconciliation.slot,
            "exactMessageMatch": signed.receipt.reconciliation.exact_message_match,
            "actualInputAssetDebit": signed.receipt.reconciliation.actual_input_asset_debit,
            "actualOutputNetCredit": signed.receipt.reconciliation.actual_output_net_credit,
        }))
        .unwrap()
    );
    Ok(())
}

fn run_validate_policy(policy_path: &Path) -> Result<(), String> {
    let raw = fs::read_to_string(policy_path)
        .map_err(|e| format!("failed reading policy {}: {e}", policy_path.display()))?;
    let policy: SolanaSwapPolicy = serde_json::from_str(&raw)
        .map_err(|e| format!("invalid SolanaSwapPolicy JSON: {e}"))?;
    let digest = validate_solana_swap_policy(&policy)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "valid": true,
            "policyId": policy.policy_id,
            "network": policy.network,
            "policyDigest": digest,
            "coveredSwapProgramCount": policy.covered_swap_programs.len(),
            "trustedAltAttesterCount": policy.trusted_alt_attester_keys.len(),
        }))
        .unwrap()
    );
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sig.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_serve(
    bind: SocketAddr,
    db: PathBuf,
    policy_path: PathBuf,
    keys_dir: Option<PathBuf>,
    extra_0x_keys: Option<PathBuf>,
    zerox_base_url: String,
    solana_rpc_url: Option<String>,
    alt_observer_key_id: Option<String>,
) -> Result<(), String> {
    let token = std::env::var("ARKHE_SOLANA_SWAP_TOKEN")
        .unwrap_or_default()
        .trim()
        .to_string();
    if token.is_empty() {
        return Err(
            "ARKHE_SOLANA_SWAP_TOKEN environment variable must be set and non-empty (fail-closed)"
                .to_string(),
        );
    }

    let policy_raw = fs::read_to_string(&policy_path)
        .map_err(|e| format!("failed reading policy {}: {e}", policy_path.display()))?;
    let policy: SolanaSwapPolicy = serde_json::from_str(&policy_raw)
        .map_err(|e| format!("invalid SolanaSwapPolicy JSON: {e}"))?;
    let _ = validate_solana_swap_policy(&policy)
        .map_err(|e| format!("policy validation failed: {e}"))?;

    let mut trusted_0x_keys = official_0x_prod_keys();
    if let Some(extra_path) = extra_0x_keys {
        trusted_0x_keys.extend(load_extra_0x_keys(&extra_path)?);
    }

    if let Some(parent) = db.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("failed creating db directory {}: {e}", parent.display()))?;
        }
    }
    let store = SqliteSolanaSwapStore::open(&db)?;

    let auth_signer =
        load_or_create_signing_key("ARKHE_AUTH_KEY_HEX", keys_dir.as_deref(), "auth.key.hex")?;
    let receipt_signer = load_or_create_signing_key(
        "ARKHE_RECEIPT_KEY_HEX",
        keys_dir.as_deref(),
        "receipt.key.hex",
    )?;
    let checkpoint_signer = load_or_create_signing_key(
        "ARKHE_CHECKPOINT_KEY_HEX",
        keys_dir.as_deref(),
        "checkpoint.key.hex",
    )?;

    let clock = Arc::new(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    });

    let policy_network = policy.network.clone();
    let policy_genesis = policy.genesis_hash.clone();

    let mut state = SolanaSwapGatewayState::new(
        store,
        token,
        policy,
        trusted_0x_keys,
        "arkhe-solana-auth-key-1",
        auth_signer,
        "arkhe-solana-receipt-key-1",
        receipt_signer,
        "arkhe-solana-checkpoint-key-1",
        checkpoint_signer,
        clock,
    );

    if let Ok(api_key) = std::env::var("ZEROX_API_KEY") {
        let trimmed = api_key.trim();
        if !trimmed.is_empty() {
            let client = ZeroXSwapClient::new(&zerox_base_url, trimmed)?;
            state = state.with_zerox_client(client);
        }
    }

    if let Some(rpc_url) = solana_rpc_url {
        let alt_observer = match (
            alt_observer_key_id,
            std::env::var("ARKHE_ALT_OBSERVER_KEY_HEX").ok(),
        ) {
            (Some(kid), Some(hex_seed)) if !hex_seed.trim().is_empty() => {
                let seed = decode_hex_32(&hex_seed, "ARKHE_ALT_OBSERVER_KEY_HEX")?;
                Some(AltObserverSigner {
                    key_id: kid,
                    signing_key: SigningKey::from_bytes(&seed),
                })
            }
            _ => None,
        };
        let rpc = SolanaRpcReadOnlyClient::new(
            rpc_url,
            policy_network,
            policy_genesis,
            alt_observer,
        )?;
        state = state.with_solana_rpc(rpc);
    }

    let state = Arc::new(state);
    let public_keys = state.public_keys_document();
    let zerox_configured = state.zerox_client.is_some();
    let rpc_configured = state.solana_rpc.is_some();
    let alt_obs_configured = state
        .solana_rpc
        .as_ref()
        .map(|r| r.has_alt_observer())
        .unwrap_or(false);
    let app = router(state);
    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .map_err(|e| format!("failed to bind {bind}: {e}"))?;
    let bound_addr = listener
        .local_addr()
        .map_err(|e| format!("local_addr error: {e}"))?;

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "status": "listening",
            "bind": bound_addr.to_string(),
            "db": db.display().to_string(),
            "mode": "DRY_RUN_AUTHORIZATION_ONLY_ZERO_REAL_SIGNATURES",
            "upstream": {
                "zeroxConfigured": zerox_configured,
                "solanaRpcConfigured": rpc_configured,
                "altObserverConfigured": alt_obs_configured,
            },
            "publicKeys": public_keys,
        }))
        .unwrap()
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|e| format!("server error: {e}"))?;
    Ok(())
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Commands::Serve {
            bind,
            db,
            policy,
            keys_dir,
            extra_0x_keys,
            zerox_base_url,
            solana_rpc_url,
            alt_observer_key_id,
        } => {
            run_serve(
                bind,
                db,
                policy,
                keys_dir,
                extra_0x_keys,
                zerox_base_url,
                solana_rpc_url,
                alt_observer_key_id,
            )
            .await
        }
        Commands::VerifyBundle {
            bundle,
            public_keys,
        } => run_verify_bundle(&bundle, &public_keys),
        Commands::VerifyConfirmation {
            confirmation,
            public_keys,
        } => run_verify_confirmation(&confirmation, &public_keys),
        Commands::ValidatePolicy { policy } => run_validate_policy(&policy),
        Commands::PrintOpenapi => {
            println!("{}", serde_json::to_string_pretty(&openapi_spec()).unwrap());
            Ok(())
        }
    };
    if let Err(err) = result {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}
