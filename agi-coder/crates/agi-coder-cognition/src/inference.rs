//! Model output is a proposal; this function never starts or verifies a plan task.
use crate::{Plan, TaskStatus};
use agi_coder_inference::{
    InferenceError, InferenceProvider, InferenceRequest, InferenceResult, SamplingConfig,
};
pub async fn propose_task(
    provider: &impl InferenceProvider,
    plan: &Plan,
    task_id: &str,
    model: String,
    sampling: SamplingConfig,
) -> Result<InferenceResult, InferenceError> {
    let task = plan
        .tasks
        .get(task_id)
        .ok_or_else(|| InferenceError::Invalid("unknown task".into()))?;
    if task.status != TaskStatus::Pending
        || task.attempts >= plan.max_attempts
        || !task.dependencies.iter().all(|id| {
            plan.tasks
                .get(id)
                .is_some_and(|d| d.status == TaskStatus::Verified)
        })
    {
        return Err(InferenceError::Invalid(
            "task is not ready for a proposal".into(),
        ));
    }
    let request = InferenceRequest { model, sampling, prompt: format!(
        "Produce a proposal for the task below. This output will be independently verified. Do not claim authorization or test success.\nGoal: {}\nTask: {}\nDescription: {}\nDependencies: {}",
        plan.goal, task.id, task.description, task.dependencies.join(", ")) };
    provider.generate(&request).await
}
