//! What the adapter emits towards an `arkhe-flow` receipt log.
//!
//! These tests cannot reach `arkhe-flow` itself: it lives in the
//! `packaging/core` workspace, and a path dependency either way fails to load
//! the manifest, because both manifests use `workspace = true` inheritance and
//! Cargo resolves that against the outermost workspace. So the body shape is
//! asserted literally here and enforced on the other side by the `invariant`
//! arm of `arkhe_flow::validate_body`, whose `require_keys` rejects any other
//! key set. Nothing automatic catches a drift between the two; a shared vector
//! read by both suites would, and does not exist yet.

use arkhe_core::{work::WorkIntentType, Digest32};
use arkhe_exec_adapter::{
    admit,
    receipt::{sha256_hex, ClaimError, VerdictClaim},
    Exclusion, Invariant, Outcome, Registry, RunReport, TaskSpec,
};
use arkhe_wormgraph::WormGraph;
use serde_json::json;

const INVARIANT: &str = "invariant.json-object";
const ACTION_ID: &str = "7c0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8";

struct RequiresValor;

impl Invariant for RequiresValor {
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
                    reason: format!("not JSON: {e}"),
                }
            }
        };
        if value.get("valor").is_some() {
            Outcome::Held { note: None }
        } else {
            Outcome::Failed {
                reason: "missing field: valor".into(),
            }
        }
    }
}

fn registry() -> Registry {
    Registry::new().with(Box::new(RequiresValor))
}

fn spec() -> TaskSpec {
    TaskSpec {
        requested_by: "operator@arkhe".into(),
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

/// Both digests, over the same bytes, neither renamed. The receipt log calls
/// its field `output_sha256`, so the claim carries sha256; the kernel saw the
/// same artifact under blake3 with a domain. The two values differ and both
/// are recorded.
#[tokio::test]
async fn a_claim_carries_both_digests_of_the_same_bytes() {
    let store = WormGraph::new();
    let run = run(GOOD);
    let admission = admit(&spec(), &run, &registry(), &store)
        .await
        .expect("a held invariant admits");

    let claim = VerdictClaim::from_admission(&admission, &run, ACTION_ID).expect("a claim");

    assert_eq!(claim.output_sha256, sha256_hex(GOOD));
    assert_ne!(
        claim.output_sha256,
        admission.output.to_hex(),
        "sha256 and blake3 of the same bytes must not be confused"
    );
    assert_eq!(claim.invariant_id, INVARIANT);
    assert_eq!(claim.invariant_version, "1.0.0");
    assert!(claim.held);

    // The exact body `arkhe_flow::validate_body` accepts for kind `invariant`.
    assert_eq!(
        claim.body(),
        json!({
            "action_id": ACTION_ID,
            "held": true,
            "invariant_id": INVARIANT,
            "invariant_version": "1.0.0",
            "issuer": "invariant",
            "kind": "invariant",
            "output_sha256": sha256_hex(GOOD),
        })
    );
}

/// A valid admission plus the bytes of some other run makes no claim. Without
/// this the signature would be over an artifact nothing checked.
#[tokio::test]
async fn a_claim_built_from_another_run_is_refused() {
    let store = WormGraph::new();
    let checked = run(GOOD);
    let admission = admit(&spec(), &checked, &registry(), &store)
        .await
        .expect("a held invariant admits");

    let elsewhere = RunReport {
        execution_id: "run-0002".into(),
        output: br#"{"cnpj":"11.111.111/0001-11","valor":999999}"#.to_vec(),
        ..run(GOOD)
    };

    assert_eq!(
        VerdictClaim::from_admission(&admission, &elsewhere, ACTION_ID),
        Err(ClaimError::WrongRun)
    );
}

#[tokio::test]
async fn a_malformed_action_id_makes_no_claim() {
    let store = WormGraph::new();
    let run = run(GOOD);
    let admission = admit(&spec(), &run, &registry(), &store)
        .await
        .expect("a held invariant admits");

    assert_eq!(
        VerdictClaim::from_admission(&admission, &run, "not-a-receipt-id"),
        Err(ClaimError::MalformedActionId)
    );
}

/// A refused run is worth signing. The verdict carries `held: false`, which
/// `arkhe-flow` reads as discharging nothing.
#[tokio::test]
async fn a_failed_invariant_yields_a_held_false_claim() {
    let store = WormGraph::new();
    let bad = run(br#"{"cnpj":"00.000.000/0001-91"}"#);
    let exclusion = admit(&spec(), &bad, &registry(), &store)
        .await
        .expect_err("a missing field cannot admit");

    let claim = VerdictClaim::from_failure(&exclusion, &bad, ACTION_ID).expect("a claim");
    assert!(!claim.held);
    assert_eq!(claim.invariant_id, INVARIANT);
    assert_eq!(claim.invariant_version, "1.0.0");
    assert_eq!(claim.body()["held"], json!(false));
}

/// The other exclusions never reached a checker, so the invariant role has
/// nothing to sign about them.
#[tokio::test]
async fn an_exclusion_that_never_reached_a_checker_makes_no_claim() {
    let store = WormGraph::new();
    let mut spec = spec();
    spec.invariant_id = "invariant.not-written-yet".into();
    let exclusion = admit(&spec, &run(GOOD), &registry(), &store)
        .await
        .expect_err("an unregistered invariant cannot admit");
    assert!(matches!(exclusion, Exclusion::UnknownInvariant { .. }));

    assert_eq!(
        VerdictClaim::from_failure(&exclusion, &run(GOOD), ACTION_ID),
        Err(ClaimError::NotACheckedFailure)
    );
}
