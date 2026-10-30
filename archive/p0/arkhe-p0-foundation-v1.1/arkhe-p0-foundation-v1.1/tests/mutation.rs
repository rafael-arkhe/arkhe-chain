use arkhe_p0_foundation::{
    canonical_bytes, decode_canonical, digest_canonical, AlgorithmId, CanonicalError,
    CanonicalValue, HashDomain, ARKHE_CANONICAL_PROFILE_V1,
};

#[test]
fn duplicate_key_rejected() {
    let value = CanonicalValue::Map(vec![
        (CanonicalValue::Text("a".into()), CanonicalValue::Unsigned(1)),
        (CanonicalValue::Text("a".into()), CanonicalValue::Unsigned(2)),
    ]);
    assert_eq!(canonical_bytes(&value), Err(CanonicalError::DuplicateMapKey));
}

#[test]
fn float_encoding_rejected() {
    assert_eq!(decode_canonical(&[0xf9, 0x00, 0x00]), Err(CanonicalError::FloatForbidden));
}

#[test]
fn indefinite_length_rejected() {
    assert_eq!(decode_canonical(&[0x9f, 0x01, 0xff]), Err(CanonicalError::IndefiniteLengthForbidden));
}

#[test]
fn noncanonical_map_order_rejected() {
    let raw = [0xa2, 0x61, b'b', 0x02, 0x61, b'a', 0x01];
    assert_eq!(decode_canonical(&raw), Err(CanonicalError::NonCanonicalMapOrder));
}

#[test]
fn invalid_utf8_rejected() {
    assert_eq!(decode_canonical(&[0x61, 0xff]), Err(CanonicalError::InvalidUtf8));
}

#[test]
fn non_shortest_integer_rejected() {
    assert_eq!(decode_canonical(&[0x18, 0x17]), Err(CanonicalError::NonShortestInteger));
}

#[test]
fn security_relevant_value_mutation_changes_digest() {
    let a = CanonicalValue::Array(vec![CanonicalValue::Text("tool".into()), CanonicalValue::Unsigned(1)]);
    let b = CanonicalValue::Array(vec![CanonicalValue::Text("tool".into()), CanonicalValue::Unsigned(2)]);
    let da = digest_canonical(AlgorithmId::Sha256, HashDomain::Canonicalization, ARKHE_CANONICAL_PROFILE_V1, &a).unwrap();
    let db = digest_canonical(AlgorithmId::Sha256, HashDomain::Canonicalization, ARKHE_CANONICAL_PROFILE_V1, &b).unwrap();
    assert_ne!(da, db);
}

#[test]
fn domain_mutation_changes_digest() {
    let value = CanonicalValue::Text("arkhe".into());
    let a = digest_canonical(AlgorithmId::Sha256, HashDomain::ArtifactEnvelope, ARKHE_CANONICAL_PROFILE_V1, &value).unwrap();
    let b = digest_canonical(AlgorithmId::Sha256, HashDomain::EvidenceRecord, ARKHE_CANONICAL_PROFILE_V1, &value).unwrap();
    assert_ne!(a, b);
}
