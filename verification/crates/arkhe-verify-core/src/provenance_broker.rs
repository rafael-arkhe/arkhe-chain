//! Pure Provenance Broker v3.1 verification, admission policy, and delivery gate.
//!
//! Operates strictly over caller-supplied JSON structures without I/O, clock,
//! filesystem, or network access. Returning an admission or delivery verdict
//! here does not grant kernel `ContainmentGate` transition authority.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest as _, Sha256};
use std::collections::{BTreeMap, BTreeSet};

use crate::mmr::profile::PROFILE_DIGEST_HEX;

pub const PROFILE_V1: &str = "arkhe-broker-local-v1";
pub const PROFILE_V2: &str = "arkhe-broker-local-v2";
pub const MAX_CHUNKS: usize = 32;
pub const MAX_QUALIFIERS: usize = 16;
pub const MAX_CHUNK_BYTES: usize = 32_768;
pub const MAX_TOTAL_PAYLOAD_BYTES: usize = 65_536;
pub const MAX_SOURCE_BYTES: usize = 1_048_576;
pub const MAX_REPRESENTATION_BYTES: usize = 1_048_576;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostPin {
    pub authority: String,
    pub public_key_hex: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostEvaluation {
    pub host_audit: Value,
    pub agent_payload: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum BrokerHostError {
    #[error("invalid candidate input: {0}")]
    InvalidCandidate(&'static str),
    #[error("unknown candidate id")]
    UnknownCandidateId,
    #[error("policy binding invalid")]
    PolicyBindingInvalid,
    #[error("anchor key not pinned")]
    AnchorKeyNotPinned,
    #[error("untrusted observation issuer")]
    UntrustedObservationIssuer,
    #[error("invalid observation signature")]
    InvalidObservationSignature,
    #[error("state checkpoint binding invalid")]
    StateCheckpointInvalid,
    #[error("observation subject does not match authenticated session")]
    SessionSubjectMismatch,
    #[error("source set differs from retained observation")]
    ResourceSetMismatch,
}

/// Deterministic UTF-8 canonical JSON matching `json.dumps(..., ensure_ascii=False, sort_keys=True, separators=(',', ':'))`.
/// Explicitly sorts keys via `BTreeMap` regardless of `serde_json` feature flags.
pub fn canonical_json(value: &Value) -> Vec<u8> {
    let mut out = Vec::new();
    write_canonical(value, &mut out);
    out
}

fn write_canonical(value: &Value, out: &mut Vec<u8>) {
    match value {
        Value::Null => out.extend_from_slice(b"null"),
        Value::Bool(true) => out.extend_from_slice(b"true"),
        Value::Bool(false) => out.extend_from_slice(b"false"),
        Value::Number(n) => out.extend_from_slice(n.to_string().as_bytes()),
        Value::String(s) => {
            let encoded = serde_json::to_string(s).expect("valid UTF-8 string serializes to JSON");
            out.extend_from_slice(encoded.as_bytes());
        }
        Value::Array(items) => {
            out.push(b'[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                write_canonical(item, out);
            }
            out.push(b']');
        }
        Value::Object(map) => {
            let sorted: BTreeMap<&str, &Value> = map.iter().map(|(k, v)| (k.as_str(), v)).collect();
            out.push(b'{');
            for (i, (k, v)) in sorted.into_iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                let encoded_key =
                    serde_json::to_string(k).expect("valid UTF-8 key serializes to JSON");
                out.extend_from_slice(encoded_key.as_bytes());
                out.push(b':');
                write_canonical(v, out);
            }
            out.push(b'}');
        }
    }
}

/// Domain-separated SHA-256 over canonical JSON: `SHA256("ARKHE:BROKER:<kind>:v1\0" || canonical(value))`.
pub fn broker_digest(kind: &str, value: &Value) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("ARKHE:BROKER:{kind}:v1\0").as_bytes());
    hasher.update(canonical_json(value));
    hex::encode(hasher.finalize())
}

fn broker_raw_sha256(tag: &str, raw: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("ARKHE:BROKER:{tag}:v1\0").as_bytes());
    hasher.update(raw);
    hex::encode(hasher.finalize())
}

fn verify_ed25519(public_key_hex: &str, signature_hex: &str, message: &[u8]) -> bool {
    let Ok(pk_vec) = hex::decode(public_key_hex) else {
        return false;
    };
    let Ok(pk_bytes): Result<[u8; 32], _> = pk_vec.try_into() else {
        return false;
    };
    let Ok(vk) = VerifyingKey::from_bytes(&pk_bytes) else {
        return false;
    };
    let Ok(sig_bytes) = hex::decode(signature_hex) else {
        return false;
    };
    let Ok(sig) = Signature::from_slice(&sig_bytes) else {
        return false;
    };
    vk.verify(message, &sig).is_ok()
}

