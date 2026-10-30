//! Compatibility adapter for the existing cryptographic KYA receipt; not an AgentPassport schema.
use crate::status::{check_status, StatusEnvelope, StatusPurpose, StatusTrust, STATUS_PROFILE};
use crate::{Context, Passport};

pub fn passport_digest(passport: &Passport) -> Result<String, String> {
    Ok(blake3::hash(&crate::inclusion_leaf(passport)?)
        .to_hex()
        .to_string())
}

/// `minimum_sequence` is independent caller state, never learned from the bundle.
/// Checks one explicit status purpose, not every possible status of a credential.
pub fn verify_with_status(
    passport_json: &str,
    context_json: &str,
    status_json: &str,
    minimum_sequence: u32,
    required_purpose: StatusPurpose,
) -> serde_json::Value {
    let mut report = match crate::verify(passport_json, context_json) {
        Ok(value) => value,
        Err(reason) => return failure(&reason),
    };
    if status_json.len() > 100_000 {
        return failure("STATUS_INPUT_TOO_LARGE");
    }
    let Ok(envelope) = serde_json::from_str::<StatusEnvelope>(status_json) else {
        return failure("STATUS_INPUT_INVALID");
    };
    if envelope.binding.status_purpose != required_purpose {
        return failure("STATUS_PURPOSE_POLICY_MISMATCH");
    }
    // Both values were parsed and checked already by the base verifier.
    let p: Passport = serde_json::from_str(passport_json).expect("validated passport");
    let c: Context = serde_json::from_str(context_json).expect("validated context");
    let trust = StatusTrust {
        trusted_issuer: c.trusted_principal_did,
        expected_passport_digest: match passport_digest(&p) {
            Ok(digest) => digest,
            Err(reason) => return failure(&reason),
        },
        now: c.now,
        minimum_sequence,
        required_purpose,
        max_snapshot_age_seconds: 3600,
    };
    match check_status(&envelope, &trust) {
        Ok(observation) => {
            let purpose = observation.status_purpose;
            report["status_profile"] = STATUS_PROFILE.into();
            report["status_observation"] =
                serde_json::to_value(&observation).expect("observation serialization");
            report["status_purpose"] = serde_json::to_value(purpose).expect("enum serialization");
            report["credential_revocation"] = if purpose == StatusPurpose::Revocation {
                "CHECKED_NOT_REVOKED"
            } else {
                "NOT_CHECKED"
            }
            .into();
            report["credential_suspension"] = if purpose == StatusPurpose::Suspension {
                "CHECKED_NOT_SUSPENDED"
            } else {
                "NOT_CHECKED"
            }
            .into();
            report["status_warning"] = "Local signed snapshot only. No W3C VC interoperability or latest-state guarantee. Retain external minimum sequence and apply revocation and suspension policies separately.".into();
            report
        }
        Err(reason) => failure(&reason),
    }
}

fn failure(reason: &str) -> serde_json::Value {
    serde_json::json!({ "outcome":"NOT_VERIFIABLE", "profile":crate::PROFILE, "label":crate::LABEL,
        "status_profile":STATUS_PROFILE, "reason":reason,
        "credential_revocation":if reason == "CredentialRevoked" { "REVOKED" } else { "NOT_CHECKED" },
        "credential_suspension":if reason == "CredentialSuspended" { "SUSPENDED" } else { "NOT_CHECKED" } })
}

#[wasm_bindgen::prelude::wasm_bindgen]
pub fn verify_agent_integrity_record_with_status(
    passport_json: &str,
    context_json: &str,
    status_json: &str,
    minimum_sequence: u32,
    required_purpose: &str,
) -> String {
    let purpose = match required_purpose {
        "revocation" => StatusPurpose::Revocation,
        "suspension" => StatusPurpose::Suspension,
        _ => return failure("STATUS_PURPOSE_POLICY_INVALID").to_string(),
    };
    verify_with_status(
        passport_json,
        context_json,
        status_json,
        minimum_sequence,
        purpose,
    )
    .to_string()
}
