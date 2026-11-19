use arkhe_flow::{
    admission_body, anchor_body, emit_gate0, generate_secret, public_hex, read_json, sha256_hex,
    sign_body, trust_from_secrets, write_json, Receipt, Secret,
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
        out: PathBuf,
    },
    /// Sign an admission receipt for a subject file and a policy file.
    Admit {
        #[arg(long)]
        secret: PathBuf,
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
        secret: PathBuf,
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
        Command::Trust { purpose, flow, storage, anchor, out } => {
            let secrets = vec![read_json(&flow)?, read_json(&storage)?, read_json(&anchor)?];
            write_json(&out, &trust_from_secrets(&purpose, &secrets)?)?;
        }
        Command::Admit { secret, tenant, operation, subject, policy, out } => {
            let secret: Secret = read_json(&secret)?;
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
            let secret: Secret = read_json(&secret)?;
            let commit: Receipt = read_json(&commit)?;
            let receipt = sign_body(&secret, &anchor_body(&commit.id, &transport, &reference, &observed)?)?;
            write_json(&out, &receipt)?;
            println!("{}", receipt.id);
        }
        Command::EmitGate0 { out } => {
            emit_gate0(&out)?;
            println!("{}", out.display());
        }
    }
    Ok(())
}
