use arkhe_p0_foundation::{
    digest_raw, AlgorithmId, ArtifactEnvelope, CausalParent, CausalProvenance, EvidenceRecord,
    RelationType, TimeEvidence,
};

#[test]
fn artifact_envelope_digest_is_deterministic_under_parent_order() {
    let p1 = CausalParent {
        relation: RelationType::DerivedFrom,
        digest: digest_raw(AlgorithmId::Sha256, b"parent-1"),
    };
    let p2 = CausalParent {
        relation: RelationType::Used,
        digest: digest_raw(AlgorithmId::Sha256, b"parent-2"),
    };
    let policy = digest_raw(AlgorithmId::Sha256, b"policy");
    let artifact = digest_raw(AlgorithmId::Sha256, b"asset");

    let a = ArtifactEnvelope {
        artifact_id: b"asset-1".to_vec(),
        digest: artifact.clone(),
        provenance: CausalProvenance { parents: vec![p1.clone(), p2.clone()] },
        authentication: None,
        anchor: None,
        policy_ref: policy.clone(),
    };
    let b = ArtifactEnvelope {
        provenance: CausalProvenance { parents: vec![p2, p1] },
        ..a.clone()
    };

    assert_eq!(
        a.digest(AlgorithmId::Sha256).unwrap(),
        b.digest(AlgorithmId::Sha256).unwrap()
    );
}

#[test]
fn evidence_record_digest_binds_time_and_witness() {
    let envelope_digest = digest_raw(AlgorithmId::Sha256, b"envelope");
    let witness = digest_raw(AlgorithmId::Sha256, b"witness");

    let a = EvidenceRecord {
        record_id: b"record-1".to_vec(),
        envelope_digest: envelope_digest.clone(),
        timestamp: TimeEvidence::None,
        witness: None,
    };

    let b = EvidenceRecord {
        timestamp: TimeEvidence::LocalClock { unix_millis: 1 },
        witness: Some(witness),
        ..a.clone()
    };

    assert_ne!(
        a.digest(AlgorithmId::Sha256).unwrap(),
        b.digest(AlgorithmId::Sha256).unwrap()
    );
}


#[test]
fn duplicate_causal_parents_are_semantically_idempotent() {
    let p = CausalParent {
        relation: RelationType::DerivedFrom,
        digest: digest_raw(AlgorithmId::Sha256, b"same-parent"),
    };
    let policy = digest_raw(AlgorithmId::Sha256, b"policy");
    let artifact = digest_raw(AlgorithmId::Sha256, b"asset");

    let once = ArtifactEnvelope {
        artifact_id: b"a".to_vec(),
        digest: artifact.clone(),
        provenance: CausalProvenance { parents: vec![p.clone()] },
        authentication: None,
        anchor: None,
        policy_ref: policy.clone(),
    };
    let twice = ArtifactEnvelope {
        provenance: CausalProvenance { parents: vec![p.clone(), p] },
        ..once.clone()
    };

    assert_eq!(
        once.digest(AlgorithmId::Sha256).unwrap(),
        twice.digest(AlgorithmId::Sha256).unwrap()
    );
}
