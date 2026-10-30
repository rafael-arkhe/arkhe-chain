use arkhe_pix_receipt::*;
use ed25519_dalek::SigningKey;
use std::collections::BTreeMap;

// TEST-ONLY seed. NOT FOR PRODUCTION.
fn test_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

fn base_receipt() -> PixReceipt {
    PixReceipt {
        v: 1,
        profile: "arkhe-pix-receipt@1".into(),
        label: "synthetic-poc".into(),
        end_to_end_id: "E12345678202610231500abcdefghijk".into(),
        txid: "abc123def456ghi789jkl000mno".into(),
        amount_cents: 12_500, // R$ 125,00
        currency: "BRL".into(),
        settled_at: 1_761_200_000,
        payer: PartyRef {
            tax_id_kind: TaxIdKind::Cnpj,
            value: "11222333000181".into(),
            display_name: Some("Empresa Pagadora Ltda".into()),
        },
        recipient: PartyRef {
            tax_id_kind: TaxIdKind::Cnpj,
            value: "99888777000166".into(),
            display_name: Some("Arkhe Demo Ltda".into()),
        },
        purpose_hash: Some("aa".repeat(32)),
        passport_digest: Some("bb".repeat(32)),
        metadata: BTreeMap::from([("description".into(), "arkhe-kya access".into())]),
    }
}

#[test]
fn sign_verify_roundtrip() {
    let sk = test_key();
    let vk = sk.verifying_key();
    let signed = SignedReceipt::sign(base_receipt(), &sk).unwrap();
    let out = verify_receipt(&signed, &vk);
    match out {
        ReceiptOutcome::SignatureValidSynthetic {
            receipt_digest,
            amount_cents,
            ..
        } => {
            assert_eq!(amount_cents, 12_500);
            assert_eq!(receipt_digest.len(), 64);
        }
        other => panic!("expected Verified, got {other:?}"),
    }
}

#[test]
fn tampered_amount_is_rejected() {
    let sk = test_key();
    let vk = sk.verifying_key();
    let mut signed = SignedReceipt::sign(base_receipt(), &sk).unwrap();
    signed.receipt.amount_cents = 1; // tamper after signing
    let out = verify_receipt(&signed, &vk);
    assert!(matches!(out, ReceiptOutcome::NotVerifiable { .. }));
}

#[test]
fn wrong_key_is_rejected() {
    let sk = test_key();
    let other = SigningKey::from_bytes(&[9u8; 32]);
    let signed = SignedReceipt::sign(base_receipt(), &sk).unwrap();
    let out = verify_receipt(&signed, &other.verifying_key());
    assert_eq!(
        out,
        ReceiptOutcome::NotVerifiable {
            reason: PixErrorReason::SignatureInvalid
        }
    );
}

#[test]
fn jcs_reordering_is_stable() {
    let mut a = base_receipt();
    let mut b = base_receipt();
    // Insert keys in reverse order into metadata to prove JCS sorts them.
    let mut ma = BTreeMap::new();
    ma.insert("z".into(), "1".into());
    ma.insert("a".into(), "2".into());
    a.metadata = ma;
    let mut mb = BTreeMap::new();
    mb.insert("a".into(), "2".into());
    mb.insert("z".into(), "1".into());
    b.metadata = mb;
    assert_eq!(a.digest().unwrap(), b.digest().unwrap());
}

#[test]
fn invalid_e2e_is_rejected() {
    let sk = test_key();
    let mut r = base_receipt();
    r.end_to_end_id = "not-an-e2e".into();
    let signed = SignedReceipt::sign(r, &sk);
    assert!(signed.is_err());
}

