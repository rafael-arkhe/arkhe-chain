//! Falsifiers for C2 canonical votes, quorum commit and attestation rotation.

use std::collections::HashMap;

use arkhe_chain::{check_rotation, RotationOutcome, MAX_LEAVES};
use arkhe_chain::{bft_commit, CommitVerdict};
use arkhe_chain::{CanonicalVote, VoteType};

fn mk_vote(part: &str, h: u64, bid: [u8; 32], vt: VoteType) -> CanonicalVote {
    CanonicalVote::new(part, h, 1, Some(bid), 1_000_000, vt)
}

fn accepts_sig(_v: &CanonicalVote, sig: &[u8]) -> bool {
    sig == b"ok"
}

fn power_1_1_1() -> HashMap<String, u64> {
    [("a".into(), 1), ("b".into(), 1), ("c".into(), 1)]
        .into_iter()
        .collect()
}

#[test]
fn c2_quorum_two_thirds_commits() {
    let bid = [7u8; 32];
    let votes = vec![
        mk_vote("a", 10, bid, VoteType::Precommit),
        mk_vote("b", 10, bid, VoteType::Precommit),
        mk_vote("c", 10, bid, VoteType::Precommit),
    ];
    let sigs = vec![b"ok".to_vec(); 3];
    let verdict = bft_commit(&votes, &sigs, &power_1_1_1(), accepts_sig);
    assert!(matches!(verdict, CommitVerdict::Commit { height: 10, .. }));
}

#[test]
fn c2_below_quorum_returns_absent_not_commitgap() {
    let bid = [7u8; 32];
    let votes = vec![mk_vote("a", 10, bid, VoteType::Precommit)];
    let sigs = vec![b"ok".to_vec()];
    let verdict = bft_commit(&votes, &sigs, &power_1_1_1(), accepts_sig);
    assert!(matches!(verdict, CommitVerdict::QuorumAbsent { height: 10, .. }));
}

#[test]
fn c2_duplicate_part_conflicting_precommits_are_invalid() {
    let a = [1u8; 32];
    let b = [2u8; 32];
    let power = [("a".into(), 2u64), ("b".into(), 2u64)].into_iter().collect();
    let votes = vec![
        mk_vote("a", 10, a, VoteType::Precommit),
        mk_vote("a", 10, b, VoteType::Precommit),
        mk_vote("b", 10, a, VoteType::Precommit),
        mk_vote("b", 10, b, VoteType::Precommit),
    ];
    let sigs = vec![b"ok".to_vec(); 4];
    let verdict = bft_commit(&votes, &sigs, &power, accepts_sig);
    assert!(matches!(verdict, CommitVerdict::InvalidVote { .. }));
}

#[test]
fn c2_wrong_chain_id_invalidates() {
    let mut v = mk_vote("a", 10, [7u8; 32], VoteType::Precommit);
    v.chain_id = "other-chain".into();
    let verdict = bft_commit(&[v], &[b"ok".to_vec()], &power_1_1_1(), accepts_sig);
    assert!(matches!(verdict, CommitVerdict::InvalidVote { .. }));
}

#[test]
fn c2_missing_part_invalidates() {
    let v = mk_vote("", 10, [7u8; 32], VoteType::Precommit);
    let verdict = bft_commit(&[v], &[b"ok".to_vec()], &power_1_1_1(), accepts_sig);
    assert!(matches!(verdict, CommitVerdict::InvalidVote { .. }));
}

#[test]
fn c2_non_validator_part_invalidates() {
    let v = mk_vote("z", 10, [7u8; 32], VoteType::Precommit);
    let verdict = bft_commit(&[v], &[b"ok".to_vec()], &power_1_1_1(), accepts_sig);
    assert!(matches!(verdict, CommitVerdict::InvalidVote { .. }));
}

#[test]
fn c2_prevote_does_not_commit() {
    let bid = [7u8; 32];
    let votes = vec![
        mk_vote("a", 10, bid, VoteType::Prevote),
        mk_vote("b", 10, bid, VoteType::Prevote),
        mk_vote("c", 10, bid, VoteType::Prevote),
    ];
    let sigs = vec![b"ok".to_vec(); 3];
    let verdict = bft_commit(&votes, &sigs, &power_1_1_1(), accepts_sig);
    assert!(matches!(verdict, CommitVerdict::QuorumAbsent { .. }));
}

