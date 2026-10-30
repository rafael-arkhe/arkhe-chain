use arkhe_core::*;

fn sample_envelope() -> ArtifactEnvelope {
    let a = Digest::compute(AlgorithmId::Sha256, b"parent-a");
    let b = Digest::compute(AlgorithmId::Blake3, b"parent-b");
    ArtifactEnvelope {
        artifact_id: ArtifactId("artifact:demo:1".into()),
        digest: Digest::compute(AlgorithmId::Blake3, b"payload"),
        provenance: CausalProvenance {
            parents: vec![
                CausalParent { relation: RelationType::Used, digest: b },
                CausalParent { relation: RelationType::DerivedFrom, digest: a },
            ],
        },
        authentication: None,
        anchor: None,
        policy_ref: PolicyRef("policy:p0:v0".into()),
    }
}

#[test]
fn equivalent_parent_set_has_same_canonical_bytes() {
    let left = sample_envelope();
    let mut right = sample_envelope();
    right.provenance.parents.reverse();
    assert_eq!(left.canonical_bytes().unwrap(), right.canonical_bytes().unwrap());
}

#[test]
fn security_relevant_change_changes_canonical_bytes() {
    let left = sample_envelope();
    let mut right = sample_envelope();
    right.policy_ref = PolicyRef("policy:p0:v1".into());
    assert_ne!(left.canonical_bytes().unwrap(), right.canonical_bytes().unwrap());
}

#[test]
fn digest_algorithm_is_bound() {
    let sha = Digest::compute(AlgorithmId::Sha256, b"same");
    let b3 = Digest::compute(AlgorithmId::Blake3, b"same");
    assert_ne!(sha.canonical_bytes().unwrap(), b3.canonical_bytes().unwrap());
}
