use arkhe_verify_core::provenance_broker::{
    broker_digest, canonical_json, decide, evaluate_and_release, BrokerHostError, HostPin,
};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

fn load_fixtures(dir: &Path) -> Vec<(String, Value)> {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .expect("fixture directory exists")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("json"))
        .collect();
    entries.sort();
    entries
        .into_iter()
        .map(|path| {
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            let raw = std::fs::read_to_string(&path).expect("read fixture JSON");
            let val: Value = serde_json::from_str(&raw).expect("valid fixture JSON");
            (name, val)
        })
        .collect()
}

fn expected_without_material_errors(expected: &Value) -> Value {
    let mut cloned = expected.clone();
    if let Some(obj) = cloned.as_object_mut() {
        obj.remove("material_errors");
    }
    cloned
}

fn lab_pin() -> HostPin {
    HostPin {
        authority: "fixture-authority-1".into(),
        public_key_hex: "03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8".into(),
    }
}

#[test]
fn all_28_v3_1_base_fixtures_match_oracle_exact() {
    let root = repo_root();
    let fixtures = load_fixtures(&root.join("tests/provenance-broker/v3.1/fixtures"));
    assert_eq!(fixtures.len(), 28, "expected all 28 base v3.1 fixtures");
    for (name, fixture) in &fixtures {
        let actual = decide(fixture);
        let expected = expected_without_material_errors(&fixture["expected_output"]);
        assert_eq!(actual, expected, "mismatch on base fixture {name}");
    }
}

#[test]
fn all_20_v2_extension_fixtures_match_oracle_exact() {
    let root = repo_root();
    let fixtures = load_fixtures(&root.join("tests/provenance-broker/v3.1/extensions-v2/fixtures"));
    assert_eq!(fixtures.len(), 20, "expected all 20 v2 extension fixtures");
    for (name, fixture) in &fixtures {
        let actual = decide(fixture);
        let expected = expected_without_material_errors(&fixture["expected_output"]);
        assert_eq!(actual, expected, "mismatch on v2 fixture {name}");
    }
}

#[test]
fn canonical_json_sorts_keys_and_preserves_utf8() {
    let v = json!({ "z": 1, "a": { "d": "serviço", "b": [true, false, null] } });
    let bytes = canonical_json(&v);
    assert_eq!(
        std::str::from_utf8(&bytes).unwrap(),
        r#"{"a":{"b":[true,false,null],"d":"serviço"},"z":1}"#
    );
}

#[test]
fn host_material_verification_detects_tampering_and_enforces_delivery_barrier() {
    let root = repo_root();
    let p02: Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("tests/provenance-broker/v3.1/fixtures/P-02.json"))
            .unwrap(),
    )
    .unwrap();
    let pin = lab_pin();

    // Intact baseline releases verified payload.
    let ok = evaluate_and_release(&p02, &pin, &p02["candidate"]).unwrap();
    assert_eq!(ok.host_audit["decision"], "Admit");
    assert_eq!(ok.host_audit["delivery"]["outcome"], "Release");
    assert_eq!(ok.agent_payload["chunks"].as_array().unwrap().len(), 2);

    // Flipping chunk bytes while leaving observations.integrity == "OK" must force Reject.
    let mut tampered_bytes = p02.clone();
    tampered_bytes["chunks"][0]["bytes_hex"] = json!("00");
    let rejected =
        evaluate_and_release(&tampered_bytes, &pin, &tampered_bytes["candidate"]).unwrap();
    assert_eq!(rejected.host_audit["decision"], "Reject");
    assert_eq!(rejected.host_audit["applied_rule"], "INTEGRITY_INVALID");
    assert_eq!(rejected.host_audit["delivery"]["outcome"], "Blocked");
    assert_eq!(
        rejected.agent_payload,
        json!({ "chunks": [], "claim_status": "Omitted", "restrictions": [] })
    );

    // D-GRANT-INVALID admits on decision, blocks on delivery, and withholds agent_payload.
    let d_grant_invalid: Value = serde_json::from_str(
        &std::fs::read_to_string(
            root.join("tests/provenance-broker/v3.1/fixtures/D-GRANT-INVALID.json"),
        )
        .unwrap(),
    )
    .unwrap();
    let blocked_delivery =
        evaluate_and_release(&d_grant_invalid, &pin, &d_grant_invalid["candidate"]).unwrap();
    assert_eq!(blocked_delivery.host_audit["decision"], "Admit");
    assert_eq!(
        blocked_delivery.host_audit["delivery"]["outcome"],
        "Blocked"
    );
    assert_eq!(
        blocked_delivery.agent_payload,
        json!({ "chunks": [], "claim_status": "Omitted", "restrictions": [] })
    );

    // Untrusted pin fails closed before policy runs.
    let wrong_pin = HostPin {
        authority: "other-authority".into(),
        public_key_hex: pin.public_key_hex.clone(),
    };
    assert_eq!(
        evaluate_and_release(&p02, &wrong_pin, &p02["candidate"]).unwrap_err(),
        BrokerHostError::AnchorKeyNotPinned
    );

    // Bad bundle signature fails closed.
    let mut bad_sig = p02.clone();
    bad_sig["observations"]["bundle"]["signature_hex"] = json!("00".repeat(64));
    assert_eq!(
        evaluate_and_release(&bad_sig, &pin, &bad_sig["candidate"]).unwrap_err(),
        BrokerHostError::InvalidObservationSignature
    );

    // Policy without re-derived policy_digest fails closed.
    let mut bad_policy = p02.clone();
    bad_policy["policy"]["max_state_age_ms"] = json!(999);
    assert_ne!(
        broker_digest("POLICY", &bad_policy["policy"]),
        bad_policy["policy_digest"].as_str().unwrap()
    );
    assert_eq!(
        evaluate_and_release(&bad_policy, &pin, &bad_policy["candidate"]).unwrap_err(),
        BrokerHostError::PolicyBindingInvalid
    );

    // Extra field on untrusted CandidateInput is rejected.
    let mut bad_candidate = p02["candidate"].clone();
    bad_candidate["injected_decision"] = json!("Admit");
    assert!(matches!(
        evaluate_and_release(&p02, &pin, &bad_candidate).unwrap_err(),
        BrokerHostError::InvalidCandidate(_)
    ));
}
