use agi_coder_core::{WorkIntent, WorkerExecutionRecord};
/// Provider adapters may dispatch remote agents. They must not merge or deploy here.
pub trait Worker {
    fn execute(&mut self, intent: &WorkIntent) -> Result<WorkerExecutionRecord, String>;
}
pub trait ProtectedExecutor {
    fn execute(
        &mut self,
        authorization: &agi_coder_kernel::Authorization,
    ) -> Result<Vec<u8>, String>;
}
