use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Running,
    Verified,
    Failed,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub description: String,
    pub dependencies: Vec<String>,
    pub status: TaskStatus,
    pub attempts: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub goal: String,
    pub tasks: BTreeMap<String, Task>,
    pub max_attempts: u32,
}
#[derive(Debug, thiserror::Error)]
#[error("invalid plan: {0}")]
pub struct PlanError(pub String);
pub struct Planner;
impl Planner {
    pub fn build(goal: String, tasks: Vec<Task>, max_attempts: u32) -> Result<Plan, PlanError> {
        if goal.trim().is_empty() || tasks.is_empty() || max_attempts == 0 {
            return Err(PlanError(
                "goal, tasks, and retry budget are required".into(),
            ));
        }
        let count = tasks.len();
        let tasks: BTreeMap<_, _> = tasks.into_iter().map(|t| (t.id.clone(), t)).collect();
        if tasks.len() != count || tasks.keys().any(|k| k.trim().is_empty()) {
            return Err(PlanError("duplicate or empty task id".into()));
        }
        if tasks
            .values()
            .any(|t| t.dependencies.iter().any(|id| !tasks.contains_key(id)))
        {
            return Err(PlanError("missing dependency".into()));
        }
        let mut visited = BTreeSet::new();
        loop {
            let previous = visited.len();
            for t in tasks.values() {
                if t.dependencies.iter().all(|d| visited.contains(d)) {
                    visited.insert(t.id.clone());
                }
            }
            if visited.len() == tasks.len() {
                break;
            }
            if previous == visited.len() {
                return Err(PlanError("dependency cycle".into()));
            }
        }
        Ok(Plan {
            goal,
            tasks,
            max_attempts,
        })
    }
    pub fn software(goal: String) -> Result<Plan, PlanError> {
        let names = ["design", "implement", "test", "audit", "deploy"];
        Self::build(
            goal,
            names
                .iter()
                .enumerate()
                .map(|(i, id)| Task {
                    id: id.to_string(),
                    description: format!("Complete the {id} stage"),
                    dependencies: if i == 0 {
                        vec![]
                    } else {
                        vec![names[i - 1].into()]
                    },
                    status: TaskStatus::Pending,
                    attempts: 0,
                })
                .collect(),
            3,
        )
    }
}
impl Plan {
    pub fn next_ready(&self) -> Option<&Task> {
        self.tasks.values().find(|t| {
            t.status == TaskStatus::Pending
                && t.attempts < self.max_attempts
                && t.dependencies.iter().all(|d| {
                    self.tasks
                        .get(d)
                        .is_some_and(|t| t.status == TaskStatus::Verified)
                })
        })
    }
    pub fn start(&mut self, id: &str) -> Result<(), PlanError> {
        let ready = self.tasks.get(id).is_some_and(|t| {
            t.status == TaskStatus::Pending
                && t.attempts < self.max_attempts
                && t.dependencies.iter().all(|d| {
                    self.tasks
                        .get(d)
                        .is_some_and(|t| t.status == TaskStatus::Verified)
                })
        });
        if !ready {
            return Err(PlanError("task is not ready".into()));
        }
        let t = self
            .tasks
            .get_mut(id)
            .ok_or_else(|| PlanError("unknown task".into()))?;
        t.status = TaskStatus::Running;
        t.attempts += 1;
        Ok(())
    }
    pub fn finish(&mut self, id: &str, verified: bool) -> Result<(), PlanError> {
        let t = self
            .tasks
            .get_mut(id)
            .ok_or_else(|| PlanError("unknown task".into()))?;
        if t.status != TaskStatus::Running {
            return Err(PlanError("task is not running".into()));
        }
        t.status = if verified {
            TaskStatus::Verified
        } else if t.attempts < self.max_attempts {
            TaskStatus::Pending
        } else {
            TaskStatus::Failed
        };
        Ok(())
    }
    pub fn is_complete(&self) -> bool {
        self.tasks
            .values()
            .all(|t| t.status == TaskStatus::Verified)
    }
}
