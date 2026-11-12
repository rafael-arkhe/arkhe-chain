//! Write a transaction list for the local devnet.
//!
//! The list holds `--count` transfers from one account, with consecutive
//! nonces starting at `--nonce`. Each payload is an allow verdict that this
//! tool issues itself, from a one-rule policy written below, through the dev
//! policy resolver. No external policy service is asked. That is acceptable
//! for a local devnet and for nothing else.
//!
//! ```text
//! cargo run --example devnet_tx -- --key testnet/keys/faucet.key \
//!     --mldsa-seed testnet/keys/faucet_mldsa.seed --sender genesis-alloc \
//!     --recipient bob --value 10 --nonce 0 --out testnet/data/inbox/0001.txs
//! ```
//!
//! The file is written under a temporary name and renamed, so a node that
//! watches the directory never reads half a list.

use std::path::PathBuf;
use std::process::ExitCode;

use arkhe_chain::{encode_tx_list, parse_secret_hex, sign_mldsa, sign_sender, Transaction};
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

struct Args {
    key: PathBuf,
    mldsa_seed: PathBuf,
    sender: String,
    recipient: String,
    value: u64,
    nonce: u64,
    count: u64,
    out: PathBuf,
}

fn parse() -> Option<Args> {
    let mut args = std::env::args().skip(1);
    let (mut key, mut seed, mut sender, mut recipient) = (None, None, None, None);
    let (mut value, mut nonce, mut count, mut out) = (None, None, 1u64, None);
    while let Some(flag) = args.next() {
        let text = args.next()?;
        match flag.as_str() {
            "--key" => key = Some(PathBuf::from(text)),
            "--mldsa-seed" => seed = Some(PathBuf::from(text)),
            "--sender" => sender = Some(text),
            "--recipient" => recipient = Some(text),
            "--value" => value = Some(text.parse().ok()?),
            "--nonce" => nonce = Some(text.parse().ok()?),
            "--count" => count = text.parse().ok()?,
            "--out" => out = Some(PathBuf::from(text)),
            _ => return None,
        }
    }
    if count == 0 || count > 250 {
        return None;
    }
    Some(Args {
        key: key?,
        mldsa_seed: seed?,
        sender: sender?,
        recipient: recipient?,
        value: value?,
        nonce: nonce?,
        count,
        out: out?,
    })
}

fn secret(path: &PathBuf) -> Result<[u8; 32], String> {
    let text = std::fs::read_to_string(path).map_err(|err| format!("{}: {err}", path.display()))?;
    parse_secret_hex(&text).map_err(|err| format!("{}: {err}", path.display()))
}

fn transfer(args: &Args, nonce: u64, key: &[u8; 32], seed: &[u8; 32]) -> Result<Transaction, String> {
    let mut tx = Transaction {
        nonce,
        sender: args.sender.clone(),
        recipient: args.recipient.clone(),
        value: args.value,
        payload: Vec::new(),
        signature_mldsa: Vec::new(),
        sender_signature: [0u8; 64],
    };
    sign_mldsa(&mut tx, seed).map_err(|err| err.to_string())?;
    let source = Source(EventPolicy {
        policy_id: POLICY.into(),
        version: 1,
        rules: vec![EventRule {
            rule_id: "transfer".into(),
            event_type: EVENT.into(),
            action: RuleAction::Allow,
        }],
    });
    let gate = ContainmentGate::new(DevPolicyResolver);
    let verdict: DecisionVerdict = gate
        .decide_event(tx.subject(), EVENT, POLICY, &resolve(&source, POLICY, EVENT))
        .map_err(|err| format!("verdict: {err:?}"))?;
    if verdict.decision != Decision::Allow {
        return Err("verdict: not allow".into());
    }
    tx.payload = verdict.canonical_bytes();
    sign_sender(&mut tx, key).map_err(|err| err.to_string())?;
    Ok(tx)
}

fn run(args: &Args) -> Result<(), String> {
    let key = secret(&args.key)?;
    let seed = secret(&args.mldsa_seed)?;
    let mut txs = Vec::new();
    for offset in 0..args.count {
        let nonce = args.nonce.checked_add(offset).ok_or("nonce overflow")?;
        txs.push(transfer(args, nonce, &key, &seed)?);
    }
    let bytes = encode_tx_list(&txs).map_err(|err| err.to_string())?;
    let mut partial = args.out.clone().into_os_string();
    partial.push(".partial");
    let partial = PathBuf::from(partial);
    std::fs::write(&partial, bytes).map_err(|err| format!("{}: {err}", partial.display()))?;
    std::fs::rename(&partial, &args.out).map_err(|err| format!("{}: {err}", args.out.display()))?;
    println!("wrote {} transaction(s) to {}", txs.len(), args.out.display());
    Ok(())
}

fn main() -> ExitCode {
    let Some(args) = parse() else {
        eprintln!(
            "usage: devnet_tx --key <file> --mldsa-seed <file> --sender <id> --recipient <id> \
             --value <n> --nonce <n> [--count <1..250>] --out <file>"
        );
        return ExitCode::from(2);
    };
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("{err}");
            ExitCode::from(1)
        }
    }
}
