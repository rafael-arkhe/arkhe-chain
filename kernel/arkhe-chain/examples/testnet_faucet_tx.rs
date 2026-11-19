//! Emite uma transferência assinada (faucet) para a caixa `--inbox`.
//! Lê as chaves de `testnet/local/keys/` e grava
//! `testnet/local/inbox/<nome>.txs` com rename atómico.
//!
//! ```text
//! cargo run -p arkhe-chain --example testnet_faucet_tx -- 0 alice 100
//! ```

use std::path::{Path, PathBuf};

use arkhe_chain::{
    encode_tx_list, parse_secret_hex, sign_mldsa, sign_sender, Transaction, GENESIS_ACCOUNT,
};
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

fn main() {
    let mut args = std::env::args().skip(1);
    let nonce: u64 = args.next().expect("nonce").parse().expect("nonce u64");
    let recipient = args.next().expect("recipient");
    let value: u64 = args.next().expect("value").parse().expect("value u64");
    let out = args.next().map(PathBuf::from).unwrap_or_else(|| {
        network_root()
            .join("local")
            .join("inbox")
            .join(format!("faucet-{nonce}-to-{recipient}-{value}.txs"))
    });

    let keys = network_root().join("local").join("keys");
    let ed = read_secret(&keys.join("genesis-alloc.ed25519.key"));
    let mldsa = read_secret(&keys.join("genesis-alloc.mldsa.seed"));

    let mut bare = Transaction {
        nonce,
        sender: GENESIS_ACCOUNT.into(),
        recipient: recipient.clone(),
        value,
        payload: Vec::new(),
        signature_mldsa: Vec::new(),
        sender_signature: [0u8; 64],
    };
    sign_mldsa(&mut bare, &mldsa).expect("mldsa");
    let policy = EventPolicy {
        policy_id: POLICY.into(),
        version: 1,
        rules: vec![EventRule {
            rule_id: "transfer".into(),
            event_type: EVENT.into(),
            action: RuleAction::Allow,
        }],
    };
    let source = Source(policy);
    let gate = ContainmentGate::new(DevPolicyResolver);
    let verdict: DecisionVerdict = gate
        .decide_event(
            bare.subject(),
            EVENT,
            POLICY,
            &resolve(&source, POLICY, EVENT),
        )
        .expect("verdict");
    assert_eq!(verdict.decision, Decision::Allow);
    let mut signed = Transaction {
        payload: verdict.canonical_bytes(),
        ..bare
    };
    sign_sender(&mut signed, &ed).expect("ed25519");
    let bytes = encode_tx_list(&[signed]).expect("encode");
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).expect("out dir");
    }
    // Rename into place so the sealer never reads a half-written *.txs.
    let tmp = out.with_extension("partial");
    std::fs::write(&tmp, bytes).expect("write tx partial");
    std::fs::rename(&tmp, &out).expect("rename into inbox");
    println!("tx={}", out.display());
    println!("from={GENESIS_ACCOUNT} to={recipient} value={value} nonce={nonce}");
}

fn network_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("testnet")
}

fn read_secret(path: &Path) -> [u8; 32] {
    let text = std::fs::read_to_string(path)
        .unwrap_or_else(|err| panic!("missing {}: {err} (rode testnet_gen_keys)", path.display()));
    parse_secret_hex(&text).expect("secret hex")
}
