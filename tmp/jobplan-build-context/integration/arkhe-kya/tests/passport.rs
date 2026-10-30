mod support;
use arkhe_kya_experimental::*;

fn result(p: &Passport, c: &Context) -> Result<serde_json::Value, String> {
    verify(
        &serde_json::to_string(p).unwrap(),
        &serde_json::to_string(c).unwrap(),
    )
}

#[test]
fn verifies_signatures_mandate_and_indexed_membership_without_claiming_identity_or_runtime() {
    let (p, c) = support::fixture();
    let r = result(&p, &c).unwrap();
    assert_eq!(r["outcome"], "CRYPTOGRAPHIC_CHECKS_PASSED");
    assert_eq!(r["runtime_model"], "NOT_ATTESTED");
    assert_eq!(r["principal_legal_identity"], "NOT_VERIFIED");
    assert_eq!(r["anchor_authenticity"], "NOT_VERIFIED");
    assert_eq!(r["credential_revocation"], "NOT_CHECKED");
}

#[test]
fn jcs_orders_utf16_keys_and_preserves_roundtrip_bytes() {
    let value = serde_json::json!({"\u{e000}":1, "\u{1f600}":2, "a":"é"});
    assert_eq!(
        String::from_utf8(canonical(&value).unwrap()).unwrap(),
        "{\"a\":\"é\",\"😀\":2,\"\u{e000}\":1}"
    );
    let (p, c) = support::fixture();
    let parsed: Passport =
        serde_json::from_str(&serde_json::to_string_pretty(&p).unwrap()).unwrap();
    assert_eq!(
        inclusion_leaf(&p).unwrap(),
        inclusion_leaf(&parsed).unwrap()
    );
    assert!(result(&parsed, &c).is_ok());
}

#[test]
fn principal_and_agent_signatures_are_independently_required() {
    let (p, c) = support::fixture();
    let mut bad = p.clone();
    bad.principal_signature = "00".repeat(64);
    assert_eq!(result(&bad, &c).unwrap_err(), "SIGNATURE_INVALID");
    let mut bad = p;
    bad.agent_signature = "00".repeat(64);
    assert_eq!(result(&bad, &c).unwrap_err(), "SIGNATURE_INVALID");
}

#[test]
fn policy_is_pinned_by_caller_and_scope_challenge_time_fail_closed() {
    let (p, c) = support::fixture();
    for mutation in 0..7 {
        let mut bad = c.clone();
        match mutation {
            0 => bad.trusted_principal_did = p.record.agent_id.clone(),
            1 => bad.audience = "wrong-audience".into(),
            2 => bad.action = "write:money".into(),
            3 => bad.challenge = "different-challenge-0001".into(),
            4 => bad.now = 999,
            5 => bad.now = 2000,
            _ => bad.now = 1401,
        }
        assert!(result(&p, &bad).is_err(), "mutation {mutation}");
    }
}

#[test]
fn swapped_mandate_does_not_bind_and_model_mismatch_fails() {
    let (mut p, c) = support::fixture();
    p.mandate.actions = vec!["write:money".into()];
    assert_eq!(result(&p, &c).unwrap_err(), "BINDING_MISMATCH");
    let (p, mut c) = support::fixture();
    c.expected_model_blake3 = Some("00".repeat(32));
    assert_eq!(result(&p, &c).unwrap_err(), "MODEL_HASH_MISMATCH");
    c.expected_model_blake3 = None;
    assert_eq!(result(&p, &c).unwrap()["model_hash"], "declared_only");
}

#[test]
fn wrong_root_index_count_and_proof_are_rejected() {
    let (p, c) = support::fixture();
    let mut bad = c.clone();
    bad.expected_root = "00".repeat(32);
    assert!(result(&p, &bad).is_err());
    let mut bad = p.clone();
    bad.inclusion.leaf_index = 0;
    assert!(result(&bad, &c).is_err());
    let mut bad = p.clone();
    bad.inclusion.leaf_count = 4;
    assert!(result(&bad, &c).is_err());
    let mut bad = p;
    bad.inclusion.steps[0].hash[0] ^= 1;
    assert!(result(&bad, &c).is_err());
}

#[test]
fn parser_rejects_unknown_duplicate_and_oversized_json() {
    let (p, c) = support::fixture();
    let c = serde_json::to_string(&c).unwrap();
    let json = serde_json::to_string(&p).unwrap();
    assert!(verify(&json.replacen('{', "{\"unexpected\":true,", 1), &c).is_err());
    assert!(verify(
        &json.replacen(
            "\"issued_at\":1100",
            "\"issued_at\":1100,\"issued_at\":1100",
            1
        ),
        &c
    )
    .is_err());
    assert!(verify(&" ".repeat(32769), &c).is_err());
}

#[test]
fn domains_are_distinct_and_real_labels_are_rejected() {
    let (mut p, c) = support::fixture();
    assert!(mandate_payload(&p.mandate)
        .unwrap()
        .starts_with(b"ARKHE:KYA:MANDATE:v1\0"));
    assert!(record_payload(&p.record)
        .unwrap()
        .starts_with(b"ARKHE:KYA:RECORD:v1\0"));
    assert!(inclusion_leaf(&p)
        .unwrap()
        .starts_with(b"ARKHE:KYA:LEAF:v1\0"));
    p.record.label = "production".into();
    assert_eq!(result(&p, &c).unwrap_err(), "PROFILE_NOT_ALLOWED");
}

#[test]
fn signature_hex_is_lowercase_and_only_ed25519_did_key_is_accepted() {
    let (mut p, c) = support::fixture();
    p.agent_signature = p.agent_signature.to_uppercase();
    assert!(result(&p, &c).is_err());
    let (mut p, mut c) = support::fixture();
    p.mandate.principal_did = "did:web:example.com".into();
    p.record.principal_did = p.mandate.principal_did.clone();
    c.trusted_principal_did = p.mandate.principal_did.clone();
    p.record.mandate_digest = mandate_digest(&p.mandate).unwrap();
    assert_eq!(result(&p, &c).unwrap_err(), "INVALID_DID");
}
