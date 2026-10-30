use agi_coder_core::{ContentHash, TestResults};
use agi_coder_core::{OperationId, Timestamp, WorkIntent, WorkerExecutionRecord};
use serde::{Deserialize, Serialize};

/// Host supplies independently executed tests; API completion is not a test pass.
pub struct CompletionContext {
    pub operation_id: OperationId,
    pub plan_digest: ContentHash,
    pub test_artifact: ContentHash,
    pub independent_tests: TestResults,
}

impl JulesWorkerRecord {
    /// Convert an observed provider response to an UNSIGNED record. A trusted
    /// host must independently verify tests before signing/admitting this record.
    pub fn from_session(
        intent: &WorkIntent,
        session: &crate::Session,
        activities: &[serde_json::Value],
        context: CompletionContext,
    ) -> Result<WorkerExecutionRecord, String> {
        if context.operation_id != intent.operation_id().map_err(|e| e.to_string())?
            || session.state != "COMPLETED"
            || activities.len() > 10000
            || !session.name.strip_prefix("sessions/").is_some_and(|id| {
                !id.is_empty()
                    && id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            })
        {
            return Err("session state or pre-dispatch operation binding rejected".into());
        }
        let mut completion = None;
        for activity in activities {
            if activity.get("sessionFailed").is_some() {
                return Err("session has failure evidence".into());
            }
            if let Some(event) = activity.get("sessionCompleted") {
                if !event.is_object() || completion.is_some() {
                    return Err("ambiguous completion evidence".into());
                }
                let name = activity
                    .get("name")
                    .and_then(|v| v.as_str())
                    .ok_or("completion activity name missing")?;
                let prefix = format!("{}/activities/", session.name);
                if !name.strip_prefix(&prefix).is_some_and(|id| {
                    !id.is_empty()
                        && id
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
                }) {
                    return Err("completion belongs to another session".into());
                }
                let time = activity
                    .get("createTime")
                    .and_then(|v| v.as_str())
                    .ok_or("provider completion time missing")?;
                let parsed = chrono::DateTime::parse_from_rfc3339(time)
                    .map_err(|_| "invalid provider completion time")?
                    .timestamp();
                if parsed < 0 {
                    return Err("negative provider completion time".into());
                }
                completion = Some(Timestamp(parsed));
            }
        }
        let completed_at =
            completion.ok_or("no provider completion activity; no local-time fallback")?;
        let patches = extract_patches(activities);
        if patches.is_empty()
            || patches.iter().any(|p| p.is_empty())
            || patches.iter().map(String::len).sum::<usize>() > 4 * 1024 * 1024
        {
            return Err("documented patch artifact missing or outside bounds".into());
        }
        let output = ContentHash::domain(
            "AGI/JULES/PATCHES/v1",
            &[&agi_coder_core::cbor::canonical(&patches).map_err(|e| e.to_string())?],
        );
        Ok(WorkerExecutionRecord {
            operation_id: context.operation_id,
            intent_digest: intent.digest().map_err(|e| e.to_string())?,
            prev_hash: None,
            worker: session.name.clone(),
            plan_digest: context.plan_digest,
            output,
            tests: context.independent_tests.clone(),
            test_artifact: context.test_artifact,
            self_check: context.independent_tests.result(),
            completed_at,
            signer: String::new(),
            record_hash: ContentHash::ZERO,
            signature: vec![],
        })
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JulesWorkerRecord {
    pub session_id: String,
    pub plan_digest: ContentHash,
    pub diff_digest: ContentHash,
    pub activities_digest: ContentHash,
    /// Explicitly supplied independent runner result. API completion is not a test pass.
    pub independent_tests: TestResults,
}
/// Extract only documented gitPatch artifacts, never stringify arbitrary outputs as a diff.
pub fn extract_patches(activities: &[serde_json::Value]) -> Vec<String> {
    activities
        .iter()
        .flat_map(|a| {
            a.get("artifacts")
                .and_then(|v| v.as_array())
                .into_iter()
                .flatten()
        })
        .filter_map(|artifact| {
            artifact
                .pointer("/changeSet/gitPatch/unidiffPatch")
                .and_then(|v| v.as_str())
                .map(str::to_owned)
        })
        .collect()
}
