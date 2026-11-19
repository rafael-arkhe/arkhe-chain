use arkhe_cognition_sdk::{CanonicalEncode, Digest32};
use arkhe_learning::{propose, Proposal};

#[test]
fn learning_proposal_binds_all_four_digests_in_order_and_requires_review() {
    let base = Digest32([1; 32]);
    let cand = Digest32([2; 32]);
    let eval = Digest32([3; 32]);
    let roll = Digest32([4; 32]);

    let wer = propose(Proposal {
        baseline_ref: base,
        candidate_ref: cand,
        evaluation_ref: eval,
        rollback_ref: roll,
    });
    assert_eq!(wer.module_id, "arkhe-learning");
    assert_eq!(wer.input_digest, base);
    assert_eq!(wer.evidence_refs, vec![eval, roll]);
    assert_eq!(wer.confidence_bps, None);
    assert!(wer
        .uncertainty_note
        .as_deref()
        .unwrap_or("")
        .contains("proposal only"));
    assert_eq!(wer.digest(), wer.object_digest());

    // Swapping candidate_ref and evaluation_ref must alter output_digest and WER digest.
    let swapped = propose(Proposal {
        baseline_ref: base,
        candidate_ref: eval,
        evaluation_ref: cand,
        rollback_ref: roll,
    });
    assert_ne!(swapped.output_digest, wer.output_digest);
    assert_ne!(swapped.digest(), wer.digest());
}
