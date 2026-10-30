mod status_support;
mod support;
use arkhe_kya_experimental::status::*;
use arkhe_kya_experimental::status_composition::verify_with_status;

fn run(e: &StatusEnvelope, minimum: u32, purpose: StatusPurpose) -> serde_json::Value {
    let (p, c) = support::fixture();
    verify_with_status(
        &serde_json::to_string(&p).unwrap(),
        &serde_json::to_string(&c).unwrap(),
        &serde_json::to_string(e).unwrap(),
        minimum,
        purpose,
    )
}
fn fresh(raw: &[u8]) -> StatusEnvelope {
    status_support::status(&support::fixture().0, 0, raw, StatusPurpose::Revocation)
}

#[test]
fn bit_zero_is_checked_not_revoked_without_upgrading_identity_or_runtime() {
    let r = run(&fresh(&vec![0; 16384]), 7, StatusPurpose::Revocation);
    assert_eq!(r["outcome"], "CRYPTOGRAPHIC_CHECKS_PASSED");
    assert_eq!(r["credential_revocation"], "CHECKED_NOT_REVOKED");
    assert_eq!(r["runtime_model"], "NOT_ATTESTED");
    assert_eq!(r["principal_legal_identity"], "NOT_VERIFIED");
    assert_eq!(r["anchor_authenticity"], "NOT_VERIFIED");
}
#[test]
fn bit_one_fails_as_credential_revoked() {
    let mut raw = vec![0; 16384];
    raw[0] = 0x80;
    let r = run(&fresh(&raw), 7, StatusPurpose::Revocation);
    assert_eq!(r["outcome"], "NOT_VERIFIABLE");
    assert_eq!(r["reason"], "CredentialRevoked");
    assert_eq!(r["credential_revocation"], "REVOKED");
}
#[test]
fn unavailable_snapshot_is_not_checked_and_never_positive() {
    let mut e = fresh(&vec![0; 16384]);
    e.status_list = None;
    let r = run(&e, 7, StatusPurpose::Revocation);
    assert_eq!(r["outcome"], "NOT_VERIFIABLE");
    assert_eq!(r["reason"], "STATUS_UNAVAILABLE");
    assert_eq!(r["credential_revocation"], "NOT_CHECKED");
}
#[test]
fn indexes_follow_most_significant_bit_first_across_byte_boundary() {
    let mut raw = vec![0; 16384];
    raw[0] = 0x80;
    raw[1] = 0x01;
    raw[2] = 0x80;
    for (index, set) in [
        (0, true),
        (1, false),
        (7, false),
        (8, false),
        (14, false),
        (15, true),
        (16, true),
        (131071, false),
    ] {
        let e = status_support::status(
            &support::fixture().0,
            index,
            &raw,
            StatusPurpose::Revocation,
        );
        assert_eq!(
            run(&e, 7, StatusPurpose::Revocation)["outcome"] == "NOT_VERIFIABLE",
            set,
            "index {index}"
        );
    }
}
#[test]
fn suspension_is_distinct_and_cannot_replace_required_revocation() {
    let p = support::fixture().0;
    let e = status_support::status(&p, 0, &vec![0; 16384], StatusPurpose::Suspension);
    assert_eq!(
        run(&e, 7, StatusPurpose::Suspension)["credential_suspension"],
        "CHECKED_NOT_SUSPENDED"
    );
    assert_eq!(
        run(&e, 7, StatusPurpose::Suspension)["credential_revocation"],
        "NOT_CHECKED"
    );
    assert_eq!(
        run(&e, 7, StatusPurpose::Revocation)["reason"],
        "STATUS_PURPOSE_POLICY_MISMATCH"
    );
    let mut raw = vec![0; 16384];
    raw[0] = 0x80;
    let e = status_support::status(&p, 0, &raw, StatusPurpose::Suspension);
    assert_eq!(
        run(&e, 7, StatusPurpose::Suspension)["reason"],
        "CredentialSuspended"
    );
}
#[test]
fn binding_list_issuer_index_purpose_and_signatures_cannot_be_swapped() {
    for mutation in 0..7 {
        let mut e = fresh(&vec![0; 16384]);
        match mutation {
            0 => e.binding.passport_digest = "00".repeat(32),
            1 => e.binding.status_list_index = 1,
            2 => e.binding_signature = "00".repeat(64),
            3 => e.status_list.as_mut().unwrap().signature = "00".repeat(64),
            4 => e.status_list.as_mut().unwrap().list.id = "https://other.test".into(),
            5 => e.status_list.as_mut().unwrap().list.status_purpose = StatusPurpose::Suspension,
            _ => e.status_list.as_mut().unwrap().list.issuer = support::fixture().0.record.agent_id,
        }
        assert_eq!(
            run(&e, 7, StatusPurpose::Revocation)["outcome"],
            "NOT_VERIFIABLE",
            "mutation {mutation}"
        );
    }
}
#[test]
fn expiry_future_snapshot_and_rollback_floor_fail_even_with_valid_signatures() {
    for (from, until) in [(1151, 1500), (1000, 1150), (1000, 5000)] {
        let mut e = fresh(&vec![0; 16384]);
        let list = &mut e.status_list.as_mut().unwrap().list;
        list.valid_from = from;
        list.valid_until = until;
        status_support::resign(&mut e);
        assert_eq!(
            run(&e, 7, StatusPurpose::Revocation)["reason"],
            "STATUS_TIME_INVALID"
        );
    }
    assert_eq!(
        run(&fresh(&vec![0; 16384]), 8, StatusPurpose::Revocation)["reason"],
        "STATUS_LIST_MISMATCH_OR_ROLLBACK"
    );
}
#[test]
fn signed_invalid_encoding_short_list_out_of_range_and_decompression_bomb_fail() {
    for raw in [vec![0; 16], vec![0; 1024 * 1024 + 1]] {
        let e = fresh(&raw);
        assert_eq!(
            run(&e, 7, StatusPurpose::Revocation)["outcome"],
            "NOT_VERIFIABLE"
        );
    }
    let mut e = fresh(&vec![0; 16384]);
    e.binding.status_list_index = 131072;
    status_support::resign(&mut e);
    assert_eq!(
        run(&e, 7, StatusPurpose::Revocation)["reason"],
        "STATUS_INDEX_OUT_OF_RANGE"
    );
    for encoded in [
        "unot-gzip".to_string(),
        "uAAAA=".into(),
        "u".to_string() + &"A".repeat(90000),
    ] {
        let mut e = fresh(&vec![0; 16384]);
        e.status_list.as_mut().unwrap().list.encoded_list = encoded;
        status_support::resign(&mut e);
        assert_eq!(
            run(&e, 7, StatusPurpose::Revocation)["outcome"],
            "NOT_VERIFIABLE"
        );
    }
}
#[test]
fn duplicate_fields_and_trailing_gzip_data_are_rejected() {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    let mut e = fresh(&vec![0; 16384]);
    let field = &mut e.status_list.as_mut().unwrap().list.encoded_list;
    let mut bytes = URL_SAFE_NO_PAD.decode(&field[1..]).unwrap();
    bytes.push(1);
    *field = format!("u{}", URL_SAFE_NO_PAD.encode(bytes));
    status_support::resign(&mut e);
    assert_eq!(
        run(&e, 7, StatusPurpose::Revocation)["reason"],
        "STATUS_BITSTRING_INVALID"
    );
    let (p, c) = support::fixture();
    let status = serde_json::to_string(&fresh(&vec![0; 16384]))
        .unwrap()
        .replace("\"sequence\":7", "\"sequence\":7,\"sequence\":7");
    assert_eq!(
        verify_with_status(
            &serde_json::to_string(&p).unwrap(),
            &serde_json::to_string(&c).unwrap(),
            &status,
            7,
            StatusPurpose::Revocation
        )["reason"],
        "STATUS_INPUT_INVALID"
    );
}