fn is_chunk_safe(chunk: &Value) -> bool {
    let pc = &chunk["per_chunk"];
    pc["integrity"].as_str() == Some("OK")
        && pc["access"].as_str() == Some("Permitted")
        && pc["state"].as_str() == Some("Current")
        && pc["transform"].as_str() == Some("Accepted")
}

fn safe_chunks(data: &Value) -> Vec<Value> {
    let Some(chunks) = data["chunks"].as_array() else {
        return Vec::new();
    };
    let mut sorted: Vec<Value> = chunks
        .iter()
        .filter(|c| is_chunk_safe(c))
        .cloned()
        .collect();
    sorted.sort_by(|a, b| {
        a["chunk_id"]
            .as_str()
            .unwrap_or("")
            .cmp(b["chunk_id"].as_str().unwrap_or(""))
    });
    sorted
}

fn sorted_record_hashes(chunks: &[Value]) -> Vec<String> {
    let mut refs: Vec<String> = chunks
        .iter()
        .filter_map(|c| c["record_hash"].as_str().map(str::to_owned))
        .collect();
    refs.sort();
    refs
}

fn semantic_binding(data: &Value) -> bool {
    let Some(chunks) = data["chunks"].as_array() else {
        return false;
    };
    let sem = &data["observations"]["semantic"]["body"];
    let refs = sorted_record_hashes(chunks);
    let refs_val = json!(refs);
    let Some(sem_refs) = sem["support_refs"].as_array() else {
        return false;
    };
    let sem_refs_str: Vec<String> = sem_refs
        .iter()
        .filter_map(|v| v.as_str().map(str::to_owned))
        .collect();
    sem_refs_str.len() == sem_refs.len()
        && sem_refs_str == refs
        && sem["claim_digest"].as_str()
            == Some(broker_digest("CLAIM", &data["candidate"]["claim"]).as_str())
        && sem["support_set_digest"].as_str() == Some(broker_digest("SUPPORT", &refs_val).as_str())
}

fn min_expires_at(expires_at: &Value) -> Option<u64> {
    let obj = expires_at.as_object()?;
    if obj.is_empty() {
        return None;
    }
    let mut min_val = u64::MAX;
    for v in obj.values() {
        let ts = v.as_u64()?;
        if ts < min_val {
            min_val = ts;
        }
    }
    Some(min_val)
}

fn state_verdict<'a>(data: &'a Value) -> &'a str {
    let b = &data["observations"]["bundle"]["body"];
    let p = &data["policy"];
    let Some(now) = data["clock_ms"].as_u64() else {
        return "Unknown";
    };
    let historical = data["candidate"]["query"]
        .get("historical_req")
        .filter(|v| !v.is_null());

    if historical.is_none() && p["profile_id"].as_str() == Some(PROFILE_V2) {
        let leaf_count = data["anchors"]["leaf_count"].as_u64().unwrap_or(0);
        let min_leaf_count = data["anchors"]["minimum_leaf_count"].as_u64().unwrap_or(0);
        if leaf_count < min_leaf_count {
            return "Stale";
        }
    }

    if historical.is_some()
        && (!p["historical_permitted"].as_bool().unwrap_or(false)
            || b["state"].as_str() == Some("HistoricalDenied"))
    {
        return "HistoricalDenied";
    }

    let Some(observed_at) = b["observed_at"].as_u64() else {
        return "Unknown";
    };
    let Some(max_age) = p["max_state_age_ms"].as_u64() else {
        return "Unknown";
    };
    let Some(state_exp) = b["expires_at"]["state"].as_u64() else {
        return "Unknown";
    };
    if observed_at > now || now - observed_at > max_age || now >= state_exp {
        return "Stale";
    }

    if let Some(hist) = historical {
        let Some(instant) = hist["requested_instant"].as_u64() else {
            return "Unknown";
        };
        let eff_from = b["effective_from"].as_u64().unwrap_or(u64::MAX);
        let eff_to = b["effective_to"].as_u64().unwrap_or(0);
        if b["state"].as_str() == Some("Historical")
            && b["historical_state"].as_str() == Some("Active")
            && eff_from <= instant
            && instant < eff_to
        {
            return "Historical";
        }
        return "Unknown";
    }

    match b["state"].as_str() {
        Some(s @ ("Current" | "Revoked" | "Superseded" | "Stale" | "Unknown")) => s,
        _ => "Unknown",
    }
}

fn value_in_array(needle: &Value, haystack: &Value) -> bool {
    haystack
        .as_array()
        .is_some_and(|items| items.iter().any(|item| item == needle))
}

fn str_in_array(needle: &str, haystack: &Value) -> bool {
    haystack
        .as_array()
        .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(needle)))
}

