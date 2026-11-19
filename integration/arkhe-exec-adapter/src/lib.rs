//! Execution adapter: an agent run becomes admitted evidence, or an explicit
//! exclusion carrying its reason.
//!
//! The adapter never authorizes. `arkhe_kernel::ContainmentGate` does, and it
//! already requires a shape this crate only has to produce: exactly one
//! `SourceReport` context entry for the raw run, and exactly one
//! `AnalysisRecord` — a `WorkerExecutionRecord` whose `input_digest` is that
//! source and whose `output_digest` is the intent `parameters_digest` —
//! admitted in the evidence store, from a module governance allowed, with an
//! allowed `CognitiveOperation`.
//!
//! Two consequences are worth stating, because they are the point:
//!
//! 1. The record an agent writes about its own work cannot take the analysis
//!    slot. The profile here allows only `Analyze`, so a record carrying
//!    `Execute` is rejected as `operation not allowed`. An unverified model
//!    output authorizes nothing.
//! 2. A task class with no invariant in the profile has no
//!    `required_worker_evidence`, and the kernel rejects it as `missing worker
//!    evidence policy`. The unknown is excluded, never waved through.
//!
//! Against `arkhe_runtime::run_report`, which admits a WER saying that a run
//! happened (`output_digest: ZERO`, no evidence refs): this binds *what* the
//! run produced and the verdict of a deterministic invariant over it. An
//! auditor holding the run report and the artifact replays `Invariant::check`
//! and recomputes every digest.

use arkhe_core::{
    canonical::encode_value,
    evidence::{EvidenceCommitter, EvidenceEnvelope},
    work::{ContextEntry, ContextKind, RequestIdentity, WorkIntent, WorkIntentType},
    worker::{CognitiveOperation, WorkerExecutionRecord},
    Digest32,
};
use arkhe_governance::{EvidenceKindRequirement, PolicyBinding, PolicyResolver, PolicyVerdict};
use serde_json::json;

/// Digest domains. Separate domains keep a run report, an artifact and a set
/// of proposed parameters from ever colliding.
pub const RUN_DOMAIN: &[u8] = b"AKG:EXEC:RUN:v1\0";
pub const OUTPUT_DOMAIN: &[u8] = b"AKG:EXEC:OUTPUT:v1\0";
pub const PARAMETERS_DOMAIN: &[u8] = b"AKG:EXEC:PARAMETERS:v1\0";
pub const PROFILE_DOMAIN: &[u8] = b"AKG:EXEC:PROFILE:v1\0";

const MAX_ID_BYTES: usize = 128;

/// Same character class as `arkhe_runtime::run_report`, so an identifier that
/// one endpoint accepts is accepted here too.
fn is_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= MAX_ID_BYTES
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._@+-/:".contains(&b))
}

/// What the task was, independently of what any run did. The caller owns this:
/// it is written before the agent starts, and it names the invariant that will
/// decide whether the result counts.
#[derive(Debug, Clone)]
pub struct TaskSpec {
    pub requested_by: String,
    pub intent_type: WorkIntentType,
    /// What is acted on: the document, the ticket, the repository.
    pub target: Digest32,
    pub invariant_id: String,
    /// One key per logical request; retries of the same request reuse it.
    pub request_key: Vec<u8>,
    pub claimed_created_at: i64,
}

/// What the agent reports. Untrusted: a bearer of the runner credential said
/// this ran and produced these bytes. Nothing here is a claim of correctness.
#[derive(Debug, Clone)]
pub struct RunReport {
    /// The executing module: a skill or computer-use harness identifier.
    pub module_id: String,
    pub module_version: String,
    /// Unique per run; retries of the same run must reuse it.
    pub execution_id: String,
    /// The artifact the run produced.
    pub output: Vec<u8>,
}

impl RunReport {
    pub fn output_digest(&self) -> Digest32 {
        Digest32::blake3(OUTPUT_DOMAIN, &self.output)
    }

    /// Identifies the run, and binds the artifact to it: changing either the
    /// runner identity or a single output byte changes this digest.
    pub fn source_digest(&self) -> Digest32 {
        Digest32::blake3(
            RUN_DOMAIN,
            &encode_value(&json!({
                "module_id": &self.module_id,
                "module_version": &self.module_version,
                "execution_id": &self.execution_id,
                "output_digest": self.output_digest(),
            })),
        )
    }
}

/// The verdict of an invariant. `Held` is the only path to an admission.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Held { note: Option<String> },
    Failed { reason: String },
}

