//! AID v1.0-rc5 verification, in the order the specification fixes.
//!
//! The order is the point. A predecessor's `aid` is recomputed from its payload
//! **before** any signature is verified, so that keeping an original signature
//! while swapping the payload it covers fails at recomputation and not later.
//! That is the rule vector V06 exists to demonstrate.
//!
//! What this build verifies, and what it refuses to claim:
//!
//! * `model-only` is verified end to end: strict parse, schema, `aid`
//!   recomputation, predecessor recomputation, authorization, Ed25519
//!   signatures, the model manifest digest, the history root over the supplied
//!   events, and the continuity link including the RFC 9162 consistency proof
//!   for any pair of history sizes.
//! * `historical` and `full` are declared and return `INCONCLUSIVE`: RFC 3161
//!   token verification and the training, runtime, capability and governance
//!   evidence paths are not implemented, and a profile that cannot be verified
//!   must not be reported as passing.
//! * ML-DSA-65 signatures return `INCONCLUSIVE`. The algorithm is in the
//!   schema; no verifier for it is linked here.

use std::collections::{BTreeMap, BTreeSet};

use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use super::jcs::Strict;
use super::merkle;
use super::types::{
    AidError, Algorithm, DimensionStatus, Envelope, FailureStage, Operation, Payload, Profile,
    Role, SignatureEntry, TrustRoot, Verdict, VerificationResult, DIMENSIONS, DOMAIN_AID,
    DOMAIN_SIG, SCHEMA_VERSION,
};
use crate::hash::sha256;

/// `"sha256:" + hex(SHA-256("ARKHE-AID-v1\0" || JCS(payload)))`.
pub fn aid_from_canonical(canonical: &[u8]) -> String {
    let mut preimage = DOMAIN_AID.to_vec();
    preimage.extend_from_slice(canonical);
    format!("sha256:{}", hex::encode(sha256(&preimage)))
}

/// The bytes a signature of role covers: `"ARKHE-AID-SIG-v1\0"` followed by the
/// UTF-8 text of the `aid` (71 bytes), never the 32 raw digest bytes.
pub fn signed_bytes(aid: &str) -> Vec<u8> {
    let mut out = DOMAIN_SIG.to_vec();
    out.extend_from_slice(aid.as_bytes());
    out
}

/// Strict parse, schema validation, canonicalization and digest of a payload.
/// Returns the `aid` and the canonical bytes it was computed over.
pub fn compute_aid(payload_json: &[u8]) -> Result<(String, Vec<u8>), AidError> {
    let strict = Strict::parse(payload_json).map_err(AidError::Parse)?;
    let canonical = strict.canonical_bytes();
    validate_payload(&strict)?;
    Ok((aid_from_canonical(&canonical), canonical))
}

/// The unit level of V06: recompute a predecessor's `aid` from its payload and
/// compare it with the declared one. No signature, no envelope, no policy.
pub fn recompute_predecessor_aid(
    predecessor_payload_json: &[u8],
    declared_aid: &str,
) -> Result<String, AidError> {
    let (recomputed, _) = compute_aid(predecessor_payload_json)?;
    if recomputed != declared_aid {
        return Err(AidError::AidMismatch {
            declared: declared_aid.to_owned(),
            recomputed,
        });
    }
    Ok(recomputed)
}

/// Typed validation of an already strictly parsed payload.
pub fn validate_payload(strict: &Strict) -> Result<Payload, AidError> {
    // `previous_aid` is declared, as `null` for a genesis. Absence is not the
    // same statement, and serde would read both as `None`.
    if strict.get("previous_aid").is_none() {
        return Err(AidError::Schema(
            "previous_aid is absent; a genesis declares it as null".into(),
        ));
    }
    let payload: Payload =
        serde_json::from_value(strict.to_json()).map_err(|e| AidError::Schema(e.to_string()))?;
    if payload.schema_version != SCHEMA_VERSION {
        return Err(AidError::Schema(format!(
            "unknown schema_version {:?}",
            payload.schema_version
        )));
    }
    if !is_instant(&payload.provenance_timestamp) {
        return Err(AidError::Schema(
            "provenance_timestamp is not a UTC instant of the form YYYY-MM-DDTHH:MM:SSZ".into(),
        ));
    }
    if let Some(previous) = &payload.previous_aid {
        if !is_aid(previous) {
            return Err(AidError::Schema("previous_aid is not sha256:<64hex>".into()));
        }
    }
    for digest in [
        &payload.descriptor.model.manifest_hash,
        &payload.descriptor.history.history_root,
    ] {
        if !is_aid(digest) {
            return Err(AidError::Schema(format!(
                "descriptor digest {digest:?} is not sha256:<64hex>"
            )));
        }
    }
    if payload.descriptor.history.event_count < 0 {
        return Err(AidError::Schema("event_count is negative".into()));
    }
    Ok(payload)
}

