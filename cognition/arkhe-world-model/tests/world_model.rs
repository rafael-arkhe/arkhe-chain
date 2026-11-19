use arkhe_cognition_sdk::{CanonicalEncode, Digest32};
use arkhe_world_model::simulate;

#[test]
fn world_model_is_deterministic_uncalibrated_and_declares_reference_scope() {
    let (f1, w1) = simulate(b"counterfactual-alpha");
    let (f2, w2) = simulate(b"counterfactual-alpha");
    let (f3, w3) = simulate(b"counterfactual-beta");

    assert_eq!(f1.scenario_digest, f2.scenario_digest);
    assert_eq!(f1.forecast_digest, f2.forecast_digest);
    assert_eq!(w1.digest(), w2.digest());
    assert_ne!(f1.scenario_digest, f1.forecast_digest);
    assert_ne!(f1.forecast_digest, f3.forecast_digest);
    assert_ne!(w1.digest(), w3.digest());

    assert_eq!(f1.uncertainty_bps, 5000);
    assert_eq!(w1.module_id, "arkhe-world-model");
    assert_eq!(w1.confidence_bps, Some(5000));
    assert!(w1
        .uncertainty_note
        .as_deref()
        .unwrap_or("")
        .contains("causal validity not demonstrated"));
    assert!(w1.evidence_refs.is_empty());
    assert_ne!(w1.digest(), Digest32::ZERO);
    assert_eq!(w1.digest(), w1.object_digest());
}