fn choose(data: &Value) -> (&'static str, &'static str) {
    let p = &data["policy"];
    let obs = &data["observations"];
    let session = &data["session"];
    let query = &data["candidate"]["query"];
    let b = &obs["bundle"]["body"];

    let principal = session["principal"].as_str().unwrap_or("");
    let Some(chunks) = data["chunks"].as_array() else {
        return ("Reject", "REQUEST_INVALID");
    };
    let Some(qualifiers) = data["candidate"]["claim"]["qualifiers"].as_array() else {
        return ("Reject", "REQUEST_INVALID");
    };
    if principal.is_empty()
        || chunks.is_empty()
        || chunks.len() > MAX_CHUNKS
        || qualifiers.len() > MAX_QUALIFIERS
    {
        return ("Reject", "REQUEST_INVALID");
    }
    let mut chunk_ids = BTreeSet::new();
    let mut total_bytes = 0usize;
    for c in chunks {
        let Some(cid) = c["chunk_id"].as_str() else {
            return ("Reject", "REQUEST_INVALID");
        };
        if !chunk_ids.insert(cid) {
            return ("Reject", "REQUEST_INVALID");
        }
        let Some(hex_str) = c["bytes_hex"].as_str() else {
            return ("Reject", "REQUEST_INVALID");
        };
        let Ok(raw) = hex::decode(hex_str) else {
            return ("Reject", "REQUEST_INVALID");
        };
        if raw.len() > MAX_CHUNK_BYTES {
            return ("Reject", "REQUEST_INVALID");
        }
        total_bytes = total_bytes.saturating_add(raw.len());
    }
    if total_bytes > MAX_TOTAL_PAYLOAD_BYTES {
        return ("Reject", "REQUEST_INVALID");
    }

    let profile_id = p["profile_id"].as_str().unwrap_or("");
    let purpose = query["purpose"].as_str().unwrap_or("");
    if !matches!(profile_id, PROFILE_V1 | PROFILE_V2)
        || !str_in_array(purpose, &p["purposes"])
        || !p["best_effort_permitted"].as_bool().unwrap_or(false)
        || !value_in_array(&b["revisions"], &p["accepted_revision_combinations"])
        || Some(broker_digest("POLICY", p).as_str()) != data["policy_digest"].as_str()
    {
        return ("Exclude", "POLICY_UNRESOLVED");
    }

    let aggregate = data.get("aggregation").filter(|v| !v.is_null());
    let mut aggregate_access: Option<&str> = None;
    if let Some(agg) = aggregate {
        let empty = Vec::new();
        let authorities = b["source_authorizations"].as_array().unwrap_or(&empty);
        let grants = b["aggregate_authorizations"].as_array().unwrap_or(&empty);
        let grant = grants
            .iter()
            .find(|g| g["aggregate_id"] == agg["aggregate_id"]);
        let mut source_map: BTreeMap<&str, &Value> = BTreeMap::new();
        for a in authorities {
            if let Some(cid) = a["chunk_id"].as_str() {
                source_map.insert(cid, a);
            }
        }
        let refs = sorted_record_hashes(chunks);
        let refs_val = json!(refs);
        let mut binding = profile_id == PROFILE_V2
            && grants.len() == 1
            && source_map.len() == authorities.len()
            && authorities.len() == chunks.len()
            && agg["constituent_refs"] == refs_val
            && grant.is_some_and(|g| {
                g["aggregate_id"] == agg["aggregate_id"]
                    && g["principal"].as_str() == Some(principal)
                    && g["constituent_refs"] == refs_val
            });
        for c in chunks {
            let cid = c["chunk_id"].as_str().unwrap_or("");
            if let Some(a) = source_map.get(cid) {
                binding = binding
                    && a["tenant"] == c["record"]["tenant"]
                    && a["scope"] == c["record"]["scope"];
            } else {
                binding = false;
            }
        }
        let cross = chunks
            .iter()
            .any(|c| c["record"]["tenant"] != session["tenant"]);
        let cross_permitted = p
            .get("cross_tenant_aggregation_permitted")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !binding
            || (cross && !cross_permitted)
            || grant.and_then(|g| g["verdict"].as_str()) == Some("Denied")
            || authorities
                .iter()
                .any(|a| a["verdict"].as_str() == Some("Denied"))
        {
            aggregate_access = Some("Denied");
        } else if grant.and_then(|g| g["verdict"].as_str()) != Some("Permitted")
            || authorities
                .iter()
                .any(|a| a["verdict"].as_str() != Some("Permitted"))
        {
            aggregate_access = Some("Unknown");
        } else {
            aggregate_access = Some("Permitted");
        }
    }

    if b["access"].as_str() == Some("Denied")
        || b["subject"].as_str() != Some(principal)
        || aggregate_access == Some("Denied")
        || chunks.iter().any(|c| {
            c["per_chunk"]["access"].as_str() == Some("Denied")
                || (aggregate.is_none()
                    && (c["record"]["tenant"] != session["tenant"]
                        || !value_in_array(&c["record"]["scope"], &session["scopes"])))
        })
    {
        return ("Reject", "ACCESS_DENIED");
    }

    if b["access"].as_str() == Some("Unknown")
        || aggregate_access == Some("Unknown")
        || chunks
            .iter()
            .any(|c| c["per_chunk"]["access"].as_str() == Some("Unknown"))
    {
        return ("Exclude", "ACCESS_UNKNOWN");
    }

    if obs["integrity"].as_str() == Some("Invalid")
        || chunks
            .iter()
            .any(|c| c["per_chunk"]["integrity"].as_str() == Some("Invalid"))
    {
        return ("Reject", "INTEGRITY_INVALID");
    }
    if obs["integrity"].as_str() != Some("OK")
        || chunks
            .iter()
            .any(|c| c["per_chunk"]["integrity"].as_str() != Some("OK"))
    {
        return ("Exclude", "INTEGRITY_UNKNOWN");
    }

    let empty = Vec::new();
    let transform_items = obs["transform_items"].as_array().unwrap_or(&empty);
    let mut transforms: BTreeMap<&str, &str> = BTreeMap::new();
    for t in transform_items {
        if let (Some(r), Some(v)) = (t["transformation_ref"].as_str(), t["verdict"].as_str()) {
            transforms.insert(r, v);
        }
    }
    let needed: BTreeSet<&str> = chunks
        .iter()
        .filter_map(|c| c["record"]["transformation_ref"].as_str())
        .collect();
    if needed
        .iter()
        .any(|r| str_in_array(r, &p["rejected_transforms"]))
        || transform_items
            .iter()
            .any(|t| t["verdict"].as_str() == Some("Rejected"))
    {
        return ("Reject", "TRANSFORM_REJECTED");
    }
    if needed.iter().any(|r| {
        !str_in_array(r, &p["accepted_transforms"])
            || transforms.get(r).copied() != Some("Accepted")
    }) {
        return ("Exclude", "TRANSFORM_UNKNOWN");
    }

    let state = state_verdict(data);
    if state == "HistoricalDenied" {
        return ("Reject", "HISTORICAL_DENIED");
    }
    let clock_ms = data["clock_ms"].as_u64().unwrap_or(u64::MAX);
    let min_exp = min_expires_at(&b["expires_at"]).unwrap_or(0);
    if matches!(state, "Unknown" | "Stale") || clock_ms >= min_exp {
        return ("Exclude", "STATE_UNAVAILABLE");
    }
    if matches!(state, "Revoked" | "Superseded") {
        return ("Reject", "STATE_DISALLOWED");
    }

    let mut doc = obs["documental"].as_str().unwrap_or("Invalid");
    let mechanism = &obs["mechanism"];
    if mechanism["kind"].as_str() == Some("Derived") {
        let artifact = data.get("derivation_artifact").filter(|v| !v.is_null());
        let rule_tag = format!(
            "{}@{}",
            mechanism["rule_id"].as_str().unwrap_or(""),
            mechanism["rule_version"].as_str().unwrap_or("")
        );
        let refs_val = json!(sorted_record_hashes(chunks));
        let valid_derived = artifact.is_some_and(|art| {
            str_in_array(&rule_tag, &p["accepted_rules"])
                && mechanism["derivation_binding_valid"].as_bool() == Some(true)
                && Some(broker_digest("DERIVATION", art).as_str())
                    == mechanism["derivation_artifact_ref"].as_str()
                && art["conclusion"] == art["premise_claim"]
                && art["conclusion"] == data["candidate"]["claim"]
                && mechanism["premise_refs"] == refs_val
                && chunks
                    .iter()
                    .all(|c| c["per_chunk"]["state"].as_str() == Some("Current"))
        });
        if !valid_derived {
            doc = "Invalid";
        }
    } else if doc == "Complete" && mechanism["predicate_span_valid"].as_bool() != Some(true) {
        doc = "Invalid";
    }

    if matches!(doc, "Invalid" | "NotEvaluated") {
        return ("Reject", "DOCUMENT_INVALID");
    }
    let safe = safe_chunks(data);
    if doc == "Complete" && safe.len() != chunks.len() {
        doc = "Incomplete";
    }
    if purpose == "Analysis" && state == "Current" && doc == "Incomplete" && !safe.is_empty() {
        return ("AdmitChunksOnly", "ANALYSIS_CHUNKS_ONLY");
    }
    if doc == "Incomplete" {
        return ("Reject", "DOCUMENT_INCOMPLETE");
    }

    let sem = &obs["semantic"]["body"];
    let semantic_accepted = sem["outcome"].as_str() == Some("Supported")
        && sem["method"].as_str() == Some("Human")
        && sem["evaluator"] == p["accepted_evaluator"]
        && sem["evaluator_version"].as_str() == Some("1")
        && semantic_binding(data);
    if purpose == "Assertion" && !semantic_accepted {
        return ("Reject", "ASSERTION_UNSUPPORTED");
    }
    if doc == "Complete" && state == "Historical" {
        return ("AdmitHistorical", "RELEASE_HISTORICAL");
    }
    if doc == "Complete" && state == "Current" {
        return ("Admit", "RELEASE_CURRENT");
    }
    ("Exclude", "DEFAULT_EXCLUDE")
}

