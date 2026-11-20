//! The RFC 9162 consistency proof, as a pure function.
//!
//! The proof generator follows `SUBPROOF` of RFC 6962 §2.1.2 and the verifier
//! rebuilds **both** roots from the proof, comparing them against roots that
//! `tree_hash` computed independently. A generator and a verifier that agreed
//! on a wrong tree would still fail these tests, because the roots do not come
//! from either of them.

use arkhe_verify_core::aid::merkle::{
    consistency_proof, empty_root, leaf_hash, node_hash, tree_hash, verify_consistency,
};

fn leaves(n: usize) -> Vec<Vec<u8>> {
    (0..n).map(|i| format!("event-{i}").into_bytes()).collect()
}

#[test]
fn every_prefix_of_every_tree_up_to_twelve_leaves_verifies() {
    for second in 0..=12usize {
        let all = leaves(second);
        let second_root = tree_hash(&all);
        for first in 0..=second {
            let first_root = tree_hash(&all[..first]);
            let proof = consistency_proof(&all, first).expect("proof generates");
            verify_consistency(first, second, &first_root, &second_root, &proof).unwrap_or_else(
                |e| panic!("{first} -> {second} should be consistent: {e}"),
            );
        }
    }
}

#[test]
fn the_proof_for_two_of_five_leaves_is_the_one_rfc_6962_derives() {
    // n=5, m=2. split(5)=4, so the proof is SUBPROOF(2, D[0..4], true) then
    // MTH(D[4..5]); SUBPROOF(2, D[0..4], true) is MTH(D[2..4]) because
    // split(4)=2 and SUBPROOF(2, D[0..2], true) is empty.
    let all = leaves(5);
    let expected = vec![
        node_hash(&leaf_hash(&all[2]), &leaf_hash(&all[3])),
        leaf_hash(&all[4]),
    ];
    assert_eq!(consistency_proof(&all, 2).unwrap(), expected);

    // And the five-leaf root has the shape the normative split dictates.
    let left = node_hash(
        &node_hash(&leaf_hash(&all[0]), &leaf_hash(&all[1])),
        &node_hash(&leaf_hash(&all[2]), &leaf_hash(&all[3])),
    );
    assert_eq!(tree_hash(&all), node_hash(&left, &leaf_hash(&all[4])));
}

#[test]
fn the_empty_and_unchanged_cases_carry_no_steps() {
    let all = leaves(5);
    assert!(consistency_proof(&all, 0).unwrap().is_empty());
    assert!(consistency_proof(&all, 5).unwrap().is_empty());

    // Every tree extends the empty tree, but the empty root is still checked.
    let root = tree_hash(&all);
    assert!(verify_consistency(0, 5, &empty_root(), &root, &[]).is_ok());
    assert!(verify_consistency(0, 5, &leaf_hash(b"not empty"), &root, &[]).is_err());

    // Same size, same root, nothing appended.
    assert!(verify_consistency(5, 5, &root, &root, &[]).is_ok());
    assert!(verify_consistency(5, 5, &root, &leaf_hash(b"other"), &[]).is_err());
    assert!(verify_consistency(5, 5, &root, &root, &[empty_root()]).is_err());
}

#[test]
fn a_shrinking_history_is_rejected() {
    let all = leaves(5);
    let root = tree_hash(&all);
    let smaller = tree_hash(&all[..2]);
    assert!(verify_consistency(5, 2, &root, &smaller, &[]).is_err());
}

#[test]
fn a_tampered_truncated_or_padded_proof_is_rejected() {
    let all = leaves(7);
    let second_root = tree_hash(&all);
    let first_root = tree_hash(&all[..3]);
    let proof = consistency_proof(&all, 3).unwrap();
    assert!(verify_consistency(3, 7, &first_root, &second_root, &proof).is_ok());

    for index in 0..proof.len() {
        let mut altered = proof.clone();
        altered[index][0] ^= 0x01;
        assert!(
            verify_consistency(3, 7, &first_root, &second_root, &altered).is_err(),
            "step {index} was altered and the proof still verified"
        );
    }

    let mut truncated = proof.clone();
    truncated.pop();
    assert!(verify_consistency(3, 7, &first_root, &second_root, &truncated).is_err());

    let mut padded = proof.clone();
    padded.push(empty_root());
    assert!(
        verify_consistency(3, 7, &first_root, &second_root, &padded).is_err(),
        "a proof with a step beyond its length must be rejected"
    );

    let mut reordered = proof.clone();
    reordered.swap(0, 1);
    assert!(verify_consistency(3, 7, &first_root, &second_root, &reordered).is_err());
}

#[test]
fn a_proof_for_another_pair_of_roots_is_rejected() {
    let all = leaves(7);
    let proof = consistency_proof(&all, 3).unwrap();
    let second_root = tree_hash(&all);
    let first_root = tree_hash(&all[..3]);

    // A different history of the same sizes.
    let other: Vec<Vec<u8>> = (0..7).map(|i| format!("other-{i}").into_bytes()).collect();
    assert!(verify_consistency(3, 7, &tree_hash(&other[..3]), &second_root, &proof).is_err());
    assert!(verify_consistency(3, 7, &first_root, &tree_hash(&other), &proof).is_err());

    // The proof of another prefix of the same history.
    let other_proof = consistency_proof(&all, 4).unwrap();
    assert!(verify_consistency(3, 7, &first_root, &second_root, &other_proof).is_err());
}

#[test]
fn an_appended_history_cannot_rewrite_its_prefix() {
    // The point of the proof: 3 -> 7 verifies only if the first three events
    // are the same three events.
    let mut rewritten = leaves(7);
    rewritten[1] = b"rewritten".to_vec();
    let proof = consistency_proof(&rewritten, 3).unwrap();
    let honest_first = tree_hash(&leaves(3));
    assert!(
        verify_consistency(3, 7, &honest_first, &tree_hash(&rewritten), &proof).is_err(),
        "a rewritten prefix must not pass as an extension of the honest one"
    );
}
