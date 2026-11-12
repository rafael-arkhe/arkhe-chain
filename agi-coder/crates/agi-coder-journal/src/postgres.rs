//! SQL shape of the operation journal. This module does not open a database.
use super::{JournalError, Status};
use agi_coder_core::ContentHash;
use std::collections::BTreeMap;

pub const INSERT_PENDING_SQL: &str =
    "INSERT INTO operation_journal (operation_id, intent_digest, status) VALUES ($1, $2, 'pending')";
pub const FINISH_SQL: &str = "UPDATE operation_journal SET status = $3, response = $4, reason = $5, completed_at = now() WHERE operation_id = $1 AND intent_digest = $2 AND status = 'pending'";

pub fn open_database() -> Result<(), JournalError> {
    Err(JournalError::DatabaseUnavailable)
}

pub fn postgres_status() -> serde_json::Value {
    serde_json::json!({
        "connected": false,
        "migration": "migrations/20261021000001_operation_journal.sql",
        "reason": "PostgreSQL is not connected. This process did not apply the migration."
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedSql {
    pub sql: &'static str,
    pub operation_id: ContentHash,
    pub intent_digest: ContentHash,
    pub status: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Row {
    intent_digest: ContentHash,
    status: Status,
    response: Option<Vec<u8>>,
}

/// In-process enforcement of the migration's checks and trigger.
/// It is not a connection and it does not survive process exit.
#[derive(Default)]
pub struct SqlJournal {
    rows: BTreeMap<ContentHash, Row>,
}

impl SqlJournal {
    pub fn insert_pending(
        &mut self,
        operation_id: ContentHash,
        intent_digest: ContentHash,
    ) -> Result<PlannedSql, JournalError> {
        if let Some(row) = self.rows.get(&operation_id) {
            if row.intent_digest != intent_digest {
                return Err(JournalError::Conflict);
            }
            return Err(JournalError::Transition);
        }
        self.rows.insert(
            operation_id,
            Row {
                intent_digest,
                status: Status::Pending,
                response: None,
            },
        );
        Ok(PlannedSql {
            sql: INSERT_PENDING_SQL,
            operation_id,
            intent_digest,
            status: "pending",
        })
    }

    pub fn finish(
        &mut self,
        operation_id: ContentHash,
        intent_digest: ContentHash,
        status: Status,
        response: Option<Vec<u8>>,
    ) -> Result<PlannedSql, JournalError> {
        let row = self
            .rows
            .get_mut(&operation_id)
            .ok_or(JournalError::Transition)?;
        if row.intent_digest != intent_digest
            || row.status != Status::Pending
            || status == Status::Pending
            || (status == Status::Completed) != response.is_some()
        {
            return Err(JournalError::Transition);
        }
        row.status = status;
        row.response = response;
        Ok(PlannedSql {
            sql: FINISH_SQL,
            operation_id,
            intent_digest,
            status: status_text(status),
        })
    }

    pub fn delete(&self, _operation_id: ContentHash) -> Result<PlannedSql, JournalError> {
        Err(JournalError::Transition)
    }
}

fn status_text(status: Status) -> &'static str {
    match status {
        Status::Pending => "pending",
        Status::Completed => "completed",
        Status::Failed => "failed",
        Status::ManualReconciliationRequired => "manual_reconciliation_required",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_is_not_opened() {
        assert!(matches!(
            open_database(),
            Err(JournalError::DatabaseUnavailable)
        ));
        assert_eq!(postgres_status()["connected"], false);
    }

    #[test]
    fn insert_then_finish_matches_the_migration() {
        let mut journal = SqlJournal::default();
        let id = ContentHash::hash(b"operation");
        let digest = ContentHash::hash(b"intent");
        let insert = journal.insert_pending(id, digest).unwrap();
        assert_eq!(insert.sql, INSERT_PENDING_SQL);
        assert!(insert.sql.contains("operation_journal"));
        let finish = journal
            .finish(id, digest, Status::Completed, Some(b"receipt".to_vec()))
            .unwrap();
        assert_eq!(finish.status, "completed");
        assert!(journal.finish(id, digest, Status::Failed, None).is_err());
    }

    #[test]
    fn illegal_transitions_and_delete_are_rejected() {
        let mut journal = SqlJournal::default();
        let id = ContentHash::hash(b"operation");
        let digest = ContentHash::hash(b"intent");
        journal.insert_pending(id, digest).unwrap();
        assert!(journal
            .insert_pending(id, ContentHash::hash(b"other"))
            .is_err());
        assert!(journal.finish(id, digest, Status::Pending, None).is_err());
        assert!(journal.finish(id, digest, Status::Completed, None).is_err());
        assert!(journal.delete(id).is_err());
    }
}
