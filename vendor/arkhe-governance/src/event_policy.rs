//! Event policy resolution (L3). Maps `(policy_id, event_type)` to one of
//! three outcomes the gate must keep apart: a rule decided, the policy has no
//! rule for this type, or the policy could not be used at all. The gate gets
//! the resolution already made and stays stateless.
use arkhe_core::{canonical::encode_value, Digest32};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RuleAction {
    Allow,
    Reject,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventRule {
    pub rule_id: String,
    pub event_type: String,
    pub action: RuleAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventPolicy {
    pub policy_id: String,
    pub version: u64,
    pub rules: Vec<EventRule>,
}

impl EventPolicy {
    pub fn digest(&self) -> Digest32 {
        let value = serde_json::to_value(self).expect("typed EventPolicy");
        Digest32::blake3(b"AKG:EVENT-POLICY:v1\0", &encode_value(&value))
    }

    /// A policy with duplicate rule ids or two rules for one event type is
    /// unusable: which rule applies would depend on order.
    pub fn validate(&self) -> Result<(), &'static str> {
        let (mut ids, mut types) = (HashSet::new(), HashSet::new());
        for r in &self.rules {
            if !ids.insert(&r.rule_id) {
                return Err("duplicate rule_id");
            }
            if !types.insert(&r.event_type) {
                return Err("two rules for one event_type");
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolution {
    Rule {
        policy_digest: Digest32,
        rule_id: String,
        action: RuleAction,
    },
    NoRuleMatched {
        policy_digest: Digest32,
    },
    /// Not loaded, failed to load, or invalid. `cause` is for operators and
    /// is not part of the verdict.
    Unavailable {
        cause: String,
    },
}

/// Where policies come from (store, bundle, file). Errors mean "could not
/// load", never "no rule".
pub trait EventPolicySource: Send + Sync {
    fn load(&self, policy_id: &str) -> Result<EventPolicy, String>;
}

pub fn resolve<S: EventPolicySource + ?Sized>(
    source: &S,
    policy_id: &str,
    event_type: &str,
) -> Resolution {
    let policy = match source.load(policy_id) {
        Ok(p) => p,
        Err(cause) => return Resolution::Unavailable { cause },
    };
    if policy.policy_id != policy_id {
        return Resolution::Unavailable {
            cause: "source returned a different policy".into(),
        };
    }
    if let Err(cause) = policy.validate() {
        return Resolution::Unavailable {
            cause: cause.into(),
        };
    }
    let policy_digest = policy.digest();
    match policy.rules.iter().find(|r| r.event_type == event_type) {
        Some(r) => Resolution::Rule {
            policy_digest,
            rule_id: r.rule_id.clone(),
            action: r.action,
        },
        None => Resolution::NoRuleMatched { policy_digest },
    }
}
