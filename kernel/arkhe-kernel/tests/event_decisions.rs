//! F2 gate behaviour: a binary decision that always carries a closed reason,
//! so a rule's rejection, missing coverage, an unusable policy and the
//! emergency stop stay distinguishable after anchoring.
use arkhe_core::{
    decision::{Decision, DecisionReason, DecisionVerdict, VerdictError},
    CanonicalEncode, Digest32,
};
use arkhe_governance::{
    event_policy::{resolve, EventPolicy, EventPolicySource, EventRule, Resolution, RuleAction},
    DevPolicyResolver,
};
use arkhe_kernel::ContainmentGate;
use std::collections::HashMap;

const POLICY: &str = "dco-tactical-v1";

struct Source(HashMap<String, Result<EventPolicy, String>>);

impl EventPolicySource for Source {
    fn load(&self, policy_id: &str) -> Result<EventPolicy, String> {
        self.0
            .get(policy_id)
            .cloned()
            .unwrap_or_else(|| Err("policy not found".into()))
    }
}

fn rule(id: &str, event_type: &str, action: RuleAction) -> EventRule {
    EventRule {
        rule_id: id.into(),
        event_type: event_type.into(),
        action,
    }
}

fn policy(rules: Vec<EventRule>) -> EventPolicy {
    EventPolicy {
        policy_id: POLICY.into(),
        version: 1,
        rules,
    }
}

fn source(p: Result<EventPolicy, String>) -> Source {
    Source(HashMap::from([(POLICY.to_string(), p)]))
}

fn dco_policy() -> EventPolicy {
    policy(vec![
        rule("block-auth-failure", "AUTH_FAILURE", RuleAction::Reject),
        rule(
            "block-policy-violation",
            "POLICY_VIOLATION",
            RuleAction::Reject,
        ),
        rule("allow-heartbeat", "HEARTBEAT", RuleAction::Allow),
    ])
}

fn event(n: u64) -> Digest32 {
    Digest32::blake3(b"test-event\0", &n.to_le_bytes())
}

fn decide(
    gate: &ContainmentGate<DevPolicyResolver>,
    s: &Source,
    n: u64,
    t: &str,
) -> DecisionVerdict {
    gate.decide_event(event(n), t, POLICY, &resolve(s, POLICY, t))
        .unwrap()
}

#[test]
fn fifty_policy_blocked_events_are_rule_rejections() {
    let gate = ContainmentGate::new(DevPolicyResolver);
    let s = source(Ok(dco_policy()));
    let digest = dco_policy().digest();
    for n in 0..50 {
        let t = if n % 2 == 0 {
            "AUTH_FAILURE"
        } else {
            "POLICY_VIOLATION"
        };
        let v = decide(&gate, &s, n, t);
        assert_eq!(v.decision, Decision::Reject);
        assert_eq!(v.reason, DecisionReason::RuleRejected);
        assert_eq!(v.policy_digest, Some(digest));
        assert!(v.rule_id.is_some());
        assert!(!v.degraded());
    }
    let allowed = decide(&gate, &s, 99, "HEARTBEAT");
    assert_eq!(
        (allowed.decision, allowed.reason, allowed.rule_id.as_deref()),
        (
            Decision::Allow,
            DecisionReason::RuleAllowed,
            Some("allow-heartbeat")
        )
    );
}

#[test]
fn uncovered_event_type_is_rejected_but_marked_as_missing_coverage() {
    let gate = ContainmentGate::new(DevPolicyResolver);
    let v = decide(&gate, &source(Ok(dco_policy())), 1, "ANOMALY");
    assert_eq!(v.decision, Decision::Reject);
    assert_eq!(v.reason, DecisionReason::NoRuleMatched);
    // The policy was evaluated: its digest is kept, and no rule is named.
    assert_eq!(v.policy_digest, Some(dco_policy().digest()));
    assert_eq!(v.rule_id, None);
    assert!(v.degraded());
}

