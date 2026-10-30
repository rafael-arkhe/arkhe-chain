use arkhe_p2p::{
    discovery::{Candidate, NostrDiscovery},
    transport::BlossomTransport,
    verify::{DualVerifier, ExpectedDigests},
    EndpointPolicy, Error, Limits,
};
use futures_util::{SinkExt, StreamExt};
use nostr::{Event, EventBuilder, Keys, Kind, Tag};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use url::Url;

const POLICY: EndpointPolicy = EndpointPolicy {
    allow_cleartext_loopback: true,
};
fn limits(max: usize) -> Limits {
    Limits {
        max_bytes: max,
        deadline: Duration::from_secs(3),
    }
}
fn expected(bytes: &[u8]) -> ExpectedDigests {
    ExpectedDigests {
        sha256: Sha256::digest(bytes).into(),
        blake3: *blake3::hash(bytes).as_bytes(),
    }
}
fn candidate(url: Url, digests: ExpectedDigests) -> Candidate {
    Candidate {
        url,
        sha256: digests.sha256,
        mime: None,
        publisher: None,
    }
}
async fn http(bytes: Vec<u8>, status: &str, header_len: Option<usize>) -> Url {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
    let status = status.to_owned();
    tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = [0; 4096];
        let _ = socket.read(&mut request).await;
        let header = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            header_len.unwrap_or(bytes.len())
        );
        let _ = socket.write_all(header.as_bytes()).await;
        let _ = socket.write_all(&bytes).await;
    });
    base
}
fn signed(url: &Url, digest: ExpectedDigests) -> Event {
    let keys = Keys::generate();
    EventBuilder::new(Kind::from(1063), "synthetic local test")
        .tags([
            Tag::parse(["x", &hex::encode(digest.sha256)]).unwrap(),
            Tag::parse(["url", url.as_str()]).unwrap(),
            Tag::parse(["m", "application/json"]).unwrap(),
        ])
        .sign_with_keys(&keys)
        .unwrap()
}
async fn relay(events: Vec<Value>, stall: bool) -> Url {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = Url::parse(&format!("ws://{}/", listener.local_addr().unwrap())).unwrap();
    tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let mut ws = accept_async(socket).await.unwrap();
        let request = ws.next().await.unwrap().unwrap();
        let req: Value = serde_json::from_str(request.to_text().unwrap()).unwrap();
        assert_eq!(req[0], "REQ");
        assert_eq!(req[2]["kinds"][0], 1063);
        assert!(req[2]["#x"][0].as_str().is_some_and(|s| s.len() == 64));
        if stall {
            tokio::time::sleep(Duration::from_secs(2)).await;
            return;
        }
        for event in events {
            if ws
                .send(Message::Text(
                    json!(["EVENT", "arkhe-lookup", event]).to_string().into(),
                ))
                .await
                .is_err()
            {
                return;
            }
        }
        let _ = ws
            .send(Message::Text(
                json!(["EOSE", "arkhe-lookup"]).to_string().into(),
            ))
            .await;
    });
    url
}

#[tokio::test]
async fn dual_verification_accepts_exact_bytes_and_empty_content() {
    for bytes in [b"".as_slice(), b"synthetic evidence", &[7u8; 40000]] {
        let verified = DualVerifier::new(expected(bytes), limits(40000))
            .unwrap()
            .verify(bytes)
            .await
            .unwrap();
        assert_eq!(verified.bytes(), bytes);
        assert_eq!(verified.digests().blake3, expected(bytes).blake3);
    }
}

#[tokio::test]
async fn correct_sha_wrong_blake_is_rejected() {
    let bytes = b"data";
    let mut digests = expected(bytes);
    digests.blake3 = [0; 32];
    assert!(matches!(
        DualVerifier::new(digests, limits(4))
            .unwrap()
            .verify(&bytes[..])
            .await,
        Err(Error::Blake3Mismatch)
    ));
}

#[tokio::test]
async fn correct_blake_wrong_sha_is_rejected() {
    let bytes = b"data";
    let mut digests = expected(bytes);
    digests.sha256 = [0; 32];
    assert!(matches!(
        DualVerifier::new(digests, limits(4))
            .unwrap()
            .verify(&bytes[..])
            .await,
        Err(Error::Sha256Mismatch)
    ));
}

#[tokio::test]
async fn truncation_corruption_and_limit_are_rejected() {
    let verifier = DualVerifier::new(expected(b"data"), limits(4)).unwrap();
    assert!(verifier.verify(&b"dat"[..]).await.is_err());
    assert!(verifier.verify(&b"date"[..]).await.is_err());
    assert!(matches!(
        verifier.verify(&b"data!"[..]).await,
        Err(Error::TooLarge)
    ));
}