/// `sha256:<64hex>`, lowercase, 71 bytes of UTF-8.
pub fn is_aid(value: &str) -> bool {
    value
        .strip_prefix("sha256:")
        .is_some_and(|hex| is_lower_hex(hex, 64))
}

fn is_lower_hex(value: &str, len: usize) -> bool {
    value.len() == len && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// `YYYY-MM-DDTHH:MM:SSZ` exactly: 20 characters, UTC, second resolution. The
/// shape is fixed so that comparing two instants is comparing two strings.
pub fn is_instant(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 20 {
        return false;
    }
    let digits = [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18];
    let marks = [(4, b'-'), (7, b'-'), (10, b'T'), (13, b':'), (16, b':'), (19, b'Z')];
    digits.iter().all(|&i| bytes[i].is_ascii_digit())
        && marks.iter().all(|&(i, c)| bytes[i] == c)
}

/// What the bundle says about its link to a previous snapshot.
enum Link<'a> {
    /// `previous_aid` is null: there is no edge to verify.
    Genesis,
    /// `previous_aid` is declared and no predecessor is presented.
    Missing,
    Present(Payload, &'a super::types::Predecessor),
}

/// Where verification stopped, and whether the stop is a contradiction (`FAIL`)
/// or missing evidence (`INCONCLUSIVE`).
enum Stop {
    Fail(FailureStage, String),
    Inconclusive(FailureStage, String),
}

/// Verify a bundle against a trust policy under a profile.
///
/// `verification_time` is the instant the verifier is acting at. It bounds the
/// declared provenance instant: a snapshot may not claim to have been signed
/// after the moment it is being verified.
pub fn verify(
    envelope_json: &[u8],
    trust_root: &TrustRoot,
    profile: Profile,
    verification_time: &str,
) -> VerificationResult {
    // The scaffold lives here, not inside `run`, so that a stop at a late stage
    // keeps the dimensions that were already decided instead of reporting them
    // as never evaluated.
    let mut dimensions = scaffold(profile);
    match run(
        envelope_json,
        trust_root,
        profile,
        verification_time,
        &mut dimensions,
    ) {
        Ok(()) => finish(dimensions, profile),
        Err(Stop::Fail(stage, reason)) => {
            stopped(Verdict::Fail, stage, reason, profile, dimensions)
        }
        Err(Stop::Inconclusive(stage, reason)) => {
            stopped(Verdict::Inconclusive, stage, reason, profile, dimensions)
        }
    }
}

fn run(
    envelope_json: &[u8],
    trust_root: &TrustRoot,
    profile: Profile,
    verification_time: &str,
    dimensions: &mut BTreeMap<String, DimensionStatus>,
) -> Result<(), Stop> {
    if profile != Profile::ModelOnly {
        return Err(Stop::Inconclusive(
            FailureStage::Schema,
            format!(
                "profile {} is declared but not verified in this build: RFC 3161 tokens and the \
                 training, runtime, capability and governance evidence paths are not implemented",
                profile.label()
            ),
        ));
    }
    if !is_instant(verification_time) {
        return Err(Stop::Fail(
            FailureStage::Authorization,
            "verification instant is not of the form YYYY-MM-DDTHH:MM:SSZ".into(),
        ));
    }

    // Stage 1: strict parse, then schema.
    let strict = Strict::parse(envelope_json).map_err(|e| Stop::Fail(FailureStage::Parse, e))?;
    let envelope: Envelope = serde_json::from_value(strict.to_json())
        .map_err(|e| Stop::Fail(FailureStage::Schema, e.to_string()))?;
    if envelope.schema_version != SCHEMA_VERSION {
        return Err(Stop::Fail(
            FailureStage::Schema,
            format!("unknown schema_version {:?}", envelope.schema_version),
        ));
    }
    if envelope.trust_root_id != trust_root.trust_root_id {
        return Err(Stop::Fail(
            FailureStage::Authorization,
            format!(
                "envelope declares trust root {:?}, policy is {:?}",
                envelope.trust_root_id, trust_root.trust_root_id
            ),
        ));
    }

    // Stage 2: the snapshot's own aid, recomputed from its payload.
    let payload_strict = strict
        .get("payload")
        .ok_or_else(|| Stop::Fail(FailureStage::Schema, "envelope has no payload".into()))?;
    let payload = validate_payload(payload_strict)
        .map_err(|e| Stop::Fail(FailureStage::Schema, e.to_string()))?;
    let recomputed = aid_from_canonical(&payload_strict.canonical_bytes());
    if recomputed != envelope.aid {
        return Err(Stop::Fail(
            FailureStage::AidRecomputation,
            format!("declared {}, recomputed {recomputed}", envelope.aid),
        ));
    }
    check_signature_encoding(&envelope.signatures)?;
    if payload.provenance_timestamp.as_str() > verification_time {
        return Err(Stop::Fail(
            FailureStage::Authorization,
            format!(
                "provenance instant {} is after the verification instant {verification_time}",
                payload.provenance_timestamp
            ),
        ));
    }

    // Stage 3: the predecessor's aid, recomputed before any signature.
    //
    // A predecessor that is merely absent is missing evidence, not a
    // contradiction, so it does not stop the run: continuity is reported
    // inconclusive and the dimensions that can still be verified are.
    let predecessor = match (&payload.previous_aid, &envelope.predecessor) {
        (None, None) => Link::Genesis,
        (None, Some(_)) => {
            return Err(Stop::Fail(
                FailureStage::Continuity,
                "previous_aid is null but a predecessor is presented".into(),
            ))
        }
        (Some(_), None) => Link::Missing,
        (Some(previous), Some(predecessor)) => {
            let predecessor_strict = strict
                .get("predecessor")
                .and_then(|p| p.get("payload"))
                .ok_or_else(|| {
                    Stop::Fail(FailureStage::Schema, "predecessor has no payload".into())
                })?;
            let predecessor_payload = validate_payload(predecessor_strict)
                .map_err(|e| Stop::Fail(FailureStage::Schema, e.to_string()))?;
            let predecessor_recomputed =
                aid_from_canonical(&predecessor_strict.canonical_bytes());
            if predecessor_recomputed != predecessor.aid {
                return Err(Stop::Fail(
                    FailureStage::PredecessorAidRecomputation,
                    format!(
                        "declared {}, recomputed {predecessor_recomputed}",
                        predecessor.aid
                    ),
                ));
            }
            if previous != &predecessor.aid {
                return Err(Stop::Fail(
                    FailureStage::Continuity,
                    format!(
                        "previous_aid {previous} does not name the presented predecessor {}",
                        predecessor.aid
                    ),
                ));
            }
            if payload.agent_id != predecessor_payload.agent_id {
                return Err(Stop::Fail(
                    FailureStage::Continuity,
                    "predecessor belongs to another agent_id".into(),
                ));
            }
            check_signature_encoding(&predecessor.signatures)?;
            Link::Present(predecessor_payload, predecessor)
        }
    };

    // Stage 4: authorization and signature over the recomputed aid.
    authenticate(
        emitter(&envelope.signatures)?,
        trust_root,
        &payload.agent_id,
        payload.operation,
        &envelope.aid,
        &payload.provenance_timestamp,
    )?;

    // Stage 5: the roles the operation requires, and then the operations this
    // build does not verify. Both come after the signature, so that a bundle
    // contradicted at a stage this build does implement is reported as `FAIL`
    // rather than excused as `INCONCLUSIVE`.
    check_required_roles(&envelope.signatures, payload.operation)?;
    if payload.operation == Operation::Rotate {
        return Err(Stop::Inconclusive(
            FailureStage::Schema,
            "rotation verification is outside the scope of this build".into(),
        ));
    }

    // Stage 6: the model dimension.
    dimensions.insert(
        "model".into(),
        model_status(
            &envelope.evidence.model_manifest,
            &payload.descriptor.model.manifest_hash,
        )?,
    );

    // Stage 7: the history dimension.
    dimensions.insert(
        "history".into(),
        history_status(
            &envelope.evidence.history_events,
            &payload.descriptor.history.history_root,
            payload.descriptor.history.event_count,
        )?,
    );

    // Stage 8: continuity.
    dimensions.insert(
        "continuity".into(),
        match predecessor {
            // A genesis has no predecessor to link. The signed declaration that
            // there is none is what passes; whether it is the agent's *only*
            // genesis is a different question, and no registry answers it here.
            Link::Genesis => DimensionStatus::Pass,
            Link::Missing => DimensionStatus::Inconclusive {
                reason: "previous_aid is declared without an authenticated predecessor".into(),
            },
            Link::Present(predecessor_payload, predecessor) => {
                check_required_roles(&predecessor.signatures, predecessor_payload.operation)
                    .map_err(|stop| match stop {
                        Stop::Fail(_, reason) => {
                            Stop::Fail(FailureStage::PredecessorAuthentication, reason)
                        }
                        Stop::Inconclusive(_, reason) => {
                            Stop::Inconclusive(FailureStage::PredecessorAuthentication, reason)
                        }
                    })?;
                authenticate(
                    emitter(&predecessor.signatures)?,
                    trust_root,
                    &predecessor_payload.agent_id,
                    predecessor_payload.operation,
                    &predecessor.aid,
                    &predecessor_payload.provenance_timestamp,
                )
                .map_err(|stop| match stop {
                    Stop::Fail(_, reason) => {
                        Stop::Fail(FailureStage::PredecessorAuthentication, reason)
                    }
                    Stop::Inconclusive(_, reason) => {
                        Stop::Inconclusive(FailureStage::PredecessorAuthentication, reason)
                    }
                })?;
                // The predecessor's own evidence, which §5.1 requires of a
                // model-only bundle for both snapshots.
                // A stop here belongs to the continuity dimension, not to the
                // successor's own `model` or `history`: it is the predecessor
                // that failed to account for itself.
                let own_evidence = [
                    (
                        "model manifest",
                        model_status(
                            &predecessor.evidence.model_manifest,
                            &predecessor_payload.descriptor.model.manifest_hash,
                        ),
                    ),
                    (
                        "history",
                        history_status(
                            &predecessor.evidence.history_events,
                            &predecessor_payload.descriptor.history.history_root,
                            predecessor_payload.descriptor.history.event_count,
                        ),
                    ),
                ];
                for (what, outcome) in own_evidence {
                    let status = outcome.map_err(|stop| match stop {
                        Stop::Fail(_, reason) => Stop::Fail(
                            FailureStage::Continuity,
                            format!("the predecessor's own {what} contradicts its payload: {reason}"),
                        ),
                        Stop::Inconclusive(_, reason) => Stop::Inconclusive(
                            FailureStage::Continuity,
                            format!("the predecessor's own {what}: {reason}"),
                        ),
                    })?;
                    if status != DimensionStatus::Pass {
                        return Err(Stop::Inconclusive(
                            FailureStage::Continuity,
                            format!(
                                "the predecessor's own {what} is not verified: {}",
                                status.reason().unwrap_or("unknown")
                            ),
                        ));
                    }
                }
                consistency_status(
                    predecessor_payload.descriptor.history.event_count,
                    payload.descriptor.history.event_count,
                    &predecessor_payload.descriptor.history.history_root,
                    &payload.descriptor.history.history_root,
                    &envelope.evidence.history_consistency_proof,
                )?
            }
        },
    );

    Ok(())
}

/// The manifest digest recomputed over the supplied bytes.
fn model_status(
    manifest_hex: &Option<String>,
    declared_hash: &str,
) -> Result<DimensionStatus, Stop> {
    let Some(manifest_hex) = manifest_hex else {
        return Ok(DimensionStatus::Inconclusive {
            reason: "model manifest bytes are absent".into(),
        });
    };
    let bytes = hex::decode(manifest_hex).map_err(|_| {
        Stop::Fail(
            FailureStage::ModelEvidence,
            "model manifest is not lowercase hex".into(),
        )
    })?;
    let digest = format!("sha256:{}", hex::encode(sha256(&bytes)));
    if digest != declared_hash {
        return Err(Stop::Fail(
            FailureStage::ModelEvidence,
            format!("declared {declared_hash}, recomputed {digest}"),
        ));
    }
    Ok(DimensionStatus::Pass)
}

/// The history root recomputed over the supplied events. An empty event list is
/// the complete evidence for a declared count of zero, and absent evidence for
/// any larger count.
fn history_status(
    events_hex: &[String],
    declared_root: &str,
    declared_count: i64,
) -> Result<DimensionStatus, Stop> {
    if events_hex.is_empty() && declared_count > 0 {
        return Ok(DimensionStatus::Inconclusive {
            reason: format!("{declared_count} events are declared and none are supplied"),
        });
    }
    if events_hex.len() as i64 != declared_count {
        return Err(Stop::Fail(
            FailureStage::HistoryEvidence,
            format!(
                "event_count is {declared_count} and {} events are supplied",
                events_hex.len()
            ),
        ));
    }
    let mut events = Vec::with_capacity(events_hex.len());
    for event in events_hex {
        events.push(hex::decode(event).map_err(|_| {
            Stop::Fail(
                FailureStage::HistoryEvidence,
                "an event is not lowercase hex".into(),
            )
        })?);
    }
    let root = format!("sha256:{}", hex::encode(merkle::tree_hash(&events)));
    if root != declared_root {
        return Err(Stop::Fail(
            FailureStage::HistoryEvidence,
            format!("declared {declared_root}, recomputed {root}"),
        ));
    }
    Ok(DimensionStatus::Pass)
}

/// The append-only relation between two histories of sizes `n` and `m`, by the
/// RFC 9162 consistency proof. Every case is decided here: there is no size
/// pair left for which this build declines to answer.
fn consistency_status(
    n: i64,
    m: i64,
    previous_root: &str,
    root: &str,
    proof: &[String],
) -> Result<DimensionStatus, Stop> {
    let fail = |reason: String| Stop::Fail(FailureStage::HistoryConsistency, reason);
    if m < n {
        return Err(fail(format!(
            "the history shrank from {n} to {m} events"
        )));
    }
    let (Ok(first), Ok(second)) = (usize::try_from(n), usize::try_from(m)) else {
        return Err(fail("an event count is not representable".into()));
    };
    let previous_root = root_bytes(previous_root)
        .ok_or_else(|| fail("the predecessor's history root is not sha256:<64hex>".into()))?;
    let root = root_bytes(root)
        .ok_or_else(|| fail("the history root is not sha256:<64hex>".into()))?;
    let mut steps = Vec::with_capacity(proof.len());
    for step in proof {
        let step: [u8; 32] = hex::decode(step)
            .ok()
            .and_then(|bytes| bytes.try_into().ok())
            .ok_or_else(|| fail("a consistency proof step is not 32 bytes of hex".into()))?;
        steps.push(step);
    }
    merkle::verify_consistency(first, second, &previous_root, &root, &steps)
        .map(|()| DimensionStatus::Pass)
        .map_err(fail)
}

/// The 32 digest bytes of a `sha256:<64hex>` text.
fn root_bytes(value: &str) -> Option<[u8; 32]> {
    hex::decode(value.strip_prefix("sha256:")?)
        .ok()?
        .try_into()
        .ok()
}

/// A byte-level rule, so it runs before anything is verified: one signature per
/// role, and the hex lengths §1.2 fixes per algorithm.
fn check_signature_encoding(signatures: &[SignatureEntry]) -> Result<(), Stop> {
    let mut roles: BTreeSet<Role> = BTreeSet::new();
    for signature in signatures {
        if !roles.insert(signature.role) {
            return Err(Stop::Fail(
                FailureStage::Parse,
                "two signatures declare the same role".into(),
            ));
        }
        if !is_lower_hex(
            &signature.signature_bytes,
            signature.algorithm.signature_hex_len(),
        ) {
            return Err(Stop::Fail(
                FailureStage::Parse,
                "signature_bytes is not lowercase hex of the length the algorithm fixes".into(),
            ));
        }
        if !is_lower_hex(&signature.public_key, signature.algorithm.public_key_hex_len()) {
            return Err(Stop::Fail(
                FailureStage::Parse,
                "public_key is not lowercase hex of the length the algorithm fixes".into(),
            ));
        }
    }
    Ok(())
}

/// A semantic rule, so it runs after the emitter's signature: the roles a given
/// operation requires, and no others.
fn check_required_roles(signatures: &[SignatureEntry], operation: Operation) -> Result<(), Stop> {
    let expected: &[Role] = match operation {
        Operation::Genesis | Operation::Extend => &[Role::Emitter],
        Operation::Rotate => &[Role::Emitter, Role::Successor],
    };
    let present: BTreeSet<Role> = signatures.iter().map(|s| s.role).collect();
    if signatures.len() != expected.len() || !expected.iter().all(|role| present.contains(role)) {
        return Err(Stop::Fail(
            FailureStage::Parse,
            format!("operation {operation:?} requires exactly the roles {expected:?}"),
        ));
    }
    Ok(())
}

/// The emitter's entry, by role and not by position. Its absence is an explicit
/// error: an unsigned envelope is not a weaker claim, it is no claim.
fn emitter(signatures: &[SignatureEntry]) -> Result<&SignatureEntry, Stop> {
    signatures
        .iter()
        .find(|signature| signature.role == Role::Emitter)
        .ok_or_else(|| {
            Stop::Fail(
                FailureStage::Parse,
                "no signature of role emitter is present".into(),
            )
        })
}

/// Authorization from the verifier's policy, then the signature over the aid.
fn authenticate(
    signature: &SignatureEntry,
    trust_root: &TrustRoot,
    agent_id: &str,
    operation: Operation,
    aid: &str,
    instant: &str,
) -> Result<(), Stop> {
    let key = trust_root.key(&signature.public_key).ok_or_else(|| {
        Stop::Fail(
            FailureStage::Authorization,
            "public key is not in the trust policy".into(),
        )
    })?;
    if key.algorithm != signature.algorithm {
        return Err(Stop::Fail(
            FailureStage::Authorization,
            "algorithm differs from the policy entry for this key".into(),
        ));
    }
    if !key.authorized_agent_ids.iter().any(|id| id == agent_id) {
        return Err(Stop::Fail(
            FailureStage::Authorization,
            format!("key is not authorized for agent {agent_id}"),
        ));
    }
    if !key.authorized_operations.contains(&operation) {
        return Err(Stop::Fail(
            FailureStage::Authorization,
            format!("key is not authorized for operation {operation:?}"),
        ));
    }
    if !is_instant(&key.valid_from) || !is_instant(&key.valid_until) {
        return Err(Stop::Fail(
            FailureStage::Authorization,
            "policy validity window is not of the form YYYY-MM-DDTHH:MM:SSZ".into(),
        ));
    }
    // `valid_from` is inclusive, `valid_until` exclusive.
    if instant < key.valid_from.as_str() || instant >= key.valid_until.as_str() {
        return Err(Stop::Fail(
            FailureStage::Authorization,
            format!(
                "key was not valid at {instant} (policy window {}..{})",
                key.valid_from, key.valid_until
            ),
        ));
    }
    verify_signature(signature, aid)
}

fn verify_signature(signature: &SignatureEntry, aid: &str) -> Result<(), Stop> {
    match signature.algorithm {
        Algorithm::MlDsa65 => Err(Stop::Inconclusive(
            FailureStage::SignatureVerification,
            "no ML-DSA-65 verifier is linked in this build".into(),
        )),
        Algorithm::Ed25519 => {
            let key: [u8; 32] = hex::decode(&signature.public_key)
                .ok()
                .and_then(|bytes| bytes.try_into().ok())
                .ok_or_else(|| {
                    Stop::Fail(
                        FailureStage::SignatureVerification,
                        "public_key is not 32 bytes of hex".into(),
                    )
                })?;
            let bytes: [u8; 64] = hex::decode(&signature.signature_bytes)
                .ok()
                .and_then(|bytes| bytes.try_into().ok())
                .ok_or_else(|| {
                    Stop::Fail(
                        FailureStage::SignatureVerification,
                        "signature_bytes is not 64 bytes of hex".into(),
                    )
                })?;
            let verifying_key = VerifyingKey::from_bytes(&key).map_err(|_| {
                Stop::Fail(
                    FailureStage::SignatureVerification,
                    "public_key is not a valid Ed25519 point".into(),
                )
            })?;
            verifying_key
                .verify(&signed_bytes(aid), &Signature::from_bytes(&bytes))
                .map_err(|_| {
                    Stop::Fail(
                        FailureStage::SignatureVerification,
                        "signature does not verify over the aid".into(),
                    )
                })
        }
    }
}

/// Required dimensions start as not evaluated; the rest are out of scope.
fn scaffold(profile: Profile) -> BTreeMap<String, DimensionStatus> {
    DIMENSIONS
        .iter()
        .map(|name| {
            let status = if profile.requires(name) {
                DimensionStatus::Inconclusive {
                    reason: "not evaluated".into(),
                }
            } else {
                DimensionStatus::NotRequired
            };
            ((*name).to_owned(), status)
        })
        .collect()
}

/// The dimension a stage belongs to, so that a stop is visible where it happened.
fn stage_dimension(stage: FailureStage) -> Option<&'static str> {
    match stage {
        FailureStage::ModelEvidence => Some("model"),
        FailureStage::HistoryEvidence => Some("history"),
        FailureStage::PredecessorAidRecomputation
        | FailureStage::PredecessorAuthentication
        | FailureStage::Continuity
        | FailureStage::HistoryConsistency => Some("continuity"),
        _ => None,
    }
}