#[test]
fn unusable_policy_is_an_infrastructure_failure_not_a_decision() {
    let gate = ContainmentGate::new(DevPolicyResolver);
    let ambiguous = policy(vec![
        rule("a", "AUTH_FAILURE", RuleAction::Reject),
        rule("b", "AUTH_FAILURE", RuleAction::Allow),
    ]);
    let mut renamed = dco_policy();
    renamed.policy_id = "other-policy".into();
    for s in [
        source(Err("policy store unreachable".into())),
        Source(HashMap::new()),
        source(Ok(ambiguous)),
        source(Ok(renamed)),
    ] {
        let v = decide(&gate, &s, 1, "AUTH_FAILURE");
        assert_eq!(v.decision, Decision::Reject);
        assert_eq!(v.reason, DecisionReason::PolicyUnavailable);
        assert_eq!((v.policy_digest, v.rule_id.as_deref()), (None, None));
        assert!(v.degraded());
    }
}

#[test]
fn emergency_stop_forces_reject_over_every_resolution() {
    let mut gate = ContainmentGate::new(DevPolicyResolver);
    gate.set_emergency_stop(true);
    let ok = source(Ok(dco_policy()));
    for (s, t) in [
        (&ok, "HEARTBEAT"),
        (&ok, "AUTH_FAILURE"),
        (&ok, "ANOMALY"),
        (&source(Err("down".into())), "HEARTBEAT"),
    ] {
        let v = decide(&gate, s, 7, t);
        assert_eq!(v.decision, Decision::Reject);
        assert_eq!(v.reason, DecisionReason::EmergencyStop);
        assert_eq!(v.rule_id, None);
        assert!(!v.degraded(), "a deliberate stop is not missing policy");
    }
}

#[test]
fn the_three_rejections_of_one_event_stay_distinguishable() {
    let gate = ContainmentGate::new(DevPolicyResolver);
    let by_rule = decide(&gate, &source(Ok(dco_policy())), 5, "AUTH_FAILURE");
    let uncovered = decide(
        &gate,
        &source(Ok(policy(vec![rule("x", "HEARTBEAT", RuleAction::Allow)]))),
        5,
        "AUTH_FAILURE",
    );
    let unavailable = decide(&gate, &source(Err("down".into())), 5, "AUTH_FAILURE");
    let verdicts = [&by_rule, &uncovered, &unavailable];
    assert!(verdicts.iter().all(|v| v.decision == Decision::Reject));
    let reasons: Vec<_> = verdicts.iter().map(|v| v.reason).collect();
    assert_eq!(
        reasons,
        [
            DecisionReason::RuleRejected,
            DecisionReason::NoRuleMatched,
            DecisionReason::PolicyUnavailable
        ]
    );
    // What gets anchored differs, so the distinction survives the log.
    let digests: std::collections::HashSet<_> =
        verdicts.iter().map(|v| v.object_digest()).collect();
    assert_eq!(digests.len(), 3);
}

type Mutation = fn(&mut DecisionVerdict);

#[test]
fn verdicts_contradicting_their_reason_are_invalid() {
    let gate = ContainmentGate::new(DevPolicyResolver);
    let good = decide(&gate, &source(Ok(dco_policy())), 1, "AUTH_FAILURE");
    let cases: [(Mutation, &str); 5] = [
        (
            |v| v.decision = Decision::Allow,
            "decision contradicts reason",
        ),
        (
            |v| v.rule_id = None,
            "rule_id must be present exactly for rule reasons",
        ),
        (
            |v| v.policy_digest = None,
            "a rule decision needs the evaluated policy digest",
        ),
        (
            |v| {
                v.reason = DecisionReason::PolicyUnavailable;
                v.rule_id = None;
            },
            "an unavailable policy has no digest",
        ),
        (
            |v| {
                v.reason = DecisionReason::NoRuleMatched;
                v.rule_id = None;
                v.policy_digest = None;
            },
            "no-rule-matched needs the evaluated policy digest",
        ),
    ];
    for (mutate, msg) in cases {
        let mut v = good.clone();
        mutate(&mut v);
        assert_eq!(v.validate(), Err(VerdictError::Schema(msg)));
        assert!(DecisionVerdict::from_canonical_bytes(&v.canonical_bytes()).is_err());
    }
    assert_eq!(
        DecisionVerdict::from_canonical_bytes(&good.canonical_bytes()).unwrap(),
        good
    );
}

#[test]
fn malformed_input_yields_no_decision_at_all() {
    let gate = ContainmentGate::new(DevPolicyResolver);
    let r = Resolution::NoRuleMatched {
        policy_digest: Digest32::ZERO,
    };
    assert!(gate.decide_event(event(1), "bad type", POLICY, &r).is_err());
    assert!(gate.decide_event(event(1), "ANOMALY", "", &r).is_err());
}
