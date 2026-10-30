//! Deterministic AKG-IDBIND v1 fixtures from fixed TEST keys.
//!
//! cargo run -p arkhe-wormgraph --example idbind-vectors [-- --check]
//!
//! Writes `tests/identity_binding_inputs.json` (public bindings, read by the
//! independent Python reference) and `tests/identity_binding_signed.json`
//! (signed bindings and a revocation). Seeds are public test material: these
//! keys are not, and must never be, provisioned in a trust registry.
use arkhe_wormgraph::binding::{
    sign_arkhe, sign_external_ed25519, sign_external_nostr, BindingRevocation, BindingRole,
    ExternalKind, ExternalProof, IdentityBinding, SignedBinding,
};
use ed25519_dalek::SigningKey;
use serde_json::json;
use std::path::Path;

pub const ARKHE_SEED: [u8; 32] = [0x41; 32];
pub const RADICLE_SEED: [u8; 32] = [0x52; 32];
pub const NOSTR_SECRET: [u8; 32] = [0x4e; 32];
pub const AUX: [u8; 32] = [0; 32];
const NOSTR_CREATED_AT: u64 = 1_792_800_000;
const NOSTR_CONTENT: &str = "Arkhe identity binding (TEST key)\n\"publisher\" for arkhe-e02";

fn main() {
    let check = std::env::args().any(|a| a == "--check");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests");
    let arkhe = SigningKey::from_bytes(&ARKHE_SEED);
    let radicle = SigningKey::from_bytes(&RADICLE_SEED);
    let nostr = k256::schnorr::SigningKey::from_bytes(&NOSTR_SECRET).unwrap();

    let publisher = IdentityBinding {
        version: 1,
        arkhe_key: arkhe.verifying_key().to_bytes(),
        external_kind: ExternalKind::NostrNpub,
        external_id: nostr.verifying_key().to_bytes().into(),
        role: BindingRole::Publisher,
        scope: "arkhe-e02".into(),
        valid_from: 1_792_000_000,
        valid_until: None,
    };
    let delegate = IdentityBinding {
        version: 1,
        arkhe_key: arkhe.verifying_key().to_bytes(),
        external_kind: ExternalKind::RadicleDidKey,
        external_id: radicle.verifying_key().to_bytes(),
        role: BindingRole::Delegate,
        scope: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5".into(),
        valid_from: 1_792_000_000,
        valid_until: Some(1_823_536_000),
    };
    let event = sign_external_nostr(
        &publisher,
        publisher.nostr_template(NOSTR_CREATED_AT, NOSTR_CONTENT),
        &nostr,
        &AUX,
    )
    .unwrap();
    let signed = [
        SignedBinding {
            arkhe_signature: sign_arkhe(&publisher, &arkhe),
            external_proof: ExternalProof::Nostr(event),
            binding: publisher.clone(),
        },
        SignedBinding {
            arkhe_signature: sign_arkhe(&delegate, &arkhe),
            external_proof: ExternalProof::Ed25519(sign_external_ed25519(&delegate, &radicle)),
            binding: delegate.clone(),
        },
    ];
    for s in &signed {
        s.verify_signatures().expect("fixture verifies");
    }
    let revocation = BindingRevocation::sign(
        publisher.digest(),
        1_793_000_000,
        "TEST key rotation",
        &arkhe,
    );

    let inputs = json!({
        "note": "Public inputs from fixed TEST keys; see idbind-vectors.rs",
        "cases": [
            {"id": "IDBIND-nostr-publisher", "binding": publisher,
             "nostr_created_at": NOSTR_CREATED_AT, "nostr_content": NOSTR_CONTENT},
            {"id": "IDBIND-radicle-delegate", "binding": delegate},
        ]
    });
    let outputs = json!({
        "note": "Signed with fixed TEST keys; not provisioned in any trust registry.",
        "nostr_pubkey_hex": hex::encode(publisher.external_id),
        "signed": signed,
        "signed_canonical_hex": signed.iter().map(|s| hex::encode(s.canonical_bytes())).collect::<Vec<_>>(),
        "revocation": revocation,
    });
    for (name, value) in [
        ("identity_binding_inputs.json", inputs),
        ("identity_binding_signed.json", outputs),
    ] {
        let bytes = serde_json::to_string_pretty(&value).unwrap() + "\n";
        let path = root.join(name);
        if check {
            let current = std::fs::read_to_string(&path).unwrap_or_default();
            assert_eq!(current, bytes, "{name} differs from regeneration");
        } else {
            std::fs::write(&path, bytes).unwrap();
        }
    }
    println!(
        "{} identity binding fixtures",
        if check { "PASS" } else { "Wrote" }
    );
}
