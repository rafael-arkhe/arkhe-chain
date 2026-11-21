use arkhe_flow::{
    admission_body, agent_action_body, anchor_body, emit_gate0, ensure_secret_outside_trust_dir,
    generate_secret, load_secret_spec, public_hex, read_json, sha256_hex, sign_body,
    sign_body_with, trust_from_secrets, write_json, FileSigner, Receipt, ReceiptSigner,
};
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "arkhe-flow")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Write a new signing seed. The file is a secret. Do not publish it.
    Keygen { role: String, #[arg(long)] out: PathBuf },
    /// Write a trust file that contains only public keys.
    Trust {
        #[arg(long)]
        purpose: String,
        #[arg(long)]
        flow: PathBuf,
        #[arg(long)]
        storage: PathBuf,
        #[arg(long)]
        anchor: PathBuf,
        #[arg(long)]
        invariant: Option<PathBuf>,
        #[arg(long)]
        out: PathBuf,
    },
    /// Sign an admission receipt for a subject file and a policy file.
    Admit {
        #[arg(long)]
        secret: String,
        #[arg(long)]
        tenant: String,
        #[arg(long)]
        operation: String,
        #[arg(long)]
        subject: PathBuf,
        #[arg(long)]
        policy: PathBuf,
        #[arg(long)]
        out: PathBuf,
    },
    /// Sign an anchor receipt. `none` with `pending` stays inconclusive.
    Anchor {
        #[arg(long)]
        secret: String,
        #[arg(long)]
        commit: PathBuf,
        #[arg(long)]
        transport: String,
        #[arg(long, default_value = "")]
        reference: String,
        #[arg(long)]
        observed: String,
        #[arg(long)]
        out: PathBuf,
    },
    /// Sign an agent-action receipt (always carrying axiom: llm_output_unverified).
    AgentAction {
        #[arg(long)]
        secret: String,
        #[arg(long)]
        plan: PathBuf,
        #[arg(long)]
        output: PathBuf,
        #[arg(long)]
        model: PathBuf,
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        out: PathBuf,
    },
    /// Sign any validated receipt body JSON (e.g. an invariant body produced by an unprivileged runner).
    SignBody {
        #[arg(long)]
        secret: String,
        #[arg(long)]
        body: PathBuf,
        #[arg(long)]
        out: PathBuf,
    },
    /// Local external-signer helper protocol (reads arkhe-signer-request/v1 on stdin, writes arkhe-signer-response/v1 on stdout).
    ExternalSignStdin {
        #[arg(long)]
        secret: String,
    },
    /// Write the public Gate 0 fixture. Seeds stay in the source and are not a production trust root.
    EmitGate0 { #[arg(long)] out: PathBuf },
}

fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Keygen { role, out } => {
            let secret = generate_secret(&role)?;
            write_json(&out, &secret)?;
            println!("{}", public_hex(&secret)?);
        }
        Command::Trust { purpose, flow, storage, anchor, invariant, out } => {
            let mut paths = vec![flow, storage, anchor];
            if let Some(inv) = invariant {
                paths.push(inv);
            }
            for p in &paths {
                ensure_secret_outside_trust_dir(p, &out)?;
            }
            let mut secrets = Vec::with_capacity(paths.len());
            for p in &paths {
                secrets.push(read_json(p)?);
            }
            write_json(&out, &trust_from_secrets(&purpose, &secrets)?)?;
        }
        Command::Admit { secret, tenant, operation, subject, policy, out } => {
            let secret = load_secret_spec(&secret)?;
            let subject_bytes = std::fs::read(subject)?;
            let policy_bytes = std::fs::read(policy)?;
            let receipt = sign_body(
                &secret,
                &admission_body(&tenant, &operation, &sha256_hex(&subject_bytes), &sha256_hex(&policy_bytes))?,
            )?;
            write_json(&out, &receipt)?;
            println!("{}", receipt.id);
        }
        Command::Anchor { secret, commit, transport, reference, observed, out } => {
            let secret = load_secret_spec(&secret)?;
            let commit: Receipt = read_json(&commit)?;
            let receipt = sign_body(&secret, &anchor_body(&commit.id, &transport, &reference, &observed)?)?;
            write_json(&out, &receipt)?;
            println!("{}", receipt.id);
        }
        Command::AgentAction { secret, plan, output, model, agent_id, out } => {
            let signer = FileSigner::from_spec(&secret)?;
            let body = agent_action_body(
                &sha256_hex(&std::fs::read(plan)?),
                &sha256_hex(&std::fs::read(output)?),
                &sha256_hex(&std::fs::read(model)?),
                &agent_id,
            )?;
            let receipt = sign_body_with(&signer, &body)?;
            write_json(&out, &receipt)?;
            println!("{}", receipt.id);
        }
        Command::SignBody { secret, body, out } => {
            let signer = FileSigner::from_spec(&secret)?;
            let body_val: serde_json::Value = read_json(&body)?;
            let receipt = sign_body_with(&signer, &body_val)?;
            write_json(&out, &receipt)?;
            println!("{}", receipt.id);
        }
        Command::ExternalSignStdin { secret } => {
            use std::io::Read;
            let signer = FileSigner::from_spec(&secret)?;
            let mut buf = Vec::new();
            std::io::stdin().read_to_end(&mut buf)?;
            let req: serde_json::Value = serde_json::from_slice(&buf)?;
            if req.get("schema").and_then(|v| v.as_str()) != Some("arkhe-signer-request/v1") {
                anyhow::bail!("request schema is not arkhe-signer-request/v1");
            }
            if req.get("role").and_then(|v| v.as_str()) != Some(signer.role()) {
                anyhow::bail!("request role does not match signer role");
            }
            let preimage_hex = req
                .get("preimage_hex")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow::anyhow!("missing preimage_hex"))?;
            let preimage = hex::decode(preimage_hex)?;
            let sig_hex = signer.sign_preimage(&preimage)?;
            let resp = serde_json::json!({
                "schema": "arkhe-signer-response/v1",
                "signature_hex": sig_hex,
            });
            println!("{}", serde_json::to_string(&resp)?);
        }
        Command::EmitGate0 { out } => {
            emit_gate0(&out)?;
            println!("{}", out.display());
        }
    }
    Ok(())
}
