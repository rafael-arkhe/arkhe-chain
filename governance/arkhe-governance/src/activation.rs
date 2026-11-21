//! Activation: the decision that one policy replaces another.
//!
//! `policy_bundle` authenticates a policy and `mandate` interprets one. Neither
//! says which policy is **in force**, and nothing in this repository stored
//! that: `verify` takes `current_version` as an argument, so the rollback floor
//! was only ever as strong as whatever the caller remembered. This module is
//! the missing half — the protocol that moves the active policy forward.
//!
//! Three refusals, each independent of the others:
//!
//! * **Consumption.** A proposal carries a `proposal_id` and may be activated
//!   once. The check runs **before** the compare-and-swap, so it still fires
//!   when the active digest has been restored to its previous value — a revert,
//!   a backup, a second reader. A nonce that is signed but never recorded is
//!   inert, and the CAS catching a replay is an accident of ordering, not
//!   replay protection.
//! * **Compare-and-swap.** A proposal names the candidate digest it replaces.
//!   Two proposals contending for the same predecessor: one activates, the
//!   other gets `ConcurrencyConflict`.
//! * **Version.** Strictly greater than the active version. `policy_bundle`
//!   admits an equal version, which would let two different policies share a
//!   number; here they cannot.
//!
//! What this module is **not**: durable. It is pure — no clock, no filesystem,
//! no database — and every effect goes through [`ActivationStore`], whose
//! implementor owns the transaction. The checks here are fail-fast; the
//! authoritative ones are the store's, inside its transaction. Crash and
//! restart behaviour is therefore a property of the backend and cannot be
//! demonstrated at this layer. See `docs/CAMADA-0.md`.

use serde::{Deserialize, Serialize};

use arkhe_core::{CanonicalEncode, Digest32};
use serde_json::{json, Value};

use crate::policy_bundle::{PolicyBundleError, SignaturePolicy, SignedPolicyBundle, TrustStore};
use crate::PolicyBinding;

pub const PROPOSAL_SCHEMA: &str = "arkhe.governance.proposal/1";

/// Domain separation for the digest of a candidate artifact's bytes.
pub const DOMAIN_CANDIDATE: &[u8] = b"AKG:POLICY:CANDIDATE:v1\0";

/// What an activation proposes to replace. Phase 1 admits `Policy` only; an
/// adapter's weights are the next phase and have their own validation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetKind {
    Policy,
    Adapter,
}

/// The statements of a proposal bundle. The envelope around it is an ordinary
/// [`SignedPolicyBundle`], so the signature, the issuer, the validity window
/// and the version floor are the ones `policy_bundle` already enforces, and
/// this shape adds only what activation needs.
///
/// `previous_candidate_digest` is named for what the compare-and-swap actually
/// compares: the digest of the artifact in force, not of the proposal that put
/// it there. An operator reasons about the policy that is running, and the
/// execution receipt binds the same digest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Proposal {
    pub schema: String,
    /// 32 lowercase hex characters: 16 bytes of nonce, consumed at activation.
    pub proposal_id: String,
    pub agent_id: String,
    /// `blake3:<64hex>` of the artifact being replaced. `None` only for the
    /// first activation of this `policy_id`.
    pub previous_candidate_digest: Option<String>,
    pub target_kind: TargetKind,
    /// `blake3:<64hex>` of the candidate's bytes, under `DOMAIN_CANDIDATE`.
    pub candidate_digest: String,
    /// `blake3:<64hex>` of the context the candidate was evaluated against.
    pub context_digest: String,
    pub scope: String,
}

/// The policy in force, as the store holds it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Active {
    pub policy_id: String,
    pub version: u64,
    pub candidate_digest: String,
    pub context_digest: String,
    /// The proposal that put this artifact in force.
    pub proposal_id: String,
    /// Unix seconds, as the caller supplied them.
    pub activated_at: i64,
}

/// The durable record of one activation. Its digest is the leaf a transparency
/// log or an MMR projects.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActivationEvent {
    pub policy_id: String,
    pub version: u64,
    pub proposal_id: String,
    pub previous_candidate_digest: Option<String>,
    pub candidate_digest: String,
    pub context_digest: String,
    pub activated_at: i64,
}

impl CanonicalEncode for ActivationEvent {
    const DOMAIN_OBJECT: &'static [u8] = b"AKG:POLICY:ACTIVATION:v1\0";
    fn unsigned_projection(&self) -> Value {
        json!({
            "policy_id": self.policy_id,
            "version": self.version,
            "proposal_id": self.proposal_id,
            "previous_candidate_digest": self.previous_candidate_digest,
            "candidate_digest": self.candidate_digest,
            "context_digest": self.context_digest,
            "activated_at": self.activated_at,
        })
    }
}

