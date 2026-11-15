//! Escreve um fluxo de atestados assinado na caixa `--inbox` do sealer.
//!
//! Quatro declarações: pedido, artefacto, avaliação e aprovação. Sem
//! `Claim::Execution` / papel Executor — no crate local a execução é
//! `AttestOp::Execute` via [`arkhe_chain::ArkheNode::submit_execution`] no
//! processo que sela, não um quinto atestado na caixa.
//!
//! ```text
//! cargo run -p arkhe-chain --example testnet_attest -- 1
//! ```

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use arkhe_chain::{
    encode_attestation_list, genesis_fingerprint, parse_genesis, parse_genesis_grants,
    parse_secret_hex, sign_attestation, AttestPolicy, Attestation, Claim, ATTEST_AUDIENCE,
    ATTEST_SCHEME_ED25519, ATTEST_VERSION, CHAIN_ID,
};

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let run: u64 = match args.next().and_then(|text| text.parse().ok()) {
        Some(run) => run,
        None => {
            eprintln!("usage: testnet_attest <run> [--out <file>]");
            return ExitCode::from(2);
        }
    };
    let out = match args.next().as_deref() {
        Some("--out") => match args.next() {
            Some(path) => PathBuf::from(path),
            None => {
                eprintln!("usage: testnet_attest <run> [--out <file>]");
                return ExitCode::from(2);
            }
        },
        Some(_) => {
            eprintln!("usage: testnet_attest <run> [--out <file>]");
            return ExitCode::from(2);
        }
        None => network_root()
            .join("local")
            .join("inbox")
            .join(format!("flow-{run}.ops")),
    };
    match write_flow(run, &out) {
        Ok(()) => ExitCode::SUCCESS,
        Err(text) => {
            eprintln!("{text}");
            ExitCode::from(1)
        }
    }
}

fn write_flow(run: u64, out: &Path) -> Result<(), String> {
    let local = network_root().join("local");
    let genesis_path = local.join("genesis.txt");
    let keys = local.join("keys");
    let text = std::fs::read_to_string(&genesis_path)
        .map_err(|err| format!("{}: {err} (rode testnet_gen_keys)", genesis_path.display()))?;
    let genesis = genesis_fingerprint(&text)
        .map_err(|err| err.to_string())?
        .hash;
    let (_, accounts) = parse_genesis(&text).map_err(|err| err.to_string())?;
    let policy = AttestPolicy {
        keys: accounts
            .into_iter()
            .map(|account| (account.id, account.public_key))
            .collect(),
        grants: parse_genesis_grants(&text).map_err(|err| err.to_string())?,
    };

    let signed = |role: &str, claim: Claim| -> Result<Attestation, String> {
        let signer = format!("testnet-{role}");
        let mut att = Attestation {
            version: ATTEST_VERSION,
            scheme: ATTEST_SCHEME_ED25519,
            chain_id: CHAIN_ID.to_string(),
            genesis,
            audience: ATTEST_AUDIENCE.to_string(),
            nonce: tagged(&format!("nonce {role}"), run),
            not_before: 0,
            expires: 1_000_000_000,
            claim,
            signature: [0u8; 64],
            signer: signer.clone(),
        };
        let key = secret(&keys.join(format!("{signer}.ed25519.key")))?;
        sign_attestation(&mut att, &key).map_err(|err| err.to_string())?;
        Ok(att)
    };

    let artifact = tagged("artifact", run);
    let action = tagged("action", run);
    let request = signed(
        "requester",
        Claim::Request {
            task: tagged("task", run),
            budget: 10,
        },
    )?;
    let proposal = signed(
        "author",
        Claim::Artifact {
            request: request.id(),
            artifact,
        },
    )?;
    let evaluation = signed(
        "evaluator",
        Claim::Evaluation {
            artifact,
            suite: tagged("suite", 0),
            environment: tagged("environment", 0),
            evidence: tagged("evidence", run),
            passed: true,
        },
    )?;
    let approval = signed(
        "approver",
        Claim::Approval {
            action,
            artifact,
            evaluation: evaluation.id(),
            policy: policy.digest(),
        },
    )?;
    println!("request {}", hex(&request.id()));
    println!("proposal {}", hex(&proposal.id()));
    println!("approval {}", hex(&approval.id()));
    println!("action {}", hex(&action));
    println!("artifact {}", hex(&artifact));
    let list = [request, proposal, evaluation, approval];
    let bytes = encode_attestation_list(&list).map_err(|err| err.to_string())?;
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let tmp = out.with_extension("partial");
    std::fs::write(&tmp, bytes).map_err(|err| format!("{}: {err}", tmp.display()))?;
    std::fs::rename(&tmp, out).map_err(|err| format!("{}: {err}", out.display()))?;
    println!("wrote {} attestation(s) to {}", list.len(), out.display());
    Ok(())
}

fn network_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("testnet")
}

fn secret(path: &Path) -> Result<[u8; 32], String> {
    let text = std::fs::read_to_string(path).map_err(|err| format!("{}: {err}", path.display()))?;
    parse_secret_hex(&text).map_err(|err| format!("{}: {err}", path.display()))
}

fn tagged(tag: &str, run: u64) -> [u8; 32] {
    *blake3::hash(format!("arkhe testnet {tag} {run}").as_bytes()).as_bytes()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
