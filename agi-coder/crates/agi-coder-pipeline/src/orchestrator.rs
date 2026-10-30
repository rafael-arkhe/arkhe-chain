use crate::subagent::{ProtectedExecutor, Worker};
use agi_coder_core::{Evidence, Timestamp, WorkIntent};
use agi_coder_journal::{AdmissionResult, OperationJournal, Status};
use agi_coder_kernel::{ContainmentGate, InMemoryEvidenceStore, Policy};
use agi_coder_wormgraph::WormGraph;
#[derive(Debug, thiserror::Error)]
#[error("pipeline stopped: {0}")]
pub struct PipelineError(pub String);
#[derive(Default)]
pub struct PipelineOrchestrator {
    pub journal: OperationJournal,
    pub graph: WormGraph,
    pub evidence: InMemoryEvidenceStore,
}
impl PipelineOrchestrator {
    pub fn run_stage(
        &mut self,
        intent: &WorkIntent,
        policy: &Policy,
        now: Timestamp,
        worker: &mut impl Worker,
        executor: &mut impl ProtectedExecutor,
    ) -> Result<Vec<u8>, PipelineError> {
        let err = |e: agi_coder_journal::JournalError| PipelineError(e.to_string());
        let id = match self.journal.admit(intent).map_err(err)? {
            AdmissionResult::New(id) => id,
            AdmissionResult::Replay(response) => return Ok(response),
            other => return Err(PipelineError(format!("admission: {other:?}"))),
        };
        let record = match worker.execute(intent) {
            Ok(record) => record,
            Err(reason) => {
                // A timeout may follow remote session creation. Never redispatch blindly.
                self.journal
                    .finish(
                        id,
                        Status::ManualReconciliationRequired,
                        None,
                        Some(reason.clone()),
                    )
                    .map_err(err)?;
                return Err(PipelineError(reason));
            }
        };
        let digest = match self.evidence.insert(Evidence::WorkerExecution(record)) {
            Ok(hash) => hash,
            Err(e) => {
                self.journal
                    .finish(id, Status::Failed, None, Some(e.to_string()))
                    .map_err(err)?;
                return Err(PipelineError(e.to_string()));
            }
        };
        let authorization =
            match ContainmentGate::authorize(intent, digest, &self.evidence, policy, now) {
                Ok(auth) => auth,
                Err(e) => {
                    self.journal
                        .finish(id, Status::Failed, None, Some(e.to_string()))
                        .map_err(err)?;
                    return Err(PipelineError(e.to_string()));
                }
            };
        self.graph.append(authorization.evidence());
        match executor.execute(&authorization) {
            Ok(response) => {
                self.journal
                    .finish(id, Status::Completed, Some(response.clone()), None)
                    .map_err(err)?;
                Ok(response)
            }
            Err(reason) => {
                self.journal
                    .finish(
                        id,
                        Status::ManualReconciliationRequired,
                        None,
                        Some(reason.clone()),
                    )
                    .map_err(err)?;
                Err(PipelineError(reason))
            }
        }
    }
}