/// What a successful activation returns: the new state, the durable event, and
/// the binding a gate decision should cite.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Activated {
    pub active: Active,
    pub event: ActivationEvent,
    pub binding: PolicyBinding,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActivationError {
    /// The statements are not a proposal this module can read.
    Schema(String),
    /// Signature, issuer, window or version floor, as `policy_bundle` sees it.
    Authorization(PolicyBundleError),
    /// A target this phase does not validate.
    UnsupportedTarget(TargetKind),
    /// The bytes handed over are not the artifact the proposal authorized.
    CandidateDigestMismatch { authorized: String, recomputed: String },
    /// This proposal has already been activated once.
    AlreadyConsumed { proposal_id: String },
    /// Another activation won the race for the same predecessor.
    ConcurrencyConflict {
        expected: Option<String>,
        actual: Option<String>,
    },
    /// Not greater than the active version. Two policies may not share a number.
    StaleVersion { active: u64, proposed: u64 },
    /// The store failed. Distinct from a conflict: a conflict is answered by
    /// re-reading the state, a storage failure by retrying or by asking whether
    /// the proposal was consumed.
    Storage(String),
}

/// What a store reports when a commit does not happen. A conflict and a storage
/// failure are different answers and must not be collapsed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommitError {
    AlreadyConsumed,
    Conflict { actual: Option<String> },
    Storage(String),
}

/// The durable boundary. One implementor, one transaction.
///
/// `commit` must do all three of these or none: record `proposal_id` as
/// consumed, replace the active record **only if** it still holds
/// `expected_candidate_digest`, and append `event`. The checks `activate`
/// performs before calling are fail-fast; these are the authoritative ones,
/// because only the store can hold them against a concurrent writer.
pub trait ActivationStore {
    fn active(&self, policy_id: &str) -> Result<Option<Active>, String>;

    fn is_consumed(&self, proposal_id: &str) -> Result<bool, String>;

    fn commit(
        &mut self,
        expected_candidate_digest: Option<&str>,
        next: &Active,
        event: &ActivationEvent,
    ) -> Result<(), CommitError>;
}

/// `blake3:<64hex>` of `bytes` under the candidate domain.
pub fn candidate_digest(bytes: &[u8]) -> String {
    format!(
        "blake3:{}",
        Digest32::blake3(DOMAIN_CANDIDATE, bytes).to_hex()
    )
}

/// Activate a candidate policy.
///
/// The order is the contract: schema, authorization, target, candidate bytes,
/// consumption, version, compare-and-swap, commit. Consumption precedes the
/// compare-and-swap so that a replayed proposal is refused as a replay even
/// when the active digest has returned to the value it names.
pub fn activate<S: ActivationStore>(
    store: &mut S,
    bundle: &SignedPolicyBundle,
    candidate_bytes: &[u8],
    trust_store: &TrustStore,
    signature_policy: SignaturePolicy,
    now: i64,
) -> Result<Activated, ActivationError> {
    let proposal = read_proposal(bundle)?;
    let policy_id = bundle.payload.policy_id.clone();

    let active = store
        .active(&policy_id)
        .map_err(ActivationError::Storage)?;
    let current_version = active.as_ref().map(|a| a.version).unwrap_or(0);

    // Signature, authority, window and rollback floor.
    let binding = bundle
        .verify(trust_store, current_version, signature_policy, now)
        .map_err(ActivationError::Authorization)?;

    if proposal.target_kind != TargetKind::Policy {
        return Err(ActivationError::UnsupportedTarget(proposal.target_kind));
    }

    let recomputed = candidate_digest(candidate_bytes);
    if recomputed != proposal.candidate_digest {
        return Err(ActivationError::CandidateDigestMismatch {
            authorized: proposal.candidate_digest,
            recomputed,
        });
    }

    // Before the compare-and-swap, on purpose.
    if store
        .is_consumed(&proposal.proposal_id)
        .map_err(ActivationError::Storage)?
    {
        return Err(ActivationError::AlreadyConsumed {
            proposal_id: proposal.proposal_id,
        });
    }

    if bundle.version <= current_version {
        return Err(ActivationError::StaleVersion {
            active: current_version,
            proposed: bundle.version,
        });
    }

    let expected = proposal.previous_candidate_digest.clone();
    let held = active.as_ref().map(|a| a.candidate_digest.clone());
    if expected != held {
        return Err(ActivationError::ConcurrencyConflict {
            expected,
            actual: held,
        });
    }

    let next = Active {
        policy_id: policy_id.clone(),
        version: bundle.version,
        candidate_digest: proposal.candidate_digest.clone(),
        context_digest: proposal.context_digest.clone(),
        proposal_id: proposal.proposal_id.clone(),
        activated_at: now,
    };
    let event = ActivationEvent {
        policy_id,
        version: bundle.version,
        proposal_id: proposal.proposal_id,
        previous_candidate_digest: proposal.previous_candidate_digest,
        candidate_digest: proposal.candidate_digest,
        context_digest: proposal.context_digest,
        activated_at: now,
    };

    store
        .commit(held.as_deref(), &next, &event)
        .map_err(|error| match error {
            CommitError::AlreadyConsumed => ActivationError::AlreadyConsumed {
                proposal_id: event.proposal_id.clone(),
            },
            CommitError::Conflict { actual } => ActivationError::ConcurrencyConflict {
                expected: held.clone(),
                actual,
            },
            CommitError::Storage(reason) => ActivationError::Storage(reason),
        })?;

    Ok(Activated {
        active: next,
        event,
        binding,
    })
}

