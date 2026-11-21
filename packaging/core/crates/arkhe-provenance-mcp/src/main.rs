use arkhe_flow::{read_json, sha256_hex, AnchorCheckpoint, AnchorInclusionProof, Receipt, Trust};
use arkhe_provenance_mcp::{
    connect_if_configured, judge, router_with, serve_stdio, AppState, TenantRosters, VerifyRequest,
};
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "arkhe-provenance-mcp")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(clap::Args)]
struct VerifyArgs {
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
    #[arg(long)]
    artifact: Option<PathBuf>,
    #[arg(long)]
    model: Option<PathBuf>,
    #[arg(long)]
    data: Option<PathBuf>,
    #[arg(long)]
    pipeline: Option<PathBuf>,
    #[arg(long)]
    plan: Option<PathBuf>,
    #[arg(long)]
    output: Option<PathBuf>,
    /// An agent-action receipt, for a verdict that claims to be about it.
    #[arg(long)]
    action: Option<PathBuf>,
    /// A signed invariant verdict offered to discharge the axiom.
    #[arg(long)]
    invariant: Option<PathBuf>,
    /// The invariant id you require. Without it nothing discharges.
    #[arg(long)]
    expect_invariant: Option<String>,
    /// Auditor-configured transparency log checkpoint for anchor verification (P-02).
    #[arg(long)]
    anchor_checkpoint: Option<PathBuf>,
    /// RFC 6962 inclusion proof for an anchor receipt (P-02).
    #[arg(long)]
    anchor_inclusion: Option<PathBuf>,
}

#[derive(Subcommand)]
enum Command {
    /// Recompute one receipt. This command does not open PostgreSQL.
    ///
    /// Files are hashed; receipts are read for their id. `--artifact` is the
    /// bytes storage committed and `--output` the bytes the action says it
    /// produced: for one artifact they are the same file, and passing both is
    /// what makes the two claims meet rather than be assumed equal.
    Verify(Box<VerifyArgs>),
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
        Command::Verify(args) => {
            let VerifyArgs {
                receipt,
                trust,
                expect_purpose,
                subject,
                policy,
                admission,
                commit,
                artifact,
                model,
                data,
                pipeline,
                plan,
                output,
                action,
                invariant,
                expect_invariant,
                anchor_checkpoint,
                anchor_inclusion,
            } = *args;
            let receipt: Receipt = read_json(&receipt)?;
            let trust: Trust = read_json(&trust)?;
            fn hash_of(path: Option<PathBuf>) -> anyhow::Result<Option<String>> {
                match path {
                    Some(path) => Ok(Some(sha256_hex(&std::fs::read(path)?))),
                    None => Ok(None),
                }
            }
            fn id_of(path: Option<PathBuf>) -> anyhow::Result<Option<String>> {
                match path {
                    Some(path) => Ok(Some(read_json::<Receipt>(&path)?.id)),
                    None => Ok(None),
                }
            }
            let invariant = match invariant {
                Some(path) => Some(read_json::<Receipt>(&path)?),
                None => None,
            };
            let anchor_checkpoint = match anchor_checkpoint {
                Some(path) => Some(read_json::<AnchorCheckpoint>(&path)?),
                None => None,
            };
            let anchor_inclusion = match anchor_inclusion {
                Some(path) => Some(read_json::<AnchorInclusionProof>(&path)?),
                None => None,
            };
            let verdict = judge(&VerifyRequest {
                receipt,
                trust,
                expect_purpose: Some(expect_purpose),
                tenant: None,
                subject_sha256: hash_of(subject)?,
                policy_sha256: hash_of(policy)?,
                admission_id: id_of(admission)?,
                commit_id: id_of(commit)?,
                artifact_sha256: hash_of(artifact)?,
                model_sha256: hash_of(model)?,
                data_sha256: hash_of(data)?,
                pipeline_sha256: hash_of(pipeline)?,
                plan_sha256: hash_of(plan)?,
                output_sha256: hash_of(output)?,
                action_id: id_of(action)?,
                invariant,
                expect_invariant,
                anchor_checkpoint,
                anchor_inclusion,
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
            let caller_auth = match std::env::var("ARKHE_CALLER_AUTH_KEY") {
                Ok(path) if !path.is_empty() => {
                    Some(arkhe_platform::load_caller_auth_key(std::path::Path::new(&path))?)
                }
                _ => None,
            };
            let tenant_rosters = match std::env::var("ARKHE_TENANT_ROSTERS") {
                Ok(path) if !path.is_empty() => {
                    Some(TenantRosters::load(std::path::Path::new(&path))?)
                }
                _ => None,
            };
            let postgres = if pool.is_some() { "ready" } else { "absent" };
            let seats = if platform.is_some() { "enforced" } else { "absent" };
            let auth = if caller_auth.is_some() { "operator-signed-token" } else { "absent" };
            let rosters = if tenant_rosters.is_some() { "enforced" } else { "absent" };
            let listener = tokio::net::TcpListener::bind(&bind).await?;
            tracing::info!(%bind, postgres, seats, auth, rosters, "verification endpoint listening");
            axum::serve(
                listener,
                router_with(AppState {
                    pool,
                    platform,
                    caller_auth,
                    tenant_rosters,
                }),
            )
            .await?;
        }
        Command::Mcp => serve_stdio()?,
    }
    Ok(())
}
