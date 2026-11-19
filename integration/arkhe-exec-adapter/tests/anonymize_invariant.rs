//! The first invariant that checks real work, end to end through the kernel.
//!
//! The task: an agent produces a record that must leave the process carrying no
//! direct identifier. The checker is `arkhe_anonymize::release`, which already
//! existed. Every case here ends at `ContainmentGate::authorize_admitted` or at
//! an `Exclusion` — an admission the kernel would reject is not an admission.

use arkhe_core::{work::WorkIntentType, Digest32};
use arkhe_exec_adapter::{
    admit,
    invariants::{NoDirectIdentifier, NO_DIRECT_IDENTIFIER_VERSION},
    receipt::VerdictClaim,
    Exclusion, InvariantProfile, Registry, RunReport, TaskSpec,
};
use arkhe_kernel::{AuthorizationDecision, ContainmentGate};
use arkhe_wormgraph::WormGraph;

const INVARIANT: &str = "invariant.no-direct-identifier";
const ACTION_ID: &str = "7c0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8";

fn registry() -> Registry {
    Registry::new().with(Box::new(NoDirectIdentifier))
}

fn spec() -> TaskSpec {
    TaskSpec {
        requested_by: "operator@arkhe".into(),
        // Protected, so the kernel refuses the caller-supplied path for it.
        intent_type: WorkIntentType::Publish,
        target: Digest32::blake3(b"TEST:TARGET\0", b"registro-sintetico-2026-11"),
        invariant_id: INVARIANT.into(),
        request_key: b"req-anpd-0001".to_vec(),
        claimed_created_at: 1_763_000_000,
    }
}

fn run(output: &[u8]) -> RunReport {
    RunReport {
        module_id: "claude.computer-use".into(),
        module_version: "2026.11.18".into(),
        execution_id: "run-anpd-0001".into(),
        output: output.to_vec(),
    }
}

fn profile() -> InvariantProfile {
    InvariantProfile {
        policy_id: "anpd.piloto".into(),
        version: 1,
        allowed: vec![(WorkIntentType::Publish, INVARIANT.into())],
    }
}

/// Suppressed already: no label, no CPF, no e-mail, no phone.
const RELEASED: &[u8] =
    br#"{"municipio":"Goiania","faixa_etaria":"30-39","protocolo":"2026-000123"}"#;

/// What an agent emits when it forgets: a field named for an identifier. The
/// label decides before the value is ever examined, so the category is
/// `labeled`.
const CARRIES_CPF: &[u8] = br#"{"municipio":"Goiania","cpf":"529.982.247-25"}"#;

/// The harder case, and the realistic one: a valid CPF buried in free text
/// under an innocuous key. Nothing in the field name gives it away, so the
/// value pattern has to catch it. A real checksum, so it is the digits that
/// fire and not the punctuation.
const CPF_IN_PROSE: &[u8] =
    br#"{"municipio":"Goiania","observacao":"o contribuinte 529.982.247-25 pediu vista"}"#;

const CARRIES_EMAIL: &[u8] = br#"{"municipio":"Goiania","contato":"fulano@example.com"}"#;

#[tokio::test]
async fn a_suppressed_record_is_admitted_and_authorized() {
    let store = WormGraph::new();
    let admission = admit(&spec(), &run(RELEASED), &registry(), &store)
        .await
        .expect("a record with no direct identifier holds");

    assert_eq!(admission.analysis.module_id, INVARIANT);
    assert_eq!(
        admission.analysis.module_version,
        NO_DIRECT_IDENTIFIER_VERSION
    );

    let profile = profile();
    let binding = profile.binding();
    let gate = ContainmentGate::new(profile);
    match gate
        .authorize_admitted(&admission.intent, &admission.analysis, &binding, &store)
        .await
    {
        AuthorizationDecision::Allow { authorization_ref } => {
            assert_ne!(authorization_ref, Digest32::ZERO);
        }
        AuthorizationDecision::Reject { reason } => panic!("unexpected rejection: {reason}"),
    }
}

