//! Deterministic dependency planning and a bounded perceive/decide/act/verify loop.
pub mod agent_loop;
pub mod deployment;
pub mod faculties;
pub mod inference;
pub mod intent;
pub mod planner;
pub mod state;
pub use agent_loop::*;
pub use deployment::production_deployment;
pub use planner::*;
pub use state::*;
