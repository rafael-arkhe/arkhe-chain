use agi_coder_cognition::{Plan, Planner};
use agi_coder_core::*;
use agi_coder_kernel::Policy;
use agi_coder_pipeline::{
    subagent::{ProtectedExecutor, Worker},
    PipelineOrchestrator,
};
use ed25519_dalek::SigningKey;
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityState {
    Local,
    Pending,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Capability {
    pub id: &'static str,
    pub name: &'static str,
    pub state: CapabilityState,
    pub limitation: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CommandSurface {
    /// Safe to invoke from the loopback operator page.
    Operator,
    /// Stays on the terminal because it reads trusted files or runs a host process.
    Terminal,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct CommandHelp {
    pub name: &'static str,
    pub surface: CommandSurface,
    pub summary: &'static str,
    pub constraint: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct StatusReport {
    pub product: &'static str,
    pub version: &'static str,
    pub authority: bool,
    pub runtime_verified: bool,
    pub persistence: &'static str,
    pub components: &'static [Capability],
    pub commands: &'static [CommandHelp],
}

const COMPONENTS: &[Capability] = &[
    Capability {
        id: "core-kernel-journal",
        name: "Core, kernel, journal",
        state: CapabilityState::Local,
        limitation: "In-memory admission, replay, and signature checks. Restart drops the journal.",
    },
    Capability {
        id: "mmr",
        name: "MMR",
        state: CapabilityState::Local,
        limitation:
            "Local inclusion against a caller-supplied root. Not an external transparency log.",
    },
    Capability {
        id: "cognition",
        name: "Cognition",
        state: CapabilityState::Local,
        limitation: "Deterministic dependency plan and bounded retries. No model planner.",
    },
    Capability {
        id: "memory",
        name: "Memory",
        state: CapabilityState::Local,
        limitation: "JSON checkpoints with overwrite refusal. No transactional database.",
    },
    Capability {
        id: "verification",
        name: "Verification",
        state: CapabilityState::Local,
        limitation: "Caller-prepared process campaigns. The operator page does not launch them.",
    },
    Capability {
        id: "pipeline",
        name: "Pipeline",
        state: CapabilityState::Local,
        limitation: "Single-process gate, replay, and uncertain-outcome handling.",
    },
    Capability {
        id: "research-cost",
        name: "Research and cost",
        state: CapabilityState::Local,
        limitation: "Explicit integer ledger and caller-supplied sources. No measured market data.",
    },
    Capability {
        id: "mcp",
        name: "MCP",
        state: CapabilityState::Local,
        limitation: "Stdio entry for @agi-coder/mcp-server. Tools check a caller-supplied MMR proof, sum a caller-supplied ledger, and report GPU attestation unsupported. agi mcp prints the launch entry. This process does not start a session and does not authorize execution.",
    },
    Capability {
        id: "deepinfer-contract",
        name: "DeepInfer contract",
        state: CapabilityState::Local,
        limitation: "Offline process bridge. Proposals stay unverified.",
    },
    Capability {
        id: "deepinfer-engine",
        name: "DeepInfer engine execution",
        state: CapabilityState::Pending,
        limitation: "engine_status reports weights_loaded false and native_generation false. No weights or native engine are linked.",
    },
    Capability {
        id: "postgres",
        name: "PostgreSQL journal",
        state: CapabilityState::Pending,
        limitation: "SQL transition codec matches the migration. open_database returns unavailable. The running journal is in memory.",
    },
    Capability {
        id: "transparency",
        name: "External transparency anchoring",
        state: CapabilityState::Pending,
        limitation: "local_checkpoint sets published false. A matching witness is still not an external publication.",
    },
    Capability {
        id: "gpu-tee",
        name: "GPU and TEE attestation",
        state: CapabilityState::Pending,
        limitation: "gpu attestation returns verified false. No hardware verifier is linked.",
    },
    Capability {
        id: "autonomy",
        name: "Autonomous planning and deployment",
        state: CapabilityState::Pending,
        limitation: "agi release writes a local manifest after the five-stage plan, cargo test, and the ten faculty files. The deploy stage is inconclusive. production and editor stay false. No repository editor runs.",
    },
    Capability {
        id: "hosted-ci",
        name: "Hosted CI and signed releases",
        state: CapabilityState::Pending,
        limitation: "hosted_ci reports executed false. Workflows are authored. This process does not observe a forge.",
    },
    Capability {
        id: "operator",
        name: "Operator console",
        state: CapabilityState::Local,
        limitation: "Loopback UI for the grid, local-seek, faculty checks, separation, receipt, bundle, plan, and the labeled offline demo. handoff reruns generation, learning, and reasoning from the same grid task. link issues this process receipt only after a grid pass and a real separation. bundle-draft exports the receipt and inclusion proof with the evaluator signature left empty. The page posts a pasted ed25519 signature to the existing bundle check and does not accept a seed. infer and verify-spec are not served.",
    },
    Capability {
        id: "tauri",
        name: "Desktop shell",
        state: CapabilityState::Pending,
        limitation: "desktop_shell reports packaged false. No window toolkit is linked. Use agi.exe ui.",
    },
];

const COMMANDS: &[CommandHelp] = &[
    CommandHelp {
        name: "status",
        surface: CommandSurface::Operator,
        summary: "Print this capability catalog.",
        constraint:
            "Bookkeeping from the implementation record. It does not re-run the test suite.",
    },
    CommandHelp {
        name: "mcp",
        surface: CommandSurface::Terminal,
        summary: "Print the MCP stdio launch entry.",
        constraint: "Does not start the server, open a session, or grant authority.",
    },
    CommandHelp {
        name: "ui",
        surface: CommandSurface::Terminal,
        summary: "Serve the loopback operator page.",
        constraint: "Binds a numeric loopback address only.",
    },
    CommandHelp {
        name: "plan",
        surface: CommandSurface::Operator,
        summary: "Build the five-stage dependency plan.",
        constraint: "Does not implement, edit, or deploy the goal.",
    },
    CommandHelp {
        name: "release",
        surface: CommandSurface::Terminal,
        summary: "Plan, gate the five stages, and write a local manifest.",
        constraint: "Output is a local directory. production and editor stay false.",
    },
    CommandHelp {
        name: "run --demo",
        surface: CommandSurface::Operator,
        summary: "Run the offline five-stage demonstration.",
        constraint: "Public demo key and synthetic tests. deployed is false.",
    },
    CommandHelp {
        name: "infer",
        surface: CommandSurface::Terminal,
        summary: "Call a configured DeepInfer process bridge.",
        constraint: "Output is unverified text. The operator page does not launch processes.",
    },
    CommandHelp {
        name: "verify-spec",
        surface: CommandSurface::Terminal,
        summary: "Run a caller-authored process campaign.",
        constraint: "Test commands execute on the host. Keep this on the terminal.",
    },
    CommandHelp {
        name: "verify",
        surface: CommandSurface::Terminal,
        summary: "Authorize one signed record against a separate trusted policy.",
        constraint: "Do not take the policy from the same untrusted source as the record.",
    },
    CommandHelp {
        name: "anchor",
        surface: CommandSurface::Terminal,
        summary: "Compute a local MMR root and inclusion proofs.",
        constraint: "Does not publish the root.",
    },
    CommandHelp {
        name: "mmr",
        surface: CommandSurface::Terminal,
        summary: "Check one inclusion proof against a trusted root.",
        constraint: "The caller supplies the root.",
    },
    CommandHelp {
        name: "pending",
        surface: CommandSurface::Terminal,
        summary: "Print the seven pending capability reports.",
        constraint:
            "Does not connect a database, load weights, publish a root, or report CI success.",
    },
    CommandHelp {
        name: "cost",
        surface: CommandSurface::Terminal,
        summary: "Sum an explicit integer micro-USD ledger.",
        constraint: "Does not fetch prices.",
    },
];

pub fn bitflip_report() -> serde_json::Value {
    let original = b"agi-coder local digest";
    let digest = ContentHash::hash(original);
    let mut flipped = *original;
    flipped[0] ^= 0x01;
    let flipped_digest = ContentHash::hash(&flipped);
    serde_json::json!({
        "verdict": "fail",
        "algorithm": "blake3",
        "signature_checked": false,
        "original": digest.to_string(),
        "flipped": flipped_digest.to_string(),
        "changed": digest != flipped_digest,
        "reason": "One flipped bit changed the digest. This process does not check an ML-DSA-65 signature."
    })
}

pub fn mcp_entry() -> serde_json::Value {
    serde_json::json!({
        "transport": "stdio",
        "authority": false,
        "command": "node",
        "args": ["packages/mcp-server/dist/index.js"],
        "tools": [
            {"name": "verify_mmr_inclusion", "authority": false},
            {"name": "get_cost", "authority": false},
            {"name": "attest_gpu", "supported": false}
        ]
    })
}

pub fn status() -> StatusReport {
    StatusReport {
        product: "agi",
        version: env!("CARGO_PKG_VERSION"),
        authority: false,
        runtime_verified: false,
        persistence: "faculty log, operator checks, and local-seek files; kernel journal in memory",
        components: COMPONENTS,
        commands: COMMANDS,
    }
}

pub fn plan(goal: &str) -> Result<Plan, String> {
    Planner::software(goal.to_string()).map_err(|error| error.to_string())
}

struct DemoWorker {
    key: SigningKey,
    now: Timestamp,
    previous: Option<ContentHash>,
}

impl Worker for DemoWorker {
    fn execute(&mut self, intent: &WorkIntent) -> Result<WorkerExecutionRecord, String> {
        let record = (|| -> Result<WorkerExecutionRecord, agi_coder_core::Error> {
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
        })()
        .map_err(|error| error.to_string())?;
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

pub fn run_demo(goal: &str) -> Result<serde_json::Value, String> {
    let mut plan = plan(goal)?;
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
        plan.start(&id).map_err(|error| error.to_string())?;
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
            parameters: serde_json::json!({"demo": true, "stage": id}),
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
        pipeline
            .run_stage(&intent, &policy, now, &mut worker, &mut executor)
            .map_err(|error| error.to_string())?;
        plan.finish(&id, true).map_err(|error| error.to_string())?;
    }
    Ok(serde_json::json!({
        "mode": "offline-demo",
        "authority": false,
        "deployed": false,
        "deployment": "inconclusive",
        "deployment_reason": "The demo executor returns a local receipt and does not deploy.",
        "plan": plan,
        "records": pipeline.graph.len(),
        "root": pipeline.graph.root()
    }))
}

pub fn release_local(
    goal: &str,
    workspace: &std::path::Path,
    output: &std::path::Path,
    tests_passed: bool,
    test_command: &str,
) -> Result<serde_json::Value, String> {
    let rendered = output.to_string_lossy();
    if rendered.trim().is_empty() || rendered.contains("://") {
        return Err("release output must be a local directory".into());
    }
    if goal.trim().is_empty() {
        return Err("goal is required".into());
    }
    let plan = plan(goal)?;
    if plan.tasks.len() != 5 {
        return Err("the release plan must contain five stages".into());
    }
    let design = hashed_file(&workspace.join("design").join("DESIGN.md"))?;
    let binary = hashed_binary(workspace)?;
    if !tests_passed || test_command.trim().is_empty() {
        return Err("test evidence is required before a local release".into());
    }
    let faculties = construction_faculties(workspace)?;
    let design_again = hashed_file(&workspace.join("design").join("DESIGN.md"))?;
    let binary_again = hashed_binary(workspace)?;
    let faculties_again = construction_faculties(workspace)?;
    if design_again != design || binary_again != binary || faculties_again != faculties {
        return Err("design, binary, or faculty files changed during the release audit".into());
    }
    let deployment = agi_coder_cognition::production_deployment();
    std::fs::create_dir_all(output).map_err(|error| error.to_string())?;
    let manifest = serde_json::json!({
        "product": "agi",
        "goal": goal,
        "authority": false,
        "editor": false,
        "production": false,
        "deployed": false,
        "local_manifest": true,
        "declares_agi": false,
        "stages": [
            {"id": "design", "verdict": "pass", "digest": design},
            {"id": "implement", "verdict": "pass", "digest": binary},
            {"id": "test", "verdict": "pass", "command": test_command},
            {"id": "audit", "verdict": "pass", "faculties": faculties},
            {
                "id": "deploy",
                "verdict": deployment.verdict,
                "production": false,
                "editor": deployment.editor,
                "deployed": deployment.deployed,
                "reason": deployment.reason
            }
        ]
    });
    let bytes = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    let path = output.join("manifest.json");
    std::fs::write(&path, &bytes).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "production": false,
        "editor": false,
        "deployed": false,
        "deployment": deployment.verdict,
        "local_manifest": true,
        "path": path.display().to_string(),
        "digest": ContentHash::hash(&bytes),
        "records": 5,
        "declares_agi": false
    }))
}

fn construction_faculties(workspace: &std::path::Path) -> Result<Vec<serde_json::Value>, String> {
    let root = workspace
        .join("crates")
        .join("agi-coder-cognition")
        .join("fixtures");
    let read = |name: &str| -> Result<Vec<u8>, String> {
        let path = root.join(name);
        std::fs::read(&path).map_err(|_| format!("missing {}", path.display()))
    };
    let mut session = crate::cockpit::Session::new();
    let checks = [
        ("perception", "perception/pass.json"),
        ("attention", "attention/pass.json"),
        ("learning", "learning/pass.json"),
        ("memory", "memory/pass.json"),
        ("reasoning", "reasoning/pass.json"),
        ("problem", "problem/pass.json"),
        ("generation", "generation/pass.json"),
        ("executive", "executive/pass.json"),
        ("social", "social/pass.json"),
        ("metacognition", "metacognition/agree.json"),
    ];
    let mut reports = Vec::with_capacity(checks.len());
    for (kind, file) in checks {
        let body = read(file)?;
        let view = match kind {
            "perception" => session.run_perception(&body)?,
            "attention" => session.run_attention(&body)?,
            "learning" => session.run_learning(&body)?,
            "memory" => session.run_memory(&body)?,
            "reasoning" => session.run_reasoning(&body)?,
            "problem" => session.run_problem(&body)?,
            "generation" => session.run_generation(&body)?,
            "executive" => session.run_executive(&body)?,
            "social" => session.run_social(&body)?,
            "metacognition" => session.run_metacognition(&body)?,
            _ => return Err("unknown construction check".into()),
        };
        let check = view
            .get("last_check")
            .cloned()
            .ok_or_else(|| format!("{kind} produced no check"))?;
        if check["kind"] != kind || check["verdict"] != "pass" || check["declares_agi"] != false {
            return Err(format!(
                "{kind} did not pass: {}",
                check["reason"].as_str().unwrap_or("no reason")
            ));
        }
        reports.push(check);
    }
    Ok(reports)
}

fn hashed_file(path: &std::path::Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|_| format!("missing {}", path.display()))?;
    if bytes.is_empty() {
        return Err(format!("{} is empty", path.display()));
    }
    Ok(ContentHash::hash(&bytes).to_string())
}

fn hashed_binary(workspace: &std::path::Path) -> Result<String, String> {
    let candidates = [
        workspace.join("target").join("debug").join("agi.exe"),
        workspace.join("target").join("release").join("agi.exe"),
        workspace.join("target").join("debug").join("agi"),
        workspace.join("target").join("release").join("agi"),
    ];
    let path = candidates
        .iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "agi binary was not found under target/debug or target/release".to_string())?;
    hashed_file(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_claims_no_authority() {
        let report = status();
        assert_eq!(report.product, "agi");
        assert_eq!(report.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(report.version, "0.13.0");
        assert!(report.persistence.contains("operator checks"));
        assert!(!report.authority);
        assert!(!report.runtime_verified);
        assert!(report.persistence.contains("kernel journal in memory"));
        assert!(report
            .components
            .iter()
            .any(|item| item.id == "gpu-tee" && item.state == CapabilityState::Pending));
        for id in [
            "deepinfer-engine",
            "postgres",
            "transparency",
            "autonomy",
            "hosted-ci",
            "tauri",
        ] {
            assert!(
                report
                    .components
                    .iter()
                    .any(|item| item.id == id && item.state == CapabilityState::Pending),
                "{id}"
            );
        }
        let autonomy = report
            .components
            .iter()
            .find(|item| item.id == "autonomy")
            .expect("autonomy");
        assert!(autonomy.limitation.contains("ten faculty files"));
        assert!(autonomy.limitation.contains("production and editor stay false"));
        assert!(report
            .components
            .iter()
            .any(|item| item.id == "operator" && item.state == CapabilityState::Local));
        assert!(report
            .components
            .iter()
            .any(|item| item.id == "mcp" && item.state == CapabilityState::Local));
        assert!(report
            .components
            .iter()
            .all(|item| !item.id.contains("jules") && !item.name.contains("Jules")));
        let entry = mcp_entry();
        assert_eq!(entry["transport"], "stdio");
        assert_eq!(entry["authority"], false);
        assert_eq!(entry["tools"].as_array().map(Vec::len), Some(3));
    }

    #[test]
    fn plan_lists_five_pending_stages() {
        let plan = plan("Add a bounded retry").expect("plan");
        assert_eq!(plan.tasks.len(), 5);
        assert!(plan
            .tasks
            .values()
            .all(|task| { matches!(task.status, agi_coder_cognition::TaskStatus::Pending) }));
    }

    #[test]
    fn empty_goal_is_rejected() {
        assert!(plan("  ").is_err());
    }

    #[test]
    fn local_release_writes_a_manifest_and_stays_out_of_production() {
        let root = std::env::temp_dir().join(format!("agi-coder-workspace-{}", std::process::id()));
        let output = root.join("out");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("design")).unwrap();
        std::fs::create_dir_all(root.join("target").join("debug")).unwrap();
        std::fs::write(root.join("design").join("DESIGN.md"), b"operator surface").unwrap();
        std::fs::write(root.join("target").join("debug").join("agi.exe"), b"binary").unwrap();
        assert!(release_local("Build agi.exe", &root, &output, false, "cargo test").is_err());
        assert!(release_local(
            "Build agi.exe",
            &root,
            &output,
            true,
            "cargo test -p agi-coder-cli --lib",
        )
        .is_err());
        for (name, bytes) in [
            (
                "perception/pass.json",
                include_str!("../../agi-coder-cognition/fixtures/perception/pass.json"),
            ),
            (
                "attention/pass.json",
                include_str!("../../agi-coder-cognition/fixtures/attention/pass.json"),
            ),
            (
                "learning/pass.json",
                include_str!("../../agi-coder-cognition/fixtures/learning/pass.json"),
            ),
            (
                "memory/pass.json",
                include_str!("../../agi-coder-cognition/fixtures/memory/pass.json"),
            ),
            (
                "reasoning/pass.json",
                include_str!("../../agi-coder-cognition/fixtures/reasoning/pass.json"),
            ),
            (
                "problem/pass.json",
                include_str!("../../agi-coder-cognition/fixtures/problem/pass.json"),
            ),
            (
                "generation/pass.json",
                include_str!("../../agi-coder-cognition/fixtures/generation/pass.json"),
            ),
            (
                "executive/pass.json",
                include_str!("../../agi-coder-cognition/fixtures/executive/pass.json"),
            ),
            (
                "social/pass.json",
                include_str!("../../agi-coder-cognition/fixtures/social/pass.json"),
            ),
            (
                "metacognition/agree.json",
                include_str!("../../agi-coder-cognition/fixtures/metacognition/agree.json"),
            ),
        ] {
            let path = root
                .join("crates")
                .join("agi-coder-cognition")
                .join("fixtures")
                .join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, bytes).unwrap();
        }
        let value = release_local(
            "Build agi.exe",
            &root,
            &output,
            true,
            "cargo test -p agi-coder-cli --lib",
        )
        .expect("release");
        assert_eq!(value["production"], false);
        assert_eq!(value["editor"], false);
        assert_eq!(value["deployed"], false);
        assert_eq!(value["deployment"], "inconclusive");
        assert_eq!(value["declares_agi"], false);
        assert_eq!(value["records"], 5);
        let written = std::fs::read(output.join("manifest.json")).expect("manifest");
        let text = String::from_utf8(written.clone()).expect("utf8");
        assert!(text.contains("the reported frame matches"));
        assert!(text.contains("the selected cells are the target"));
        assert!(text.contains("applied to a new pair"));
        assert!(text.contains("the recall matches"));
        assert!(text.contains("the conclusion follows"));
        assert!(text.contains("the target cells were selected"));
        assert!(text.contains("generated transpose"));
        assert!(text.contains("production and editor stay false"));
        assert!(text.contains("No production executor or repository editor is configured."));
        assert!(text.contains("the other party's claim matches"));
        assert!(text.contains("recomputed pass"));
        let digest = ContentHash::hash(&written).to_string();
        assert_eq!(value["digest"].as_str(), Some(digest.as_str()));
        assert!(written.windows(4).any(|bytes| bytes == b"pass"));
        assert!(release_local(
            "Build agi.exe",
            &root,
            std::path::Path::new("https://example.test/agi"),
            true,
            "cargo test -p agi-coder-cli --lib",
        )
        .is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn demo_stays_undeployed() {
        let value = run_demo("Demonstrate evidence-gated execution").expect("demo");
        assert_eq!(value["mode"], "offline-demo");
        assert_eq!(value["deployed"], false);
        assert_eq!(value["deployment"], "inconclusive");
        assert_eq!(value["records"], 5);
    }

    #[test]
    fn bitflip_changes_the_digest_and_checks_no_signature() {
        let report = bitflip_report();
        assert_eq!(report["verdict"], "fail");
        assert_eq!(report["changed"], true);
        assert_eq!(report["signature_checked"], false);
        assert_ne!(report["original"], report["flipped"]);
    }
}
