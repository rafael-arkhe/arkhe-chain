use arkhe_core::*;

#[test]
fn golden_digest_sha256_abc() {
    let digest = Digest::compute(AlgorithmId::Sha256, b"abc");
    assert_eq!(
        hex::encode(digest.canonical_bytes().unwrap()),
        "5141524b48452d50302d43424f522d5630000082015820ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}

#[test]
fn golden_envelope_parent_set() {
    let envelope = ArtifactEnvelope {
        artifact_id: ArtifactId("artifact:vector:1".into()),
        digest: Digest::compute(AlgorithmId::Sha256, b"payload"),
        provenance: CausalProvenance {
            parents: vec![
                CausalParent {
                    relation: RelationType::Used,
                    digest: Digest::compute(AlgorithmId::Sha256, b"parent-b"),
                },
                CausalParent {
                    relation: RelationType::DerivedFrom,
                    digest: Digest::compute(AlgorithmId::Sha256, b"parent-a"),
                },
            ],
        },
        authentication: None,
        anchor: None,
        policy_ref: PolicyRef("policy:p0:v0".into()),
    };

    assert_eq!(
        hex::encode(envelope.canonical_bytes().unwrap()),
        "5141524b48452d50302d43424f522d56300000867161727469666163743a766563746f723a3182015820239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5828201820158202fbf067e9c68d7aa61a5891ba0cfe87619f81b8540a1450bff5a5f0481218754820382015820189793de2b346e3bb8869d0b80e5cb6f2743291c4aec0b329f4f57f08e87e9f3f6f66c706f6c6963793a70303a7630"
    );
}
