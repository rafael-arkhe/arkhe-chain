use arkhe_core::*;

#[test]
fn artifact_byte_mutation_fails_digest_verification() {
    let digest = Digest::compute(AlgorithmId::Blake3, b"asset");
    assert!(digest.verify(b"asset"));
    assert!(!digest.verify(b"asset!"));
}

#[test]
fn algorithm_mutation_fails_equality() {
    let a = Digest::compute(AlgorithmId::Sha256, b"asset");
    let b = Digest::compute(AlgorithmId::Blake3, b"asset");
    assert_ne!(a, b);
}

#[test]
fn provenance_parent_mutation_changes_envelope_digest() {
    let make = |parent: &[u8]| ArtifactEnvelope {
        artifact_id: ArtifactId("artifact:1".into()),
        digest: Digest::compute(AlgorithmId::Blake3, b"payload"),
        provenance: CausalProvenance {
            parents: vec![CausalParent {
                relation: RelationType::DerivedFrom,
                digest: Digest::compute(AlgorithmId::Blake3, parent),
            }],
        },
        authentication: None,
        anchor: None,
        policy_ref: PolicyRef("policy:v0".into()),
    };

    let a = make(b"parent-a").canonical_bytes().unwrap();
    let b = make(b"parent-b").canonical_bytes().unwrap();
    assert_ne!(
        Digest::compute(AlgorithmId::Blake3, &a),
        Digest::compute(AlgorithmId::Blake3, &b)
    );
}
