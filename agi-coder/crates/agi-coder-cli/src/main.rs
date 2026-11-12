use agi_coder_core::*;
use agi_coder_kernel::{ContainmentGate, InMemoryEvidenceStore, Policy};
use agi_coder_wormgraph::{verify_inclusion, InclusionProof, WormGraph};
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = env!("CARGO_BIN_NAME"),
    version,
    about = "Local evidence-gated operator. This binary has no execution authority."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Print the capability catalog. This does not re-run the suite or grant authority.
    Status,
    /// Print the MCP stdio launch entry. This does not start the server.
    Mcp,
    /// Print the pending capability reports. This does not perform those capabilities.
    Pending,
    /// Write the four gap observations. Weights, database, editor, and CI stay unproven.
    Observe {
        /// Workspace used to look for engine.local.json and a git remote.
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
        /// Local directory. A URL is rejected.
        #[arg(long)]
        output: PathBuf,
    },
    /// Print an ed25519 evaluator signature for a 174-byte receipt. The seed must not be the process seed.
    AttestReceipt { seed: String, receipt: String },
    /// Serve the loopback operator page for status, plan, and the offline demo.
    Ui {
        /// Numeric loopback socket, for example 127.0.0.1:8791.
        #[arg(long, default_value = "127.0.0.1:8791")]
        bind: String,
    },
    /// Generate an unverified proposal through a trusted DeepInfer process bridge.
    Infer {
        #[arg(long)]
        bridge_config: PathBuf,
        #[arg(long)]
        request: PathBuf,
    },
    /// Run trusted test commands against prepared baseline and mutant directories.
    VerifySpec { manifest: PathBuf },
    /// Build a deterministic dependency plan; does not claim to implement the goal.
    Plan { goal: String },
    /// Step the local interactive frame. This does not score ARC-AGI-3.
    Arc3 {
        /// Comma-separated actions: 1, 2, 3, 4, 5, undo, click:x:y, or reset.
        #[arg(long)]
        actions: String,
    },
    /// Plan the five stages against a workspace and write a local manifest after tests pass.
    Release {
        #[arg(long, default_value = "Build agi.exe")]
        goal: String,
        /// Workspace that contains design/DESIGN.md and target/debug/agi.exe.
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
        /// Local directory. A URL is rejected.
        #[arg(long)]
        output: PathBuf,
    },
    Run {
        #[arg(long, required = true)]
        demo: bool,
        #[arg(long, default_value = "Demonstrate evidence-gated execution")]
        goal: String,
    },
    /// Verify a signed WER against a separate, trusted local intent and policy.
    Verify {
        #[arg(long)]
        record: PathBuf,
        #[arg(long)]
        intent: PathBuf,
        #[arg(long)]
        policy: PathBuf,
        #[arg(long)]
        now: i64,
    },
    /// Compute a local MMR root and proofs; this does not contact a transparency log.
    Anchor { records: Vec<ContentHash> },
    /// Verify a portable MMR inclusion proof against an independently trusted root.
    Mmr {
        #[arg(long)]
        value: ContentHash,
        #[arg(long)]
        root: ContentHash,
        #[arg(long)]
        proof: PathBuf,
    },
    /// Report an explicitly provided integer USD cost ledger.
    Cost { ledger: PathBuf },
}

fn read<T: serde::de::DeserializeOwned>(path: &PathBuf) -> anyhow::Result<T> {
    Ok(serde_json::from_slice(&std::fs::read(path)?)?)
}