fn grant_verdict(data: &Value) -> &'static str {
    let Some(envelope) = data["delivery"].get("grant").filter(|v| !v.is_null()) else {
        return "Absent";
    };
    let grant = &envelope["body"];
    let anchors = &data["anchors"];
    if envelope["key_id"] != anchors["key_id"] {
        return "Invalid";
    }
    let mut msg = b"ARKHE:BROKER:SIGN:GRANT:v1\0".to_vec();
    msg.extend(canonical_json(grant));
    let pk_hex = anchors["public_key_hex"].as_str().unwrap_or("");
    let sig_hex = envelope["signature_hex"].as_str().unwrap_or("");
    if !verify_ed25519(pk_hex, sig_hex, &msg) {
        return "Invalid";
    }
    let conds_non_empty = match &grant["conditions"] {
        Value::Null => false,
        Value::Array(a) => !a.is_empty(),
        Value::Object(m) => !m.is_empty(),
        Value::Bool(b) => *b,
        Value::String(s) => !s.is_empty(),
        Value::Number(_) => true,
    };
    if grant["contract_id"].as_str() != Some("fixture-lease-v1")
        || grant["issuer"] != anchors["key_id"]
        || grant["subject"] != data["session"]["principal"]
        || grant["resources"] != data["observations"]["bundle"]["body"]["resources"]
        || grant["operations"] != json!(["access_check"])
        || conds_non_empty
        || grant["purpose"] != data["candidate"]["query"]["purpose"]
        || grant["revision"] != data["observations"]["bundle"]["body"]["revisions"]["authorization"]
    {
        return "Invalid";
    }
    let now = data["delivery"]["attempted_at"].as_u64().unwrap_or(0);
    let not_before = grant["not_before"].as_u64().unwrap_or(u64::MAX);
    let valid_until = grant["valid_until"].as_u64().unwrap_or(0);
    if !(not_before <= now && now < valid_until) {
        return "Expired";
    }
    if data["policy"]["grants_permitted"]
        .as_bool()
        .unwrap_or(false)
    {
        "Valid"
    } else {
        "Unaccepted"
    }
}

