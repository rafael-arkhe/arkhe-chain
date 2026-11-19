use arkhe_anonymize::{release, Status};
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "arkhe-anonymize")]
struct Cli {
    #[arg(long)]
    input: PathBuf,
    #[arg(long)]
    output: PathBuf,
    #[arg(long)]
    report: PathBuf,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(&cli.input)?)?;
    let outcome = release(&value);
    if let Some(parent) = cli.report.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&cli.report, serde_json::to_string_pretty(&outcome.report)? + "\n")?;
    match outcome.status {
        Status::Released => {
            if let Some(parent) = cli.output.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&cli.output, serde_json::to_string_pretty(outcome.value.as_ref().unwrap())? + "\n")?;
            println!("RELEASED");
            Ok(())
        }
        Status::Refused => {
            println!("REFUSED");
            std::process::exit(1);
        }
    }
}
