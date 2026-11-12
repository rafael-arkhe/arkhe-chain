//! Write one signed attestation flow for the local devnet.
//!
//! The list holds a request, a proposal of an artifact, an evaluation, an
//! approval and an execution, each signed by the devnet account that holds
//! that role in `testnet/genesis.txt`. The artifact, the task and the action
//! are hashes of the run number, so each run is a different flow. Nothing is
//! evaluated here: the evaluation says `passed` because the tool writes it.
//!
//! ```text
//! cargo run --example devnet_attest -- flow --genesis testnet/genesis.txt \
//!     --keys testnet/keys --run 1 --out testnet/data/inbox/flow-1.ops
//! cargo run --example devnet_attest -- pubkey testnet/keys/devnet-root.key
//! ```

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use arkhe_chain::{
    encode_attestation_list, genesis_fingerprint, parse_genesis, parse_genesis_grants, parse_secret_hex,
    public_key, sign_attestation, AttestPolicy, Attestation, Claim, ATTEST_AUDIENCE, ATTEST_SCHEME_ED25519,
    ATTEST_VERSION, CHAIN_ID,
};

struct Flow {
    genesis: PathBuf,
    keys: PathBuf,
    run: u64,
    budget: u64,
    cost: u64,
    out: PathBuf,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn secret(path: &Path) -> Result<[u8; 32], String> {
    let text = std::fs::read_to_string(path).map_err(|err| format!("{}: {err}", path.display()))?;
    parse_secret_hex(&text).map_err(|err| format!("{}: {err}", path.display()))
}

fn tagged(tag: &str, run: u64) -> [u8; 32] {
    *blake3::hash(format!("arkhe devnet {tag} {run}").as_bytes()).as_bytes()
}

fn parse_flow(mut args: impl Iterator<Item = String>) -> Option<Flow> {
    let (mut genesis, mut keys, mut run, mut out) = (None, None, None, None);
    let (mut budget, mut cost) = (10u64, 1u64);
    while let Some(flag) = args.next() {
        let text = args.next()?;
        match flag.as_str() {
            "--genesis" => genesis = Some(PathBuf::from(text)),
            "--keys" => keys = Some(PathBuf::from(text)),
            "--run" => run = Some(text.parse().ok()?),
            "--budget" => budget = text.parse().ok()?,
            "--cost" => cost = text.parse().ok()?,
            "--out" => out = Some(PathBuf::from(text)),
            _ => return None,
        }
    }
    Some(Flow {
        genesis: genesis?,
        keys: keys?,
        run: run?,
        budget,
        cost,
        out: out?,
    })
}

fn flow(args: &Flow) -> Result<(), String> {
    let text = std::fs::read_to_string(&args.genesis).map_err(|err| format!("{}: {err}", args.genesis.display()))?;
    let genesis = genesis_fingerprint(&text).map_err(|err| err.to_string())?.hash;
    let (_, accounts) = parse_genesis(&text).map_err(|err| err.to_string())?;
    let policy = AttestPolicy {
        keys: accounts.into_iter().map(|account| (account.id, account.public_key)).collect(),
        grants: parse_genesis_grants(&text).map_err(|err| err.to_string())?,
    };
    let signed = |role: &str, claim: Claim| -> Result<Attestation, String> {
        let signer = format!("devnet-{role}");
        let mut att = Attestation {
            version: ATTEST_VERSION,
            scheme: ATTEST_SCHEME_ED25519,
            chain_id: CHAIN_ID.to_string(),
            genesis,
            audience: ATTEST_AUDIENCE.to_string(),
            nonce: tagged(&format!("nonce {role}"), args.run),
            not_before: 0,
            expires: 1_000_000_000,
            claim,
            signature: [0u8; 64],
            signer: signer.clone(),
        };
        let key = secret(&args.keys.join(format!("{signer}.key")))?;
        sign_attestation(&mut att, &key).map_err(|err| err.to_string())?;
        Ok(att)
    };
    let artifact = tagged("artifact", args.run);
    let action = tagged("action", args.run);
    let request = signed("requester", Claim::Request { task: tagged("task", args.run), budget: args.budget })?;
    let proposal = signed("author", Claim::Artifact { request: request.id(), artifact })?;
    let evaluation = signed(
        "evaluator",
        Claim::Evaluation {
            artifact,
            suite: tagged("suite", 0),
            environment: tagged("environment", 0),
            evidence: tagged("evidence", args.run),
            passed: true,
        },
    )?;
    let approval = signed(
        "approver",
        Claim::Approval {
            action,
            artifact,
            proposal: proposal.id(),
            evaluation: evaluation.id(),
            policy: policy.digest(),
            cost: args.cost,
        },
    )?;
    let execution = signed("executor", Claim::Execution { approval: approval.id(), action, artifact })?;
    println!("request {}", hex(&request.id()));
    println!("approval {}", hex(&approval.id()));
    println!("execution {}", hex(&execution.id()));
    let list = [request, proposal, evaluation, approval, execution];
    let bytes = encode_attestation_list(&list).map_err(|err| err.to_string())?;
    let mut partial = args.out.clone().into_os_string();
    partial.push(".partial");
    let partial = PathBuf::from(partial);
    std::fs::write(&partial, bytes).map_err(|err| format!("{}: {err}", partial.display()))?;
    std::fs::rename(&partial, &args.out).map_err(|err| format!("{}: {err}", args.out.display()))?;
    println!("wrote {} attestation(s) to {}", list.len(), args.out.display());
    Ok(())
}

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let outcome = match args.next().as_deref() {
        Some("pubkey") => match (args.next(), args.next()) {
            (Some(path), None) => secret(Path::new(&path))
                .and_then(|key| public_key(&key).map_err(|err| err.to_string()))
                .map(|public| println!("{}", hex(&public))),
            _ => Err(String::new()),
        },
        Some("flow") => match parse_flow(args) {
            Some(parsed) => flow(&parsed),
            None => Err(String::new()),
        },
        _ => Err(String::new()),
    };
    match outcome {
        Ok(()) => ExitCode::SUCCESS,
        Err(text) if text.is_empty() => {
            eprintln!(
                "usage: devnet_attest pubkey <key file>\n       devnet_attest flow --genesis <file> --keys <dir> \
                 --run <n> [--budget <n>] [--cost <n>] --out <file>"
            );
            ExitCode::from(2)
        }
        Err(text) => {
            eprintln!("{text}");
            ExitCode::from(1)
        }
    }
}