fn delivery_verdict(data: &Value, decision: &str, snapshot: &Value) -> Value {
    let outcome = |o: &str, code: &str| json!({ "outcome": o, "code": code });
    if matches!(decision, "Reject" | "Exclude") {
        return outcome("Blocked", "DECISION_DENIED");
    }
    let grant = grant_verdict(data);
    if grant == "Invalid" {
        return outcome("Blocked", "GRANT_INVALID");
    }
    let delivery = &data["delivery"];
    let now = delivery["attempted_at"].as_u64().unwrap_or(0);
    let snap_valid_until = snapshot["valid_until"].as_u64().unwrap_or(0);
    if now >= snap_valid_until {
        return outcome("Reevaluate", "SNAPSHOT_EXPIRED");
    }
    if !delivery["other_sources_available"]
        .as_bool()
        .unwrap_or(false)
    {
        return outcome("Blocked", "SOURCE_UNAVAILABLE");
    }
    let mut names = vec!["state", "policy", "anchor_set"];
    if grant != "Valid" {
        names.push("authorization");
    }
    if names
        .iter()
        .any(|k| delivery["observed_revisions"][*k] != snapshot["revisions"][*k])
    {
        return outcome("Reevaluate", "REVISION_CHANGED");
    }
    let validated = snapshot["temporal_guarantee"]["validated_at"]
        .as_u64()
        .unwrap_or(0);
    let interval = snapshot["temporal_guarantee"]["accepted_interval_ms"]
        .as_u64()
        .unwrap_or(0);
    if now < validated || now >= validated.saturating_add(interval) {
        return outcome("Reevaluate", "VALIDATION_WINDOW_EXPIRED");
    }
    if grant == "Valid" {
        return outcome("Release", "ACCESS_GRANT");
    }
    if !delivery["authorization_source_available"]
        .as_bool()
        .unwrap_or(false)
    {
        return outcome("Blocked", "SOURCE_UNAVAILABLE");
    }
    outcome("Release", "VALIDATION_WINDOW")
}

