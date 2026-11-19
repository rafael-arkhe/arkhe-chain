use arkhe_cognition_sdk::{CanonicalEncode, Digest32};
use arkhe_perception::observe;

#[test]
fn perception_separates_input_and_representation_domains_and_binds_attestation() {
    let att = Digest32([0x42; 32]);
    let (obs, wer) = observe(b"sensor-frame-1", Some(att));
    assert_ne!(obs.input_digest, Digest32::ZERO);
    assert_ne!(obs.representation_digest, Digest32::ZERO);
    assert_ne!(obs.input_digest, obs.representation_digest);
    assert_eq!(obs.encoder_attestation, Some(att));

    assert_eq!(wer.module_id, "arkhe-perception");
    assert_eq!(wer.input_digest, obs.input_digest);
    assert_eq!(wer.output_digest, obs.representation_digest);
    assert_eq!(wer.evidence_refs, vec![att]);
    assert_eq!(wer.confidence_bps, None);
    assert_eq!(wer.digest(), wer.object_digest());

    let (unattested, unattested_wer) = observe(b"sensor-frame-1", None);
    assert_eq!(unattested.input_digest, obs.input_digest);
    assert_eq!(unattested.representation_digest, obs.representation_digest);
    assert!(unattested_wer.evidence_refs.is_empty());
    // Presence of evidence_refs changes canonical WER digest.
    assert_ne!(unattested_wer.digest(), wer.digest());
}
