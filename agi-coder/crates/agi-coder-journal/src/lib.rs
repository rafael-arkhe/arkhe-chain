//! Single-process admission journal. No external effect may precede `admit`.
pub mod postgres;
use agi_coder_core::{ContentHash, WorkIntent};
pub use postgres::{open_database, postgres_status, SqlJournal};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Pending,
    Completed,
    Failed,
    ManualReconciliationRequired,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    #[serde(default)]
    pub session_name: Option<String>,
    pub intent_digest: ContentHash,
    pub status: Status,
    pub response: Option<Vec<u8>>,
    pub reason: Option<String>,
}
#[derive(Debug, PartialEq, Eq)]
pub enum AdmissionResult {
    New(ContentHash),
    Replay(Vec<u8>),
    InProgress,
    ReconciliationRequired,
    Failed,
}
#[derive(Debug, thiserror::Error)]
pub enum JournalError {
    #[error("idempotency conflict")]
    Conflict,
    #[error("illegal journal transition")]
    Transition,
    #[error("PostgreSQL is not connected. This process did not apply the migration.")]
    DatabaseUnavailable,
    #[error(transparent)]
    Core(#[from] agi_coder_core::Error),
}
#[derive(Default)]
pub struct OperationJournal {
    entries: BTreeMap<ContentHash, Entry>,
}
impl OperationJournal {
    pub fn admit(&mut self, intent: &WorkIntent) -> Result<AdmissionResult, JournalError> {
        let id = intent.operation_id()?;
        let digest = intent.digest()?;
        if let Some(entry) = self.entries.get(&id) {
            if entry.intent_digest != digest {
                return Err(JournalError::Conflict);
            }
            return Ok(match entry.status {
                Status::Completed => {
                    AdmissionResult::Replay(entry.response.clone().ok_or(JournalError::Transition)?)
                }
                Status::Pending => AdmissionResult::InProgress,
                Status::Failed => AdmissionResult::Failed,
                Status::ManualReconciliationRequired => AdmissionResult::ReconciliationRequired,
            });
        }
        self.entries.insert(
            id,
            Entry {
                session_name: None,
                intent_digest: digest,
                status: Status::Pending,
                response: None,
                reason: None,
            },
        );
        Ok(AdmissionResult::New(id))
    }
    pub fn get(&self, id: &ContentHash) -> Option<&Entry> {
        self.entries.get(id)
    }
    /// Callback target for JulesClient::create_recorded after admission. This
    /// reference store is volatile; a live host must use a durable equivalent.
    pub fn record_session(
        &mut self,
        id: ContentHash,
        session_name: &str,
    ) -> Result<(), JournalError> {
        if !session_name.strip_prefix("sessions/").is_some_and(|id| {
            !id.is_empty()
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        }) {
            return Err(JournalError::Transition);
        }
        let entry = self.entries.get_mut(&id).ok_or(JournalError::Transition)?;
        if entry.status != Status::Pending
            || entry
                .session_name
                .as_deref()
                .is_some_and(|old| old != session_name)
        {
            return Err(JournalError::Transition);
        }
        entry.session_name = Some(session_name.into());
        Ok(())
    }
    pub fn finish(
        &mut self,
        id: ContentHash,
        status: Status,
        response: Option<Vec<u8>>,
        reason: Option<String>,
    ) -> Result<(), JournalError> {
        let e = self.entries.get_mut(&id).ok_or(JournalError::Transition)?;
        if e.status != Status::Pending
            || status == Status::Pending
            || (status == Status::Completed) != response.is_some()
        {
            return Err(JournalError::Transition);
        }
        e.status = status;
        e.response = response;
        e.reason = reason;
        Ok(())
    }
}
