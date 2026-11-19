//! Process preemption is not implemented. This is not a signal and not a kill.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Preemption {
    NotImplemented,
}

pub fn preempt() -> Preemption {
    Preemption::NotImplemented
}
