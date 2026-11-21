//! End-to-end governed execution cycle (I1–I7):
//! `SignedPolicyBundle` -> `SqliteActivationStore` -> `ContainmentGate`
//! -> observable effect -> signed `ExecutionReceipt` -> `rbb::mmr` inclusion
//! -> offline verification against a signed `MmrCheckpoint`.
//!
//! Receipts and checkpoints use Ed25519 (`verify_strict`), matching Camada 0
//! (`arkhe-governance::policy_bundle`). Receipts prove occurrence, policy
//! binding, and integrity — not semantic correctness of the output.

use crate::activation_sqlite::{OutboxError, OutboxRecord, SqliteActivationStore};
use crate::{AuthorizationDecision, ContainmentGate};
use arkhe_core::work::{WorkIntent, WorkIntentType};
use arkhe_core::{canonical, CanonicalEncode, Digest32};
use arkhe_governance::activation::candidate_digest;
use arkhe_governance::policy_bundle::{SignaturePolicy, TrustStore};
use arkhe_governance::{PolicyBinding, PolicyResolver, PolicyVerdict};
use arkhe_verify_core::rbb::mmr::{self, Frontier, Proof};
use ed25519_dalek::{Signature, Signer, SigningKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const ACTIVE_POLICY_SCHEMA: &str = "arkhe.kernel.active-policy/1";
pub const EXECUTION_RECEIPT_SCHEMA: &str = "arkhe.kernel.execution-receipt/1";
pub const MMR_CHECKPOINT_SCHEMA: &str = "arkhe.kernel.mmr-checkpoint/1";

const DOMAIN_ACTION_INPUT: &[u8] = b"AKG:ACTION:INPUT:v1\0";
const DOMAIN_ACTION_OUTPUT: &[u8] = b"AKG:ACTION:OUTPUT:v1\0";
const DOMAIN_RECEIPT_LEAF: &[u8] = b"AKG:EXECUTION:RECEIPT:LEAF:v1\0";

/// Declarative default-deny policy document carried inside the candidate bytes
/// of an activated `SignedPolicyBundle`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActivePolicyDocument {
    pub schema: String,
    pub allowed_intents: Vec<WorkIntentType>,
}

impl ActivePolicyDocument {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        let doc: Self = serde_json::from_slice(bytes)
            .map_err(|e| format!("invalid active policy document JSON: {e}"))?;
        if doc.schema != ACTIVE_POLICY_SCHEMA {
            return Err(format!("unknown active policy schema {:?}", doc.schema));
        }
        Ok(doc)
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>, String> {
        serde_json::to_vec(self).map_err(|e| format!("serialize active policy document: {e}"))
    }
}

/// Default-deny [`PolicyResolver`] backed by the active policy bytes loaded from
/// [`SqliteActivationStore`].
pub struct ActivePolicyResolver(pub ActivePolicyDocument);

impl PolicyResolver for ActivePolicyResolver {
    fn resolve(&self, intent: &WorkIntent, _binding: &PolicyBinding) -> PolicyVerdict {
        if self.0.allowed_intents.contains(&intent.intent_type) {
            PolicyVerdict::Allow
        } else {
            PolicyVerdict::Deny(format!(
                "intent {:?} not permitted by active policy",
                intent.intent_type
            ))
        }
    }
}

/// Outcome bound into a signed [`ExecutionReceipt`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ReceiptOutcome {
    Executed {
        authorization_ref: String,
        observed_output_digest: String,
    },
    Rejected {
        reason: String,
    },
}

/// Signed receipt binding an action attempt (executed or refused) to the active
/// policy, its activation event, and the observed input/output digests.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecutionReceipt {
    pub schema: String,
    pub policy_id: String,
    pub policy_version: Option<u64>,
    pub policy_bundle_digest: Option<String>,
    pub active_candidate_digest: Option<String>,
    pub activation_event_digest: Option<String>,
    pub intent_digest: String,
    pub action_input_digest: String,
    pub outcome: ReceiptOutcome,
    pub executed_at: i64,
    pub signer_key_id: String,
    pub signature_hex: String,
}

impl CanonicalEncode for ExecutionReceipt {
    const DOMAIN_OBJECT: &'static [u8] = b"AKG:EXECUTION:RECEIPT:v1\0";

    fn unsigned_projection(&self) -> Value {
        json!({
            "schema": self.schema,
            "policy_id": self.policy_id,
            "policy_version": self.policy_version,
            "policy_bundle_digest": self.policy_bundle_digest,
            "active_candidate_digest": self.active_candidate_digest,
            "activation_event_digest": self.activation_event_digest,
            "intent_digest": self.intent_digest,
            "action_input_digest": self.action_input_digest,
            "outcome": self.outcome,
            "executed_at": self.executed_at,
            "signer_key_id": self.signer_key_id,
        })
    }
}

