//! Live Rekor fetch is opt-in via `ARKHE_REKOR_ONLINE=1` and `ARKHE_REKOR_ENTRY_UUID`.

use arkhe_chain::{
    verify_recorded_witness, witness_from_rekor_entry_json, DEFAULT_REKOR_BASE_URL,
    DEFAULT_REKOR_ORIGIN,
};
use std::process::Command;

fn fetch_url(url: &str) -> Vec<u8> {
    let output = Command::new("curl")
        .args(["-fsSL", "--max-time", "30", url])
        .output()
        .expect("curl must be installed for ARKHE_REKOR_ONLINE=1");
    if !output.status.success() {
        panic!(
            "FAIL_CLOSED: curl exit {:?} for {url}",
            output.status.code()
        );
    }
    output.stdout
}

#[test]
fn live_rekor_entry_matches_recorded_inclusion_when_online() {
    if std::env::var("ARKHE_REKOR_ONLINE").ok().as_deref() != Some("1") {
        eprintln!("SKIP: ARKHE_REKOR_ONLINE!=1");
        return;
    }
    let entry_uuid = match std::env::var("ARKHE_REKOR_ENTRY_UUID") {
        Ok(u) if !u.is_empty() => u,
        _ => {
            eprintln!("SKIP: ARKHE_REKOR_ENTRY_UUID not set");
            return;
        }
    };
    let anchored_hex = match std::env::var("ARKHE_REKOR_ANCHORED_DIGEST_HEX") {
        Ok(h) if h.len() == 64 => h,
        _ => {
            eprintln!("SKIP: ARKHE_REKOR_ANCHORED_DIGEST_HEX (64 hex) not set");
            return;
        }
    };
    let mut digest = [0u8; 32];
    hex::decode_to_slice(&anchored_hex, &mut digest).expect("hex digest");

    let url = format!("{DEFAULT_REKOR_BASE_URL}/api/v1/log/entries/{entry_uuid}");
    let bytes = fetch_url(&url);
    let witness = witness_from_rekor_entry_json(
        &digest,
        DEFAULT_REKOR_BASE_URL,
        DEFAULT_REKOR_ORIGIN,
        &bytes,
    )
    .expect("parse entry");
    verify_recorded_witness(&digest, &witness).expect("inclusion");
}