/// A decidable property of a finished run.
///
/// `check` must be a pure, deterministic function of its arguments: an auditor
/// replays it from the run report and the artifact and must reach the same
/// verdict. Reading the clock, the network or the filesystem breaks that, and
/// with it the only reason the admission means anything.
pub trait Invariant: Send + Sync {
    fn id(&self) -> &str;
    fn version(&self) -> &str;
    fn check(&self, spec: &TaskSpec, output: &[u8]) -> Outcome;
}

/// The invariants this process can run. An id that is not here is excluded.
#[derive(Default)]
pub struct Registry {
    entries: Vec<Box<dyn Invariant>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with(mut self, invariant: Box<dyn Invariant>) -> Self {
        self.entries.push(invariant);
        self
    }

    pub fn get(&self, id: &str) -> Option<&dyn Invariant> {
        self.entries
            .iter()
            .map(|entry| entry.as_ref())
            .find(|entry| entry.id() == id)
    }

    pub fn module_ids(&self) -> Vec<String> {
        self.entries.iter().map(|e| e.id().to_owned()).collect()
    }
}

/// Closed set. Every exclusion says which of the four things went wrong, so a
/// reader can tell a failed check from an absent one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Exclusion {
    /// The run report or the spec is not well formed. Nothing was checked.
    Malformed(&'static str),
    /// No invariant for this task class in this process. Fail-closed.
    UnknownInvariant { requested: String },
    /// An invariant ran and did not hold. This is the turn of the human. The
    /// version travels with the id because a receipt log has to record which
    /// build of the checker said no.
    InvariantFailed {
        invariant_id: String,
        invariant_version: String,
        reason: String,
    },
    /// Evidence could not be committed. An infrastructure failure, not a
    /// verdict about the run.
    CommitFailed(String),
}

impl Exclusion {
    pub fn reason(&self) -> String {
        match self {
            Self::Malformed(field) => format!("malformed run: {field}"),
            Self::UnknownInvariant { requested } => {
                format!("no invariant registered for `{requested}`")
            }
            Self::InvariantFailed {
                invariant_id,
                invariant_version,
                reason,
            } => format!("invariant `{invariant_id}@{invariant_version}` did not hold: {reason}"),
            Self::CommitFailed(reason) => format!("evidence commit failed: {reason}"),
        }
    }
}

/// A run whose invariant held and whose evidence is committed. Hand `intent`
/// and `analysis` to `ContainmentGate::authorize_admitted` with the same
/// store. This type is not an authorization and must not be treated as one.
///
/// The private field is load-bearing: a struct with one is unconstructible
/// outside this module, so `admit` is the only way to obtain an `Admission`.
/// Anything downstream that accepts one — `receipt::VerdictClaim`, say — is
/// therefore holding something an invariant actually produced, not a value a
/// caller assembled to look like one.
#[derive(Debug, Clone)]
pub struct Admission {
    pub intent: WorkIntent,
    pub analysis: WorkerExecutionRecord,
    /// Digest of the run report: the `SourceReport` binding.
    pub source: Digest32,
    /// Digest of the artifact the run produced.
    pub output: Digest32,
    /// Never read: its privacy is the whole point. See the type docs.
    #[allow(dead_code)]
    checked: (),
}

impl Admission {
    pub fn analysis_hash(&self) -> Digest32 {
        self.analysis.digest()
    }
}