fn read_proposal(bundle: &SignedPolicyBundle) -> Result<Proposal, ActivationError> {
    let proposal: Proposal = serde_json::from_value(bundle.payload.statements.clone())
        .map_err(|e| ActivationError::Schema(e.to_string()))?;
    if proposal.schema != PROPOSAL_SCHEMA {
        return Err(ActivationError::Schema(format!(
            "unknown proposal schema {:?}",
            proposal.schema
        )));
    }
    if !is_lower_hex(&proposal.proposal_id, 32) {
        return Err(ActivationError::Schema(
            "proposal_id is not 32 lowercase hex characters".into(),
        ));
    }
    if proposal.agent_id.is_empty() || proposal.scope.is_empty() {
        return Err(ActivationError::Schema(
            "agent_id and scope are required".into(),
        ));
    }
    for digest in [&proposal.candidate_digest, &proposal.context_digest] {
        if !is_digest(digest) {
            return Err(ActivationError::Schema(format!(
                "digest {digest:?} is not blake3:<64hex>"
            )));
        }
    }
    if let Some(previous) = &proposal.previous_candidate_digest {
        if !is_digest(previous) {
            return Err(ActivationError::Schema(
                "previous_candidate_digest is not blake3:<64hex>".into(),
            ));
        }
        if previous == &proposal.candidate_digest {
            return Err(ActivationError::Schema(
                "a proposal that replaces an artifact with itself changes nothing".into(),
            ));
        }
    }
    Ok(proposal)
}

fn is_digest(value: &str) -> bool {
    value
        .strip_prefix("blake3:")
        .is_some_and(|hex| is_lower_hex(hex, 64))
}

fn is_lower_hex(value: &str, len: usize) -> bool {
    value.len() == len && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// The reference semantics of [`ActivationStore`], in memory.
///
/// It documents what a backend must do and it is what the protocol's tests run
/// against. It is **not durable**: nothing here survives a process, so no test
/// using it says anything about crash recovery.
#[derive(Debug, Clone, Default)]
pub struct MemoryActivationStore {
    active: Vec<Active>,
    consumed: Vec<String>,
    events: Vec<ActivationEvent>,
    /// When set, every `commit` fails with this storage error.
    pub fail_commit_with: Option<String>,
}

impl MemoryActivationStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn events(&self) -> &[ActivationEvent] {
        &self.events
    }

    pub fn consumed(&self) -> &[String] {
        &self.consumed
    }

    /// Put the active record back to an earlier artifact, as a revert or a
    /// restore would. The consumption log is left alone — which is the point.
    pub fn force_active(&mut self, active: Active) {
        self.active.retain(|a| a.policy_id != active.policy_id);
        self.active.push(active);
    }
}

impl ActivationStore for MemoryActivationStore {
    fn active(&self, policy_id: &str) -> Result<Option<Active>, String> {
        Ok(self
            .active
            .iter()
            .find(|a| a.policy_id == policy_id)
            .cloned())
    }

    fn is_consumed(&self, proposal_id: &str) -> Result<bool, String> {
        Ok(self.consumed.iter().any(|id| id == proposal_id))
    }

    fn commit(
        &mut self,
        expected_candidate_digest: Option<&str>,
        next: &Active,
        event: &ActivationEvent,
    ) -> Result<(), CommitError> {
        if let Some(reason) = &self.fail_commit_with {
            return Err(CommitError::Storage(reason.clone()));
        }
        // The authoritative order, inside what a backend would make one
        // transaction: consumption, then the compare-and-swap, then the event.
        if self.consumed.iter().any(|id| id == &next.proposal_id) {
            return Err(CommitError::AlreadyConsumed);
        }
        let held = self
            .active
            .iter()
            .find(|a| a.policy_id == next.policy_id)
            .map(|a| a.candidate_digest.clone());
        if held.as_deref() != expected_candidate_digest {
            return Err(CommitError::Conflict { actual: held });
        }
        self.consumed.push(next.proposal_id.clone());
        self.active.retain(|a| a.policy_id != next.policy_id);
        self.active.push(next.clone());
        self.events.push(event.clone());
        Ok(())
    }
}
