//! Cross-implementation check for AKG-IDBIND v1: the Nostr proof produced by
//! `arkhe-wormgraph::binding` (own NIP-01 serializer + k256 BIP-340) must be a
//! valid event for the independent `nostr` crate, and the event id must match
//! the stdlib Python reference.
use serde_json::{json, Value};

fn read(name: &str) -> Value {
    let path = format!("{}/../../tests/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn binding_event_verifies_with_the_nostr_crate() {
    let signed = read("identity_binding_signed.json");
    let reference = read("identity_binding_vectors.json");
    let proof = &signed["signed"][0]["external_proof"]["nostr"];
    let id = reference["vectors"][0]["nostr"]["event_id_hex"].clone();
    let event = json!({
        "id": id,
        "pubkey": signed["nostr_pubkey_hex"],
        "created_at": proof["created_at"],
        "kind": 30078,
        "tags": proof["tags"],
        "content": proof["content"],
        "sig": proof["sig"],
    });
    let parsed: nostr::Event = serde_json::from_value(event.clone()).unwrap();
    parsed
        .verify()
        .expect("nostr crate accepts the binding event");

    let mut tampered = event;
    tampered["content"] = json!("changed");
    let parsed: nostr::Event = serde_json::from_value(tampered).unwrap();
    assert!(parsed.verify().is_err());
}
