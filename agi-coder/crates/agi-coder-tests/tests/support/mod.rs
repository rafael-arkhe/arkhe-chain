use agi_coder_core::*;
use agi_coder_kernel::Policy;
use ed25519_dalek::SigningKey;
pub fn intent() -> WorkIntent {
    WorkIntent {
        requested_by: Did("did:test:requester".into()),
        intent_type: WorkIntentType::Implement,
        target: ContentHash::hash(b"repository@commit"),
        parameters: serde_json::json!({"goal":"fix bug"}),
        request_identity: RequestIdentity::new(b"request-1"),
        created_at: Timestamp(100),
    }
}
pub fn record(intent: &WorkIntent) -> WorkerExecutionRecord {
    WorkerExecutionRecord {
        operation_id: intent.operation_id().unwrap(),
        intent_digest: intent.digest().unwrap(),
        prev_hash: None,
        worker: "independent-test-runtime".into(),
        plan_digest: ContentHash::hash(b"plan"),
        output: ContentHash::hash(b"diff"),
        tests: TestResults {
            passed: 10,
            failed: 0,
            skipped: 0,
        },
        test_artifact: ContentHash::hash(b"runner-output"),
        self_check: SelfCheckResult::Skipped,
        completed_at: Timestamp(101),
        signer: String::new(),
        record_hash: ContentHash::ZERO,
        signature: vec![],
    }
    .sign(&SigningKey::from_bytes(&[42; 32]))
    .unwrap()
}
pub fn policy(record: &WorkerExecutionRecord) -> Policy {
    Policy {
        allowed_signers: vec![record.signer.clone()],
        allowed_requesters: vec!["did:test:requester".into()],
        allowed_operations: vec![WorkIntentType::Implement],
        max_age_seconds: 60,
        expected_output: record.output,
    }
}