/// Pure decision & delivery policy over host-retained observations.
pub fn decide(data: &Value) -> Value {
    let (decision, rule) = choose(data);
    let query = &data["candidate"]["query"];
    let policy = &data["policy"];
    let body = &data["observations"]["bundle"]["body"];

    let temporal = if let Some(hist) = query.get("historical_req").filter(|v| !v.is_null()) {
        let mut map = Map::new();
        map.insert("mode".into(), json!("Historical"));
        if let Some(obj) = hist.as_object() {
            for (k, v) in obj {
                map.insert(k.clone(), v.clone());
            }
        }
        Value::Object(map)
    } else {
        json!({ "mode": "Current" })
    };

    let mut payload_chunks = Vec::new();
    let mut claim_status = "Omitted";
    let mut flags: Vec<Value> = Vec::new();
    let mut restrictions: Vec<Value> = Vec::new();
    let mut include_claim = false;
    let mut include_semantic = false;

    if !matches!(decision, "Reject" | "Exclude") {
        for c in safe_chunks(data) {
            let r = &c["record"];
            payload_chunks.push(json!({
                "chunk_id": c["chunk_id"],
                "bytes_hex": c["bytes_hex"],
                "chunk_digest": r["chunk_digest"],
                "text_position": r["text_position"],
                "source_digest": r["source_digest"],
                "evidence_ref": c["record_hash"],
            }));
        }
        if decision == "AdmitChunksOnly" {
            flags.push(json!("RELATION_OMITTED"));
            restrictions.push(json!("ANALYSIS_ONLY"));
            restrictions.push(json!("NO_RELATION_SUPPORT"));
        } else {
            include_claim = true;
            claim_status = if query["purpose"].as_str() == Some("Analysis") {
                "ForAnalysis"
            } else {
                "SupportedByEvaluation"
            };
            if semantic_binding(data) {
                include_semantic = true;
            }
        }
    }

    let mut payload = Map::new();
    payload.insert("chunks".into(), Value::Array(payload_chunks));
    payload.insert("claim_status".into(), json!(claim_status));
    payload.insert("temporal_context".into(), temporal);
    payload.insert("restrictions".into(), Value::Array(restrictions));
    if include_claim {
        payload.insert("claim".into(), data["candidate"]["claim"].clone());
    }
    if include_semantic {
        payload.insert(
            "semantic".into(),
            data["observations"]["semantic"]["body"].clone(),
        );
    }

    let clock_ms = data["clock_ms"].as_u64().unwrap_or(0);
    let max_ttl = policy["max_decision_ttl_ms"].as_u64().unwrap_or(0);
    let min_exp = min_expires_at(&body["expires_at"]).unwrap_or(0);
    let valid_until = min_exp.min(clock_ms.saturating_add(max_ttl));

    let snapshot = json!({
        "evaluated_at": clock_ms,
        "valid_until": valid_until,
        "revisions": body["revisions"],
        "policy_digest": data["policy_digest"],
        "anchor_set_digest": broker_digest("ANCHORS", &data["anchors"]),
        "consistency": {
            "mode": "BestEffort",
            "profile_id": "frozen-observations-v1",
            "observation_digest": broker_digest("OBSERVATIONS", &data["observations"]),
        },
        "temporal_guarantee": {
            "kind": "ValidatedAt",
            "validated_at": clock_ms,
            "accepted_interval_ms": policy["accepted_interval_ms"],
        },
    });

    let delivery = delivery_verdict(data, decision, &snapshot);

    json!({
        "decision": decision,
        "applied_rule": rule,
        "flags": flags,
        "reasons": [{ "rule_id": rule, "code": "RULE_MATCH" }],
        "released_payload": Value::Object(payload),
        "snapshot": snapshot,
        "delivery": delivery,
    })
}

