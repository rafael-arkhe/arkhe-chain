#![allow(unexpected_cfgs)]
//! Fail-closed capability check.
//!
//! Allow only when some listed capability matches principal, action and scope
//! and has not expired. This crate is not wired into `arkhe-kernel`. Integration
//! tests in `tests/fail_closed.rs` exercise eight cases. They are not a Kani proof and they do not quantify over
//! every input.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Allow { action: String },
    Deny { reason: DenyReason },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DenyReason {
    NoCapability,
    Expired,
    /// Present so the stated vocabulary exists. `decide` does not return it:
    /// a scope that does not match is `NoCapability`.
    #[allow(dead_code)]
    ScopeMismatch,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Capability {
    pub principal: String,
    pub action: String,
    pub scope: String,
    pub expires_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Gate {
    pub capabilities: Vec<Capability>,
}

impl Gate {
    /// `expires_at <= now` is expired, including the instant of expiry.
    ///
    /// The first listed match decides. An earlier expired capability hides a
    /// later valid one for the same principal, action and scope.
    pub fn decide(&self, principal: &str, action: &str, scope: &str, now: u64) -> Decision {
        let cap = self
            .capabilities
            .iter()
            .find(|c| c.principal == principal && c.action == action && c.scope == scope);

        match cap {
            None => Decision::Deny {
                reason: DenyReason::NoCapability,
            },
            Some(c) if c.expires_at <= now => Decision::Deny {
                reason: DenyReason::Expired,
            },
            Some(_) => Decision::Allow {
                action: action.to_string(),
            },
        }
    }
}

/// Symbolic checks. `cargo test` does not compile this module.
/// `String` inside Kani needs an allocator model; these harnesses are the
/// stated proof obligation, not a result.
#[allow(unexpected_cfgs)]
#[cfg(kani)]
mod kani_proofs {
    use super::*;

    #[kani::proof]
    fn no_capability_always_denies() {
        let g = Gate {
            capabilities: vec![],
        };
        let decision = g.decide("any", "any", "any", kani::any());
        kani::assert(
            matches!(
                decision,
                Decision::Deny {
                    reason: DenyReason::NoCapability
                }
            ),
            "fail-closed violated: empty capabilities must deny",
        );
    }

    #[kani::proof]
    fn expired_always_denies() {
        let expires_at: u64 = kani::any();
        let now: u64 = kani::any();
        kani::assume(now >= expires_at);
        let cap = Capability {
            principal: "p".into(),
            action: "a".into(),
            scope: "s".into(),
            expires_at,
        };
        let g = Gate {
            capabilities: vec![cap],
        };
        let decision = g.decide("p", "a", "s", now);
        kani::assert(
            matches!(
                decision,
                Decision::Deny {
                    reason: DenyReason::Expired
                }
            ),
            "fail-closed violated: expired capability must deny",
        );
    }
}