impl ExecutionReceipt {
    /// Sign the canonical unsigned projection of the receipt with Ed25519.
    pub fn sign(&mut self, signer: &SigningKey) {
        let sig = signer.sign(&self.canonical_bytes());
        self.signature_hex = hex::encode(sig.to_bytes());
    }

    /// Verify schema and Ed25519 signature (`verify_strict`) against `trust`.
    pub fn verify(&self, trust: &TrustStore) -> Result<(), OfflineVerifyError> {
        if self.schema != EXECUTION_RECEIPT_SCHEMA {
            return Err(OfflineVerifyError::InvalidReceiptSchema(
                self.schema.clone(),
            ));
        }
        let sig_bytes =
            decode_sig64(&self.signature_hex).ok_or(OfflineVerifyError::InvalidReceiptSignature)?;
        let key = trust
            .get(&self.signer_key_id)
            .ok_or_else(|| OfflineVerifyError::UnknownReceiptKey(self.signer_key_id.clone()))?;
        key.verify_strict(&self.canonical_bytes(), &Signature::from_bytes(&sig_bytes))
            .map_err(|_| OfflineVerifyError::InvalidReceiptSignature)
    }

    /// Canonical 32-byte MMR leaf digest covering both the unsigned receipt
    /// payload and its signature so any tampering breaks MMR inclusion.
    pub fn leaf_hash(&self) -> [u8; 32] {
        let full = canonical::encode_value(&json!({
            "unsigned": self.unsigned_projection(),
            "signature_hex": self.signature_hex,
        }));
        Digest32::blake3(DOMAIN_RECEIPT_LEAF, &full).0
    }
}

/// Signed MMR root checkpoint used by an independent offline verifier.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MmrCheckpoint {
    pub schema: String,
    pub leaf_count: u64,
    pub root_hex: String,
    pub issued_at: i64,
    pub signer_key_id: String,
    pub signature_hex: String,
}

impl CanonicalEncode for MmrCheckpoint {
    const DOMAIN_OBJECT: &'static [u8] = b"AKG:MMR:CHECKPOINT:v1\0";

    fn unsigned_projection(&self) -> Value {
        json!({
            "schema": self.schema,
            "leaf_count": self.leaf_count,
            "root_hex": self.root_hex,
            "issued_at": self.issued_at,
            "signer_key_id": self.signer_key_id,
        })
    }
}

impl MmrCheckpoint {
    pub fn sign(
        leaf_count: u64,
        root: [u8; 32],
        issued_at: i64,
        signer_key_id: impl Into<String>,
        signer: &SigningKey,
    ) -> Self {
        let mut cp = Self {
            schema: MMR_CHECKPOINT_SCHEMA.into(),
            leaf_count,
            root_hex: hex::encode(root),
            issued_at,
            signer_key_id: signer_key_id.into(),
            signature_hex: String::new(),
        };
        let sig = signer.sign(&cp.canonical_bytes());
        cp.signature_hex = hex::encode(sig.to_bytes());
        cp
    }

