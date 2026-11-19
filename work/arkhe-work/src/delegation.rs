use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DelegationScope {
    ExactTransition(String),
    TransitionSet(Vec<String>),
}

impl DelegationScope {
    pub fn covers(&self, transition: &str) -> bool {
        if transition.trim().is_empty() {
            return false;
        }
        match self {
            DelegationScope::ExactTransition(t) => !t.trim().is_empty() && t == transition,
            DelegationScope::TransitionSet(set) => {
                !set.is_empty() && set.iter().any(|t| !t.trim().is_empty() && t == transition)
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delegation {
    pub delegator: String,
    pub delegatee: String,
    pub scope: DelegationScope,
    pub not_before: i64,
    pub not_after: i64,
    pub signature: Vec<u8>,
}

impl Delegation {
    /// Structural and temporal eligibility check; cryptographic signature
    /// verification against pinned keys belongs to the governance/host layer.
    pub fn matches_request(&self, actor: &str, transition: &str, now: i64) -> bool {
        !self.delegator.trim().is_empty()
            && !self.delegatee.trim().is_empty()
            && self.delegator != self.delegatee
            && self.delegatee == actor
            && self.signature.len() == 64
            && self.not_before < self.not_after
            && self.not_before <= now
            && now < self.not_after
            && self.scope.covers(transition)
    }
}
