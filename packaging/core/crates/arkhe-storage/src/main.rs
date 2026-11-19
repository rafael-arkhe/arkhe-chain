use arkhe_flow::{read_json, write_json, Secret, Trust};
use arkhe_storage::append;
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "arkhe-storage")]
struct Cli {
    /// Directory that holds chain.json. Created on the first append.
    #[arg(long)]
    dir: PathBuf,
    /// Admission receipt already verified by the caller path inside append.
    #[arg(long)]
    admission: PathBuf,
    /// Storage signing seed. Not required to read the chain back.
    #[arg(long)]
    secret: PathBuf,
    /// Public trust file. The admission must verify against it.
    #[arg(long)]
    trust: PathBuf,
    /// Where to write the commit receipt.
    #[arg(long)]
    out: PathBuf,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let secret: Secret = read_json(&cli.secret)?;
    let trust: Trust = read_json(&cli.trust)?;
    let outcome = append(&cli.dir, &cli.admission, &secret, &trust)?;
    write_json(&cli.out, &outcome.commit)?;
    println!("{} {}", if outcome.replayed { "replay" } else { "append" }, outcome.commit.id);
    Ok(())
}
