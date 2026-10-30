use arkhe_pix_receipt::*;
use clap::{Parser, Subcommand};
use ed25519_dalek::SigningKey;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "arkhe-pix")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Verify a signed receipt against a pinned signer key.
    Verify {
        #[arg(long)]
        receipt: PathBuf,
        #[arg(long)]
        signer_hex: String,
    },
    /// Print the JCS canonical bytes (for debugging).
    Canonicalize {
        #[arg(long)]
        receipt: PathBuf,
    },
    /// Emit a fixture (TEST-ONLY, seed [7u8;32]).
    IssueFixture {
        #[arg(long)]
        out: PathBuf,
        #[arg(long, default_value_t = 12_500)]
        amount_cents: u64,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::IssueFixture { out, amount_cents } => {
            let sk = SigningKey::from_bytes(&[7u8; 32]);
            let r = PixReceipt {
                v: 1,
                profile: "arkhe-pix-receipt@1".into(),
                label: "synthetic-poc".into(),
                end_to_end_id: "E12345678202610231500abcdefghijk".into(),
                txid: "abc123def456ghi789jkl000mno".into(),
                amount_cents,
                currency: "BRL".into(),
                settled_at: 1_761_200_000,
                payer: PartyRef {
                    tax_id_kind: TaxIdKind::Cnpj,
                    value: "11222333000181".into(),
                    display_name: None,
                },
                recipient: PartyRef {
                    tax_id_kind: TaxIdKind::Cnpj,
                    value: "99888777000166".into(),
                    display_name: None,
                },
                purpose_hash: Some("aa".repeat(32)),
                passport_digest: Some("bb".repeat(32)),
                metadata: Default::default(),
            };
            let signed = SignedReceipt::sign(r, &sk)?;
            if let Some(parent) = out.parent().filter(|p| !p.as_os_str().is_empty()) {
                std::fs::create_dir_all(parent)?;
            }
            use std::io::Write;
            let mut file = std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&out)?;
            file.write_all(&serde_json::to_vec_pretty(&signed)?)?;
            println!(
                "signer_pub_hex={}",
                hex::encode(sk.verifying_key().to_bytes())
            );
            Ok(())
        }
        Cmd::Verify {
            receipt,
            signer_hex,
        } => {
            let input = read_bounded(&receipt)?;
            let out = arkhe_pix_receipt::verify_receipt_json(&input, &signer_hex);
            let parsed: serde_json::Value = serde_json::from_str(&out)?;
            let code = if parsed["verdict"] == "signature_valid_synthetic" {
                0
            } else {
                1
            };
            println!("{out}");
            std::process::exit(code);
        }
        Cmd::Canonicalize { receipt } => {
            let input = read_bounded(&receipt)?;
            let signed: SignedReceipt = serde_json::from_str(&input)?;
            signed.receipt.validate()?;
            let canonical = serde_jcs::to_vec(&signed.receipt)?;
            println!("{}", hex::encode(&canonical));
            Ok(())
        }
    }
}

fn read_bounded(path: &std::path::Path) -> anyhow::Result<String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(32769)
        .read_to_end(&mut bytes)?;
    anyhow::ensure!(bytes.len() <= 32768, "receipt exceeds 32 KiB");
    Ok(String::from_utf8(bytes)?)
}
