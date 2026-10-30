use arkhe_p0_canonicalization_digest::{
    canonical_bytes, digest_canonical, AlgorithmId, CanonicalValue, ARKHE_CANONICAL_PROFILE_V1,
};

#[test]
fn security_relevant_value_mutation_changes_digest() {
    let a = CanonicalValue::Array(vec![
        CanonicalValue::Text("tool".into()),
        CanonicalValue::Unsigned(1),
    ]);
    let b = CanonicalValue::Array(vec![
        CanonicalValue::Text("tool".into()),
        CanonicalValue::Unsigned(2),
    ]);

    let da = digest_canonical(AlgorithmId::Sha256, ARKHE_CANONICAL_PROFILE_V1, &a).unwrap();
    let db = digest_canonical(AlgorithmId::Sha256, ARKHE_CANONICAL_PROFILE_V1, &b).unwrap();
    assert_ne!(da, db);
}

#[test]
fn semantic_map_order_does_not_change_digest() {
    let a = CanonicalValue::Map(vec![
        (CanonicalValue::Text("b".into()), CanonicalValue::Unsigned(2)),
        (CanonicalValue::Text("a".into()), CanonicalValue::Unsigned(1)),
    ]);
    let b = CanonicalValue::Map(vec![
        (CanonicalValue::Text("a".into()), CanonicalValue::Unsigned(1)),
        (CanonicalValue::Text("b".into()), CanonicalValue::Unsigned(2)),
    ]);

    assert_eq!(canonical_bytes(&a).unwrap(), canonical_bytes(&b).unwrap());
    assert_eq!(
        digest_canonical(AlgorithmId::Sha256, ARKHE_CANONICAL_PROFILE_V1, &a).unwrap(),
        digest_canonical(AlgorithmId::Sha256, ARKHE_CANONICAL_PROFILE_V1, &b).unwrap()
    );
}

#[test]
fn algorithm_mutation_is_not_silent() {
    let value = CanonicalValue::Text("same semantic object".into());
    let sha = digest_canonical(AlgorithmId::Sha256, ARKHE_CANONICAL_PROFILE_V1, &value).unwrap();
    let b3 = digest_canonical(AlgorithmId::Blake3_256, ARKHE_CANONICAL_PROFILE_V1, &value).unwrap();

    assert_ne!(sha.to_tagged_bytes(), b3.to_tagged_bytes());
}