/// Run the invariant of the task over a finished run and, only if it holds,
/// commit the two envelopes the kernel will look for and return the proposal.
///
/// A failed or missing invariant commits nothing: an excluded run leaves no
/// admitted evidence behind to be mistaken for a checked one.
pub async fn admit<C: EvidenceCommitter>(
    spec: &TaskSpec,
    run: &RunReport,
    registry: &Registry,
    store: &C,
) -> Result<Admission, Exclusion> {
    if spec.requested_by.trim().is_empty() {
        return Err(Exclusion::Malformed("requested_by"));
    }
    if spec.request_key.is_empty() {
        return Err(Exclusion::Malformed("request_key"));
    }
    if run.output.is_empty() {
        return Err(Exclusion::Malformed("output"));
    }
    for (field, value) in [
        ("module_id", &run.module_id),
        ("module_version", &run.module_version),
        ("execution_id", &run.execution_id),
        ("invariant_id", &spec.invariant_id),
    ] {
        if !is_id(value) {
            return Err(Exclusion::Malformed(field));
        }
    }

    let invariant =
        registry
            .get(&spec.invariant_id)
            .ok_or_else(|| Exclusion::UnknownInvariant {
                requested: spec.invariant_id.clone(),
            })?;

    let source = run.source_digest();
    let output = run.output_digest();

    let note = match invariant.check(spec, &run.output) {
        Outcome::Failed { reason } => {
            return Err(Exclusion::InvariantFailed {
                invariant_id: invariant.id().to_owned(),
                invariant_version: invariant.version().to_owned(),
                reason,
            })
        }
        Outcome::Held { note } => note,
    };

    // What is being proposed: this artifact, from this run, checked by this
    // invariant at this version. The kernel requires the output_digest of the
    // analysis record to equal it, so none of the four can be swapped later.
    let parameters_digest = Digest32::blake3(
        PARAMETERS_DOMAIN,
        &encode_value(&json!({
            "invariant_id": invariant.id(),
            "invariant_version": invariant.version(),
            "source": source,
            "output": output,
        })),
    );

    let analysis = WorkerExecutionRecord {
        classification: None,
        operation: Some(CognitiveOperation::Analyze),
        module_id: invariant.id().to_owned(),
        module_version: invariant.version().to_owned(),
        input_digest: source,
        output_digest: parameters_digest,
        evidence_refs: vec![output],
        confidence_bps: None,
        uncertainty_note: note,
        execution_id: format!("{}:{}", run.execution_id, invariant.id()),
    };
    let analysis_hash = analysis.digest();

    let intent = WorkIntent {
        requested_by: spec.requested_by.clone(),
        intent_type: spec.intent_type.clone(),
        target: spec.target,
        parameters_digest,
        context: vec![
            ContextEntry {
                kind: ContextKind::SourceReport,
                hash: source,
            },
            ContextEntry {
                kind: ContextKind::AnalysisRecord,
                hash: analysis_hash,
            },
        ],
        context_refs: vec![source, output],
        request_identity: RequestIdentity::new(&spec.request_key),
        claimed_created_at: spec.claimed_created_at,
    };

    store
        .append_verified(EvidenceEnvelope {
            record_hash: source,
            kind: "RunReport".to_owned(),
            subject: output,
            payload_digest: source,
            policy_digest: None,
            causal_parents: vec![],
        })
        .await
        .map_err(Exclusion::CommitFailed)?;

    store
        .append_verified(EvidenceEnvelope {
            record_hash: analysis_hash,
            kind: "WorkerExecutionRecord".to_owned(),
            subject: source,
            payload_digest: analysis_hash,
            policy_digest: None,
            causal_parents: vec![source],
        })
        .await
        .map_err(Exclusion::CommitFailed)?;

    Ok(Admission {
        intent,
        analysis,
        source,
        output,
        checked: (),
    })
}

/// Governance side of the adapter: which invariant module may stand as the
/// analysis record for which task class. Nothing is allowed by default, and
/// `Analyze` is the only allowed operation, so the record an agent writes
/// about its own execution can never authorize a transition.
#[derive(Debug, Clone)]
pub struct InvariantProfile {
    pub policy_id: String,
    pub version: u64,
    /// One entry per task class governance has opted in to.
    pub allowed: Vec<(WorkIntentType, String)>,
}

impl InvariantProfile {
    pub fn binding(&self) -> PolicyBinding {
        PolicyBinding {
            policy_id: self.policy_id.clone(),
            version: self.version,
            policy_digest: Digest32::blake3(
                PROFILE_DOMAIN,
                &encode_value(&json!({
                    "policy_id": &self.policy_id,
                    "version": self.version,
                    "allowed": &self.allowed,
                })),
            ),
        }
    }

    fn modules_for(&self, intent_type: &WorkIntentType) -> Vec<String> {
        self.allowed
            .iter()
            .filter(|(class, _)| class == intent_type)
            .map(|(_, module)| module.clone())
            .collect()
    }
}

pub mod invariants;
pub mod receipt;

impl PolicyResolver for InvariantProfile {
    /// `None` means the kernel rejects with `missing worker evidence policy`:
    /// an uncovered task class cannot be admitted by this profile.
    fn required_worker_evidence(
        &self,
        intent: &WorkIntent,
        _binding: &PolicyBinding,
    ) -> Option<EvidenceKindRequirement> {
        let allowed_modules = self.modules_for(&intent.intent_type);
        if allowed_modules.is_empty() {
            return None;
        }
        Some(EvidenceKindRequirement {
            allowed_modules,
            allowed_operations: vec![CognitiveOperation::Analyze],
        })
    }

    fn resolve(&self, intent: &WorkIntent, _binding: &PolicyBinding) -> PolicyVerdict {
        if self.modules_for(&intent.intent_type).is_empty() {
            PolicyVerdict::Deny(format!("no invariant profile for {:?}", intent.intent_type))
        } else {
            PolicyVerdict::Allow
        }
    }
}
