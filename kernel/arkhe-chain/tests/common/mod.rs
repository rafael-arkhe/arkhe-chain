use arkhe_chain::{ArkheNode, Transaction};
use arkhe_core::decision::{Decision, DecisionVerdict};
use arkhe_core::CanonicalEncode;
use arkhe_governance::{
    event_policy::{resolve, EventPolicy, EventPolicySource, EventRule, RuleAction},
    DevPolicyResolver,
};
use arkhe_kernel::ContainmentGate;

const POLICY: &str = "chain-v1";
const EVENT: &str = "chain-transfer";

struct Source(EventPolicy);

impl EventPolicySource for Source {
    fn load(&self, policy_id: &str) -> Result<EventPolicy, String> {
        if policy_id == self.0.policy_id {
            Ok(self.0.clone())
        } else {
            Err("policy not found".into())
        }
    }
}

fn policy(allow: bool) -> EventPolicy {
    EventPolicy {
        policy_id: POLICY.into(),
        version: 1,
        rules: vec![EventRule {
            rule_id: "transfer".into(),
            event_type: EVENT.into(),
            action: if allow {
                RuleAction::Allow
            } else {
                RuleAction::Reject
            },
        }],
    }
}

#[allow(dead_code)]
pub fn node() -> ArkheNode {
    ArkheNode::new("validator-a", &SECRET_A, validators(), accounts()).unwrap()
}

pub const SECRET_A: [u8; 32] = [0x11; 32];
pub const SECRET_B: [u8; 32] = [0x22; 32];
pub const GENESIS_SECRET: [u8; 32] = [0x44; 32];
pub const ATTACKER_SECRET: [u8; 32] = [0x55; 32];
const GENESIS_MLDSA: [u8; 32] = [0x66; 32];
const ATTACKER_MLDSA: [u8; 32] = [0x77; 32];

fn mldsa_public(seed: &[u8; 32]) -> [u8; arkhe_chain::MLDSA65_PK_LEN] {
    use std::sync::OnceLock;
    static GENESIS: OnceLock<[u8; arkhe_chain::MLDSA65_PK_LEN]> = OnceLock::new();
    static ATTACKER: OnceLock<[u8; arkhe_chain::MLDSA65_PK_LEN]> = OnceLock::new();
    let slot = if *seed == GENESIS_MLDSA {
        &GENESIS
    } else if *seed == ATTACKER_MLDSA {
        &ATTACKER
    } else {
        panic!("no cached ML-DSA seed");
    };
    *slot.get_or_init(|| {
        let mut probe = Transaction {
            nonce: 0,
            sender: "genesis-alloc".into(),
            recipient: "genesis-alloc".into(),
            value: 0,
            payload: Vec::new(),
            signature_mldsa: Vec::new(),
            sender_signature: [0u8; 64],
        };
        arkhe_chain::sign_mldsa(&mut probe, seed).unwrap()
    })
}

pub fn accounts() -> Vec<arkhe_chain::Account> {
    vec![
        arkhe_chain::Account {
            id: "genesis-alloc".into(),
            public_key: arkhe_chain::public_key(&GENESIS_SECRET).unwrap(),
            mldsa_public_key: Some(mldsa_public(&GENESIS_MLDSA)),
        },
        arkhe_chain::Account {
            id: "attacker-node".into(),
            public_key: arkhe_chain::public_key(&ATTACKER_SECRET).unwrap(),
            mldsa_public_key: Some(mldsa_public(&ATTACKER_MLDSA)),
        },
    ]
}

pub fn validators() -> Vec<arkhe_chain::Validator> {
    vec![
        arkhe_chain::Validator {
            id: "validator-a".into(),
            public_key: arkhe_chain::public_key(&SECRET_A).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-b".into(),
            public_key: arkhe_chain::public_key(&SECRET_B).unwrap(),
        },
    ]
}

#[allow(dead_code)]
pub fn peer() -> ArkheNode {
    ArkheNode::new("validator-b", &SECRET_B, validators(), accounts()).unwrap()
}

#[allow(dead_code)]
pub fn outsider() -> ArkheNode {
    let secret = [0x33u8; 32];
    let public_key = arkhe_chain::public_key(&secret).unwrap();
    ArkheNode::new(
        "validator-c",
        &secret,
        vec![arkhe_chain::Validator {
            id: "validator-c".into(),
            public_key,
        }],
        accounts(),
    )
    .unwrap()
}

#[allow(dead_code)]
pub fn sign(block: &mut arkhe_chain::Block) {
    arkhe_chain::sign_proposer(block, &SECRET_A).unwrap();
}

#[allow(dead_code)]
pub fn transfer(nonce: u64, sender: &str, recipient: &str, value: u64) -> Transaction {
    judged(nonce, sender, recipient, value, true, false)
}

#[allow(dead_code)]
pub fn rejected_transfer(nonce: u64, sender: &str, recipient: &str, value: u64) -> Transaction {
    judged(nonce, sender, recipient, value, false, false)
}

#[allow(dead_code)]
pub fn stopped_transfer(nonce: u64, sender: &str, recipient: &str, value: u64) -> Transaction {
    judged(nonce, sender, recipient, value, true, true)
}