    pub fn verify(&self, trust: &TrustStore) -> Result<[u8; 32], OfflineVerifyError> {
        if self.schema != MMR_CHECKPOINT_SCHEMA {
            return Err(OfflineVerifyError::InvalidCheckpointSchema(
                self.schema.clone(),
            ));
        }
        let root =
            decode_hash32(&self.root_hex).ok_or(OfflineVerifyError::InvalidCheckpointSignature)?;
        let sig_bytes = decode_sig64(&self.signature_hex)
            .ok_or(OfflineVerifyError::InvalidCheckpointSignature)?;
        let key = trust
            .get(&self.signer_key_id)
            .ok_or_else(|| OfflineVerifyError::UnknownCheckpointKey(self.signer_key_id.clone()))?;
        key.verify_strict(&self.canonical_bytes(), &Signature::from_bytes(&sig_bytes))
            .map_err(|_| OfflineVerifyError::InvalidCheckpointSignature)?;
        Ok(root)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MmrLeafKind {
    ActivationEvent,
    ExecutionReceiptExecuted,
    ExecutionReceiptRejected,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MmrEntry {
    pub leaf_index: u64,
    pub dedup_key: String,
    pub kind: MmrLeafKind,
    pub record: [u8; 32],
}

/// Append-only MMR log backed by [`arkhe_verify_core::rbb::mmr::Frontier`] with
/// idempotent projection of activation outbox records and execution receipts.
#[derive(Debug, Default)]
pub struct MmrLog {
    frontier: Frontier,
    entries: Vec<MmrEntry>,
}

impl MmrLog {
    pub fn new() -> Self {
        Self::default()
    }

    /// Append a record idempotently by `dedup_key`. Re-projecting the same
    /// key with the same 32-byte digest returns the existing leaf index; a
    /// divergent digest fails with [`OutboxError::IntegrityViolation`].
    pub fn append_idempotent(
        &mut self,
        dedup_key: impl Into<String>,
        kind: MmrLeafKind,
        record: [u8; 32],
        seq_for_err: u64,
    ) -> Result<u64, OutboxError> {
        let dedup_key = dedup_key.into();
        if let Some(existing) = self.entries.iter().find(|e| e.dedup_key == dedup_key) {
            if existing.record != record {
                return Err(OutboxError::IntegrityViolation {
                    seq: seq_for_err,
                    reason: format!("divergent digest for MMR key {dedup_key}"),
                });
            }
            return Ok(existing.leaf_index);
        }

        let leaf_index = self
            .frontier
            .append(&record)
            .map_err(|e| OutboxError::Storage(format!("mmr append failed: {e}")))?;
        self.entries.push(MmrEntry {
            leaf_index,
            dedup_key,
            kind,
            record,
        });
        Ok(leaf_index)
    }

    /// Project an activation outbox record into the MMR as a 32-byte leaf.
    pub fn project_outbox_record(&mut self, rec: &OutboxRecord) -> Result<u64, OutboxError> {
        let digest = parse_blake3_digest(&rec.event_digest).ok_or_else(|| {
            OutboxError::IntegrityViolation {
                seq: rec.event_seq,
                reason: format!("malformed activation event digest {}", rec.event_digest),
            }
        })?;
        self.append_idempotent(
            format!("activation:{}", rec.event_seq),
            MmrLeafKind::ActivationEvent,
            digest,
            rec.event_seq,
        )
    }

    pub fn leaf_index_for_record(&self, record: &[u8; 32]) -> Option<u64> {
        self.entries
            .iter()
            .find(|e| &e.record == record)
            .map(|e| e.leaf_index)
    }

    pub fn entries(&self) -> &[MmrEntry] {
        &self.entries
    }

    pub fn count_kind(&self, kind: MmrLeafKind) -> usize {
        self.entries.iter().filter(|e| e.kind == kind).count()
    }

    pub fn prove(&self, leaf_index: u64) -> Result<Proof, String> {
        let records: Vec<[u8; 32]> = self.entries.iter().map(|e| e.record).collect();
        let idx = usize::try_from(leaf_index).map_err(|_| "leaf_index overflow".to_string())?;
        mmr::prove(&records, idx).map_err(|e| format!("mmr prove failed: {e}"))
    }

    pub fn sign_checkpoint(
        &self,
        issued_at: i64,
        signer_key_id: impl Into<String>,
        signer: &SigningKey,
    ) -> Result<MmrCheckpoint, String> {
        let root = self
            .frontier
            .root()
            .map_err(|e| format!("mmr root failed: {e}"))?;
        Ok(MmrCheckpoint::sign(
            self.frontier.count,
            root,
            issued_at,
            signer_key_id,
            signer,
        ))
    }
}

/// Result returned by [`execute_governed`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GovernedOutcome {
    pub receipt: ExecutionReceipt,
    pub receipt_leaf_index: u64,
    pub activation_leaf_index: Option<u64>,
    pub output: Option<Vec<u8>>,
}

/// Normal kernel entry point for governed action execution.
///
/// 1. Projects any pending activation outbox events idempotently into `mmr`.
/// 2. Loads the active [`SignedPolicyBundle`] and candidate bytes directly from
///    [`SqliteActivationStore`] (never trusting unpersisted in-memory state).
/// 3. Re-verifies signature, trust store, rollback floor, and validity window
///    at `now`, plus recomputes `candidate_digest(candidate_bytes)`.
/// 4. Evaluates the loaded policy through [`ContainmentGate::authorize`].
/// 5. On `Allow`, executes `execute_effect`, captures observed output bytes,
///    signs an `Executed` receipt, and appends it to `mmr`.
/// 6. On any refusal, never invokes `execute_effect`, signs a `Rejected`
///    receipt, and appends it to `mmr` so audits distinguish refused actions
///    from unsubmitted ones.
#[allow(clippy::too_many_arguments)]
pub fn execute_governed<F>(
    store: &mut SqliteActivationStore,
    mmr: &mut MmrLog,
    policy_id: &str,
    intent: &WorkIntent,
    action_input: &[u8],
    policy_trust: &TrustStore,
    receipt_key_id: &str,
    receipt_signer: &SigningKey,
    now: i64,
    execute_effect: F,
) -> Result<GovernedOutcome, String>
where
    F: FnOnce(&WorkIntent, &[u8]) -> Result<Vec<u8>, String>,
{
    store
        .reconcile_outbox(|rec| mmr.project_outbox_record(rec).map(|_| ()))
        .map_err(|e| format!("outbox reconciliation failed: {e:?}"))?;

    let intent_digest = format!("blake3:{}", intent.digest().to_hex());
    let action_input_digest = format!(
        "blake3:{}",
        Digest32::blake3(DOMAIN_ACTION_INPUT, action_input).to_hex()
    );

    let loaded = match store.load_active_bundle(policy_id)? {
        Some(bundle) => bundle,
        None => {
            return record_rejection(
                mmr,
                policy_id,
                None,
                None,
                None,
                None,
                None,
                intent_digest,
                action_input_digest,
                "no active policy in store".into(),
                now,
                receipt_key_id,
                receipt_signer,
            );
        }
    };

    let policy_version = Some(loaded.active.version);
    let policy_bundle_digest = Some(format!("blake3:{}", loaded.bundle.digest().to_hex()));
    let active_candidate_digest = Some(loaded.active.candidate_digest.clone());
    let activation_event_digest = Some(loaded.activation_event_digest.clone());
    let activation_leaf_index = parse_blake3_digest(&loaded.activation_event_digest)
        .and_then(|d| mmr.leaf_index_for_record(&d));

    // Re-verify persisted bundle against trust store and current clock `now`.
    let binding = match loaded.bundle.verify(
        policy_trust,
        loaded.active.version,
        SignaturePolicy::Required,
        now,
    ) {
        Ok(b) => b,
        Err(err) => {
            return record_rejection(
                mmr,
                policy_id,
                policy_version,
                policy_bundle_digest,
                active_candidate_digest,
                activation_event_digest,
                activation_leaf_index,
                intent_digest,
                action_input_digest,
                format!("active policy verification failed: {err:?}"),
                now,
                receipt_key_id,
                receipt_signer,
            );
        }
    };

    // Recompute candidate digest from the loaded bytes before parsing or running.
    let recomputed = candidate_digest(&loaded.candidate_bytes);
    if recomputed != loaded.active.candidate_digest {
        return record_rejection(
            mmr,
            policy_id,
            policy_version,
            policy_bundle_digest,
            active_candidate_digest,
            activation_event_digest,
            activation_leaf_index,
            intent_digest,
            action_input_digest,
            format!(
                "loaded policy bytes digest mismatch: active={}, recomputed={recomputed}",
                loaded.active.candidate_digest
            ),
            now,
            receipt_key_id,
            receipt_signer,
        );
    }

    let doc = match ActivePolicyDocument::from_bytes(&loaded.candidate_bytes) {
        Ok(d) => d,
        Err(reason) => {
            return record_rejection(
                mmr,
                policy_id,
                policy_version,
                policy_bundle_digest,
                active_candidate_digest,
                activation_event_digest,
                activation_leaf_index,
                intent_digest,
                action_input_digest,
                reason,
                now,
                receipt_key_id,
                receipt_signer,
            );
        }
    };

    // Pass through the real kernel ContainmentGate.
    let gate = ContainmentGate::new(ActivePolicyResolver(doc));
    let authorization_ref = match gate.authorize(intent, None, &binding) {
        AuthorizationDecision::Allow { authorization_ref } => {
            format!("blake3:{}", authorization_ref.to_hex())
        }
        AuthorizationDecision::Reject { reason } => {
            return record_rejection(
                mmr,
                policy_id,
                policy_version,
                policy_bundle_digest,
                active_candidate_digest,
                activation_event_digest,
                activation_leaf_index,
                intent_digest,
                action_input_digest,
                reason,
                now,
                receipt_key_id,
                receipt_signer,
            );
        }
    };

    let output = execute_effect(intent, action_input)?;
    let observed_output_digest = format!(
        "blake3:{}",
        Digest32::blake3(DOMAIN_ACTION_OUTPUT, &output).to_hex()
    );

    let mut receipt = ExecutionReceipt {
        schema: EXECUTION_RECEIPT_SCHEMA.into(),
        policy_id: policy_id.into(),
        policy_version,
        policy_bundle_digest,
        active_candidate_digest,
        activation_event_digest,
        intent_digest,
        action_input_digest,
        outcome: ReceiptOutcome::Executed {
            authorization_ref,
            observed_output_digest,
        },
        executed_at: now,
        signer_key_id: receipt_key_id.into(),
        signature_hex: String::new(),
    };
    receipt.sign(receipt_signer);

    let leaf = receipt.leaf_hash();
    let receipt_leaf_index = mmr
        .append_idempotent(
            format!("receipt:{}", hex::encode(leaf)),
            MmrLeafKind::ExecutionReceiptExecuted,
            leaf,
            0,
        )
        .map_err(|e| format!("append executed receipt to mmr: {e:?}"))?;

    Ok(GovernedOutcome {
        receipt,
        receipt_leaf_index,
        activation_leaf_index,
        output: Some(output),
    })
}

#[allow(clippy::too_many_arguments)]
fn record_rejection(
    mmr: &mut MmrLog,
    policy_id: &str,
    policy_version: Option<u64>,
    policy_bundle_digest: Option<String>,
    active_candidate_digest: Option<String>,
    activation_event_digest: Option<String>,
    activation_leaf_index: Option<u64>,
    intent_digest: String,
    action_input_digest: String,
    reason: String,
    now: i64,
    receipt_key_id: &str,
    receipt_signer: &SigningKey,
) -> Result<GovernedOutcome, String> {
    let mut receipt = ExecutionReceipt {
        schema: EXECUTION_RECEIPT_SCHEMA.into(),
        policy_id: policy_id.into(),
        policy_version,
        policy_bundle_digest,
        active_candidate_digest,
        activation_event_digest,
        intent_digest,
        action_input_digest,
        outcome: ReceiptOutcome::Rejected { reason },
        executed_at: now,
        signer_key_id: receipt_key_id.into(),
        signature_hex: String::new(),
    };
    receipt.sign(receipt_signer);

    let leaf = receipt.leaf_hash();
    let receipt_leaf_index = mmr
        .append_idempotent(
            format!("receipt:{}", hex::encode(leaf)),
            MmrLeafKind::ExecutionReceiptRejected,
            leaf,
            0,
        )
        .map_err(|e| format!("append rejected receipt to mmr: {e:?}"))?;

    Ok(GovernedOutcome {
        receipt,
        receipt_leaf_index,
        activation_leaf_index,
        output: None,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OfflineVerifyError {
    InvalidCheckpointSchema(String),
    UnknownCheckpointKey(String),
    InvalidCheckpointSignature,
    InvalidReceiptSchema(String),
    UnknownReceiptKey(String),
    InvalidReceiptSignature,
    ReceiptNotInMmr,
    ActivationNotInMmr,
    ActivationDigestMismatch,
}

/// Independent offline verification of a receipt, its MMR inclusion proof,
/// optional activation event proof, and signed MMR checkpoint. Requires zero
/// access to the operational SQLite database or kernel runtime.
pub fn verify_offline_bundle(
    receipt: &ExecutionReceipt,
    receipt_proof: &Proof,
    activation_proof: Option<([u8; 32], &Proof)>,
    checkpoint: &MmrCheckpoint,
    receipt_trust: &TrustStore,
    checkpoint_trust: &TrustStore,
) -> Result<(), OfflineVerifyError> {
    let root = checkpoint.verify(checkpoint_trust)?;
    receipt.verify(receipt_trust)?;

    let receipt_leaf = receipt.leaf_hash();
    mmr::verify(&receipt_leaf, receipt_proof, checkpoint.leaf_count, &root)
        .map_err(|_| OfflineVerifyError::ReceiptNotInMmr)?;

    if let Some((act_leaf, act_proof)) = activation_proof {
        let expected = format!("blake3:{}", hex::encode(act_leaf));
        if receipt.activation_event_digest.as_deref() != Some(expected.as_str()) {
            return Err(OfflineVerifyError::ActivationDigestMismatch);
        }
        mmr::verify(&act_leaf, act_proof, checkpoint.leaf_count, &root)
            .map_err(|_| OfflineVerifyError::ActivationNotInMmr)?;
    }

    Ok(())
}

/// Parse a `blake3:<64hex>` string into 32 raw bytes.
pub fn parse_blake3_digest(value: &str) -> Option<[u8; 32]> {
    let hex_str = value.strip_prefix("blake3:")?;
    decode_hash32(hex_str)
}

fn decode_hash32(hex_str: &str) -> Option<[u8; 32]> {
    let bytes = hex::decode(hex_str).ok()?;
    bytes.try_into().ok()
}

fn decode_sig64(hex_str: &str) -> Option<[u8; 64]> {
    let bytes = hex::decode(hex_str).ok()?;
    bytes.try_into().ok()
}