#[tokio::test]
async fn stalled_stream_expires() {
    let (reader, _writer) = tokio::io::duplex(32);
    let verifier = DualVerifier::new(
        expected(b"data"),
        Limits {
            max_bytes: 32,
            deadline: Duration::from_millis(20),
        },
    )
    .unwrap();
    assert!(matches!(verifier.verify(reader).await, Err(Error::Timeout)));
}

#[tokio::test]
async fn blossom_download_is_verified_with_same_contract_as_local_source() {
    let bytes = b"synthetic data";
    let digests = expected(bytes);
    let base = http(bytes.to_vec(), "200 OK", None).await;
    let transport = BlossomTransport::new(vec![base.clone()], POLICY).unwrap();
    let c = candidate(base.join(&hex::encode(digests.sha256)).unwrap(), digests);
    let local = DualVerifier::new(digests, limits(100))
        .unwrap()
        .verify(&bytes[..])
        .await
        .unwrap();
    assert_eq!(
        transport
            .fetch(&c, digests, limits(100))
            .await
            .unwrap()
            .bytes(),
        local.bytes()
    );
}

#[tokio::test]
async fn bad_http_status_partial_response_and_size_are_not_accepted() {
    for status in [
        "404 Not Found",
        "500 Internal Server Error",
        "206 Partial Content",
        "302 Found",
    ] {
        let d = expected(b"data");
        let base = http(b"data".to_vec(), status, None).await;
        let c = candidate(base.join(&hex::encode(d.sha256)).unwrap(), d);
        let t = BlossomTransport::new(vec![base], POLICY).unwrap();
        assert!(matches!(
            t.fetch(&c, d, limits(4)).await,
            Err(Error::HttpStatus(_))
        ));
    }
    let d = expected(b"data");
    let base = http(b"data".to_vec(), "200 OK", Some(100)).await;
    let c = candidate(base.join(&hex::encode(d.sha256)).unwrap(), d);
    let t = BlossomTransport::new(vec![base], POLICY).unwrap();
    assert!(matches!(
        t.fetch(&c, d, limits(4)).await,
        Err(Error::TooLarge)
    ));
}

#[tokio::test]
async fn disallowed_origin_credentials_and_wrong_locator_are_rejected_before_network() {
    let d = expected(b"data");
    let t = BlossomTransport::new(
        vec![Url::parse("https://cdn.example/").unwrap()],
        EndpointPolicy::default(),
    )
    .unwrap();
    for url in [
        format!("https://other.example/{}", hex::encode(d.sha256)),
        format!(
            "https://name:password@cdn.example/{}",
            hex::encode(d.sha256)
        ),
        "https://cdn.example/not-a-digest".into(),
    ] {
        assert!(matches!(
            t.fetch(&candidate(Url::parse(&url).unwrap(), d), d, limits(100))
                .await,
            Err(Error::InvalidInput)
        ));
    }
    assert!(BlossomTransport::new(
        vec![Url::parse("http://127.0.0.1/").unwrap()],
        EndpointPolicy::default()
    )
    .is_err());
}

#[tokio::test]
async fn fallback_rejects_poisoned_source_then_accepts_second_and_empty_is_incomplete() {
    let d = expected(b"data");
    let bad = http(b"evil".to_vec(), "200 OK", None).await;
    let good = http(b"data".to_vec(), "200 OK", None).await;
    let candidates = [
        candidate(bad.join(&hex::encode(d.sha256)).unwrap(), d),
        candidate(good.join(&hex::encode(d.sha256)).unwrap(), d),
    ];
    let t = BlossomTransport::new(vec![bad, good], POLICY).unwrap();
    assert_eq!(
        t.acquire(&candidates, d, limits(100))
            .await
            .unwrap()
            .bytes(),
        b"data"
    );
    assert_eq!(
        t.acquire(&[], d, limits(100)).await.unwrap_err().attempts,
        0
    );
}