fn judged(
    nonce: u64,
    sender: &str,
    recipient: &str,
    value: u64,
    allow: bool,
    emergency_stop: bool,
) -> Transaction {
    let mut bare = Transaction {
        nonce,
        sender: sender.into(),
        recipient: recipient.into(),
        value,
        payload: Vec::new(),
        signature_mldsa: Vec::new(),
        sender_signature: [0u8; 64],
    };
    let seed = match sender {
        "genesis-alloc" => GENESIS_MLDSA,
        "attacker-node" => ATTACKER_MLDSA,
        other => panic!("no test key for {other}"),
    };
    arkhe_chain::sign_mldsa(&mut bare, &seed).unwrap();
    let mut gate = ContainmentGate::new(DevPolicyResolver);
    gate.set_emergency_stop(emergency_stop);
    let source = Source(policy(allow));
    let verdict: DecisionVerdict = gate
        .decide_event(
            bare.subject(),
            EVENT,
            POLICY,
            &resolve(&source, POLICY, EVENT),
        )
        .unwrap();
    if emergency_stop || !allow {
        assert_eq!(verdict.decision, Decision::Reject);
    }
    let mut signed = Transaction {
        payload: verdict.canonical_bytes(),
        ..bare
    };
    sign_for(&mut signed);
    signed
}

fn sign_for(tx: &mut arkhe_chain::Transaction) {
    let secret = match tx.sender.as_str() {
        "genesis-alloc" => GENESIS_SECRET,
        "attacker-node" => ATTACKER_SECRET,
        other => panic!("no test key for {other}"),
    };
    arkhe_chain::sign_sender(tx, &secret).unwrap();
}

#[allow(dead_code)]
pub fn fresh_zero_transfer(index: u16) -> (arkhe_chain::Account, Transaction) {
    let mut seed = [0x91u8; 32];
    seed[..2].copy_from_slice(&index.to_be_bytes());
    let id = format!("m{index}");
    let mut bare = Transaction {
        nonce: 0,
        sender: id.clone(),
        recipient: "bob".into(),
        value: 0,
        payload: Vec::new(),
        signature_mldsa: Vec::new(),
        sender_signature: [0u8; 64],
    };
    let mldsa_public_key = arkhe_chain::sign_mldsa(&mut bare, &seed).unwrap();
    let gate = ContainmentGate::new(DevPolicyResolver);
    let source = Source(policy(true));
    let verdict: DecisionVerdict = gate
        .decide_event(
            bare.subject(),
            EVENT,
            POLICY,
            &resolve(&source, POLICY, EVENT),
        )
        .unwrap();
    let mut signed = Transaction {
        payload: verdict.canonical_bytes(),
        ..bare
    };
    arkhe_chain::sign_sender(&mut signed, &seed).unwrap();
    (
        arkhe_chain::Account {
            id,
            public_key: arkhe_chain::public_key(&seed).unwrap(),
            mldsa_public_key: Some(mldsa_public_key),
        },
        signed,
    )
}

#[allow(dead_code)]
pub fn mldsa_transfer(nonce: u64, sender: &str, recipient: &str, value: u64) -> (Transaction, [u8; arkhe_chain::MLDSA65_PK_LEN]) {
    let mut bare = Transaction {
        nonce,
        sender: sender.into(),
        recipient: recipient.into(),
        value,
        payload: Vec::new(),
        signature_mldsa: Vec::new(),
        sender_signature: [0u8; 64],
    };
    let public = arkhe_chain::sign_mldsa(&mut bare, &[0x66; 32]).unwrap();
    let gate = ContainmentGate::new(DevPolicyResolver);
    let source = Source(policy(true));
    let verdict: DecisionVerdict = gate
        .decide_event(
            bare.subject(),
            EVENT,
            POLICY,
            &resolve(&source, POLICY, EVENT),
        )
        .unwrap();
    assert_eq!(verdict.decision, Decision::Allow);
    let mut signed = Transaction {
        payload: verdict.canonical_bytes(),
        ..bare
    };
    sign_for(&mut signed);
    (signed, public)
}

#[allow(dead_code)]
pub fn rebind(tx: &Transaction) -> Transaction {
    let bare = Transaction {
        payload: Vec::new(),
        sender_signature: [0u8; 64],
        ..tx.clone()
    };
    let gate = ContainmentGate::new(DevPolicyResolver);
    let source = Source(policy(true));
    let verdict = gate
        .decide_event(
            bare.subject(),
            EVENT,
            POLICY,
            &resolve(&source, POLICY, EVENT),
        )
        .unwrap();
    let mut signed = Transaction {
        payload: verdict.canonical_bytes(),
        ..bare
    };
    sign_for(&mut signed);
    signed
}

#[allow(dead_code)]
pub fn mismatched_subject(tx: &Transaction) -> Transaction {
    let mut forged = tx.clone();
    let other = Transaction {
        nonce: tx.nonce.wrapping_add(9),
        sender: tx.sender.clone(),
        recipient: tx.recipient.clone(),
        value: tx.value,
        payload: Vec::new(),
        signature_mldsa: Vec::new(),
        sender_signature: [0u8; 64],
    };
    let gate = ContainmentGate::new(DevPolicyResolver);
    let source = Source(policy(true));
    let verdict = gate
        .decide_event(
            other.subject(),
            EVENT,
            POLICY,
            &resolve(&source, POLICY, EVENT),
        )
        .unwrap();
    forged.payload = verdict.canonical_bytes();
    forged
}
