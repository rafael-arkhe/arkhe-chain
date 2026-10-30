use agi_coder_core::{ContentHash, Did, RequestIdentity, Timestamp, WorkIntent, WorkIntentType};
pub fn for_task(
    goal: &str,
    task: &str,
    target: ContentHash,
    parameters: serde_json::Value,
    now: Timestamp,
) -> WorkIntent {
    WorkIntent {
        requested_by: Did("did:agi:planner".into()),
        intent_type: WorkIntentType::Implement,
        target,
        parameters,
        request_identity: RequestIdentity::new(format!("{goal}\0{task}").as_bytes()),
        created_at: now,
    }
}