#[test]
fn proof_metadata_cannot_be_swapped() {
    let sk = test_key();
    let mut signed = SignedReceipt::sign(base_receipt(), &sk).unwrap();
    signed.proof.kind = "OtherSuite".into();
    assert!(matches!(
        verify_receipt(&signed, &sk.verifying_key()),
        ReceiptOutcome::NotVerifiable { .. }
    ));
    signed.proof.kind = "Ed25519SignaturePixPoC".into();
    signed.proof.verification_method = "did:key:forged".into();
    assert!(matches!(
        verify_receipt(&signed, &sk.verifying_key()),
        ReceiptOutcome::NotVerifiable { .. }
    ));
}
#[test]
fn bounds_profile_and_digest_encoding_are_enforced() {
    for mutate in [0, 1, 2, 3, 4, 5, 6] {
        let mut r = base_receipt();
        match mutate {
            0 => r.label = "real".into(),
            1 => r.amount_cents = 0,
            2 => r.amount_cents = u64::MAX,
            3 => r.settled_at = -1,
            4 => r.purpose_hash = Some("AA".repeat(32)),
            5 => r.txid = "short".into(),
            _ => r
                .metadata
                .insert("x".into(), "a".repeat(257))
                .map(|_| ())
                .unwrap_or(()),
        };
        assert!(SignedReceipt::sign(r, &test_key()).is_err());
    }
}
#[test]
fn strict_json_boundary_rejects_duplicates_unknowns_oversize_and_key_alias() {
    let signed = SignedReceipt::sign(base_receipt(), &test_key()).unwrap();
    let good = serde_json::to_string(&signed).unwrap();
    let key = hex::encode(test_key().verifying_key().to_bytes());
    for bad in [
        good.replacen('{', "{\"extra\":true,", 1),
        good.replacen("\"v\":1", "\"v\":1,\"v\":1", 1),
        " ".repeat(32769),
    ] {
        assert!(verify_receipt_json(&bad, &key).contains("not_verifiable"));
    }
    assert!(verify_receipt_json(&good, &key.to_uppercase()).contains("not_verifiable"));
}
#[test]
fn signature_binds_purpose_passport_and_claimed_settlement() {
    let signed = SignedReceipt::sign(base_receipt(), &test_key()).unwrap();
    for index in 0..3 {
        let mut s = signed.clone();
        match index {
            0 => s.receipt.purpose_hash = Some("cc".repeat(32)),
            1 => s.receipt.passport_digest = Some("dd".repeat(32)),
            _ => s.receipt.settled_at += 1,
        };
        assert!(matches!(
            verify_receipt(&s, &test_key().verifying_key()),
            ReceiptOutcome::NotVerifiable { .. }
        ));
    }
}
#[test]
fn e2e_schema_uses_32_ascii_alphanumeric_not_old_20_char_rule() {
    let mut r = base_receipt();
    assert_eq!(r.end_to_end_id.len(), 32);
    assert!(r.validate().is_ok());
    for bad in [
        "E12345678202610231500".into(),
        "E".repeat(31),
        "E".repeat(33),
        format!("{}-", "E".repeat(31)),
    ] {
        r.end_to_end_id = bad;
        assert!(r.validate().is_err());
    }
}

#[test]
fn metadata_duplicate_is_rejected_before_verification() {
    let signed = SignedReceipt::sign(base_receipt(), &test_key()).unwrap();
    let raw = serde_json::to_string(&signed).unwrap();
    let bad = raw.replace(
        "\"description\":",
        "\"description\":\"forged\",\"description\":",
    );
    assert!(serde_json::from_str::<SignedReceipt>(&bad).is_err());
}

#[test]
fn pinned_golden_receipt_digest_signature_and_canonical_bytes() {
    let raw = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/fixtures/receipt-clear.json"
    ));
    let expected = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/fixtures/golden-outcome.json"
    ));
    let key = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/fixtures/keys/test-signer.pub.hex"
    ))
    .trim();
    let outcome = verify_receipt_json(raw, key);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&outcome).unwrap(),
        serde_json::from_str::<serde_json::Value>(expected).unwrap()
    );
    let signed: SignedReceipt = serde_json::from_str(raw).unwrap();
    let canonical = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/fixtures/golden-canonical.hex"
    ))
    .trim();
    assert_eq!(
        hex::encode(serde_jcs::to_vec(&signed.receipt).unwrap()),
        canonical
    );
}
