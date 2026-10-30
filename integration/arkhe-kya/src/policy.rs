//! Policy consumes recomputed checks, never a received ProofDeclaration.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifierPolicy {
    pub require_tee: bool,
    pub require_icp_brasil: bool,
    pub require_revocation_check: bool,
    pub require_anchor: bool,
    pub max_status_age_seconds: u32,
    pub minimum_status_sequence: u32,
}

impl Default for VerifierPolicy {
    fn default() -> Self {
        Self {
            require_tee: false,
            require_icp_brasil: false,
            require_revocation_check: true,
            require_anchor: false,
            max_status_age_seconds: 300,
            minimum_status_sequence: 0,
        }
    }
}

pub fn verify_under_policy(
    passport: &str,
    context: &str,
    status: Option<&str>,
    policy_json: &str,
) -> serde_json::Value {
    let reject = |reason: &str| {
        serde_json::json!({"decision":"REJECT", "profile":crate::PROFILE,
        "label":crate::LABEL, "reasons":[reason], "authorization_granted":false})
    };
    if policy_json.len() > 4096 {
        return reject("POLICY_TOO_LARGE");
    }
    let Ok(policy) = serde_json::from_str::<VerifierPolicy>(policy_json) else {
        return reject("POLICY_INVALID");
    };
    if policy.max_status_age_seconds == 0 || policy.max_status_age_seconds > 3600 {
        return reject("POLICY_INVALID");
    }
    // Signature, mandate, caller pins and indexed MMR are always checked.
    let report = match status {
        Some(status) => crate::status_composition::verify_with_status(
            passport,
            context,
            status,
            policy.minimum_status_sequence,
            crate::status::StatusPurpose::Revocation,
        ),
        None => match crate::verify(passport, context) {
            Ok(report) => report,
            Err(reason) => return reject(&reason),
        },
    };
    if report["outcome"] != "CRYPTOGRAPHIC_CHECKS_PASSED" {
        return serde_json::json!({"decision":"REJECT", "profile":crate::PROFILE, "label":crate::LABEL,
            "reasons":[report["reason"]], "checks":report, "authorization_granted":false});
    }
    let mut reasons = Vec::new();
    let mut warnings = vec![
        "runtime_not_attested",
        "principal_legal_identity_not_verified",
        "anchor_not_authenticated",
        "model_runtime_not_observed",
    ];
    if policy.require_tee {
        reasons.push("runtime_not_attested");
    }
    if policy.require_icp_brasil {
        reasons.push("principal_legal_identity_not_verified");
    }
    if policy.require_anchor {
        reasons.push("anchor_not_authenticated");
    }
    if report["credential_revocation"] != "CHECKED_NOT_REVOKED" {
        if policy.require_revocation_check {
            reasons.push("credential_revocation_not_checked");
        }
        warnings.push("credential_revocation_not_checked");
    } else {
        let observed = &report["status_observation"];
        let age = observed["evaluated_at"].as_u64().and_then(|now| {
            observed["snapshot_valid_from"]
                .as_u64()
                .and_then(|start| now.checked_sub(start))
        });
        if age.is_none_or(|age| age > u64::from(policy.max_status_age_seconds)) {
            reasons.push("STATUS_STALE");
        }
    }
    serde_json::json!({"decision":if reasons.is_empty() {"ACCEPT_WITH_LIMITATIONS"} else {"REJECT"},
        "profile":crate::PROFILE, "label":crate::LABEL, "reasons":reasons, "warnings":warnings,
        "checks":report, "authorization_granted":false,
        "policy_warning":"Synthetic cryptographic acceptance only. Does not grant authority or approve a payment. This API does not verify TEE, ICP-Brasil or external anchor; requiring them fails closed."})
}

#[wasm_bindgen::prelude::wasm_bindgen]
pub fn verify_passport_json(passport: &str, context: &str, status: &str, policy: &str) -> String {
    verify_under_policy(
        passport,
        context,
        if status.is_empty() {
            None
        } else {
            Some(status)
        },
        policy,
    )
    .to_string()
}
