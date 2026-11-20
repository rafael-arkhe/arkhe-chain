//! The AID payload, envelope, trust policy and verdict types of v1.0-rc5.
//!
//! The split is the one the rc4 round introduced and rc5 keeps: the payload
//! determines the `aid`, and everything that depends on the `aid` — signatures,
//! timestamp tokens, evidence, the predecessor — lives in the envelope.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

/// The schema every rc5 payload and envelope declares.
pub const SCHEMA_VERSION: &str = "arkhe.agi.identity/1.0";

/// Domain separation for the `aid` digest: `SHA-256(DOMAIN_AID || JCS(payload))`.
pub const DOMAIN_AID: &[u8] = b"ARKHE-AID-v1\0";

/// Domain separation for the signed bytes: `DOMAIN_SIG || aid`, where `aid` is
/// the UTF-8 text `sha256:<64hex>` (71 bytes), not the 32 raw digest bytes.
pub const DOMAIN_SIG: &[u8] = b"ARKHE-AID-SIG-v1\0";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    Genesis,
    Extend,
    Rotate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Algorithm {
    #[serde(rename = "Ed25519")]
    Ed25519,
    #[serde(rename = "ML-DSA-65")]
    MlDsa65,
}

impl Algorithm {
    /// The fixed length of `signature_bytes` in lowercase hex characters (§1.2).
    pub fn signature_hex_len(self) -> usize {
        match self {
            Algorithm::Ed25519 => 128,
            Algorithm::MlDsa65 => 6618,
        }
    }

