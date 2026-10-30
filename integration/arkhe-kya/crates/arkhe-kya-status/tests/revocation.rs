use arkhe_kya_primitives::did_key;
use arkhe_kya_status::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signer, SigningKey};
use std::io::Write;

// No Passport/Context/model/mandate fixture: only a digest and independent trust.
fn fixture(set: bool) -> (StatusEnvelope, StatusTrust) {
    let key = SigningKey::from_bytes(&[11; 32]); // public synthetic test seed only
    let issuer = did_key(key.verifying_key().as_bytes());
    let digest = "ab".repeat(32);
    let mut raw = vec![0; 16384];
    if set {
        raw[0] = 0x80;
    }
    let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    gzip.write_all(&raw).unwrap();
    let binding = PassportStatus {
        profile: STATUS_PROFILE.into(),
        label: LABEL.into(),
        issuer: issuer.clone(),
        passport_digest: digest.clone(),
        status_list_credential: "https://status.example.test/1".into(),
        status_list_index: 0,
        status_purpose: StatusPurpose::Revocation,
    };
    let list = StatusList {
        profile: STATUS_PROFILE.into(),
        label: LABEL.into(),
        id: binding.status_list_credential.clone(),
        issuer: issuer.clone(),
        status_purpose: StatusPurpose::Revocation,
        sequence: 7,
        valid_from: 1000,
        valid_until: 1500,
        encoded_list: format!("u{}", URL_SAFE_NO_PAD.encode(gzip.finish().unwrap())),
    };
    let envelope = StatusEnvelope {
        binding_signature: hex::encode(key.sign(&binding_payload(&binding).unwrap()).to_bytes()),
        binding,
        status_list: Some(SignedStatusList {
            signature: hex::encode(key.sign(&list_payload(&list).unwrap()).to_bytes()),
            list,
        }),
    };
    let trust = StatusTrust {
        trusted_issuer: issuer,
        expected_passport_digest: digest,
        required_purpose: StatusPurpose::Revocation,
        now: 1150,
        minimum_sequence: 7,
        max_snapshot_age_seconds: 300,
    };
    (envelope, trust)
}

#[test]
fn isolated_bit_zero_returns_a_scoped_observation() {
    let (e, t) = fixture(false);
    let observed = check_status(&e, &t).unwrap();
    assert_eq!(observed.status_purpose, StatusPurpose::Revocation);
    assert_eq!(observed.evaluated_at, 1150);
    assert_eq!(observed.snapshot_valid_from, 1000);
    assert_eq!(observed.snapshot_valid_until, 1500);
}
#[test]
fn isolated_bit_one_returns_credential_revoked() {
    let (e, t) = fixture(true);
    assert_eq!(check_status(&e, &t).unwrap_err(), "CredentialRevoked");
}
#[test]
fn isolated_missing_list_cannot_be_accepted() {
    let (mut e, t) = fixture(false);
    e.status_list = None;
    assert_eq!(check_status(&e, &t).unwrap_err(), "STATUS_UNAVAILABLE");
}
#[test]
fn independent_freshness_policy_can_reject_still_valid_snapshot() {
    let (e, mut t) = fixture(false);
    t.max_snapshot_age_seconds = 150;
    assert!(check_status(&e, &t).is_ok());
    t.max_snapshot_age_seconds = 149;
    assert_eq!(check_status(&e, &t).unwrap_err(), "STATUS_STALE");
}
#[test]
fn subject_and_purpose_are_external_policy_not_learned_from_evidence() {
    let (e, mut t) = fixture(false);
    t.expected_passport_digest = "cd".repeat(32);
    assert_eq!(check_status(&e, &t).unwrap_err(), "STATUS_BINDING_INVALID");
    let (e, mut t) = fixture(false);
    t.required_purpose = StatusPurpose::Suspension;
    assert_eq!(
        check_status(&e, &t).unwrap_err(),
        "STATUS_PURPOSE_POLICY_MISMATCH"
    );
}