fn print(value: &impl serde::Serialize) -> anyhow::Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Status => print(&agi_coder_cli::ops::status())?,
        Command::Mcp => print(&agi_coder_cli::ops::mcp_entry())?,
        Command::Pending => print(&agi_coder_cli::pending::pending())?,
        Command::Observe { workspace, output } => print(
            &agi_coder_cli::observe::write_observations(&workspace, &output)
                .map_err(anyhow::Error::msg)?,
        )?,
        Command::AttestReceipt { seed, receipt } => print(
            &agi_coder_cli::cockpit::Session::attest(&seed, &receipt)
                .map_err(anyhow::Error::msg)?,
        )?,
        Command::Ui { bind } => {
            let addr = agi_coder_cli::serve::parse_loopback(&bind).map_err(anyhow::Error::msg)?;
            agi_coder_cli::serve::serve(addr)?;
        }
        Command::Infer {
            bridge_config,
            request,
        } => {
            let config: agi_coder_inference::BridgeConfig = read(&bridge_config)?;
            let request: agi_coder_inference::InferenceRequest = read(&request)?;
            let client = agi_coder_inference::DeepInferClient::new(config)?;
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()?;
            print(&runtime.block_on(client.generate(&request))?)?;
        }
        Command::VerifySpec { manifest } => {
            let campaign: agi_coder_verification::ProcessCampaign = read(&manifest)?;
            let report = campaign.run()?;
            print(&report)?;
            anyhow::ensure!(report.accepted, "mutation verification did not meet policy");
        }
        Command::Plan { goal } => {
            print(&agi_coder_cli::ops::plan(&goal).map_err(anyhow::Error::msg)?)?
        }
        Command::Arc3 { actions } => {
            let path = std::path::Path::new("observations/local-seek.json");
            let mut session = agi_coder_cli::cockpit::Session::new();
            session
                .load_arc3(path)
                .map_err(anyhow::Error::msg)?;
            let mut last = session.view();
            for action in actions.split(',').map(str::trim).filter(|item| !item.is_empty()) {
                let (name, x, y) = if let Some(rest) = action.strip_prefix("click:") {
                    let mut parts = rest.split(':');
                    let x = parts
                        .next()
                        .and_then(|value| value.parse::<u8>().ok())
                        .ok_or_else(|| anyhow::anyhow!("click needs x:y"))?;
                    let y = parts
                        .next()
                        .and_then(|value| value.parse::<u8>().ok())
                        .ok_or_else(|| anyhow::anyhow!("click needs x:y"))?;
                    ("click".to_string(), Some(x), Some(y))
                } else {
                    (action.to_string(), None, None)
                };
                let body = serde_json::to_vec(&serde_json::json!({"action": name, "x": x, "y": y}))?;
                last = session
                    .run_arc3(&body)
                    .map_err(anyhow::Error::msg)?;
            }
            session.save_arc3(path).map_err(anyhow::Error::msg)?;
            print(&last)?;
        }
        Command::Release {
            goal,
            workspace,
            output,
        } => {
            let status = std::process::Command::new("cargo")
                .args(["test", "-p", "agi-coder-cli", "--lib"])
                .current_dir(&workspace)
                .status()?;
            anyhow::ensure!(status.success(), "cargo test failed; local release was not written");
            print(&agi_coder_cli::ops::release_local(
                &goal,
                &workspace,
                &output,
                true,
                "cargo test -p agi-coder-cli --lib",
            )
            .map_err(anyhow::Error::msg)?)?
        }
        Command::Run { demo, goal } => {
            anyhow::ensure!(demo, "only the explicit offline demo runner is configured");
            print(&agi_coder_cli::ops::run_demo(&goal).map_err(anyhow::Error::msg)?)?;
        }
        Command::Verify {
            record,
            intent,
            policy,
            now,
        } => {
            let record: WorkerExecutionRecord = read(&record)?;
            let intent: WorkIntent = read(&intent)?;
            let policy: Policy = read(&policy)?;
            let mut store = InMemoryEvidenceStore::default();
            let hash = store.insert(Evidence::WorkerExecution(record))?;
            let auth = ContainmentGate::authorize(&intent, hash, &store, &policy, Timestamp(now))?;
            print(&serde_json::json!({
                "authorized": true,
                "operation": auth.operation(),
                "evidence": auth.evidence(),
                "output": auth.output()
            }))?;
        }
        Command::Anchor { records } => {
            let mut graph = WormGraph::default();
            for record in records {
                graph.append(record);
            }
            let proofs: Vec<_> = (0..graph.len() as u64)
                .filter_map(|index| graph.prove(index))
                .collect();
            print(&serde_json::json!({
                "scope": "local-only",
                "root": graph.root(),
                "proofs": proofs
            }))?;
        }
        Command::Mmr { value, root, proof } => {
            let proof: InclusionProof = read(&proof)?;
            anyhow::ensure!(
                verify_inclusion(value, &proof, root),
                "invalid inclusion proof"
            );
            print(&serde_json::json!({"valid": true}))?;
        }
        Command::Cost { ledger } => {
            let ledger: agi_coder_cost::CostTracker = read(&ledger)?;
            let total = ledger.total_micro_usd().map_err(anyhow::Error::msg)?;
            print(&serde_json::json!({
                "total_micro_usd": total,
                "entries": ledger.entries()
            }))?;
        }
    }
    Ok(())
}