fn verify_chunk_material(chunk: &Value, anchors: &Value, profile_id: &str) -> bool {
    let rec = &chunk["record"];
    let proof = &chunk["proof"];
    let (Some(bytes_hex), Some(src_hex), Some(repr_hex)) = (
        chunk["bytes_hex"].as_str(),
        chunk["source_bytes_hex"].as_str(),
        chunk["representation_hex"].as_str(),
    ) else {
        return false;
    };
    let (Ok(raw), Ok(source), Ok(representation)) = (
        hex::decode(bytes_hex),
        hex::decode(src_hex),
        hex::decode(repr_hex),
    ) else {
        return false;
    };
    if raw.len() > MAX_CHUNK_BYTES
        || source.len() > MAX_SOURCE_BYTES
        || representation.len() > MAX_REPRESENTATION_BYTES
    {
        return false;
    }
    let pos = &rec["text_position"];
    let (Some(offset), Some(length)) = (pos["offset"].as_u64(), pos["length"].as_u64()) else {
        return false;
    };
    let Some(end_u64) = offset.checked_add(length) else {
        return false;
    };
    let (Ok(start), Ok(end)) = (usize::try_from(offset), usize::try_from(end_u64)) else {
        return false;
    };
    if start > end || end > representation.len() {
        return false;
    }
    if std::str::from_utf8(&representation[..start]).is_err()
        || std::str::from_utf8(&representation[start..end]).is_err()
    {
        return false;
    }
    if raw != representation[start..end] || source != representation {
        return false;
    }
    if Some(broker_raw_sha256("CHUNK", &raw).as_str()) != rec["chunk_digest"].as_str()
        || Some(broker_raw_sha256("SOURCE", &source).as_str()) != rec["source_digest"].as_str()
        || Some(broker_raw_sha256("REPRESENTATION", &representation).as_str())
            != pos["repr_digest"].as_str()
    {
        return false;
    }
    let mut rec_preimage = b"AKG:BROKER:RECORD:v1\0".to_vec();
    rec_preimage.extend(canonical_json(rec));
    let rh = blake3::hash(&rec_preimage);
    if Some(rh.to_hex().as_str()) != chunk["record_hash"].as_str()
        || rec["chunk_id"] != chunk["chunk_id"]
    {
        return false;
    }
    if proof["profile_digest"].as_str() != Some(PROFILE_DIGEST_HEX) {
        return false;
    }
    let (Some(count), Some(leaf_index)) =
        (proof["leaf_count"].as_u64(), proof["leaf_index"].as_u64())
    else {
        return false;
    };
    let allowed = if profile_id == PROFILE_V2 {
        matches!(count, 1 | 2)
    } else {
        count == 2
    };
    if !allowed || leaf_index >= count || Some(count) != anchors["leaf_count"].as_u64() {
        return false;
    }
    let Some(steps) = proof["steps"].as_array() else {
        return false;
    };
    if steps.len() as u64 != count - 1 {
        return false;
    }
    let mut leaf_preimage = vec![0u8];
    leaf_preimage.extend_from_slice(rh.as_bytes());
    let leaf = blake3::hash(&leaf_preimage);
    if count == 1 {
        return Some(leaf.to_hex().as_str()) == anchors["root"].as_str();
    }
    let step = &steps[0];
    let expected_dir = if leaf_index == 0 { "right" } else { "left" };
    if step["kind"].as_str() != Some("node") || step["direction"].as_str() != Some(expected_dir) {
        return false;
    }
    let Some(sibling_hex) = step["hash"].as_str() else {
        return false;
    };
    let Ok(sibling) = hex::decode(sibling_hex) else {
        return false;
    };
    if sibling.len() != 32 {
        return false;
    }
    let mut node_preimage = vec![1u8];
    if expected_dir == "right" {
        node_preimage.extend_from_slice(leaf.as_bytes());
        node_preimage.extend_from_slice(&sibling);
    } else {
        node_preimage.extend_from_slice(&sibling);
        node_preimage.extend_from_slice(leaf.as_bytes());
    }
    let root = blake3::hash(&node_preimage);
    Some(root.to_hex().as_str()) == anchors["root"].as_str()
}

/// Validates minimal closed shape of untrusted `CandidateInput`.
fn validate_candidate_shape(candidate: &Value) -> Result<(), BrokerHostError> {
    let Some(obj) = candidate.as_object() else {
        return Err(BrokerHostError::InvalidCandidate(
            "candidate must be an object",
        ));
    };
    if obj.len() != 3
        || !obj.contains_key("candidate_id")
        || !obj.contains_key("claim")
        || !obj.contains_key("query")
    {
        return Err(BrokerHostError::InvalidCandidate(
            "unexpected or missing candidate keys",
        ));
    }
    if candidate["candidate_id"].as_str().is_none_or(str::is_empty) {
        return Err(BrokerHostError::InvalidCandidate("empty candidate_id"));
    }
    let Some(claim) = candidate["claim"].as_object() else {
        return Err(BrokerHostError::InvalidCandidate("claim must be an object"));
    };
    for key in [
        "subject",
        "predicate",
        "object",
        "polarity",
        "modality",
        "qualifiers",
    ] {
        if !claim.contains_key(key) {
            return Err(BrokerHostError::InvalidCandidate("missing claim field"));
        }
    }
    if claim.len() != 6 || !claim["qualifiers"].is_array() {
        return Err(BrokerHostError::InvalidCandidate("invalid claim structure"));
    }
    let Some(query) = candidate["query"].as_object() else {
        return Err(BrokerHostError::InvalidCandidate("query must be an object"));
    };
    if !matches!(
        query.get("purpose").and_then(Value::as_str),
        Some("Analysis" | "Assertion")
    ) {
        return Err(BrokerHostError::InvalidCandidate("invalid query purpose"));
    }
    if query
        .keys()
        .any(|k| k != "purpose" && k != "historical_req")
    {
        return Err(BrokerHostError::InvalidCandidate("unexpected query field"));
    }
    if let Some(hist) = query.get("historical_req") {
        let Some(hobj) = hist.as_object() else {
            return Err(BrokerHostError::InvalidCandidate(
                "historical_req must be an object",
            ));
        };
        if hobj.len() != 1
            || hobj
                .get("requested_instant")
                .and_then(Value::as_u64)
                .is_none()
        {
            return Err(BrokerHostError::InvalidCandidate("invalid historical_req"));
        }
    }
    Ok(())
}

