use arkhe_core::{
    decision::{Decision, DecisionReason, DecisionVerdict, VERDICT_VERSION},
    evidence::EvidenceReader,
    CanonicalEncode, Digest32,
};
use arkhe_wormgraph::{
    decision::{record_verdict, VERDICT_KIND},
    WormGraph,
};

fn uncovered() -> DecisionVerdict {
    DecisionVerdict {
        version: VERDICT_VERSION,
        subject: Digest32([3; 32]),
        event_type: "ANOMALY".into(),
        policy_id: "dco-tactical-v1".into(),
        policy_digest: Some(Digest32([4; 32])),
        rule_id: None,
        decision: Decision::Reject,
        reason: DecisionReason::NoRuleMatched,
    }
}

#[tokio::test]
async fn the_verdict_with_its_reason_is_what_gets_recorded() {
    let graph = WormGraph::new();
    let v = uncovered();
    let hash = record_verdict(&graph, &v).await.unwrap();
    assert_eq!(hash, v.object_digest());
    let stored = graph.get(hash).await.unwrap().unwrap();
    assert_eq!(stored.kind, VERDICT_KIND);
    assert_eq!(stored.subject, v.subject);
    assert_eq!(stored.policy_digest, v.policy_digest);
    // The record hash commits to the reason: the same Reject with another
    // reason is a different record.
    let mut by_rule = v.clone();
    by_rule.reason = DecisionReason::RuleRejected;
    by_rule.rule_id = Some("block".into());
    assert_ne!(by_rule.object_digest(), hash);
}

#[tokio::test]
async fn contradictory_verdict_is_never_recorded() {
    let graph = WormGraph::new();
    let mut v = uncovered();
    v.decision = Decision::Allow;
    assert!(record_verdict(&graph, &v).await.is_err());
    assert!(graph.get(v.object_digest()).await.unwrap().is_none());
}
