use serde::{Deserialize, Serialize};
pub mod policy;
pub mod presentation;
pub mod principal;
pub mod status;
pub mod status_composition;

pub const PROFILE: &str = "arkhe-kya-experimental@1";
pub use arkhe_kya_primitives::{canonical, did_key, LABEL};
use arkhe_kya_primitives::{hex_bytes, payload, signature, text};
const MANDATE_DOMAIN: &[u8] = b"ARKHE:KYA:MANDATE:v1\0";
const RECORD_DOMAIN: &[u8] = b"ARKHE:KYA:RECORD:v1\0";
const LEAF_DOMAIN: &[u8] = b"ARKHE:KYA:LEAF:v1\0";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Mandate {
    pub profile: String,
    pub label: String,
    pub principal_did: String,
    pub agent_id: String,
    pub audience: String,
    pub actions: Vec<String>,
    pub not_before: u64,
    pub expires_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentIntegrityRecord {
    pub profile: String,
    pub label: String,
    pub agent_id: String,
    pub principal_did: String,
    pub declared_model_blake3: String,
    pub mandate_digest: String,
    pub audience: String,
    pub challenge: String,
    pub issued_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub kind: String,
    pub direction: String,
    pub hash: [u8; 32],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Inclusion {
    pub leaf_count: u32,
    pub leaf_index: u32,
    pub steps: Vec<Step>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Passport {
    pub mandate: Mandate,
    pub principal_signature: String,
    pub record: AgentIntegrityRecord,
    pub agent_signature: String,
    pub inclusion: Inclusion,
}

/// Independent caller policy. Never populate this from the passport being checked.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Context {
    pub trusted_principal_did: String,
    pub audience: String,
    pub action: String,
    pub challenge: String,
    pub now: u64,
    pub expected_root: String,
    pub expected_leaf_count: u32,
    pub expected_model_blake3: Option<String>,
}

pub fn mandate_payload(value: &Mandate) -> Result<Vec<u8>, String> {
    payload(MANDATE_DOMAIN, value)
}
pub fn record_payload(value: &AgentIntegrityRecord) -> Result<Vec<u8>, String> {
    payload(RECORD_DOMAIN, value)
}
pub fn mandate_digest(value: &Mandate) -> Result<String, String> {
    Ok(blake3::hash(&mandate_payload(value)?).to_hex().to_string())
}
pub fn inclusion_leaf(value: &Passport) -> Result<Vec<u8>, String> {
    #[derive(Serialize)]
    struct Signed<'a> {
        mandate: &'a Mandate,
        principal_signature: &'a str,
        record: &'a AgentIntegrityRecord,
        agent_signature: &'a str,
    }
    payload(
        LEAF_DOMAIN,
        &Signed {
            mandate: &value.mandate,
            principal_signature: &value.principal_signature,
            record: &value.record,
            agent_signature: &value.agent_signature,
        },
    )
}

pub fn verify(passport_json: &str, context_json: &str) -> Result<serde_json::Value, String> {
    if passport_json.len() > 32768 || context_json.len() > 4096 {
        return Err("INPUT_TOO_LARGE".into());
    }
    let p: Passport = serde_json::from_str(passport_json).map_err(|_| "INVALID_PASSPORT")?;
    let c: Context = serde_json::from_str(context_json).map_err(|_| "INVALID_CONTEXT")?;
    let m = &p.mandate;
    let r = &p.record;
    if m.profile != PROFILE || r.profile != PROFILE || m.label != LABEL || r.label != LABEL {
        return Err("PROFILE_NOT_ALLOWED".into());
    }
    if m.principal_did != c.trusted_principal_did
        || r.principal_did != m.principal_did
        || r.agent_id != m.agent_id
        || r.mandate_digest != mandate_digest(m)?
    {
        return Err("BINDING_MISMATCH".into());
    }
    if !text(&c.audience, 1, 256)
        || !text(&c.action, 1, 64)
        || !text(&c.challenge, 16, 128)
        || m.actions.is_empty()
        || m.actions.len() > 16
        || m.actions.iter().any(|a| !text(a, 1, 64))
        || m.actions
            .iter()
            .enumerate()
            .any(|(i, a)| m.actions[..i].contains(a))
        || r.audience != c.audience
        || m.audience != c.audience
        || r.challenge != c.challenge
        || !m.actions.contains(&c.action)
    {
        return Err("SCOPE_OR_CHALLENGE_MISMATCH".into());
    }
    const SAFE: u64 = 9_007_199_254_740_991;
    if c.now > SAFE
        || m.expires_at > SAFE
        || m.not_before > c.now
        || m.expires_at <= m.not_before
        || c.now >= m.expires_at
        || m.expires_at - m.not_before > 86400
        || r.issued_at < m.not_before
        || r.issued_at > c.now
        || c.now - r.issued_at > 300
    {
        return Err("TIME_INVALID".into());
    }
    hex_bytes::<32>(&r.declared_model_blake3)?;
    if let Some(expected) = &c.expected_model_blake3 {
        hex_bytes::<32>(expected)?;
        if expected != &r.declared_model_blake3 {
            return Err("MODEL_HASH_MISMATCH".into());
        }
    }
    signature(
        &m.principal_did,
        &p.principal_signature,
        &mandate_payload(m)?,
    )?;
    signature(&r.agent_id, &p.agent_signature, &record_payload(r)?)?;
    if p.inclusion.leaf_count == 0
        || p.inclusion.leaf_count > 1_000_000
        || p.inclusion.leaf_count != c.expected_leaf_count
        || p.inclusion.steps.len() > 32
    {
        return Err("INCLUSION_INVALID".into());
    }
    let steps: Vec<_> = p
        .inclusion
        .steps
        .iter()
        .map(|s| arkhe_verify_core::mmr::ProofStep {
            kind: s.kind.clone(),
            direction: s.direction.clone(),
            hash: s.hash,
        })
        .collect();
    let matches = arkhe_verify_core::mmr::verify_proof_at(
        &inclusion_leaf(&p)?,
        p.inclusion.leaf_count as usize,
        p.inclusion.leaf_index as usize,
        &steps,
        &hex_bytes::<32>(&c.expected_root)?,
    )
    .map_err(|_| "INCLUSION_INVALID")?;
    if !matches {
        return Err("ROOT_MISMATCH".into());
    }
    Ok(serde_json::json!({
        "outcome": "CRYPTOGRAPHIC_CHECKS_PASSED", "profile": PROFILE, "label": LABEL,
        "agent_signature": "valid", "principal_signature": "valid", "scoped_mandate": "matches_caller_policy",
        "model_hash": if c.expected_model_blake3.is_some() { "matches_caller_expected_hash" } else { "declared_only" },
        "mmr_membership": "matches_caller_supplied_root", "runtime_model": "NOT_ATTESTED",
        "principal_legal_identity": "NOT_VERIFIED", "credential_revocation": "NOT_CHECKED",
        "anchor_authenticity": "NOT_VERIFIED", "replay_protection": "CALLER_MUST_CONSUME_CHALLENGE",
        "warning": "Synthetic experimental receipt. No W3C VC/ICP-Brasil validation, legal authority, runtime attestation, authenticated anchoring or authorization grant."
    }))
}

#[wasm_bindgen::prelude::wasm_bindgen]
pub fn verify_agent_integrity_record(passport_json: &str, context_json: &str) -> String {
    match verify(passport_json, context_json) {
        Ok(result) => result.to_string(),
        Err(reason) => serde_json::json!({"outcome":"NOT_VERIFIABLE", "profile": PROFILE, "label": LABEL, "reason":reason}).to_string(),
    }
}
