use arkhe_core::{CanonicalEncode, Digest32};
use arkhe_verify_core::mmr::{build_root_and_proof, verify_proof_at};
use arkhe_wormgraph::binding::{
    binding_envelope, binding_in_force, revocation_envelope, sign_arkhe, BindingRevocation,
    BindingRole, BindingViolation, ExternalProof, SignedBinding, BINDING_KIND,
};
use arkhe_wormgraph::roster::{
    sign_roster_approval, GovernanceRoster, RosterEntry, RosterViolation, VerifierRole,
};
use ed25519_dalek::SigningKey;
use serde_json::Value;

// Public TEST seeds, identical to examples/idbind-vectors.rs.
const ARKHE_SEED: [u8; 32] = [0x41; 32];
const OTHER_SEED: [u8; 32] = [0x4f; 32];
const NOSTR_SECRET: [u8; 32] = [0x4e; 32];
const ROSTER_FROM: i64 = 1_791_000_000;
const AT: i64 = 1_792_500_000;
const REVOKED_AT: i64 = 1_793_000_000;

fn json(name: &str) -> Value {
    let path = format!("{}/../../tests/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}
fn fixtures() -> (SignedBinding, SignedBinding, BindingRevocation) {
    let v = json("identity_binding_signed.json");
    let signed: Vec<SignedBinding> = serde_json::from_value(v["signed"].clone()).unwrap();
    let revocation = serde_json::from_value(v["revocation"].clone()).unwrap();
    (signed[0].clone(), signed[1].clone(), revocation)
}
fn key(seed: [u8; 32]) -> SigningKey {
    SigningKey::from_bytes(&seed)
}
fn roster_with(entries: Vec<RosterEntry>) -> GovernanceRoster {
    let draft = GovernanceRoster {
        version: 1,
        quorum_threshold: 2,
        entries: entries.clone(),
        approvals: vec![],
    };
    let bytes = draft.canonical_bytes();
    let approvals = [ARKHE_SEED, OTHER_SEED].map(|s| sign_roster_approval(&bytes, &key(s)));
    GovernanceRoster::genesis(entries, 2, &approvals).unwrap()
}
fn entry(seed: [u8; 32], from: i64, until: Option<i64>) -> RosterEntry {
    RosterEntry {
        verifier_public_key: key(seed).verifying_key().to_bytes(),
        role: VerifierRole::Operator,
        valid_from: from,
        valid_until: until,
    }
}
fn roster() -> GovernanceRoster {
    roster_with(vec![
        entry(ARKHE_SEED, ROSTER_FROM, None),
        entry(OTHER_SEED, ROSTER_FROM, None),
    ])
}

#[test]
fn rust_matches_independent_python_reference() {
    let reference = json("identity_binding_vectors.json");
    let (nostr, radicle, _) = fixtures();
    for (row, signed) in reference["vectors"]
        .as_array()
        .unwrap()
        .iter()
        .zip([&nostr, &radicle])
    {
        let b = &signed.binding;
        assert_eq!(hex::encode(b.to_cbor().encode()), row["canonical_cbor_hex"]);
        assert_eq!(b.digest().to_hex(), row["binding_digest_hex"]);
        if let ExternalProof::Nostr(event) = &signed.external_proof {
            assert_eq!(
                hex::encode(event.event_id(&b.external_id).unwrap()),
                row["nostr"]["event_id_hex"]
            );
            assert_eq!(
                serde_json::to_value(&event.tags).unwrap(),
                row["nostr"]["tags"]
            );
        }
    }
}

#[test]
fn bidirectional_bindings_are_in_force() {
    let (nostr, radicle, _) = fixtures();
    let roster = roster();
    assert_eq!(
        binding_in_force(&nostr, &[], &roster, None, AT),
        Ok(BindingRole::Publisher)
    );
    assert_eq!(
        binding_in_force(&radicle, &[], &roster, None, AT),
        Ok(BindingRole::Delegate)
    );
}

#[test]
fn binding_without_or_with_wrong_external_signature_is_rejected() {
    let (nostr, radicle, _) = fixtures();
    let roster = roster();
    let check = |s: &SignedBinding| binding_in_force(s, &[], &roster, None, AT);

    let mut m = nostr.clone();
    let ExternalProof::Nostr(e) = &mut m.external_proof else {
        panic!()
    };
    e.sig = [0; 64];
    assert_eq!(check(&m), Err(BindingViolation::ExternalProofMissing));

    let mut m = radicle.clone();
    m.external_proof = ExternalProof::Ed25519([0; 64]);
    assert_eq!(check(&m), Err(BindingViolation::ExternalProofMissing));

    // The Arkhe key signing "for" the external side is not possession of it.
    let mut m = radicle.clone();
    m.external_proof = ExternalProof::Ed25519(m.arkhe_signature);
    assert_eq!(check(&m), Err(BindingViolation::ExternalProofInvalid));

    // A proof valid for one binding cannot be moved to another.
    let mut m = radicle.clone();
    m.external_proof = nostr.external_proof.clone();
    assert_eq!(check(&m), Err(BindingViolation::ExternalProofInvalid));

    for mutate in [
        |e: &mut arkhe_wormgraph::binding::NostrEventProof| e.content.push('!'),
        |e: &mut arkhe_wormgraph::binding::NostrEventProof| e.created_at += 1,
        |e: &mut arkhe_wormgraph::binding::NostrEventProof| e.tags[0][1].push('0'),
        |e: &mut arkhe_wormgraph::binding::NostrEventProof| e.tags.push(e.tags[0].clone()),
        |e: &mut arkhe_wormgraph::binding::NostrEventProof| e.content.push('\u{1}'),
        |e: &mut arkhe_wormgraph::binding::NostrEventProof| e.sig[10] ^= 1,
    ] {
        let mut m = nostr.clone();
        let ExternalProof::Nostr(e) = &mut m.external_proof else {
            panic!()
        };
        mutate(e);
        assert_eq!(check(&m), Err(BindingViolation::ExternalProofInvalid));
    }
}

#[test]
fn arkhe_side_and_binding_fields_are_bound() {
    let (nostr, _, _) = fixtures();
    let roster = roster();
    let mut m = nostr.clone();
    m.arkhe_signature[0] ^= 1;
    assert_eq!(
        binding_in_force(&m, &[], &roster, None, AT),
        Err(BindingViolation::ArkheSignatureInvalid)
    );
    // Changing any binding field invalidates both signatures; re-signing only
    // the Arkhe side still leaves the external proof bound to the old digest.
    let mut m = nostr.clone();
    m.binding.role = BindingRole::Witness;
    m.arkhe_signature = sign_arkhe(&m.binding, &key(ARKHE_SEED));
    assert_eq!(
        binding_in_force(&m, &[], &roster, None, AT),
        Err(BindingViolation::ExternalProofInvalid)
    );
    // An unrelated key cannot bind itself as the Arkhe side.
    let mut m = nostr.clone();
    m.binding.arkhe_key = key([9; 32]).verifying_key().to_bytes();
    m.arkhe_signature = sign_arkhe(&m.binding, &key([9; 32]));
    assert!(binding_in_force(&m, &[], &roster, None, AT).is_err());
}

#[test]
fn roster_and_binding_windows_are_enforced() {
    let (nostr, radicle, _) = fixtures();
    let roster = roster();
    assert_eq!(
        binding_in_force(&nostr, &[], &roster, None, nostr.binding.valid_from - 1),
        Err(BindingViolation::NotYetValid)
    );
    let until = radicle.binding.valid_until.unwrap();
    assert!(binding_in_force(&radicle, &[], &roster, None, until).is_ok());
    assert_eq!(
        binding_in_force(&radicle, &[], &roster, None, until + 1),
        Err(BindingViolation::Expired)
    );
    // The Arkhe key joins the roster only after the binding's valid_from.
    let late = GovernanceRoster {
        version: 1,
        quorum_threshold: 2,
        entries: vec![
            entry(ARKHE_SEED, AT + 1, None),
            entry(OTHER_SEED, ROSTER_FROM, None),
        ],
        approvals: vec![],
    };
    let bytes = late.canonical_bytes();
    let approvals = [ARKHE_SEED, OTHER_SEED].map(|s| sign_roster_approval(&bytes, &key(s)));
    let late = GovernanceRoster::genesis(late.entries.clone(), 2, &approvals).unwrap();
    assert_eq!(
        binding_in_force(&nostr, &[], &late, None, AT + 10),
        Err(BindingViolation::ArkheKeyOutsideWindow)
    );
    let mut forged = roster.clone();
    forged.approvals.pop();
    assert_eq!(
        binding_in_force(&nostr, &[], &forged, None, AT),
        Err(BindingViolation::RosterInvalid(
            RosterViolation::QuorumNotMet
        ))
    );
}

#[test]
fn arkhe_key_absent_from_roster_is_refused() {
    let (nostr, _, _) = fixtures();
    let entries = vec![
        entry(OTHER_SEED, ROSTER_FROM, None),
        entry([0x33; 32], ROSTER_FROM, None),
    ];
    let draft = GovernanceRoster {
        version: 1,
        quorum_threshold: 2,
        entries: entries.clone(),
        approvals: vec![],
    };
    let bytes = draft.canonical_bytes();
    let approvals = [OTHER_SEED, [0x33; 32]].map(|s| sign_roster_approval(&bytes, &key(s)));
    let roster = GovernanceRoster::genesis(entries, 2, &approvals).unwrap();
    assert_eq!(
        binding_in_force(&nostr, &[], &roster, None, AT),
        Err(BindingViolation::ArkheKeyNotInRoster)
    );
}

#[test]
fn revocation_is_respected_from_its_time() {
    let (nostr, radicle, revocation) = fixtures();
    let roster = roster();
    let revs = [revocation.clone()];
    assert!(binding_in_force(&nostr, &revs, &roster, None, REVOKED_AT - 1).is_ok());
    assert_eq!(
        binding_in_force(&nostr, &revs, &roster, None, REVOKED_AT),
        Err(BindingViolation::Revoked)
    );
    // A revocation of another binding does not touch this one.
    assert!(binding_in_force(&radicle, &revs, &roster, None, REVOKED_AT).is_ok());
    // Another active roster member may revoke.
    let by_member =
        BindingRevocation::sign(radicle.binding.digest(), AT, "compromise", &key(OTHER_SEED));
    assert_eq!(
        binding_in_force(&radicle, &[by_member], &roster, None, AT),
        Err(BindingViolation::Revoked)
    );
    // Revocations without authority or with a broken signature carry nothing.
    let outsider = BindingRevocation::sign(nostr.binding.digest(), AT, "spam", &key([0x77; 32]));
    let mut tampered = revocation.clone();
    tampered.revoked_at = AT;
    let mut retargeted = revocation.clone();
    retargeted.binding_digest = Digest32([0; 32]);
    assert!(binding_in_force(&nostr, &[outsider, tampered, retargeted], &roster, None, AT).is_ok());
}

#[test]
fn binding_and_revocation_are_anchored_in_the_mmr() {
    let (nostr, radicle, revocation) = fixtures();
    let envelope = binding_envelope(&nostr, vec![]);
    assert_eq!(envelope.kind, BINDING_KIND);
    assert_eq!(envelope.record_hash, nostr.binding.digest());
    assert_eq!(envelope.payload_digest, nostr.signed_digest());
    assert_eq!(
        envelope.subject,
        binding_envelope(&nostr, vec![]).subject,
        "subject depends only on the external identity"
    );
    assert_ne!(envelope.subject, binding_envelope(&radicle, vec![]).subject);
    let revoked = revocation_envelope(&revocation, &nostr.binding);
    assert_eq!(revoked.causal_parents, vec![nostr.binding.digest()]);
    assert_eq!(revoked.subject, envelope.subject);

    let leaves = vec![
        roster().canonical_bytes(),
        nostr.canonical_bytes(),
        radicle.canonical_bytes(),
        revocation.core_digest().0.to_vec(),
    ];
    let (root, proof) = build_root_and_proof(&leaves, 1).unwrap();
    assert!(verify_proof_at(&leaves[1], leaves.len(), 1, &proof, &root).unwrap());
    let mut altered = leaves[1].clone();
    let last = altered.len() - 1;
    altered[last] ^= 1;
    assert!(!verify_proof_at(&altered, leaves.len(), 1, &proof, &root).unwrap());
    // Committed fixture bytes are what the MMR leaf holds.
    let committed = json("identity_binding_signed.json");
    assert_eq!(
        committed["signed_canonical_hex"][0],
        hex::encode(&leaves[1])
    );
}

#[test]
fn nostr_proof_never_verifies_under_the_wrong_kind() {
    let (nostr, radicle, _) = fixtures();
    let mut m = radicle.clone();
    m.binding.external_kind = nostr.binding.external_kind;
    m.arkhe_signature = sign_arkhe(&m.binding, &key(ARKHE_SEED));
    assert!(m.verify_signatures().is_err());
    let _ = k256::schnorr::SigningKey::from_bytes(&NOSTR_SECRET).unwrap();
}
