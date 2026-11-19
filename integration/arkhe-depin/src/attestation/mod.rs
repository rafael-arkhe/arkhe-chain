//! Offline NRAS fixture verification. Presence of a JWT alone is never success.
//! Live NVIDIA NRAS (`nras-live`) is intentionally not implemented in this slice.

use crate::Error;
use arkhe_core::Digest32;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NrasChallenge {
    pub nonce: [u8; 32],
    pub issued_at: i64,
    pub max_age_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum AttestationVerdict {
    Verified {
        claims_digest: Digest32,
        expires_at: i64,
    },
    Denied {
        reason: String,
    },
    Unsupported,
}

#[derive(Debug, Clone, Deserialize)]
struct JwksDocument {
    keys: Vec<JwksKey>,
}

#[derive(Debug, Clone, Deserialize)]
struct JwksKey {
    kty: String,
    kid: Option<String>,
    alg: Option<String>,
    k: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FixtureClaims {
    nonce: String,
    iat: i64,
    exp: i64,
    #[serde(rename = "x_arkhe_profile")]
    profile: String,
}

/// Pinned JWKS profile for offline fixture verification only.
#[derive(Clone)]
pub struct NrasAttestationPort {
    mode: PortMode,
}

#[derive(Clone)]
enum PortMode {
    Unsupported,
    Fixture { kid: String, key: DecodingKey },
}

impl NrasAttestationPort {
    /// Always returns [`AttestationVerdict::Unsupported`].
    pub fn unsupported() -> Self {
        Self {
            mode: PortMode::Unsupported,
        }
    }

    /// Load a pinned JWKS fixture. Only `oct` / HS256 keys are accepted in this slice.
    pub fn from_jwks_json(json: &str) -> Result<Self, Error> {
        let doc: JwksDocument = serde_json::from_str(json)
            .map_err(|_| Error::InvalidAttestation("invalid JWKS JSON"))?;
        let key = doc
            .keys
            .into_iter()
            .find(|k| {
                k.kty == "oct"
                    && k.alg.as_deref() == Some("HS256")
                    && k.kid.as_ref().is_some_and(|kid| !kid.is_empty())
                    && k.k.as_ref().is_some_and(|secret| !secret.is_empty())
            })
            .ok_or(Error::InvalidAttestation("no usable HS256 oct key in JWKS"))?;
        let secret = key.k.as_ref().expect("checked above");
        let raw =
            b64url_decode(secret).ok_or(Error::InvalidAttestation("JWKS key is not base64url"))?;
        if raw.len() < 32 {
            return Err(Error::InvalidAttestation("JWKS secret too short"));
        }
        Ok(Self {
            mode: PortMode::Fixture {
                kid: key.kid.expect("checked above"),
                key: DecodingKey::from_secret(&raw),
            },
        })
    }

    pub fn verify(&self, jwt: &str, challenge: &NrasChallenge, now: i64) -> AttestationVerdict {
        match &self.mode {
            PortMode::Unsupported => AttestationVerdict::Unsupported,
            PortMode::Fixture { kid, key } => self.verify_fixture(jwt, challenge, now, kid, key),
        }
    }

    fn verify_fixture(
        &self,
        jwt: &str,
        challenge: &NrasChallenge,
        now: i64,
        expected_kid: &str,
        key: &DecodingKey,
    ) -> AttestationVerdict {
        if jwt.trim().is_empty() {
            return AttestationVerdict::Denied {
                reason: "empty JWT".into(),
            };
        }
        if challenge.max_age_secs == 0 || challenge.issued_at < 0 || now < challenge.issued_at {
            return AttestationVerdict::Denied {
                reason: "invalid challenge clock window".into(),
            };
        }
        let age = (now - challenge.issued_at) as u64;
        if age > challenge.max_age_secs {
            return AttestationVerdict::Denied {
                reason: "challenge expired".into(),
            };
        }

        let header = match jsonwebtoken::decode_header(jwt) {
            Ok(header) => header,
            Err(_) => {
                return AttestationVerdict::Denied {
                    reason: "JWT header invalid".into(),
                }
            }
        };
        if header.alg != Algorithm::HS256 {
            return AttestationVerdict::Denied {
                reason: "unexpected JWT algorithm".into(),
            };
        }
        match header.kid.as_deref() {
            Some(kid) if kid == expected_kid => {}
            _ => {
                return AttestationVerdict::Denied {
                    reason: "JWT kid does not match pinned JWKS".into(),
                }
            }
        }

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.validate_nbf = false;
        validation.set_required_spec_claims(&["exp", "iat"]);
        // jsonwebtoken uses SystemTime by default; override with caller clock via leeway=0
        // and manual iat/exp checks below after decode with disabled exp if needed.
        // Keep library exp check with a generous leeway then enforce our window.
        validation.leeway = 0;

        // Temporarily disable library clock: inject `now` via custom validation by
        // decoding without exp and checking ourselves. jsonwebtoken 9 always uses
        // system time for exp, so disable and enforce with `now`.
        validation.validate_exp = false;

        let token = match decode::<FixtureClaims>(jwt, key, &validation) {
            Ok(token) => token,
            Err(_) => {
                return AttestationVerdict::Denied {
                    reason: "JWT signature or claims invalid".into(),
                }
            }
        };
        let claims = token.claims;
        if claims.profile != "arkhe-nras-fixture-v1" {
            return AttestationVerdict::Denied {
                reason: "unsupported attestation profile".into(),
            };
        }
        let expected_nonce = hex::encode(challenge.nonce);
        if claims.nonce != expected_nonce {
            return AttestationVerdict::Denied {
                reason: "nonce mismatch".into(),
            };
        }
        if claims.iat != challenge.issued_at {
            return AttestationVerdict::Denied {
                reason: "iat does not match challenge".into(),
            };
        }
        if claims.exp <= claims.iat || claims.exp <= now {
            return AttestationVerdict::Denied {
                reason: "token expired or not yet valid".into(),
            };
        }
        if (claims.exp - claims.iat) as u64 > challenge.max_age_secs {
            return AttestationVerdict::Denied {
                reason: "token lifetime exceeds challenge max age".into(),
            };
        }

        let digest_payload = serde_json::to_vec(&claims).unwrap_or_default();
        AttestationVerdict::Verified {
            claims_digest: Digest32::blake3(b"ARKHE/NRAS/CLAIMS/v1", &digest_payload),
            expires_at: claims.exp,
        }
    }
}

fn b64url_decode(input: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(input)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(input))
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};

    const JWKS: &str = include_str!("../../fixtures/nras_jwks.fixture.json");
    // Must match fixtures/nras_jwks.fixture.json secret (32+ bytes).
    const SECRET: &[u8] = b"arkhe-nras-fixture-secret-key-32b!";

    fn challenge(now: i64) -> NrasChallenge {
        NrasChallenge {
            nonce: [7u8; 32],
            issued_at: now,
            max_age_secs: 300,
        }
    }

    fn mint(claims: &FixtureClaims) -> String {
        let mut header = Header::new(Algorithm::HS256);
        header.kid = Some("arkhe-nras-fixture-1".into());
        encode(&header, claims, &EncodingKey::from_secret(SECRET)).unwrap()
    }

    #[test]
    fn verified_fixture_token() {
        let now = 1_780_000_000;
        let ch = challenge(now);
        let jwt = mint(&FixtureClaims {
            nonce: hex::encode(ch.nonce),
            iat: ch.issued_at,
            exp: now + 120,
            profile: "arkhe-nras-fixture-v1".into(),
        });
        let port = NrasAttestationPort::from_jwks_json(JWKS).unwrap();
        match port.verify(&jwt, &ch, now) {
            AttestationVerdict::Verified { expires_at, .. } => assert_eq!(expires_at, now + 120),
            other => panic!("expected verified, got {other:?}"),
        }
    }

    #[test]
    fn denies_bad_signature_stale_nonce_and_wrong_jwks() {
        let now = 1_780_000_000;
        let ch = challenge(now);
        let port = NrasAttestationPort::from_jwks_json(JWKS).unwrap();

        let mut bad = mint(&FixtureClaims {
            nonce: hex::encode(ch.nonce),
            iat: ch.issued_at,
            exp: now + 120,
            profile: "arkhe-nras-fixture-v1".into(),
        });
        bad.push('x');
        assert!(matches!(
            port.verify(&bad, &ch, now),
            AttestationVerdict::Denied { .. }
        ));

        let wrong_nonce = mint(&FixtureClaims {
            nonce: hex::encode([9u8; 32]),
            iat: ch.issued_at,
            exp: now + 120,
            profile: "arkhe-nras-fixture-v1".into(),
        });
        assert!(matches!(
            port.verify(&wrong_nonce, &ch, now),
            AttestationVerdict::Denied { .. }
        ));

        let stale_ch = NrasChallenge {
            nonce: ch.nonce,
            issued_at: now - 1_000,
            max_age_secs: 300,
        };
        let stale_jwt = mint(&FixtureClaims {
            nonce: hex::encode(stale_ch.nonce),
            iat: stale_ch.issued_at,
            exp: stale_ch.issued_at + 120,
            profile: "arkhe-nras-fixture-v1".into(),
        });
        assert!(matches!(
            port.verify(&stale_jwt, &stale_ch, now),
            AttestationVerdict::Denied { .. }
        ));

        let wrong_jwks = r#"{"keys":[{"kty":"oct","kid":"other","alg":"HS256","k":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}]}"#;
        let other = NrasAttestationPort::from_jwks_json(wrong_jwks).unwrap();
        let good = mint(&FixtureClaims {
            nonce: hex::encode(ch.nonce),
            iat: ch.issued_at,
            exp: now + 120,
            profile: "arkhe-nras-fixture-v1".into(),
        });
        assert!(matches!(
            other.verify(&good, &ch, now),
            AttestationVerdict::Denied { .. }
        ));
    }

    #[test]
    fn unsupported_port() {
        let port = NrasAttestationPort::unsupported();
        assert_eq!(
            port.verify("anything", &challenge(1), 1),
            AttestationVerdict::Unsupported
        );
    }
}
