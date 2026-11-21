//! AID — AGI Identity Descriptor, v1.0-rc5.
//!
//! An AID is not a label. It is a transition: `agent_id` names the subject,
//! `aid` is the digest of one snapshot's payload, and `previous_aid` is the
//! edge to the snapshot it succeeds. This module is the offline verification
//! surface for those transitions: pure, deterministic, no clock, no network,
//! no filesystem. The caller supplies the bytes, the trust policy, and the
//! instant it is verifying at.
//!
//! Scope of this build: the `model-only` profile, Ed25519 signatures, and the
//! frozen vectors V06, V07a and V07b. `historical` and `full` parse and return
//! `INCONCLUSIVE` rather than claim a verification they do not perform. See
//! `docs/AID-CONFORMANCE.md` for the rules frozen here and the ones still open.

pub mod jcs;
pub mod merkle;
pub mod types;
pub mod verify;

pub use types::{
    AidError, Algorithm, Descriptor, DimensionStatus, Envelope, Evidence, FailureStage,
    HistoryDimension, ModelDimension, Operation, Payload, Predecessor, Profile, Role,
    SignatureEntry, TrustRoot, TrustedKey, Verdict, VerificationResult, DOMAIN_AID, DOMAIN_SIG,
    SCHEMA_VERSION,
};
pub use verify::{
    aid_from_canonical, compute_aid, recompute_predecessor_aid, signed_bytes, verify,
};
