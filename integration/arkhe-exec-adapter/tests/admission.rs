//! What the adapter promises, as cases the kernel decides.
//!
//! Each test ends at `ContainmentGate::authorize_admitted` or at an
//! `Exclusion`. Nothing here asserts on the adapter alone: an admission that
//! the kernel would reject is not an admission.

use arkhe_core::{
    work::{ContextKind, WorkIntent, WorkIntentType},
    worker::{CognitiveOperation, WorkerExecutionRecord},
    Digest32,
};
use arkhe_exec_adapter::{
    admit, Exclusion, Invariant, InvariantProfile, Outcome, Registry, RunReport, TaskSpec,
};
use arkhe_kernel::{AuthorizationDecision, ContainmentGate};
use arkhe_wormgraph::WormGraph;

const INVARIANT: &str = "invariant.json-object";

/// A decidable property: the artifact parses as a JSON object and carries
/// every field the task said it must.
struct JsonObjectHasFields {
    required: Vec<&'static str>,
}

impl Invariant for JsonObjectHasFields {
    fn id(&self) -> &str {
        INVARIANT
    }

    fn version(&self) -> &str {
        "1.0.0"
    }

    fn check(&self, _spec: &TaskSpec, output: &[u8]) -> Outcome {
        let value: serde_json::Value = match serde_json::from_slice(output) {
            Ok(value) => value,
            Err(e) => {
                return Outcome::Failed {
                    reason: format!("output does not parse as JSON: {e}"),
                }
            }
        };
        let Some(map) = value.as_object() else {
            return Outcome::Failed {
                reason: "output is not a JSON object".into(),
            };
        };
        let missing: Vec<&str> = self
            .required
            .iter()
            .copied()
            .filter(|field| !map.contains_key(*field))
            .collect();
        if missing.is_empty() {
            Outcome::Held { note: None }
        } else {
            Outcome::Failed {
                reason: format!("missing fields: {}", missing.join(", ")),
            }
        }
    }
}

fn registry() -> Registry {
    Registry::new().with(Box::new(JsonObjectHasFields {
        required: vec!["cnpj", "valor"],
    }))
}

fn spec() -> TaskSpec {
    TaskSpec {
        requested_by: "operator@arkhe".into(),
        // Protected: the kernel refuses the caller-supplied path for it.
        intent_type: WorkIntentType::Publish,
        target: Digest32::blake3(b"TEST:TARGET\0", b"nota-fiscal-2026-11"),
        invariant_id: INVARIANT.into(),
        request_key: b"req-0001".to_vec(),
        claimed_created_at: 1_763_000_000,
    }
}

fn run(output: &[u8]) -> RunReport {
    RunReport {
        module_id: "claude.computer-use".into(),
        module_version: "2026.11.18".into(),
        execution_id: "run-0001".into(),
        output: output.to_vec(),
    }
}

const GOOD: &[u8] = br#"{"cnpj":"00.000.000/0001-91","valor":1250}"#;

/// The profile governance would have to sign: this task class, this invariant.
fn profile() -> InvariantProfile {
    InvariantProfile {
        policy_id: "exec.adapter.test".into(),
        version: 1,
        allowed: vec![(WorkIntentType::Publish, INVARIANT.into())],
    }
}

async fn decide(
    profile: InvariantProfile,
    intent: &WorkIntent,
    worker: &WorkerExecutionRecord,
    store: &WormGraph,
) -> AuthorizationDecision {
    let binding = profile.binding();
    let gate = ContainmentGate::new(profile);
    gate.authorize_admitted(intent, worker, &binding, store)
        .await
}

fn rejection(decision: AuthorizationDecision) -> String {
    match decision {
        AuthorizationDecision::Reject { reason } => reason,
        AuthorizationDecision::Allow { authorization_ref } => {
            panic!("expected a rejection, got {}", authorization_ref.to_hex())
        }
    }
}

