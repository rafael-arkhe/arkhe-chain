//! In-memory reference implementation. Production uses PgOperationJournal.
use crate::{Digest32, Error, WorkIntent, WorkerExecutionRecord};
use async_trait::async_trait;
use std::collections::HashMap;
use tokio::sync::Mutex;
use uuid::Uuid;

// Preserve the established public replay payload without a boxing API migration.
#[allow(clippy::large_enum_variant)]
pub enum Claim {
    Acquired(Uuid),
    Replay(WorkerExecutionRecord),
    Pending,
}
#[async_trait]
pub trait Journal: Send + Sync {
    /// Operational escalation only; never authorizes retry or manufactures evidence.
    async fn require_manual_reconciliation(
        &self,
        _caller: &str,
        _operation: Digest32,
        _reason: &str,
    ) -> Result<(), Error> {
        Ok(())
    }

    async fn claim(&self, intent: &WorkIntent) -> Result<Claim, Error>;
    async fn mark_dispatched(&self, intent: &WorkIntent, owner: Uuid) -> Result<(), Error>;
    async fn complete(
        &self,
        intent: &WorkIntent,
        owner: Uuid,
        record: &WorkerExecutionRecord,
    ) -> Result<(), Error>;
}
struct Entry {
    parameters: Digest32,
    owner: Uuid,
    dispatched: bool,
    response: Option<WorkerExecutionRecord>,
}
#[derive(Default)]
pub struct OperationJournal(Mutex<HashMap<(String, Digest32), Entry>>);
fn require_actor(actor: &str) -> Result<(), Error> {
    if actor.is_empty() || actor != actor.trim() {
        return Err(Error::Rejected("actor required".into()));
    }
    Ok(())
}
#[async_trait]
impl Journal for OperationJournal {
    async fn claim(&self, i: &WorkIntent) -> Result<Claim, Error> {
        require_actor(&i.requested_by)?;
        let mut entries = self.0.lock().await;
        let key = (i.requested_by.clone(), i.operation_id());
        if let Some(e) = entries.get(&key) {
            if e.parameters != i.parameters_digest {
                return Err(Error::ParameterMismatch);
            }
            return Ok(match &e.response {
                Some(r) => Claim::Replay(r.clone()),
                None => Claim::Pending,
            });
        }
        let owner = Uuid::new_v4();
        entries.insert(
            key,
            Entry {
                parameters: i.parameters_digest,
                owner,
                dispatched: false,
                response: None,
            },
        );
        Ok(Claim::Acquired(owner))
    }
    async fn mark_dispatched(&self, i: &WorkIntent, owner: Uuid) -> Result<(), Error> {
        require_actor(&i.requested_by)?;
        let mut entries = self.0.lock().await;
        let e = entries
            .get_mut(&(i.requested_by.clone(), i.operation_id()))
            .ok_or(Error::Uncertain)?;
        if e.owner != owner || e.parameters != i.parameters_digest || e.dispatched {
            return Err(Error::Uncertain);
        }
        e.dispatched = true;
        Ok(())
    }
    async fn complete(
        &self,
        i: &WorkIntent,
        owner: Uuid,
        r: &WorkerExecutionRecord,
    ) -> Result<(), Error> {
        require_actor(&i.requested_by)?;
        let mut entries = self.0.lock().await;
        let e = entries
            .get_mut(&(i.requested_by.clone(), i.operation_id()))
            .ok_or(Error::Uncertain)?;
        if e.owner != owner
            || e.parameters != i.parameters_digest
            || !e.dispatched
            || e.response.is_some()
            || r.execution_id != i.operation_id().to_hex()
        {
            return Err(Error::Uncertain);
        }
        e.response = Some(r.clone());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{Claim, Journal, OperationJournal};
    use crate::Error;
    use arkhe_core::work::{RequestIdentity, WorkIntent, WorkIntentType};
    use arkhe_core::worker::WorkerExecutionRecord;
    use arkhe_core::Digest32;

    fn intent(actor: &str, params: u8) -> WorkIntent {
        WorkIntent {
            requested_by: actor.into(),
            intent_type: WorkIntentType::TriageReport,
            target: Digest32([1; 32]),
            parameters_digest: Digest32([params; 32]),
            context: vec![],
            context_refs: vec![],
            request_identity: RequestIdentity::new(b"same-request"),
            claimed_created_at: 0,
        }
    }

    fn record(intent: &WorkIntent) -> WorkerExecutionRecord {
        WorkerExecutionRecord {
            classification: None,
            operation: None,
            module_id: "journal-test".into(),
            module_version: "0".into(),
            input_digest: Digest32::ZERO,
            output_digest: Digest32::ZERO,
            evidence_refs: vec![],
            confidence_bps: None,
            uncertainty_note: None,
            execution_id: intent.operation_id().to_hex(),
        }
    }

    #[tokio::test]
    async fn actor_parameter_conflict_and_replay_stay_isolated() {
        let journal = OperationJournal::default();
        let alice = intent("alice", 1);
        let Claim::Acquired(owner) = journal.claim(&alice).await.unwrap() else {
            panic!("first claim must acquire");
        };
        let mut changed = alice.clone();
        changed.parameters_digest = Digest32([2; 32]);
        assert!(matches!(
            journal.claim(&changed).await,
            Err(Error::ParameterMismatch)
        ));
        let bob = intent("bob", 9);
        assert!(matches!(journal.claim(&bob).await, Ok(Claim::Acquired(_))));
        journal.mark_dispatched(&alice, owner).await.unwrap();
        let response = record(&alice);
        journal.complete(&alice, owner, &response).await.unwrap();
        match journal.claim(&alice).await.unwrap() {
            Claim::Replay(found) => assert_eq!(found.execution_id, response.execution_id),
            Claim::Acquired(_) | Claim::Pending => panic!("completed claim must replay"),
        }
        assert!(matches!(journal.claim(&bob).await, Ok(Claim::Pending)));
    }

    #[tokio::test]
    async fn blank_actor_wrong_owner_and_second_complete_fail_closed() {
        let journal = OperationJournal::default();
        let mut blank = intent("alice", 1);
        blank.requested_by = " ".into();
        assert!(matches!(
            journal.claim(&blank).await,
            Err(Error::Rejected(_))
        ));
        let alice = intent("alice", 1);
        let Claim::Acquired(owner) = journal.claim(&alice).await.unwrap() else {
            panic!("first claim must acquire");
        };
        assert!(matches!(
            journal.mark_dispatched(&alice, uuid::Uuid::new_v4()).await,
            Err(Error::Uncertain)
        ));
        assert!(matches!(
            journal.complete(&alice, owner, &record(&alice)).await,
            Err(Error::Uncertain)
        ));
        journal.mark_dispatched(&alice, owner).await.unwrap();
        assert!(matches!(
            journal.mark_dispatched(&alice, owner).await,
            Err(Error::Uncertain)
        ));
        let mut bad = record(&alice);
        bad.execution_id = "not-the-operation".into();
        assert!(matches!(
            journal.complete(&alice, owner, &bad).await,
            Err(Error::Uncertain)
        ));
        journal
            .complete(&alice, owner, &record(&alice))
            .await
            .unwrap();
        assert!(matches!(
            journal.complete(&alice, owner, &record(&alice)).await,
            Err(Error::Uncertain)
        ));
        assert!(matches!(journal.claim(&alice).await, Ok(Claim::Replay(_))));
    }
}
