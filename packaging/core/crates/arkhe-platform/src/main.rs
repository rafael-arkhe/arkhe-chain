use arkhe_platform::{bill, load_seats, observe_sla, reconcile, ObservationRow, PriceBook, Probe, SlaSpec};
use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "arkhe-platform")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Check that a seat file loads and list the active count.
    Seats { #[arg(long)] file: PathBuf },
    /// Sum the file meter into a draft invoice. This does not collect payment.
    Bill {
        #[arg(long)]
        meter: PathBuf,
        #[arg(long)]
        price_book: PathBuf,
        #[arg(long)]
        out: PathBuf,
    },
    /// Compare operator probes with an operator window. COVERED is not a sold SLA.
    Sla {
        #[arg(long)]
        spec: PathBuf,
        #[arg(long)]
        probes: PathBuf,
    },
    /// Reconcile events.jsonl (billing source) against exported provenance_observations rows (P-07).
    /// Exits non-zero when any discrepancy exists.
    Reconcile {
        #[arg(long)]
        meter: PathBuf,
        #[arg(long)]
        observations: PathBuf,
        #[arg(long)]
        from: Option<DateTime<Utc>>,
        #[arg(long)]
        to: Option<DateTime<Utc>>,
    },
}

fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Seats { file } => {
            let seats = load_seats(&file)?;
            let active = seats.seats.iter().filter(|seat| seat.active).count();
            println!("{active} {}", seats.seat_limit);
        }
        Command::Bill { meter, price_book, out } => {
            let book: PriceBook = serde_json::from_slice(&std::fs::read(price_book)?)?;
            let invoice = bill(&meter, &book)?;
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&out, serde_json::to_string_pretty(&invoice)? + "\n")?;
            println!("{} {}", invoice.status, invoice.total_minor);
        }
        Command::Sla { spec, probes } => {
            let spec: SlaSpec = serde_json::from_slice(&std::fs::read(spec)?)?;
            let mut parsed = Vec::new();
            for line in std::fs::read_to_string(probes)?.lines() {
                if line.is_empty() {
                    continue;
                }
                parsed.push(serde_json::from_str::<Probe>(line)?);
            }
            let report = observe_sla(&spec, &parsed)?;
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
        Command::Reconcile { meter, observations, from, to } => {
            let mut rows = Vec::new();
            for line in std::fs::read_to_string(observations)?.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                rows.push(serde_json::from_str::<ObservationRow>(line)?);
            }
            let report = reconcile(&meter, &rows, from, to)?;
            println!("{}", serde_json::to_string_pretty(&report)?);
            if !report.ok {
                std::process::exit(1);
            }
        }
    }
    Ok(())
}
