use arkhe_core::*;

#[test]
fn witness_is_optional_but_bound_when_present() {
    let envelope_digest = Digest::compute(AlgorithmId::Blake3, b"envelope");
    let base = EvidenceRecord {
        record_id: "record:1".into(),
        envelope_digest: envelope_digest.clone(),
        timestamp: TimeEvidence::LocalClock { unix_seconds: 1_700_000_000 },
        witness: None,
    };
    let with_witness = EvidenceRecord {
        witness: Some(WitnessEvidence::Digest {
            kind: "test".into(),
            digest: Digest::compute(AlgorithmId::Sha256, b"witness"),
        }),
        ..base.clone()
    };

    assert_ne!(base.canonical_bytes().unwrap(), with_witness.canonical_bytes().unwrap());
}

#[test]
fn claimed_time_and_trusted_time_are_distinct() {
    let local = TimeEvidence::LocalClock { unix_seconds: 42 };
    let trusted = TimeEvidence::Rfc3161 {
        token_digest: Digest::compute(AlgorithmId::Sha256, b"tsa-token"),
    };
    assert_ne!(local.canonical_bytes().unwrap(), trusted.canonical_bytes().unwrap());
}