/// Full material verification + pure policy evaluation + delivery payload barrier,
/// mirroring `FrozenHost.evaluate_and_release` in `scripts/provenance_broker_host.py`.
pub fn evaluate_and_release(
    trusted_context: &Value,
    pin: &HostPin,
    candidate: &Value,
) -> Result<HostEvaluation, BrokerHostError> {
    validate_candidate_shape(candidate)?;
    let mut data = trusted_context.clone();
    if candidate["candidate_id"] != data["candidate"]["candidate_id"] {
        return Err(BrokerHostError::UnknownCandidateId);
    }
    data["candidate"] = candidate.clone();

    if Some(broker_digest("POLICY", &data["policy"]).as_str()) != data["policy_digest"].as_str() {
        return Err(BrokerHostError::PolicyBindingInvalid);
    }
    if data["anchors"]["key_id"].as_str() != Some(pin.authority.as_str())
        || data["anchors"]["public_key_hex"].as_str() != Some(pin.public_key_hex.as_str())
    {
        return Err(BrokerHostError::AnchorKeyNotPinned);
    }

    for (field, kind) in [("bundle", "BUNDLE"), ("semantic", "SEMANTIC")] {
        let env = &data["observations"][field];
        if env["key_id"].as_str() != Some(pin.authority.as_str()) {
            return Err(BrokerHostError::UntrustedObservationIssuer);
        }
        let mut preimage = format!("ARKHE:BROKER:SIGN:{kind}:v1\0").into_bytes();
        preimage.extend(canonical_json(&env["body"]));
        let sig_hex = env["signature_hex"].as_str().unwrap_or("");
        if !verify_ed25519(&pin.public_key_hex, sig_hex, &preimage) {
            return Err(BrokerHostError::InvalidObservationSignature);
        }
    }

    let body = &data["observations"]["bundle"]["body"];
    let mut state_preimage = b"AKG:BROKER:STATE:v1\0".to_vec();
    state_preimage.extend(canonical_json(body));
    let state_hash = blake3::hash(&state_preimage);
    let mut state_leaf_preimage = vec![0u8];
    state_leaf_preimage.extend_from_slice(state_hash.as_bytes());
    let state_root = blake3::hash(&state_leaf_preimage);
    if Some(state_hash.to_hex().as_str()) != data["anchors"]["state_record_hash"].as_str()
        || Some(state_root.to_hex().as_str()) != data["anchors"]["state_root"].as_str()
        || data["anchors"]["state_proof"]
            != json!({ "leaf_count": 1, "leaf_index": 0, "steps": [] })
    {
        return Err(BrokerHostError::StateCheckpointInvalid);
    }

    if body["subject"] != data["session"]["principal"] {
        return Err(BrokerHostError::SessionSubjectMismatch);
    }

    let expected_resources: BTreeSet<&str> = body["resources"]
        .as_array()
        .map(|arr| arr.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let chunk_resources: BTreeSet<&str> = data["chunks"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|c| c["chunk_id"].as_str()).collect())
        .unwrap_or_default();
    if expected_resources != chunk_resources {
        return Err(BrokerHostError::ResourceSetMismatch);
    }

    let profile_id = data["policy"]["profile_id"]
        .as_str()
        .unwrap_or("")
        .to_owned();
    let anchors = data["anchors"].clone();
    let mut any_invalid = false;
    if let Some(chunks) = data["chunks"].as_array_mut() {
        for c in chunks {
            if !verify_chunk_material(c, &anchors, &profile_id) {
                c["per_chunk"]["integrity"] = json!("Invalid");
                any_invalid = true;
            }
        }
    }
    if any_invalid {
        data["observations"]["integrity"] = json!("Invalid");
    }

    let result = decide(&data);
    let agent_payload = if result["delivery"]["outcome"].as_str() == Some("Release") {
        result["released_payload"].clone()
    } else {
        json!({
            "chunks": [],
            "claim_status": "Omitted",
            "restrictions": [],
        })
    };

    Ok(HostEvaluation {
        host_audit: result,
        agent_payload,
    })
}
