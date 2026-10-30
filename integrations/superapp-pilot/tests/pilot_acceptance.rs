use arkhe_superapp_pilot::*;
use arkhe_verify_core::mmr::build_root_and_proof;
use ed25519_dalek::SigningKey;
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};

struct TestClock(AtomicU64);
impl Clock for TestClock {
    fn now(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}
fn setup() -> (Artifact, TrustRoot, Arc<TestClock>, Client, PathBuf) {
    let (artifact, trust, _) = demo::fixture(1000);
    let clock = Arc::new(TestClock(AtomicU64::new(1000)));
    let path = std::env::temp_dir().join(format!(
        "arkhe-pilot-{}-{}.jsonl",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let client = Client::new(trust.clone(), clock.clone(), path.clone());
    (artifact, trust, clock, client, path)
}
fn rebind(a: &mut Artifact) {
    a.manifest.bundle_digest = hash(&a.bundle);
    a.manifest.sign(&SigningKey::from_bytes(&[11; 32])).unwrap();
    let leaves = vec![
        b"prior".to_vec(),
        a.manifest.unsigned_bytes().unwrap(),
        b"next".to_vec(),
    ];
    let (root, proof) = build_root_and_proof(&leaves, 1).unwrap();
    a.proof = proof;
    a.leaf_index = 1;
    a.checkpoint.root = root;
    a.checkpoint.sign(&SigningKey::from_bytes(&[22; 32]));
}
#[test]
fn t1_tampered_bundle_rejected_before_guest() {
    let (mut a, _, _, c, log) = setup();
    a.bundle.push(0);
    assert!(c.admit(&a, vec![]).is_err());
    assert!(!log.exists());
}
#[test]
fn t2_invalid_signature_rejected_before_guest() {
    let (mut a, _, _, c, log) = setup();
    a.manifest.signature[0] ^= 1;
    assert!(c.admit(&a, vec![]).is_err());
    assert!(!log.exists());
}
#[test]
fn t3_expired_checkpoint_allows_metadata_blocks_execution_and_broker() {
    let (a, _, clock, c, log) = setup();
    clock.0.store(1301, Ordering::SeqCst);
    let token = c.admit(&a, vec!["camera".into()]).unwrap();
    assert!(token.can_query());
    assert!(!c.can_execute(&token));
    assert_eq!(c.status(&token), "EVIDENCE_DEGRADED");
    assert!(c.execute(&token).is_err());
    assert!(c.call_api(&token, "camera").is_err());
    let events = fs::read_to_string(&log).unwrap();
    assert!(events.contains("EVIDENCE_DEGRADED"));
    fs::remove_file(log).unwrap();
}
#[test]
fn t4_real_guest_undeclared_api_denied_and_durable() {
    let (mut a, _, _, c, log) = setup();
    a.bundle = wat::parse_str("(module (import \"arkhe\" \"contacts\" (func $contacts (result i32))) (func (export \"run\") (result i32) call $contacts))").unwrap();
    a.manifest.imports = vec!["arkhe.contacts".into()];
    rebind(&mut a);
    let token = c.admit(&a, vec!["camera".into()]).unwrap();
    assert!(c.execute(&token).is_err());
    drop(c);
    let events: Vec<Event> = fs::read_to_string(&log)
        .unwrap()
        .lines()
        .map(|s| serde_json::from_str(s).unwrap())
        .collect();
    assert_eq!(events.len(), 1);
    assert!(!events[0].allowed);
    assert_eq!(events[0].reason, "api not declared");
    fs::remove_file(log).unwrap();
}
#[test]
fn t5_real_http_distribution_and_provider_unavailable_without_fallback() {
    let (a, _, _, c, log) = setup();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let data = serde_json::to_vec(&a).unwrap();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(3)))
            .unwrap();
        let mut request = [0; 4096];
        let n = stream.read(&mut request).unwrap();
        assert!(n > 0);
        write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", data.len()).unwrap();
        stream.write_all(&data).unwrap();
    });
    let url = format!("http://{address}/artifact.json");
    let fetched = fetch_artifact(&url).unwrap();
    server.join().unwrap();
    let token = c.admit(&fetched, vec!["camera".into()]).unwrap();
    assert_eq!(c.execute(&token).unwrap(), 1);
    fs::remove_file(&log).unwrap();
    assert!(fetch_artifact(&url).is_err());
    assert!(!log.exists());
}
#[test]
fn t6_substitution_and_actual_unlisted_wasm_import_blocked() {
    let (mut a, _, _, c, log) = setup();
    let token = c.admit(&a, vec!["camera".into()]).unwrap();
    a.bundle[0] ^= 1;
    assert!(c.execute_candidate(&token, &a.bundle).is_err());
    a.bundle = wat::parse_str("(module (import \"evil\" \"load\" (func $load)) (func (export \"run\") (result i32) call $load i32.const 1))").unwrap();
    rebind(&mut a);
    let second = c.admit(&a, vec![]).unwrap();
    assert!(c
        .execute(&second)
        .unwrap_err()
        .contains("import not admitted"));
    assert!(!log.exists());
    // Caller mutation cannot modify the immutable admitted copy.
    assert_eq!(c.execute(&token).unwrap(), 1);
    fs::remove_file(log).unwrap();
}
#[test]
fn t7_attacker_self_consistent_artifact_rejected_by_pinned_trust() {
    let (mut a, _, _, c, log) = setup();
    a.manifest.sign(&SigningKey::from_bytes(&[99; 32])).unwrap();
    let (root, proof) = build_root_and_proof(&[a.manifest.unsigned_bytes().unwrap()], 0).unwrap();
    a.checkpoint.root = root;
    a.checkpoint.count = 1;
    a.leaf_index = 0;
    a.proof = proof;
    a.checkpoint.sign(&SigningKey::from_bytes(&[88; 32]));
    assert!(c.admit(&a, vec![]).is_err());
    assert!(!log.exists());
}
#[test]
fn token_expiry_revocation_clock_rollback_and_instance_binding() {
    let (a, mut trust, clock, c, log) = setup();
    let token = c.admit(&a, vec!["camera".into()]).unwrap();
    clock.0.store(1301, Ordering::SeqCst);
    assert_eq!(c.status(&token), "EVIDENCE_DEGRADED");
    assert!(c.execute(&token).is_err());
    clock.0.store(999, Ordering::SeqCst);
    assert!(c.execute(&token).is_err());
    clock.0.store(1000, Ordering::SeqCst);
    let other = Client::new(trust.clone(), clock, log.clone());
    assert!(other.execute(&token).is_err());
    trust.publisher_keys.clear();
    c.replace_trust(trust);
    assert!(c.execute(&token).is_err());
    assert!(!log.exists());
}
#[test]
fn checkpoint_future_signature_and_mmr_position_rejected() {
    let (a, _, _, c, _) = setup();
    let mut bad = a.clone();
    bad.checkpoint.epoch = 1001;
    bad.checkpoint.sign(&SigningKey::from_bytes(&[22; 32]));
    assert!(c.admit(&bad, vec![]).is_err());
    bad = a.clone();
    bad.checkpoint.epoch += 1;
    assert!(c.admit(&bad, vec![]).is_err());
    bad = a;
    bad.leaf_index = bad.checkpoint.count;
    assert!(c.admit(&bad, vec![]).is_err());
}
#[test]
fn consent_required_and_log_failure_fails_closed() {
    let (a, trust, clock, c, log) = setup();
    let token = c.admit(&a, vec![]).unwrap();
    assert!(c.execute(&token).is_err());
    assert!(fs::read_to_string(&log)
        .unwrap()
        .contains("user consent missing"));
    fs::remove_file(log).unwrap();
    let impossible = std::env::temp_dir(); // opening a directory as an append file fails
    let c = Client::new(trust, clock, impossible);
    let token = c.admit(&a, vec!["camera".into()]).unwrap();
    assert!(c.execute(&token).is_err());
}
#[test]
fn fuel_exhaustion_and_memory_limit_are_enforced() {
    let (mut a, _, _, c, _) = setup();
    a.bundle = wat::parse_str(
        "(module (func (export \"run\") (result i32) (loop $loop br $loop) i32.const 1))",
    )
    .unwrap();
    a.manifest.imports.clear();
    rebind(&mut a);
    let token = c.admit(&a, vec![]).unwrap();
    assert!(c.execute(&token).is_err());
    a.bundle =
        wat::parse_str("(module (memory 100) (func (export \"run\") (result i32) i32.const 1))")
            .unwrap();
    rebind(&mut a);
    let token = c.admit(&a, vec![]).unwrap();
    assert!(c.execute(&token).is_err());
}
#[test]
fn manifest_encoding_distinguishes_lists_and_delimiters() {
    let (mut a, _, _, _, _) = setup();
    a.manifest.permissions = vec!["camera,contacts".into()];
    let first = a.manifest.unsigned_bytes().unwrap();
    a.manifest.permissions = vec!["camera".into(), "contacts".into()];
    assert_ne!(first, a.manifest.unsigned_bytes().unwrap());
}
#[test]
fn encodings_distinguish_shifted_boundaries_and_empty_entries() {
    let (mut a, trust, _, _, _) = setup();
    let mut seen = Vec::new();
    for (imports, permissions) in [
        (vec!["ab", "c"], vec![]),
        (vec!["a", "bc"], vec![]),
        (vec!["a"], vec![]),
        (vec![], vec!["a"]),
        (vec![], vec![]),
        (vec![""], vec![]),
        (vec![], vec![""]),
    ] {
        a.manifest.imports = imports.into_iter().map(String::from).collect();
        a.manifest.permissions = permissions.into_iter().map(String::from).collect();
        let b = a.manifest.unsigned_bytes().unwrap();
        assert!(!seen.contains(&b));
        seen.push(b);
    }
    let mut policy = trust.policy.clone();
    policy.allowed_apis = vec!["ab".into(), "c".into()];
    let first = policy.digest().unwrap();
    policy.allowed_apis = vec!["a".into(), "bc".into()];
    assert_ne!(first, policy.digest().unwrap());

    let event = |api: &str, reason: &str| Event {
        epoch: 1000,
        api: api.into(),
        allowed: false,
        reason: reason.into(),
    };
    let mut package = EvidencePackage {
        version: 1,
        artifact: a,
        policy: trust.policy.clone(),
        policy_digest: trust.policy.digest().unwrap(),
        evaluated_at: 1000,
        decision: "Allow".into(),
        consent: vec![],
        events: vec![event("ab", "c")],
        gate_pubkey: [0; 32],
        gate_signature: vec![],
    };
    let first = package.unsigned_bytes().unwrap();
    package.events = vec![event("a", "bc")];
    assert_ne!(first, package.unsigned_bytes().unwrap());
}
