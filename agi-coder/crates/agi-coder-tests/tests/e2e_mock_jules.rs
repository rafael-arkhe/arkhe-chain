mod support;
use agi_coder_core::*;
use agi_coder_jules::*;
use agi_coder_pipeline::{subagent::*, PipelineOrchestrator};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

async fn mock() -> (String, Arc<AtomicUsize>, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let count = Arc::new(AtomicUsize::new(0));
    let c = count.clone();
    let task = tokio::spawn(async move {
        loop {
            let Ok((mut stream, _)) = listener.accept().await else {
                break;
            };
            let mut request = Vec::new();
            let mut chunk = [0; 4096];
            loop {
                let n = stream.read(&mut chunk).await.unwrap();
                if n == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..n]);
                if let Some(end) = request.windows(4).position(|s| s == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..end]).to_lowercase();
                    let length = headers
                        .lines()
                        .find_map(|l| {
                            l.strip_prefix("content-length:")
                                .and_then(|s| s.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            let text = String::from_utf8_lossy(&request);
            assert!(text.to_lowercase().contains("x-goog-api-key: mock-key"));
            let body = if text.starts_with("POST /v1alpha/sessions ") {
                c.fetch_add(1, Ordering::SeqCst);
                assert!(text.contains("sourceContext"));
                r#"{"name":"sessions/mock-1","id":"mock-1","state":"IN_PROGRESS"}"#
            } else if text.starts_with("GET /v1alpha/sessions/mock-1/activities") {
                r#"{"activities":[{"artifacts":[{"changeSet":{"gitPatch":{"unidiffPatch":"diff --git a/a b/a\n+fixed"}}}]}]}"#
            } else if text.starts_with("GET /v1alpha/sessions/mock-1 ") {
                r#"{"name":"sessions/mock-1","id":"mock-1","state":"COMPLETED","outputs":[{"pullRequest":{"url":"https://example.test/pr/1"}}]}"#
            } else {
                panic!("unexpected request: {text}")
            };
            let response=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body);
            stream.write_all(response.as_bytes()).await.unwrap();
        }
    });
    (format!("http://{address}/v1alpha/"), count, task)
}
#[tokio::test]
async fn mock_http_to_signed_evidence_gate_journal_and_mmr() {
    let (base, count, task) = mock().await;
    let client = JulesClient::with_base_url(&base, "mock-key").unwrap();
    let request = CreateSession {
        prompt: "Fix the fixture".into(),
        source_context: SourceContext {
            source: "sources/github/test/repo".into(),
            github_repo_context: GithubRepoContext {
                starting_branch: "main".into(),
            },
        },
        require_plan_approval: true,
    };
    // The bridge below creates the remote session only after journal admission.
    struct HttpWorker {
        base: String,
        request: CreateSession,
    }
    impl Worker for HttpWorker {
        fn execute(&mut self, i: &WorkIntent) -> Result<WorkerExecutionRecord, String> {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            runtime.block_on(async {
                let client = JulesClient::with_base_url(&self.base, "mock-key").unwrap();
                let session = client.create(&self.request).await.unwrap();
                assert_eq!(
                    client
                        .wait(
                            &session.name,
                            std::time::Duration::from_secs(2),
                            std::time::Duration::from_millis(10)
                        )
                        .await
                        .unwrap()
                        .state,
                    "COMPLETED"
                );
                let patches = agi_coder_jules::worker_record::extract_patches(
                    &client.activities(&session.name).await.unwrap(),
                );
                assert_eq!(patches.len(), 1);
                let mut record = support::record(i);
                record.output = ContentHash::hash(patches[0].as_bytes());
                record = record
                    .sign(&ed25519_dalek::SigningKey::from_bytes(&[42; 32]))
                    .unwrap();
                Ok(record)
            })
        }
    }
    struct Executor;
    impl ProtectedExecutor for Executor {
        fn execute(&mut self, _: &agi_coder_kernel::Authorization) -> Result<Vec<u8>, String> {
            Ok(b"mock receipt".to_vec())
        }
    }
    let mut w = HttpWorker { base, request };
    let i = support::intent();
    let mut p = support::policy(&support::record(&i));
    p.expected_output = ContentHash::hash(b"diff --git a/a b/a\n+fixed");
    let root = tokio::task::spawn_blocking(move || {
        let mut pipeline = PipelineOrchestrator::default();
        let mut x = Executor;
        pipeline
            .run_stage(&i, &p, Timestamp(102), &mut w, &mut x)
            .unwrap();
        pipeline
            .run_stage(&i, &p, Timestamp(102), &mut w, &mut x)
            .unwrap();
        assert_eq!(pipeline.graph.len(), 1);
        pipeline.graph.root()
    })
    .await
    .unwrap();
    assert_ne!(root, ContentHash::ZERO);
    assert_eq!(count.load(Ordering::SeqCst), 1);
    assert!(client.get("sessions/../../evil").await.is_err());
    task.abort();
}
#[test]
fn unsupported_schema_and_missing_tests_never_imply_success() {
    assert!(serde_json::from_str::<Session>(r#"{"name":"sessions/1"}"#).is_err());
    assert!(agi_coder_jules::worker_record::extract_patches(&[
        serde_json::json!({"artifacts":[{"unknown":"diff"}]})
    ])
    .is_empty());
    assert_eq!(
        route(
            &TestResults {
                passed: 0,
                failed: 0,
                skipped: 0
            },
            false,
            true,
            1
        ),
        ReviewDecision::ReviewRequired
    );
    assert_eq!(
        route(
            &TestResults {
                passed: 1,
                failed: 0,
                skipped: 0
            },
            false,
            true,
            1
        ),
        ReviewDecision::AutoAccept
    );
    assert_eq!(
        route(
            &TestResults {
                passed: 1,
                failed: 1,
                skipped: 0
            },
            false,
            true,
            1
        ),
        ReviewDecision::AutoReject
    );
}
#[tokio::test]
async fn created_session_is_recorded_before_return_and_recording_failure_is_uncertain() {
    let (base, count, task) = mock().await;
    let client = JulesClient::with_base_url(&base, "mock-key").unwrap();
    let request = CreateSession {
        prompt: "fixture".into(),
        source_context: SourceContext {
            source: "sources/test".into(),
            github_repo_context: GithubRepoContext {
                starting_branch: "main".into(),
            },
        },
        require_plan_approval: true,
    };
    let operation = support::intent().operation_id().unwrap();
    let mut recorded = false;
    let mut journal = agi_coder_journal::OperationJournal::default();
    assert!(matches!(
        journal.admit(&support::intent()).unwrap(),
        agi_coder_journal::AdmissionResult::New(_)
    ));
    let session = client
        .create_recorded(&request, operation, &mut |id, name| {
            assert_eq!(id, operation);
            assert_eq!(name, "sessions/mock-1");
            recorded = true;
            journal
                .record_session(id, name)
                .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
        .unwrap();
    assert!(recorded);
    assert_eq!(
        journal.get(&operation).unwrap().session_name.as_deref(),
        Some("sessions/mock-1")
    );
    assert_eq!(session.name, "sessions/mock-1");
    let error = client
        .create_recorded(&request, ContentHash::hash(b"another"), &mut |_, _| {
            Err("storage unavailable".into())
        })
        .await
        .unwrap_err();
    assert!(
        matches!(error,JulesError::UnrecordedSession{session_name} if session_name=="sessions/mock-1")
    );
    assert_eq!(count.load(Ordering::SeqCst), 2); // One per explicit call; no automatic retry.
    task.abort();
}