    /// The fixed length of `public_key` in lowercase hex characters.
    pub fn public_key_hex_len(self) -> usize {
        match self {
            Algorithm::Ed25519 => 64,
            Algorithm::MlDsa65 => 3904,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Emitter,
    Successor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Payload {
    pub schema_version: String,
    pub agent_id: String,
    pub previous_aid: Option<String>,
    pub operation: Operation,
    pub provenance_timestamp: String,
    pub descriptor: Descriptor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Descriptor {
    pub model: ModelDimension,
    pub history: HistoryDimension,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub training: Option<TrainingDimension>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime: Option<RuntimeDimension>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<CapabilityDimension>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub governance: Option<GovernanceDimension>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelDimension {
    pub manifest_hash: String,
    pub architecture: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parameter_count: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryDimension {
    pub history_root: String,
    pub event_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TrainingDimension {
    pub lineage_root: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checkpoint_count: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeDimension {
    pub config_digest: String,
    pub determinism_profile: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapabilityDimension {
    pub capability_set_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GovernanceDimension {
    pub values_hash: String,
    pub constitution_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignatureEntry {
    pub role: Role,
    pub algorithm: Algorithm,
    pub public_key: String,
    pub signature_bytes: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TimestampEvidence {
    pub signature_role: Role,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tsa_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tsa_key_fingerprint: Option<String>,
}

/// The artefacts a verifier needs to recompute the digests a payload declares.
///
/// Byte-carrying fields are lowercase hex, not base64: the rest of this
/// repository's vectors are hex, and a frozen vector should not need a second
/// transfer encoding to be read.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Evidence {
    /// The model manifest bytes whose SHA-256 is `descriptor.model.manifest_hash`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_manifest: Option<String>,
    /// The canonical bytes of each history event, in order.
    #[serde(default)]
    pub history_events: Vec<String>,
    /// RFC 9162 consistency proof between the predecessor's history root and
    /// this payload's. Empty is the proof for two empty histories.
    #[serde(default)]
    pub history_consistency_proof: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Predecessor {
    pub aid: String,
    pub payload: Value,
    pub signatures: Vec<SignatureEntry>,
    #[serde(default)]
    pub evidence: Evidence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub schema_version: String,
    pub payload: Value,
    pub aid: String,
    pub signatures: Vec<SignatureEntry>,
    #[serde(default)]
    pub timestamp_evidence: Vec<TimestampEvidence>,
    #[serde(default)]
    pub evidence: Evidence,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub predecessor: Option<Predecessor>,
    pub trust_root_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TrustedKey {
    pub public_key: String,
    pub algorithm: Algorithm,
    pub authorized_agent_ids: Vec<String>,
    pub authorized_operations: Vec<Operation>,
    pub valid_from: String,
    pub valid_until: String,
}

/// The authorization policy. It is the verifier's, configured out-of-band, and
/// never travels inside the envelope.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TrustRoot {
    pub trust_root_id: String,
    pub keys: Vec<TrustedKey>,
}

impl TrustRoot {
    pub fn key(&self, public_key_hex: &str) -> Option<&TrustedKey> {
        self.keys.iter().find(|k| k.public_key == public_key_hex)
    }
}

/// The dimensions a profile requires. Anything else is `NOT_REQUIRED`, which is
/// not a pass: it is a dimension declared outside the scope of the claim.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Profile {
    ModelOnly,
    Historical,
    Full,
}

/// Every dimension name a result reports on, in a fixed order.
pub const DIMENSIONS: [&str; 7] = [
    "capabilities",
    "continuity",
    "governance",
    "history",
    "model",
    "runtime",
    "training",
];

impl Profile {
    pub fn requires(self, dimension: &str) -> bool {
        match self {
            Profile::ModelOnly => matches!(dimension, "model" | "history" | "continuity"),
            Profile::Historical => {
                matches!(dimension, "model" | "history" | "continuity")
            }
            Profile::Full => true,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Profile::ModelOnly => "model-only",
            Profile::Historical => "historical",
            Profile::Full => "full",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Pass,
    Fail,
    Inconclusive,
}

impl Verdict {
    pub fn exit_code(self) -> i32 {
        match self {
            Verdict::Pass => 0,
            Verdict::Fail => 1,
            Verdict::Inconclusive => 2,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Verdict::Pass => "PASS",
            Verdict::Fail => "FAIL",
            Verdict::Inconclusive => "INCONCLUSIVE",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DimensionStatus {
    Pass,
    Fail { reason: String },
    Inconclusive { reason: String },
    /// Outside the profile's scope: neither verified nor contradicted.
    NotRequired,
}

impl DimensionStatus {
    pub fn label(&self) -> &'static str {
        match self {
            DimensionStatus::Pass => "PASS",
            DimensionStatus::Fail { .. } => "FAIL",
            DimensionStatus::Inconclusive { .. } => "INCONCLUSIVE",
            DimensionStatus::NotRequired => "NOT_REQUIRED",
        }
    }

    pub fn reason(&self) -> Option<&str> {
        match self {
            DimensionStatus::Fail { reason } | DimensionStatus::Inconclusive { reason } => {
                Some(reason)
            }
            _ => None,
        }
    }
}

/// The stage at which verification stopped. The stage is part of the frozen
/// expectation of a vector: a vector that fails at the wrong stage has not
/// demonstrated the rule it was written for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureStage {
    Parse,
    Schema,
    AidRecomputation,
    PredecessorAidRecomputation,
    Authorization,
    SignatureVerification,
    PredecessorAuthentication,
    Continuity,
    HistoryEvidence,
    HistoryConsistency,
    ModelEvidence,
}

impl FailureStage {
    pub fn label(self) -> &'static str {
        match self {
            FailureStage::Parse => "parse",
            FailureStage::Schema => "schema",
            FailureStage::AidRecomputation => "aid_recomputation",
            FailureStage::PredecessorAidRecomputation => "predecessor_aid_recomputation",
            FailureStage::Authorization => "authorization",
            FailureStage::SignatureVerification => "signature_verification",
            FailureStage::PredecessorAuthentication => "predecessor_authentication",
            FailureStage::Continuity => "continuity",
            FailureStage::HistoryEvidence => "history_evidence",
            FailureStage::HistoryConsistency => "history_consistency",
            FailureStage::ModelEvidence => "model_evidence",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerificationResult {
    pub verdict: Verdict,
    pub exit_code: i32,
    /// Set whenever the verdict is not `PASS`.
    pub failure_stage: Option<FailureStage>,
    pub reason: Option<String>,
    pub dimensions: BTreeMap<String, DimensionStatus>,
}

impl VerificationResult {
    /// The result as a vector would record it: verdict, exit code, stage, and
    /// one label per dimension.
    pub fn to_json(&self) -> Value {
        let mut dimensions = serde_json::Map::new();
        for (name, status) in &self.dimensions {
            dimensions.insert(name.clone(), Value::String(status.label().to_owned()));
        }
        let mut out = serde_json::Map::new();
        out.insert("verdict".into(), Value::String(self.verdict.label().into()));
        out.insert("exit_code".into(), Value::from(self.exit_code));
        if let Some(stage) = self.failure_stage {
            out.insert("failure_stage".into(), Value::String(stage.label().into()));
        }
        out.insert("dimensions".into(), Value::Object(dimensions));
        Value::Object(out)
    }
}

/// What the unit level of a vector sees: the errors of recomputing an `aid`
/// from a payload, without any of the envelope's other evidence.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AidError {
    #[error("strict parse rejected the payload: {0}")]
    Parse(String),
    #[error("payload does not match the AID schema: {0}")]
    Schema(String),
    #[error("aid mismatch: declared {declared}, recomputed {recomputed}")]
    AidMismatch {
        declared: String,
        recomputed: String,
    },
}