fn stopped(
    verdict: Verdict,
    stage: FailureStage,
    reason: String,
    profile: Profile,
    mut dimensions: BTreeMap<String, DimensionStatus>,
) -> VerificationResult {
    if let Some(dimension) = stage_dimension(stage) {
        if profile.requires(dimension) {
            let status = match verdict {
                Verdict::Fail => DimensionStatus::Fail {
                    reason: reason.clone(),
                },
                _ => DimensionStatus::Inconclusive {
                    reason: reason.clone(),
                },
            };
            dimensions.insert(dimension.to_owned(), status);
        }
    }
    VerificationResult {
        verdict,
        exit_code: verdict.exit_code(),
        failure_stage: Some(stage),
        reason: Some(reason),
        dimensions,
    }
}

/// The global verdict: `PASS` only if every required dimension passed.
/// `NOT_REQUIRED` dimensions contribute nothing either way.
fn finish(
    dimensions: BTreeMap<String, DimensionStatus>,
    profile: Profile,
) -> VerificationResult {
    let mut pending: Option<String> = None;
    for name in DIMENSIONS {
        if !profile.requires(name) {
            continue;
        }
        match dimensions.get(name) {
            Some(DimensionStatus::Pass) => {}
            Some(status) => {
                if pending.is_none() {
                    pending = Some(format!(
                        "{name}: {}",
                        status.reason().unwrap_or("not evaluated")
                    ));
                }
            }
            None => pending = Some(format!("{name}: absent from the result")),
        }
    }
    match pending {
        None => VerificationResult {
            verdict: Verdict::Pass,
            exit_code: Verdict::Pass.exit_code(),
            failure_stage: None,
            reason: None,
            dimensions,
        },
        Some(reason) => VerificationResult {
            verdict: Verdict::Inconclusive,
            exit_code: Verdict::Inconclusive.exit_code(),
            failure_stage: None,
            reason: Some(reason),
            dimensions,
        },
    }
}
