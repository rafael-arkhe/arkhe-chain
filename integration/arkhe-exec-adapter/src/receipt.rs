//! Emitting the verdict an `arkhe-flow` receipt log can sign.
//!
//! `arkhe-flow` can discharge `llm_output_unverified` when handed a signed
//! `invariant` receipt about an agent action. This module produces the body of
//! that receipt from an `Admission`, and nothing else: it does not sign, and it
//! holds no key. Signing belongs to the invariant role, whose secret is the
//! concern of whoever runs the log, and the whole point of a separate role is
//! that this process cannot clear its own work.
//!
//! **Two digests of the same bytes.** This crate commits evidence under blake3
//! with a domain per object type; `arkhe-flow` names its fields `*_sha256` and
//! its `is_hex64` only checks the shape, so 32 bytes of blake3 would fit a
//! field called sha256 and the name would be a lie. So a claim carries the
//! sha256 of the same artifact, computed here, next to the blake3 digest the
//! kernel saw. Neither digest is renamed and both are recorded.
//!
//! **Not linked by Cargo.** `arkhe-flow` lives in the `packaging/core`
//! workspace and cannot be a dependency of this crate: both manifests use
//! `workspace = true` inheritance, and Cargo resolves that against the
//! outermost workspace, so a path dependency either way fails to load the
//! manifest. The shape below is therefore pinned by a vector both sides check —
//! see `tests/flow_receipt.rs` and the `invariant` arm of `validate_body` in
//! `arkhe-flow`.

use crate::{Admission, Exclusion, RunReport};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// Hex sha256, the way `arkhe_flow::sha256_hex` writes it.
pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn is_hex64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Why no claim could be made. Each variant is a refusal to write a receipt
/// that would say something the caller cannot back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClaimError {
    /// `action_id` is not a 64-character lowercase hex receipt id.
    MalformedActionId,
    /// These bytes are not the run this admission is about.
    WrongRun,
    /// The run never reached a checker, so the invariant role has nothing to
    /// say about it. Only `Exclusion::InvariantFailed` carries a verdict.
    NotACheckedFailure,
}

impl ClaimError {
    pub fn reason(&self) -> &'static str {
        match self {
            Self::MalformedActionId => "action id is not a receipt id",
            Self::WrongRun => "these bytes are not the run this admission is about",
            Self::NotACheckedFailure => "this exclusion never reached an invariant",
        }
    }
}

/// The fields of an `arkhe-flow` `invariant` receipt body, before signing.
///
/// `held` is not a parameter anywhere: it comes from which constructor was
/// used. An `Admission` only exists when the invariant held, and a failure
/// claim only comes from an invariant that ran and did not.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerdictClaim {
    /// Receipt id of the agent action this verdict is about. Because that id is
    /// the hash of the signed action body, naming it binds the plan, output,
    /// model and agent id at once.
    pub action_id: String,
    /// sha256 of the artifact the invariant read.
    pub output_sha256: String,
    pub invariant_id: String,
    pub invariant_version: String,
    pub held: bool,
}

impl VerdictClaim {
    /// From an admission whose invariant held.
    ///
    /// `run` must be the run the admission came from; the source digest is
    /// recomputed and compared, so a verdict cannot be emitted for one run
    /// using the bytes of another.
    pub fn from_admission(
        admission: &Admission,
        run: &RunReport,
        action_id: &str,
    ) -> Result<Self, ClaimError> {
        if !is_hex64(action_id) {
            return Err(ClaimError::MalformedActionId);
        }
        if run.source_digest() != admission.source {
            return Err(ClaimError::WrongRun);
        }
        Ok(Self {
            action_id: action_id.to_owned(),
            output_sha256: sha256_hex(&run.output),
            invariant_id: admission.analysis.module_id.clone(),
            invariant_version: admission.analysis.module_version.clone(),
            held: true,
        })
    }

    /// From an invariant that ran and did not hold. A refused run is worth
    /// signing: the log keeps the exclusion, and the verdict discharges
    /// nothing, which is what `arkhe-flow` reads it as.
    pub fn from_failure(
        exclusion: &Exclusion,
        run: &RunReport,
        action_id: &str,
    ) -> Result<Self, ClaimError> {
        if !is_hex64(action_id) {
            return Err(ClaimError::MalformedActionId);
        }
        let Exclusion::InvariantFailed {
            invariant_id,
            invariant_version,
            ..
        } = exclusion
        else {
            return Err(ClaimError::NotACheckedFailure);
        };
        Ok(Self {
            action_id: action_id.to_owned(),
            output_sha256: sha256_hex(&run.output),
            invariant_id: invariant_id.clone(),
            invariant_version: invariant_version.clone(),
            held: false,
        })
    }

    /// The body to sign with the invariant role key. Field names and the issuer
    /// are what `arkhe_flow::invariant_body` produces; `arkhe-flow` rejects any
    /// other key set, so a drift here fails there rather than passing quietly.
    pub fn body(&self) -> Value {
        json!({
            "action_id": &self.action_id,
            "held": self.held,
            "invariant_id": &self.invariant_id,
            "invariant_version": &self.invariant_version,
            "issuer": "invariant",
            "kind": "invariant",
            "output_sha256": &self.output_sha256,
        })
    }
}
