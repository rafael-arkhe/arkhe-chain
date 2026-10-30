use agi_coder_cognition::Planner;
use agi_coder_core::*;
use agi_coder_kernel::{ContainmentGate, InMemoryEvidenceStore, Policy};
use agi_coder_pipeline::{
    subagent::{ProtectedExecutor, Worker},
    PipelineOrchestrator,
};
use agi_coder_wormgraph::{verify_inclusion, InclusionProof, WormGraph};
use clap::{Parser, Subcommand};
use ed25519_dalek::SigningKey;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "agi-coder",
    version,
    about = "Evidence-gated coding infrastructure"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
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
    /// Run the offline five-stage demo with a deliberately public demonstration key.
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

struct DemoWorker {
    key: SigningKey,
    now: Timestamp,
    previous: Option<ContentHash>,
}
impl Worker for DemoWorker {
    fn execute(&mut self, intent: &WorkIntent) -> Result<WorkerExecutionRecord, String> {
        let make = || -> Result<WorkerExecutionRecord, agi_coder_core::Error> {
            WorkerExecutionRecord {
                operation_id: intent.operation_id()?,
                intent_digest: intent.digest()?,
                prev_hash: self.previous,
                worker: "offline-demo".into(),
                plan_digest: ContentHash::hash(b"five-stage-demo-v1"),
                output: intent.target,
                tests: TestResults {
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                },
                test_artifact: ContentHash::hash(
                    b"demo-only: independent production verification is not configured",
                ),
                self_check: SelfCheckResult::Skipped,
                completed_at: self.now,
                signer: String::new(),
                record_hash: ContentHash::ZERO,
                signature: vec![],
            }
            .sign(&self.key)
        };
        let record = make().map_err(|e| e.to_string())?;
        self.previous = Some(record.record_hash);
        Ok(record)
    }
}
struct DemoExecutor;
impl ProtectedExecutor for DemoExecutor {
    fn execute(&mut self, auth: &agi_coder_kernel::Authorization) -> Result<Vec<u8>, String> {
        Ok(format!("demo receipt for {}", auth.operation()).into_bytes())
    }
}
fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
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
        Command::Plan { goal } => print(&Planner::software(goal)?)?,
        Command::Run { demo, goal } => {
            anyhow::ensure!(demo, "only the explicit offline demo runner is configured");
            let mut plan = Planner::software(goal.clone())?;
            let key = SigningKey::from_bytes(&[7; 32]);
            let now = Timestamp(1000);
            let mut worker = DemoWorker {
                key,
                now,
                previous: None,
            };
            let mut pipeline = PipelineOrchestrator::default();
            let mut executor = DemoExecutor;
            while let Some(task) = plan.next_ready() {
                let id = task.id.clone();
                plan.start(&id)?;
                let intent = WorkIntent {
                    requested_by: Did("did:agi:demo".into()),
                    intent_type: match id.as_str() {
                        "design" => WorkIntentType::Design,
                        "implement" => WorkIntentType::Implement,
                        "test" => WorkIntentType::Verify,
                        "audit" => WorkIntentType::Audit,
                        _ => WorkIntentType::Deploy,
                    },
                    target: ContentHash::hash(format!("{goal}:{id}").as_bytes()),
                    parameters: serde_json::json!({"demo":true,"stage":id}),
                    request_identity: RequestIdentity::new(format!("{goal}:{id}").as_bytes()),
                    created_at: now,
                };
                let policy = Policy {
                    allowed_signers: vec![hex::encode(worker.key.verifying_key().as_bytes())],
                    allowed_requesters: vec![intent.requested_by.0.clone()],
                    allowed_operations: vec![intent.intent_type],
                    max_age_seconds: 60,
                    expected_output: intent.target,
                };
                pipeline.run_stage(&intent, &policy, now, &mut worker, &mut executor)?;
                plan.finish(&id, true)?;
            }
            print(
                &serde_json::json!({"mode":"offline-demo", "plan":plan,"records":pipeline.graph.len(),"root":pipeline.graph.root(),"deployed":false}),
            )?;
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
            print(
                &serde_json::json!({"authorized":true,"operation":auth.operation(),"evidence":auth.evidence(),"output":auth.output()}),
            )?;
        }
        Command::Anchor { records } => {
            let mut graph = WormGraph::default();
            for record in records {
                graph.append(record);
            }
            let proofs: Vec<_> = (0..graph.len() as u64)
                .filter_map(|i| graph.prove(i))
                .collect();
            print(&serde_json::json!({"scope":"local-only","root":graph.root(),"proofs":proofs}))?;
        }
        Command::Mmr { value, root, proof } => {
            let proof: InclusionProof = read(&proof)?;
            anyhow::ensure!(
                verify_inclusion(value, &proof, root),
                "invalid inclusion proof"
            );
            print(&serde_json::json!({"valid":true}))?;
        }
        Command::Cost { ledger } => {
            let ledger: agi_coder_cost::CostTracker = read(&ledger)?;
            let total = ledger.total_micro_usd().map_err(anyhow::Error::msg)?;
            print(&serde_json::json!({"total_micro_usd":total,"entries":ledger.entries()}))?;
        }
    }
    Ok(())
}
