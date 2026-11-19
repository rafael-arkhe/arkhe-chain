use arkhe_gate::{Capability, Decision, DenyReason, Gate};

fn gate_with(caps: Vec<Capability>) -> Gate {
    Gate { capabilities: caps }
}

fn cap(principal: &str, action: &str, scope: &str, expires_at: u64) -> Capability {
    Capability {
        principal: principal.into(),
        action: action.into(),
        scope: scope.into(),
        expires_at,
    }
}

#[test]
fn no_capability_denies() {
    let g = gate_with(vec![]);
    assert!(matches!(
        g.decide("alice", "transfer", "ledger", 100),
        Decision::Deny {
            reason: DenyReason::NoCapability
        }
    ));
}

#[test]
fn expired_capability_denies() {
    let g = gate_with(vec![cap("alice", "transfer", "ledger", 50)]);
    assert!(matches!(
        g.decide("alice", "transfer", "ledger", 100),
        Decision::Deny {
            reason: DenyReason::Expired
        }
    ));
}

#[test]
fn wrong_principal_denies() {
    let g = gate_with(vec![cap("bob", "transfer", "ledger", 100)]);
    assert!(matches!(
        g.decide("alice", "transfer", "ledger", 100),
        Decision::Deny {
            reason: DenyReason::NoCapability
        }
    ));
}

#[test]
fn wrong_action_denies() {
    let g = gate_with(vec![cap("alice", "read", "ledger", 100)]);
    assert!(matches!(
        g.decide("alice", "transfer", "ledger", 100),
        Decision::Deny {
            reason: DenyReason::NoCapability
        }
    ));
}

#[test]
fn wrong_scope_denies() {
    let g = gate_with(vec![cap("alice", "transfer", "other", 100)]);
    assert!(matches!(
        g.decide("alice", "transfer", "ledger", 100),
        Decision::Deny {
            reason: DenyReason::NoCapability
        }
    ));
}

#[test]
fn valid_capability_allows() {
    let g = gate_with(vec![cap("alice", "transfer", "ledger", 100)]);
    assert!(matches!(
        g.decide("alice", "transfer", "ledger", 50),
        Decision::Allow { .. }
    ));
}

#[test]
fn expiry_instant_denies() {
    let g = gate_with(vec![cap("alice", "transfer", "ledger", 100)]);
    assert!(matches!(
        g.decide("alice", "transfer", "ledger", 100),
        Decision::Deny {
            reason: DenyReason::Expired
        }
    ));
}

#[test]
fn earlier_expired_hides_later_valid() {
    let g = gate_with(vec![
        cap("alice", "transfer", "ledger", 10),
        cap("alice", "transfer", "ledger", 1_000),
    ]);
    assert!(matches!(
        g.decide("alice", "transfer", "ledger", 50),
        Decision::Deny {
            reason: DenyReason::Expired
        }
    ));
}