/// The case the whole crate exists for: the agent produced something, it looks
/// finished, and it is excluded with a reason instead of being published.
#[tokio::test]
async fn a_record_carrying_a_cpf_is_excluded() {
    let store = WormGraph::new();
    let excluded = admit(&spec(), &run(CARRIES_CPF), &registry(), &store)
        .await
        .expect_err("a CPF cannot be admitted");

    match &excluded {
        Exclusion::InvariantFailed {
            invariant_id,
            invariant_version,
            reason,
        } => {
            assert_eq!(invariant_id, INVARIANT);
            assert_eq!(invariant_version, NO_DIRECT_IDENTIFIER_VERSION);
            assert!(reason.contains("labeled"), "reason was {reason}");
        }
        other => panic!("expected InvariantFailed, got {other:?}"),
    }

    // Nothing was committed, so nothing can later read as a checked run.
    let source = run(CARRIES_CPF).source_digest();
    assert!(arkhe_core::evidence::EvidenceReader::get(&store, source)
        .await
        .expect("store read")
        .is_none());
}

/// Nothing in the field name warns anyone. The exclusion comes from the value.
#[tokio::test]
async fn a_cpf_buried_in_free_text_is_excluded() {
    let store = WormGraph::new();
    let excluded = admit(&spec(), &run(CPF_IN_PROSE), &registry(), &store)
        .await
        .expect_err("a CPF in prose cannot be admitted");
    assert!(
        excluded.reason().contains("cpf"),
        "reason was {}",
        excluded.reason()
    );
}

#[tokio::test]
async fn a_record_carrying_an_email_is_excluded() {
    let store = WormGraph::new();
    let excluded = admit(&spec(), &run(CARRIES_EMAIL), &registry(), &store)
        .await
        .expect_err("an e-mail cannot be admitted");
    assert!(
        excluded.reason().contains("email") || excluded.reason().contains("e-mail"),
        "reason was {}",
        excluded.reason()
    );
}

/// A refused run is worth signing, and the receipt says the invariant did not
/// hold. This is the exclusion leaving the process as evidence rather than as
/// a log line.
#[tokio::test]
async fn an_excluded_record_yields_a_held_false_claim() {
    let store = WormGraph::new();
    let bad = run(CARRIES_CPF);
    let excluded = admit(&spec(), &bad, &registry(), &store)
        .await
        .expect_err("a CPF cannot be admitted");

    let claim = VerdictClaim::from_failure(&excluded, &bad, ACTION_ID).expect("a claim");
    assert!(!claim.held);
    assert_eq!(claim.invariant_id, INVARIANT);
    assert_eq!(claim.invariant_version, NO_DIRECT_IDENTIFIER_VERSION);
}

/// The admitted run also emits a claim, so the same task produces either an
/// authorization plus a `held: true` verdict, or an exclusion plus a
/// `held: false` one. Never silence.
#[tokio::test]
async fn an_admitted_record_yields_a_held_true_claim() {
    let store = WormGraph::new();
    let good = run(RELEASED);
    let admission = admit(&spec(), &good, &registry(), &store)
        .await
        .expect("a suppressed record holds");

    let claim = VerdictClaim::from_admission(&admission, &good, ACTION_ID).expect("a claim");
    assert!(claim.held);
    assert_eq!(claim.invariant_id, INVARIANT);
    assert_eq!(claim.output_sha256.len(), 64);
}

/// Not JSON at all is a failed check, not a crash.
#[tokio::test]
async fn an_output_that_is_not_json_is_excluded() {
    let store = WormGraph::new();
    let excluded = admit(&spec(), &run(b"<html>sorry</html>"), &registry(), &store)
        .await
        .expect_err("HTML is not a record");
    assert!(
        excluded.reason().contains("does not parse as JSON"),
        "reason was {}",
        excluded.reason()
    );
}