#[test]
fn c2_rotation_below_limit_no_proof_needed() {
    let r = check_rotation(100, None, |_| Err("never".into())).unwrap();
    assert!(matches!(r, RotationOutcome::BelowLimit));
}

#[test]
fn c2_rotation_at_limit_without_proof_rejected() {
    let r = check_rotation(MAX_LEAVES, None, |_| Err("never".into())).unwrap();
    assert!(matches!(r, RotationOutcome::AtLimitRequiresProof));
}

#[test]
fn c2_rotation_at_limit_with_valid_proof_accepted() {
    let r = check_rotation(MAX_LEAVES, Some(b"proof"), |_| Ok([9u8; 32])).unwrap();
    match r {
        RotationOutcome::Rotated { new_segment_root } => {
            assert_eq!(new_segment_root, [9u8; 32]);
        }
        _ => panic!("expected Rotated"),
    }
}

#[test]
fn c2_registry_admits_after_rotation_with_block_proof() {
    use arkhe_chain::{
        build_rotation_proof, sign_attestation, AttestPolicy, AttestRegistry, Attestation, Claim,
        ATTEST_AUDIENCE, ATTEST_SCHEME_ED25519, ATTEST_SIGNER_QUOTA, ATTEST_VERSION, CHAIN_ID,
    };
    use std::collections::BTreeMap;

    let signer_count = ATTEST_SIGNER_QUOTA;
    let mut keys = BTreeMap::new();
    let mut signers = Vec::new();
    for i in 0..signer_count {
        let mut secret = [0xC0u8; 32];
        secret[1] = i as u8;
        let id = format!("sig-{i:02}");
        keys.insert(id.clone(), arkhe_chain::public_key(&secret).unwrap());
        signers.push((secret, id));
    }
    let mut reg = AttestRegistry::new(
        CHAIN_ID,
        [3u8; 32],
        ATTEST_AUDIENCE,
        AttestPolicy {
            keys,
            grants: vec![],
        },
    )
    .unwrap();
    for round in 0..signer_count {
        for (secret, id) in &signers {
            let mut nonce = [0u8; 32];
            nonce[0] = round as u8;
            let mut att = Attestation {
                version: ATTEST_VERSION,
                scheme: ATTEST_SCHEME_ED25519,
                chain_id: CHAIN_ID.into(),
                genesis: [3u8; 32],
                audience: ATTEST_AUDIENCE.into(),
                signer: id.clone(),
                nonce,
                not_before: 0,
                expires: 200,
                claim: Claim::Request { task: [0; 32], budget: 1 },
                signature: [0; 64],
            };
            sign_attestation(&mut att, secret).unwrap();
            reg.admit(&att, 1, None).unwrap();
        }
    }
    assert_eq!(reg.count(), MAX_LEAVES as u64);
    let proof = build_rotation_proof(&reg).unwrap();
    let (secret, id) = &signers[0];
    let mut att = Attestation {
        version: ATTEST_VERSION,
        scheme: ATTEST_SCHEME_ED25519,
        chain_id: CHAIN_ID.into(),
        genesis: [3u8; 32],
        audience: ATTEST_AUDIENCE.into(),
        signer: id.clone(),
        nonce: [0xAB; 32],
        not_before: 0,
        expires: 200,
        claim: Claim::Request { task: [1; 32], budget: 1 },
        signature: [0; 64],
    };
    sign_attestation(&mut att, secret).unwrap();
    assert_eq!(
        reg.admit(&att, 2, None),
        Err(arkhe_chain::ChainError::Attest("full"))
    );
    reg.admit(&att, 2, Some(&proof)).unwrap();
    assert_eq!(reg.count(), 1);
}

#[test]
fn c2_sign_bytes_are_deterministic() {
    let a = mk_vote("val1", 3, [4u8; 32], VoteType::Precommit);
    let b = a.clone();
    assert_eq!(a.sign_bytes(), b.sign_bytes());
}