#[tokio::test]
async fn invariant_holds_and_the_kernel_authorizes() {
    let store = WormGraph::new();
    let admission = admit(&spec(), &run(GOOD), &registry(), &store)
        .await
        .expect("a held invariant admits");

    let decision = decide(profile(), &admission.intent, &admission.analysis, &store).await;
    match decision {
        AuthorizationDecision::Allow { authorization_ref } => {
            assert_ne!(authorization_ref, Digest32::ZERO);
        }
        AuthorizationDecision::Reject { reason } => panic!("unexpected rejection: {reason}"),
    }
}

#[tokio::test]
async fn an_unknown_invariant_excludes_and_commits_nothing() {
    let store = WormGraph::new();
    let mut spec = spec();
    spec.invariant_id = "invariant.not-written-yet".into();

    let excluded = admit(&spec, &run(GOOD), &registry(), &store)
        .await
        .expect_err("an unregistered invariant cannot admit");
    assert_eq!(
        excluded,
        Exclusion::UnknownInvariant {
            requested: "invariant.not-written-yet".into()
        }
    );

    // Nothing was written, so nothing can later be mistaken for a checked run.
    let source = run(GOOD).source_digest();
    assert!(arkhe_core::evidence::EvidenceReader::get(&store, source)
        .await
        .expect("store read")
        .is_none());
}

