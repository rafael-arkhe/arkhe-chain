use arkhe_anonymize::{evaluate_no_direct_identifier_body, release, Status};
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "arkhe-anonymize")]
struct Cli {
    #[arg(long)]
    input: PathBuf,
    #[arg(long)]
    output: Option<PathBuf>,
    #[arg(long)]
    report: Option<PathBuf>,
    /// P-06 unprivileged invariant runner mode: evaluate `invariant.no-direct-identifier`
    /// over `--input` and emit an unsigned `invariant` receipt body JSON (never signs).
    #[arg(long)]
    action_id: Option<String>,
    #[arg(long)]
    body_out: Option<PathBuf>,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    if let Some(action_id) = cli.action_id {
        let bytes = std::fs::read(&cli.input)?;
        let body = evaluate_no_direct_identifier_body(&action_id, &bytes)?;
        let rendered = serde_json::to_string_pretty(&body)? + "\n";
        if let Some(out) = cli.body_out {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&out, &rendered)?;
        } else {
            print!("{rendered}");
        }
        return Ok(());
    }

    let report_path = cli
        .report
        .ok_or_else(|| anyhow::anyhow!("--report is required outside --action-id mode"))?;
    let output_path = cli
        .output
        .ok_or_else(|| anyhow::anyhow!("--output is required outside --action-id mode"))?;

    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(&cli.input)?)?;
    let outcome = release(&value);
    if let Some(parent) = report_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        &report_path,
        serde_json::to_string_pretty(&outcome.report)? + "\n",
    )?;
    match outcome.status {
        Status::Released => {
            if let Some(parent) = output_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(
                &output_path,
                serde_json::to_string_pretty(outcome.value.as_ref().unwrap())? + "\n",
            )?;
            println!("RELEASED");
            Ok(())
        }
        Status::Refused => {
            println!("REFUSED");
            std::process::exit(1);
        }
    }
}
