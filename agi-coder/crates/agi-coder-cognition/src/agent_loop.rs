use crate::{PlanError, WorkingState};
pub trait AgentEnvironment {
    fn perceive(&mut self) -> Result<String, PlanError>;
    fn act(&mut self, task_id: &str) -> Result<(), PlanError>;
    fn verify(&mut self, task_id: &str) -> Result<bool, PlanError>;
}
pub fn run_bounded(
    state: &mut WorkingState,
    environment: &mut impl AgentEnvironment,
    budget: u32,
) -> Result<(), PlanError> {
    for _ in 0..budget {
        if state.plan.is_complete() {
            return Ok(());
        }
        state.observations.push(environment.perceive()?);
        let id = state
            .plan
            .next_ready()
            .ok_or_else(|| PlanError("plan is blocked or retry budget is exhausted".into()))?
            .id
            .clone();
        state.plan.start(&id)?;
        state.steps += 1;
        let verified = match environment.act(&id) {
            Ok(()) => environment.verify(&id),
            Err(e) => {
                state.plan.finish(&id, false)?;
                return Err(e);
            }
        };
        match verified {
            Ok(ok) => state.plan.finish(&id, ok)?,
            Err(e) => {
                state.plan.finish(&id, false)?;
                return Err(e);
            }
        }
    }
    if state.plan.is_complete() {
        Ok(())
    } else {
        Err(PlanError(
            "step budget exhausted; checkpoint state before resuming".into(),
        ))
    }
}