#[tokio::test]
async fn a_failed_invariant_excludes_with_its_reason() {
    let store = WormGraph::new();
    let excluded = admit(
        &spec(),
        &run(br#"{"cnpj":"00.000.000/0001-91"}"#),
        &registry(),
        &store,
    )
    .await
    .expect_err("a missing field cannot admit");

    match excluded {
        Exclusion::InvariantFailed {
            invariant_id,
            invariant_version,
            reason,
        } => {
            assert_eq!(invariant_id, INVARIANT);
            assert_eq!(invariant_version, "1.0.0");
            assert!(reason.contains("valor"), "reason was {reason}");
        }
        other => panic!("expected InvariantFailed, got {other:?}"),
    }
}

/// The axiom: an output no invariant checked authorizes nothing. The agent
/// here reports the same work, with the same digests, as its own `Execute`
/// record; the profile allows only `Analyze`.
#[tokio::test]
async fn an_execute_record_cannot_stand_as_the_analysis() {
    let store = WormGraph::new();
    let admission = admit(&spec(), &run(GOOD), &registry(), &store)
        .await
        .expect("a held invariant admits");

    let mut self_reported = admission.analysis.clone();
    self_reported.operation = Some(CognitiveOperation::Execute);
    self_reported.module_id = "claude.computer-use".into();
    let hash = self_reported.digest();

    // Admit it with the bindings the kernel checks, so only the operation and
    // module are left to decide.
    arkhe_core::evidence::EvidenceCommitter::append_verified(
        &store,
        arkhe_core::evidence::EvidenceEnvelope {
            record_hash: hash,
            kind: "WorkerExecutionRecord".into(),
            subject: admission.source,
            payload_digest: hash,
            policy_digest: None,
            causal_parents: vec![admission.source],
        },
    )
    .await
    .expect("commit");

    let mut intent = admission.intent.clone();
    for entry in intent.context.iter_mut() {
        if entry.kind == ContextKind::AnalysisRecord {
            entry.hash = hash;
        }
    }
    let reason = rejection(decide(profile(), &intent, &self_reported, &store).await);
    assert_eq!(reason, "module not allowed");

    // And with the invariant module name but still `Execute`:
    let mut masquerade = self_reported.clone();
    masquerade.module_id = INVARIANT.into();
    let hash = masquerade.digest();
    arkhe_core::evidence::EvidenceCommitter::append_verified(
        &store,
        arkhe_core::evidence::EvidenceEnvelope {
            record_hash: hash,
            kind: "WorkerExecutionRecord".into(),
            subject: admission.source,
            payload_digest: hash,
            policy_digest: None,
            causal_parents: vec![admission.source],
        },
    )
    .await
    .expect("commit");
    let mut intent = admission.intent.clone();
    for entry in intent.context.iter_mut() {
        if entry.kind == ContextKind::AnalysisRecord {
            entry.hash = hash;
        }
    }
    let reason = rejection(decide(profile(), &intent, &masquerade, &store).await);
    assert_eq!(reason, "operation not allowed");
}

/// Swapping the artifact after the check breaks the binding the kernel
/// requires between the analysis output and the proposed parameters.
#[tokio::test]
async fn a_substituted_artifact_is_rejected() {
    let store = WormGraph::new();
    let admission = admit(&spec(), &run(GOOD), &registry(), &store)
        .await
        .expect("a held invariant admits");

    let other = admit(
        &spec(),
        &RunReport {
            execution_id: "run-0002".into(),
            output: br#"{"cnpj":"11.111.111/0001-11","valor":999999}"#.to_vec(),
            ..run(GOOD)
        },
        &registry(),
        &store,
    )
    .await
    .expect("the second run also holds");

    // The first proposal, carrying the parameters of the second.
    let mut intent = admission.intent.clone();
    intent.parameters_digest = other.intent.parameters_digest;
    let reason = rejection(decide(profile(), &intent, &admission.analysis, &store).await);
    assert_eq!(reason, "analysis evidence does not bind this proposal");
}

/// An admission held in one process authorizes nothing in a store that never
/// saw the evidence.
#[tokio::test]
async fn an_uncommitted_analysis_is_rejected() {
    let committed = WormGraph::new();
    let admission = admit(&spec(), &run(GOOD), &registry(), &committed)
        .await
        .expect("a held invariant admits");

    let empty = WormGraph::new();
    let reason = rejection(decide(profile(), &admission.intent, &admission.analysis, &empty).await);
    assert_eq!(reason, "missing admitted analysis evidence");
}

/// A task class governance never opted in to has no evidence policy at all.
#[tokio::test]
async fn an_uncovered_task_class_is_rejected() {
    let store = WormGraph::new();
    let admission = admit(&spec(), &run(GOOD), &registry(), &store)
        .await
        .expect("a held invariant admits");

    let elsewhere = InvariantProfile {
        allowed: vec![(WorkIntentType::ReleaseSoftware, INVARIANT.into())],
        ..profile()
    };

    let reason = rejection(decide(elsewhere, &admission.intent, &admission.analysis, &store).await);
    assert_eq!(reason, "missing worker evidence policy");
}

/// Retries of the same request reach the same operation, and an identical run
/// commits the same evidence twice without conflict.
#[tokio::test]
async fn an_identical_retry_is_idempotent() {
    let store = WormGraph::new();
    let first = admit(&spec(), &run(GOOD), &registry(), &store)
        .await
        .expect("first admission");
    let second = admit(&spec(), &run(GOOD), &registry(), &store)
        .await
        .expect("retry admission");

    assert_eq!(first.source, second.source);
    assert_eq!(first.analysis_hash(), second.analysis_hash());
    assert_eq!(
        first.intent.operation_id(),
        second.intent.operation_id(),
        "a retry must not open a second operation"
    );
}

#[tokio::test]
async fn a_malformed_run_is_excluded_before_any_check() {
    let store = WormGraph::new();
    let excluded = admit(
        &spec(),
        &RunReport {
            module_id: "claude computer use".into(),
            ..run(GOOD)
        },
        &registry(),
        &store,
    )
    .await
    .expect_err("a module id with spaces is not an id");
    assert_eq!(excluded, Exclusion::Malformed("module_id"));

    let excluded = admit(&spec(), &run(b""), &registry(), &store)
        .await
        .expect_err("an empty output is not a result");
    assert_eq!(excluded, Exclusion::Malformed("output"));
}