#[tokio::test]
async fn discovery_verifies_signatures_hash_binding_deduplicates_and_composes_with_fetch() {
    let d = expected(b"data");
    let base = http(b"data".to_vec(), "200 OK", None).await;
    let url = base.join(&hex::encode(d.sha256)).unwrap();
    let event = serde_json::to_value(signed(&url, d)).unwrap();
    let mut forged = event.clone();
    forged["content"] = json!("tampered");
    let wrong_hash = serde_json::to_value(signed(&url, expected(b"other"))).unwrap();
    let relay = relay(vec![forged, wrong_hash, event.clone(), event], false).await;
    let discovery =
        NostrDiscovery::new(vec![relay], POLICY, Duration::from_secs(3), 10, 4).unwrap();
    let observation = discovery.lookup(d.sha256).await;
    assert_eq!(observation.candidates.len(), 1);
    assert_eq!(observation.rejected_events, 2);
    assert_eq!(observation.relay_eose.len(), 1);
    let t = BlossomTransport::new(vec![base], POLICY).unwrap();
    assert_eq!(
        t.acquire(&observation.candidates, d, limits(100))
            .await
            .unwrap()
            .bytes(),
        b"data"
    );
}

#[tokio::test]
async fn relay_timeout_empty_response_and_candidate_budget_are_observations_not_absence() {
    let d = expected(b"data");
    let slow = relay(vec![], true).await;
    let empty = relay(vec![], false).await;
    let discovery =
        NostrDiscovery::new(vec![slow, empty], POLICY, Duration::from_millis(400), 10, 2).unwrap();
    let result = discovery.lookup(d.sha256).await;
    assert!(result.candidates.is_empty());
    assert!(!result.diagnostics.is_empty());
    assert_eq!(result.relay_eose.len(), 1);
    let url = Url::parse(&format!("https://cdn.example/{}", hex::encode(d.sha256))).unwrap();
    let r = relay(vec![serde_json::to_value(signed(&url, d)).unwrap()], false).await;
    let result = NostrDiscovery::new(vec![r], POLICY, Duration::from_secs(2), 4, 1)
        .unwrap()
        .lookup(d.sha256)
        .await;
    assert_eq!(result.candidates.len(), 1);
    assert!(!result.diagnostics.is_empty());
}

#[test]
fn configuration_rejects_unbounded_or_zero_budgets() {
    assert!(DualVerifier::new(expected(b""), limits(0)).is_err());
    assert!(DualVerifier::new(expected(b""), limits(16 * 1024 * 1024 + 1)).is_err());
    assert!(NostrDiscovery::new(vec![], POLICY, Duration::from_secs(1), 10, 2).is_err());
}

#[tokio::test]
async fn acquired_dataset_feeds_existing_e02_cli_without_modifying_frozen_inputs() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let smoke = root.join("docs/evidence/2026-10-23-e02-devnet-smoke");
    let bytes = std::fs::read(smoke.join("dataset.json")).unwrap();
    let digests = expected(&bytes);
    // Pinned independently of Nostr metadata and the HTTP response.
    assert_eq!(
        hex::encode(digests.blake3),
        "022fe7a7311d8e1834f39f4ca4a9de6bc8d8c4f6c5c97ce792c1259768fdcfa8"
    );
    let base = http(bytes.clone(), "200 OK", None).await;
    let url = base.join(&hex::encode(digests.sha256)).unwrap();
    let relay = relay(
        vec![serde_json::to_value(signed(&url, digests)).unwrap()],
        false,
    )
    .await;
    let discovery = NostrDiscovery::new(vec![relay], POLICY, Duration::from_secs(3), 8, 4).unwrap();
    let observation = discovery.lookup(digests.sha256).await;
    let transport = BlossomTransport::new(vec![base], POLICY).unwrap();
    let blob = transport
        .acquire(&observation.candidates, digests, limits(16 * 1024 * 1024))
        .await
        .unwrap();
    assert_eq!(blob.bytes(), bytes);
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("arkhe-p2p-e02-{}-{suffix}", std::process::id()));
    std::fs::create_dir(&dir).unwrap();
    let dataset = dir.join("dataset.json");
    std::fs::write(&dataset, blob.bytes()).unwrap();
    let output = std::process::Command::new("node")
        .arg(root.join("scripts/e02_verify.mjs"))
        .arg("--receipt")
        .arg(smoke.join("ref.json"))
        .arg("--anchor")
        .arg(smoke.join("anchor.json"))
        .arg("--dataset")
        .arg(&dataset)
        .output();
    std::fs::remove_file(dataset).unwrap();
    std::fs::remove_dir(dir).unwrap();
    let output = output.expect("Node must be installed for the E02 composition test");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(result["outcome"], "VERIFIED");
    assert!(result["observation_warning"]
        .as_str()
        .unwrap()
        .contains("não autentica recibos RPC"));
    assert_eq!(std::fs::read(smoke.join("dataset.json")).unwrap(), bytes);
}
