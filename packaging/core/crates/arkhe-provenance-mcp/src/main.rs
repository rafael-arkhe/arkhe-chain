use arkhe_flow::{read_json, sha256_hex, Receipt, Trust};
use arkhe_provenance_mcp::{connect_if_configured, judge, router_with, serve_stdio, AppState, VerifyRequest};
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "arkhe-provenance-mcp")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Recompute one receipt. This command does not open PostgreSQL.
    Verify {
        #[arg(long)]
        receipt: PathBuf,
        #[arg(long)]
        trust: PathBuf,
        #[arg(long)]
        expect_purpose: String,
        #[arg(long)]
        subject: Option<PathBuf>,
        #[arg(long)]
        policy: Option<PathBuf>,
        #[arg(long)]
        admission: Option<PathBuf>,
        #[arg(long)]
        commit: Option<PathBuf>,
    },
    /// Serve GET /health and POST /v1/verify.
    /// DATABASE_URL is optional. When it is set, the process connects and
    /// creates provenance_observations before accepting requests.
    Serve {
        #[arg(long, default_value = "127.0.0.1:8080")]
        bind: String,
    },
    /// Speak MCP on stdin/stdout. One tool, verify_receipt. No database.
    Mcp,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Verify { receipt, trust, expect_purpose, subject, policy, admission, commit } => {
            let receipt: Receipt = read_json(&receipt)?;
            let trust: Trust = read_json(&trust)?;
            let subject_sha256 = match subject {
                Some(path) => Some(sha256_hex(&std::fs::read(path)?)),
                None => None,
            };
            let policy_sha256 = match policy {
                Some(path) => Some(sha256_hex(&std::fs::read(path)?)),
                None => None,
            };
            let admission_id = match admission {
                Some(path) => Some(read_json::<Receipt>(&path)?.id),
                None => None,
            };
            let commit_id = match commit {
                Some(path) => Some(read_json::<Receipt>(&path)?.id),
                None => None,
            };
            let verdict = judge(&VerifyRequest {
                receipt,
                trust,
                expect_purpose: Some(expect_purpose),
                subject_sha256,
                policy_sha256,
                admission_id,
                commit_id,
            });
            println!("{}", serde_json::to_string_pretty(&verdict)?);
            std::process::exit(verdict.exit_code());
        }
        Command::Serve { bind } => {
            tracing_subscriber::fmt()
                .with_env_filter(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| "info,arkhe_provenance_mcp=info".into()),
                )
                .init();
            let pool = connect_if_configured().await?;
            let platform = match std::env::var("ARKHE_SEATS") {
                Ok(path) if !path.is_empty() => {
                    let meter = std::env::var("ARKHE_METER_DIR")
                        .map_err(|_| anyhow::anyhow!("ARKHE_METER_DIR is required when ARKHE_SEATS is set"))?;
                    Some(arkhe_platform::Platform {
                        seats: arkhe_platform::load_seats(std::path::Path::new(&path))?,
                        meter_dir: std::path::PathBuf::from(meter),
                    })
                }
                _ => None,
            };
            let postgres = if pool.is_some() { "ready" } else { "absent" };
            let seats = if platform.is_some() { "enforced" } else { "absent" };
            let listener = tokio::net::TcpListener::bind(&bind).await?;
            tracing::info!(%bind, postgres, seats, "verification endpoint listening");
            axum::serve(listener, router_with(AppState { pool, platform })).await?;
        }
        Command::Mcp => serve_stdio()?,
    }
    Ok(())
}
