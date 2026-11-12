//! Session operations for the audit cockpit. Every verdict is computed here.
use agi_coder_core::ContentHash;
use agi_coder_wormgraph::{verify_inclusion, InclusionProof, WormGraph};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier};
use serde::Deserialize;
use serde_json::{json, Value};

const PROCESS_SEED: [u8; 32] = [9; 32];

#[derive(Clone)]
struct Action {
    kind: String,
    verdict: String,
    leaf: ContentHash,
    corrects: Option<u64>,
}

pub struct Session {
    key: SigningKey,
    nonce: [u8; 16],
    actions: Vec<Action>,
    graph: WormGraph,
    separation: Option<Separation>,
    receipt: Option<Vec<u8>>,
    receipt_signature: Option<Signature>,
    receipt_key: Option<ed25519_dalek::VerifyingKey>,
    ladder: Option<&'static str>,
    horizons_ms: Vec<u128>,
    efficiency: Option<String>,
    trace: Vec<String>,
    grid: Vec<Vec<u8>>,
    last_check: Option<LastCheck>,
    arc3: Option<crate::arc3::Seek>,
    faculty_log: Vec<(String, Vec<u8>)>,
    journal: Vec<(String, Vec<u8>)>,
}

#[derive(Clone)]
struct Separation {
    pass: bool,
    reason: String,
}

struct LastCheck {
    kind: String,
    verdict: String,
    reason: String,
}

impl Session {
    pub fn new() -> Self {
        Self {
            key: SigningKey::from_bytes(&PROCESS_SEED),
            nonce: [4; 16],
            actions: Vec::new(),
            graph: WormGraph::default(),
            separation: None,
            receipt: None,
            receipt_signature: None,
            receipt_key: None,
            ladder: None,
            horizons_ms: Vec::new(),
            efficiency: None,
            trace: Vec::new(),
            grid: Vec::new(),
            last_check: None,
            arc3: None,
            faculty_log: Vec::new(),
            journal: Vec::new(),
        }
    }

    pub fn journal_full(&self) -> bool {
        self.journal.len() >= 128
    }

    pub fn remember(&mut self, route: &str, body: &[u8]) -> Result<(), String> {
        if self.journal_full() {
            return Err("the operator journal already has 128 checks".into());
        }
        self.journal.push((route.to_string(), body.to_vec()));
        Ok(())
    }

    pub fn seed_journal_from_faculties(&mut self) {
        if !self.journal.is_empty() {
            return;
        }
        self.journal = self
            .faculty_log
            .iter()
            .map(|(kind, body)| (format!("/api/{kind}"), body.clone()))
            .collect();
    }

    pub fn save_journal(&self, path: &std::path::Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let entries: Vec<Value> = self
            .journal
            .iter()
            .map(|(route, body)| {
                let parsed: Value = if body.is_empty() {
                    Value::Null
                } else {
                    serde_json::from_slice(body).unwrap_or(Value::Null)
                };
                json!({"route": route, "body": parsed})
            })
            .collect();
        let bytes = serde_json::to_vec_pretty(&entries).map_err(|error| error.to_string())?;
        std::fs::write(path, bytes).map_err(|error| error.to_string())
    }

    pub fn replace_journal(&mut self, entries: Vec<(String, Vec<u8>)>) -> Result<(), String> {
        if entries.len() > 128 {
            return Err("the operator journal is longer than 128".into());
        }
        self.journal = entries;
        Ok(())
    }

    pub fn record(&mut self, kind: &str, verdict: &str, payload: &[u8]) {
        let leaf = ContentHash::hash(payload);
        self.graph.append(leaf);
        self.actions.push(Action {
            kind: kind.into(),
            verdict: verdict.into(),
            leaf,
            corrects: None,
        });
        self.receipt = None;
        self.receipt_signature = None;
        self.receipt_key = None;
    }

    pub fn run_grid(&mut self, body: &[u8]) -> Result<Value, String> {
        let started = std::time::Instant::now();
        let task: GridTask =
            serde_json::from_slice(body).map_err(|_| "body must be a grid task".to_string())?;
        let mut trace = Vec::new();
        for (index, pair) in task.train.iter().enumerate() {
            let got = apply(&task.program, &parse_grid(&pair.input)?)?;
            let expect = parse_grid(&pair.output)?;
            if got != expect {
                trace.push(format!(
                    "train pair {index} mismatch at {}",
                    first_diff(&got, &expect)
                ));
                return self.finish_grid(
                    started,
                    "fail",
                    trace,
                    Vec::new(),
                    None,
                    "train pair rejected the program",
                );
            }
        }
        trace.push(format!("parsed {} training pair(s)", task.train.len()));
        trace.push(format!("selected program {}", task.program));
        let got = apply(&task.program, &parse_grid(&task.test_input)?)?;
        let expect = parse_grid(&task.test_output)?;
        trace.push("executed the program on the test input".into());
        let pass = got == expect;
        if pass {
            trace.push("test output matches".into());
        } else {
            trace.push(format!("test mismatch at {}", first_diff(&got, &expect)));
        }
        let efficiency =
            if pass {
                match (task.cost_micro_usd, task.tokens) {
                    (Some(cost), Some(tokens)) if cost > 0 && tokens > 0 => {
                        Some(format!("1/{}", cost.saturating_add(tokens)))
                    }
                    (None, None) => None,
                    _ => return Err(
                        "cost_micro_usd and tokens must both be positive integers, or both omitted"
                            .into(),
                    ),
                }
            } else {
                None
            };
        self.finish_grid(
            started,
            if pass { "pass" } else { "fail" },
            trace,
            if pass { expect } else { got },
            efficiency,
            if pass {
                "grid check passed"
            } else {
                "grid check failed"
            },
        )
    }

    fn finish_grid(
        &mut self,
        started: std::time::Instant,
        verdict: &str,
        trace: Vec<String>,
        grid: Vec<Vec<u8>>,
        efficiency: Option<String>,
        detail: &str,
    ) -> Result<Value, String> {
        let ms = started.elapsed().as_millis();
        self.horizons_ms.push(ms);
        self.trace = trace;
        self.grid = grid;
        self.efficiency = efficiency;
        if verdict == "pass" {
            self.ladder = Some("L1");
        }
        self.record("grid", verdict, detail.as_bytes());
        Ok(self.view()        )
    }

    pub fn handoff(&mut self, body: &[u8]) -> Result<Value, String> {
        let task: Value = serde_json::from_slice(body)
            .map_err(|_| "body must be a grid task".to_string())?;
        self.run_grid(body)?;
        let search = serde_json::to_vec(&json!({
            "train": task["train"],
            "test_input": task["test_input"],
            "test_output": task["test_output"]
        }))
        .map_err(|error| error.to_string())?;
        let reasoning = serde_json::to_vec(&json!({
            "program": task["program"],
            "premise": task["test_input"],
            "conclusion": task["test_output"]
        }))
        .map_err(|error| error.to_string())?;
        self.run_generation(&search)?;
        self.run_learning(&search)?;
        self.run_reasoning(&reasoning)?;
        let target = task["test_input"]
            .get(0)
            .and_then(|row| row.get(0))
            .cloned()
            .unwrap_or(Value::from(0));
        Ok(json!({
            "ran": [
                {"check": "grid", "verdict": by_kind(self, "grid")},
                {"check": "generation", "verdict": by_kind(self, "generation")},
                {"check": "learning", "verdict": by_kind(self, "learning")},
                {"check": "reasoning", "verdict": by_kind(self, "reasoning")}
            ],
            "prepared": {
                "perception": {"frame": task["test_input"], "reported": Value::Null},
                "attention": {"frame": task["test_input"], "target": target, "selected": []},
                "memory": {"stored": task["test_output"], "recalled": Value::Null, "delay_steps": 1},
                "problem": {
                    "frame": task["test_input"],
                    "target": target,
                    "selected": [],
                    "program": task["program"],
                    "premise": task["test_input"],
                    "conclusion": task["test_output"]
                }
            },
            "reason": "Generation and learning search the closed set. Reasoning checks the stated conclusion. Perception, attention, memory, and problem solving keep a blank claim and are not recorded.",
            "declares_agi": false,
            "session": self.view()
        }))
    }

    pub fn run_arc3(&mut self, body: &[u8]) -> Result<Value, String> {
        #[derive(Deserialize)]
        struct Step {
            action: String,
            x: Option<u8>,
            y: Option<u8>,
        }
        let step: Step = serde_json::from_slice(body)
            .map_err(|_| "body must be an action: 1, 2, 3, 4, 5, undo, click, or reset".to_string())?;
        if step.action == "reset" || self.arc3.is_none() {
            self.arc3 = Some(crate::arc3::Seek::new());
        }
        if step.action != "reset" {
            self.arc3
                .as_mut()
                .expect("frame")
                .act(&step.action, step.x, step.y)?;
        }
        let won = self.arc3.as_ref().is_some_and(|seek| seek.won());
        let verdict = if won { "pass" } else { "inconclusive" };
        self.record("arc3", verdict, step.action.as_bytes());
        Ok(self.view())
    }

    pub fn save_arc3(&self, path: &std::path::Path) -> Result<(), String> {
        match &self.arc3 {
            Some(seek) => seek.save(path),
            None => Ok(()),
        }
    }

    pub fn load_arc3(&mut self, path: &std::path::Path) -> Result<(), String> {
        if !path.is_file() {
            return Ok(());
        }
        self.arc3 = Some(crate::arc3::Seek::load(path)?);
        Ok(())
    }

    pub fn run_perception(&mut self, body: &[u8]) -> Result<Value, String> {
        let report = agi_coder_cognition::faculties::check_perception(body)?;
        self.finish_faculty("perception", &report, body)
    }

    pub fn run_attention(&mut self, body: &[u8]) -> Result<Value, String> {
        let report = agi_coder_cognition::faculties::check_attention(body)?;
        self.finish_faculty("attention", &report, body)
    }

    pub fn run_learning(&mut self, body: &[u8]) -> Result<Value, String> {
        let report = agi_coder_cognition::faculties::check_learning(body)?;
        self.finish_faculty("learning", &report, body)
    }

    pub fn run_memory(&mut self, body: &[u8]) -> Result<Value, String> {
        let report = agi_coder_cognition::faculties::check_memory(body)?;
        self.finish_faculty("memory", &report, body)
    }

    pub fn run_reasoning(&mut self, body: &[u8]) -> Result<Value, String> {
        let report = agi_coder_cognition::faculties::check_reasoning(body)?;
        self.finish_faculty("reasoning", &report, body)
    }

    pub fn run_problem(&mut self, body: &[u8]) -> Result<Value, String> {
        let report = agi_coder_cognition::faculties::check_problem_solving(body)?;
        self.finish_faculty("problem", &report, body)
    }

    pub fn run_generation(&mut self, body: &[u8]) -> Result<Value, String> {
        let report = agi_coder_cognition::faculties::check_generation(body)?;
        self.finish_faculty("generation", &report, body)
    }

    pub fn run_executive(&mut self, body: &[u8]) -> Result<Value, String> {
        let report = agi_coder_cognition::faculties::check_executive(body)?;
        self.finish_faculty("executive", &report, body)
    }

    pub fn run_social(&mut self, body: &[u8]) -> Result<Value, String> {
        #[derive(Deserialize)]
        struct Speaker {
            speaker_key: String,
        }
        let speaker: Speaker = serde_json::from_slice(body)
            .map_err(|_| "social file must include speaker_key".to_string())?;
        let key = decode_key(&speaker.speaker_key)?;
        let matches = agi_coder_cognition::faculties::claim_matches(body)?;
        let report = if key.as_bytes() == self.key.verifying_key().as_bytes() {
            agi_coder_cognition::faculties::FacultyReport {
                verdict: "fail",
                reason: "the speaker is this process".into(),
            }
        } else if matches {
            agi_coder_cognition::faculties::FacultyReport {
                verdict: "pass",
                reason: "the other party's claim matches the computed grid".into(),
            }
        } else {
            agi_coder_cognition::faculties::FacultyReport {
                verdict: "fail",
                reason: "the other party's claim does not match the computed grid".into(),
            }
        };
        self.finish_faculty("social", &report, body)
    }

    pub fn run_metacognition(&mut self, body: &[u8]) -> Result<Value, String> {
        let report = agi_coder_cognition::faculties::check_metacognition(body)?;
        self.finish_faculty("metacognition", &report, body)
    }

    fn finish_faculty(
        &mut self,
        kind: &str,
        report: &agi_coder_cognition::faculties::FacultyReport,
        body: &[u8],
    ) -> Result<Value, String> {
        if self.faculty_log.len() >= 64 {
            return Err("the faculty log already has 64 checks".into());
        }
        self.faculty_log.push((kind.into(), body.to_vec()));
        self.last_check = Some(LastCheck {
            kind: kind.into(),
            verdict: report.verdict.into(),
            reason: report.reason.clone(),
        });
        self.record(kind, report.verdict, report.reason.as_bytes());
        Ok(self.view())
    }

    pub fn save_faculties(&self, path: &std::path::Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let entries: Vec<Value> = self
            .faculty_log
            .iter()
            .map(|(kind, body)| {
                let parsed: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
                json!({"kind": kind, "body": parsed})
            })
            .collect();
        let bytes = serde_json::to_vec_pretty(&entries).map_err(|error| error.to_string())?;
        std::fs::write(path, bytes).map_err(|error| error.to_string())
    }

    pub fn load_faculties(&mut self, path: &std::path::Path) -> Result<(), String> {
        if !path.is_file() {
            return Ok(());
        }
        let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
        let entries: Vec<Value> = serde_json::from_slice(&bytes)
            .map_err(|_| "faculty log is not valid".to_string())?;
        if entries.len() > 64 {
            return Err("faculty log is longer than 64".into());
        }
        for entry in entries {
            let kind = entry["kind"].as_str().unwrap_or("");
            let body = serde_json::to_vec(&entry["body"]).map_err(|error| error.to_string())?;
            match kind {
                "perception" => self.run_perception(&body)?,
                "attention" => self.run_attention(&body)?,
                "learning" => self.run_learning(&body)?,
                "memory" => self.run_memory(&body)?,
                "reasoning" => self.run_reasoning(&body)?,
                "problem" => self.run_problem(&body)?,
                "generation" => self.run_generation(&body)?,
                "executive" => self.run_executive(&body)?,
                "social" => self.run_social(&body)?,
                "metacognition" => self.run_metacognition(&body)?,
                _ => return Err("faculty log names an unknown check".into()),
            };
        }
        Ok(())
    }

    pub fn separate(&mut self, body: &[u8]) -> Result<Value, String> {
        let claim: SeparationClaim =
            serde_json::from_slice(body).map_err(|_| "body must name both parties".to_string())?;
        let pairs = [
            ("key", claim.proposer_key.trim(), claim.evaluator_key.trim()),
            (
                "entity",
                claim.proposer_entity.trim(),
                claim.evaluator_entity.trim(),
            ),
            (
                "environment",
                claim.proposer_environment.trim(),
                claim.evaluator_environment.trim(),
            ),
            (
                "network",
                claim.proposer_network.trim(),
                claim.evaluator_network.trim(),
            ),
        ];
        let mut reason = String::from("the four dimensions differ");
        let mut pass = true;
        for (name, left, right) in pairs {
            if left.is_empty() || right.is_empty() {
                pass = false;
                reason = format!("{name} is missing");
                break;
            }
            if name == "key" && (decode_key(left).is_err() || decode_key(right).is_err()) {
                pass = false;
                reason = "each key must be 32 bytes of hex".into();
                break;
            }
            if left == right {
                pass = false;
                reason = format!("{name} is the same for proposer and evaluator");
                break;
            }
        }
        self.separation = Some(Separation {
            pass,
            reason: reason.clone(),
        });
        self.record(
            "separation",
            if pass { "pass" } else { "fail" },
            reason.as_bytes(),
        );
        Ok(self.view())
    }

    pub fn link(&mut self, body: &[u8]) -> Result<Value, String> {
        if !self
            .actions
            .iter()
            .any(|action| action.kind == "grid" && action.verdict == "pass")
        {
            return Err("link issues a receipt only after a grid pass".into());
        }
        self.separate(body)?;
        let separated = self.separation.as_ref().is_some_and(|item| item.pass);
        if !separated {
            return Ok(json!({
                "linked": false,
                "receipt_issued": false,
                "reason": "the parties were not separated, so no receipt was issued",
                "declares_agi": false,
                "session": self.view()
            }));
        }
        self.issue_receipt()?;
        Ok(json!({
            "linked": true,
            "receipt_issued": true,
            "reason": "the four dimensions differ and this process signed its ed25519 receipt. An independent bundle is still required.",
            "declares_agi": false,
            "session": self.view()
        }))
    }

    pub fn correct(&mut self) -> Result<Value, String> {
        let target = self.unresolved_failure();
        let Some(index) = target else {
            return Err("there is no unresolved failed action to correct".into());
        };
        let leaf = ContentHash::hash(format!("correction-of-{index}").as_bytes());
        self.graph.append(leaf);
        self.actions.push(Action {
            kind: "correction".into(),
            verdict: "pass".into(),
            leaf,
            corrects: Some(index),
        });
        self.receipt = None;
        self.receipt_signature = None;
        self.receipt_key = None;
        Ok(self.view())
    }

    pub fn issue_receipt(&mut self) -> Result<Value, String> {
        let Some(action) = self.actions.last() else {
            return Err("issue a receipt only after this process has recorded an action".into());
        };
        let mut body = Vec::with_capacity(174);
        body.push(1);
        body.push(1);
        body.extend_from_slice(&ContentHash::hash(b"agi-coder/policy/v1").0[..16]);
        body.extend_from_slice(&ContentHash::hash(b"no-model").0);
        body.extend_from_slice(&[0x01, 0x55, 0x1e, 0x20]);
        body.extend_from_slice(&action.leaf.0);
        body.extend_from_slice(&ContentHash::hash(action.kind.as_bytes()).0);
        body.extend_from_slice(&action.leaf.0);
        body.extend_from_slice(&self.nonce);
        body.extend_from_slice(&(self.actions.len() as u64).to_be_bytes());
        if body.len() != 174 {
            return Err(format!("receipt body is {} bytes", body.len()));
        }
        let signature = self.key.sign(&body);
        self.key
            .verifying_key()
            .verify(&body, &signature)
            .map_err(|_| "process signature did not verify")?;
        self.receipt = Some(body);
        self.receipt_signature = Some(signature);
        self.receipt_key = Some(self.key.verifying_key());
        Ok(self.view())
    }

    pub fn verify_bundle(&mut self, body: &[u8]) -> Result<Value, String> {
        let bundle: Bundle = serde_json::from_slice(body)
            .map_err(|_| "body must be a receipt bundle".to_string())?;
        let receipt = decode_exact(&bundle.receipt_hex, 174, "receipt")?;
        let signature =
            Signature::from_slice(&decode_exact(&bundle.signature_hex, 64, "signature")?)
                .map_err(|_| "signature bytes are not an ed25519 signature".to_string())?;
        let public = decode_key(&bundle.public_key_hex)?;
        let leaf = ContentHash::from_str_hash(&bundle.leaf)?;
        let root = ContentHash::from_str_hash(&bundle.root)?;
        let verdict = if public.as_bytes() == self.key.verifying_key().as_bytes() {
            "fail"
        } else if public.verify(&receipt, &signature).is_err() {
            "fail"
        } else if !verify_inclusion(leaf, &bundle.proof, root) {
            "fail"
        } else {
            "pass"
        };
        let reason = match verdict {
            "pass" => "independent signature and inclusion proof verified",
            _ if public.as_bytes() == self.key.verifying_key().as_bytes() => {
                "the signer is this process, so the evaluation is not independent"
            }
            _ if public.verify(&receipt, &signature).is_err() => "signature rejected",
            _ => "inclusion proof rejected",
        };
        self.record("bundle", verdict, reason.as_bytes());
        if verdict == "pass" {
            self.receipt = Some(receipt);
            self.receipt_signature = Some(signature);
            self.receipt_key = Some(public);
        }
        Ok(json!({
            "verdict": verdict,
            "reason": reason,
            "declares_agi": false,
            "session": self.view()
        }))
    }

    pub fn bundle_draft(&self) -> Result<Value, String> {
        if self.receipt.is_none() || !self.view()["receipt"]["valid"].as_bool().unwrap_or(false) {
            return Err("prepare a bundle only after this process receipt verifies".into());
        }
        let view = self.view();
        let leaf = self
            .actions
            .last()
            .map(|action| action.leaf.to_string())
            .ok_or_else(|| "prepare a bundle only after this process has recorded an action".to_string())?;
        Ok(json!({
            "receipt_hex": view["receipt"]["hex"],
            "signature_hex": Value::Null,
            "public_key_hex": Value::Null,
            "leaf": leaf,
            "root": view["root"],
            "proof": view["proof"],
            "process_public_key": view["process_public_key"],
            "reason": "The receipt, leaf, root, and proof come from this process. signature_hex and public_key_hex stay empty until a different ed25519 key signs the receipt. This process rejects its own key.",
            "declares_agi": false
        }))
    }

    pub fn attest(seed_hex: &str, receipt_hex: &str) -> Result<Value, String> {
        let seed = decode_exact(seed_hex, 32, "seed")?;
        let seed: [u8; 32] = seed.try_into().map_err(|_| "seed length")?;
        if seed == PROCESS_SEED {
            return Err("the evaluator seed must differ from the process seed".into());
        }
        let receipt = decode_exact(receipt_hex, 174, "receipt")?;
        let key = SigningKey::from_bytes(&seed);
        let signature = key.sign(&receipt);
        Ok(json!({
            "algorithm": "ed25519",
            "public_key_hex": hex::encode(key.verifying_key().as_bytes()),
            "signature_hex": hex::encode(signature.to_bytes()),
            "declares_agi": false
        }))
    }

    fn unresolved_failure(&self) -> Option<u64> {
        self.actions
            .iter()
            .enumerate()
            .rev()
            .find_map(|(index, action)| {
                if action.verdict != "fail" {
                    return None;
                }
                let index = index as u64;
                let corrected = self
                    .actions
                    .iter()
                    .any(|later| later.corrects == Some(index));
                if corrected {
                    None
                } else {
                    Some(index)
                }
            })
    }

    pub fn view(&self) -> Value {
        let proof = self
            .graph
            .len()
            .checked_sub(1)
            .and_then(|index| self.graph.prove(index as u64));
        let (receipt_hex, signature_hex, receipt_valid) =
            match (&self.receipt, &self.receipt_signature, &self.receipt_key) {
                (Some(body), Some(signature), Some(key)) => {
                    let valid = key.verify(body, signature).is_ok();
                    (
                        Some(hex::encode(body)),
                        Some(hex::encode(signature.to_bytes())),
                        valid,
                    )
                }
                _ => (None, None, false),
            };
        json!({
            "authority": false,
            "declares_agi": false,
            "algorithm": "ed25519",
            "process_public_key": hex::encode(self.key.verifying_key().as_bytes()),
            "actions": self.actions.iter().enumerate().map(|(index, action)| json!({
                "index": index,
                "kind": action.kind,
                "verdict": action.verdict,
                "leaf": action.leaf.to_string(),
                "corrects": action.corrects
            })).collect::<Vec<_>>(),
            "root": self.graph.root().to_string(),
            "leaves": self.graph.len(),
            "proof": proof,
            "faculties": faculties(self),
            "ladder": self.ladder,
            "horizons_ms": self.horizons_ms,
            "efficiency": self.efficiency,
            "trace": self.trace,
            "grid": self.grid,
            "arc3": self.arc3.as_ref().map(crate::arc3::Seek::view),
            "last_check": self.last_check.as_ref().map(|item| json!({
                "kind": item.kind,
                "verdict": item.verdict,
                "reason": item.reason,
                "declares_agi": false
            })),
            "separation": self.separation.as_ref().map(|item| json!({"pass": item.pass, "reason": item.reason})),
            "correction_available": self.unresolved_failure().is_some(),
            "assessment": assessment(self, receipt_valid),
            "receipt": {
                "bytes": 174,
                "hex": receipt_hex,
                "signature_hex": signature_hex,
                "valid": receipt_valid,
                "timestamp_kind": "session_counter",
                "fields": receipt_fields(self.receipt.as_deref())
            }
        })
    }
}

fn assessment(session: &Session, receipt_valid: bool) -> &'static str {
    if session.unresolved_failure().is_some() {
        return "contested";
    }
    if session.separation.as_ref().is_some_and(|item| !item.pass) {
        return "insufficient";
    }
    if !session
        .actions
        .iter()
        .any(|action| action.kind == "grid" && action.verdict == "pass")
    {
        return "insufficient";
    }
    if !session.separation.as_ref().is_some_and(|item| item.pass) || !receipt_valid {
        return "pending";
    }
    if !session
        .actions
        .iter()
        .any(|action| action.kind == "bundle" && action.verdict == "pass")
    {
        return "pending";
    }
    "pass"
}

fn faculties(session: &Session) -> Value {
    json!({
        "perception": by_kind(session, "perception"),
        "generation": by_kind(session, "generation"),
        "attention": by_kind(session, "attention"),
        "learning": by_kind(session, "learning"),
        "memory": by_kind(session, "memory"),
        "reasoning": by_kind(session, "reasoning"),
        "metacognition": metacognition(session),
        "executive_function": by_kind(session, "executive"),
        "problem_solving": by_kind(session, "problem"),
        "social_cognition": by_kind(session, "social")
    })
}

fn by_kind(session: &Session, kind: &str) -> &'static str {
    match session
        .actions
        .iter()
        .rev()
        .find(|action| action.kind == kind)
        .map(|action| action.verdict.as_str())
    {
        Some("pass") => "pass",
        Some("fail") => "fail",
        _ => "absent",
    }
}

fn metacognition(session: &Session) -> &'static str {
    if let Some(action) = session
        .actions
        .iter()
        .rev()
        .find(|action| action.kind == "metacognition")
    {
        return if action.verdict == "pass" {
            "pass"
        } else {
            "fail"
        };
    }
    if session
        .actions
        .iter()
        .any(|action| action.kind == "correction" || action.kind == "bitflip")
    {
        "pass"
    } else {
        "absent"
    }
}

fn receipt_fields(body: Option<&[u8]>) -> Value {
    let Some(body) = body else {
        return json!(null);
    };
    let field = |start: usize, len: usize| hex::encode(&body[start..start + len]);
    json!({
        "version": body[0],
        "profile": body[1],
        "policy_id": field(2, 16),
        "model_fp": field(18, 32),
        "chunk_cid": field(50, 36),
        "input_hash": field(86, 32),
        "output_hash": field(118, 32),
        "session_nonce": field(150, 16),
        "timestamp": field(166, 8)
    })
}

#[derive(Deserialize)]
struct GridTask {
    program: String,
    train: Vec<Pair>,
    test_input: Vec<Vec<u8>>,
    test_output: Vec<Vec<u8>>,
    cost_micro_usd: Option<u64>,
    tokens: Option<u64>,
}

#[derive(Deserialize)]
struct Pair {
    input: Vec<Vec<u8>>,
    output: Vec<Vec<u8>>,
}

#[derive(Deserialize)]
struct SeparationClaim {
    proposer_key: String,
    evaluator_key: String,
    proposer_entity: String,
    evaluator_entity: String,
    proposer_environment: String,
    evaluator_environment: String,
    proposer_network: String,
    evaluator_network: String,
}

#[derive(Deserialize)]
struct Bundle {
    receipt_hex: String,
    signature_hex: String,
    public_key_hex: String,
    leaf: String,
    root: String,
    proof: InclusionProof,
}

fn parse_grid(grid: &[Vec<u8>]) -> Result<Vec<Vec<u8>>, String> {
    agi_coder_cognition::faculties::parse_grid(grid)
}

fn apply(program: &str, grid: &[Vec<u8>]) -> Result<Vec<Vec<u8>>, String> {
    agi_coder_cognition::faculties::apply(program, grid)
}

fn first_diff(got: &[Vec<u8>], expect: &[Vec<u8>]) -> String {
    if got.len() != expect.len() || got.first().map(Vec::len) != expect.first().map(Vec::len) {
        return "shape".into();
    }
    for (y, row) in got.iter().enumerate() {
        for (x, cell) in row.iter().enumerate() {
            if *cell != expect[y][x] {
                return format!("row {y} column {x}");
            }
        }
    }
    "none".into()
}

fn decode_exact(value: &str, len: usize, name: &str) -> Result<Vec<u8>, String> {
    let bytes = hex::decode(value.trim()).map_err(|_| format!("{name} is not hex"))?;
    if bytes.len() != len {
        return Err(format!("{name} must be {len} bytes"));
    }
    Ok(bytes)
}

fn decode_key(value: &str) -> Result<ed25519_dalek::VerifyingKey, String> {
    let bytes = decode_exact(value, 32, "public key")?;
    let bytes: [u8; 32] = bytes.try_into().map_err(|_| "key length".to_string())?;
    ed25519_dalek::VerifyingKey::from_bytes(&bytes).map_err(|_| "public key is not ed25519".into())
}

trait HashParse {
    fn from_str_hash(value: &str) -> Result<Self, String>
    where
        Self: Sized;
}

impl HashParse for ContentHash {
    fn from_str_hash(value: &str) -> Result<Self, String> {
        value
            .parse()
            .map_err(|error: agi_coder_core::Error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(program: &str) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "program": program,
            "train": [{"input": [[1, 2], [3, 4]], "output": [[1, 3], [2, 4]]}],
            "test_input": [[0, 1], [2, 3]],
            "test_output": [[0, 2], [1, 3]],
            "cost_micro_usd": 2,
            "tokens": 3
        }))
        .unwrap()
    }

    #[test]
    fn grid_pass_records_l1_and_a_real_ratio() {
        let mut session = Session::new();
        let view = session.run_grid(&task("transpose")).unwrap();
        assert_eq!(view["ladder"], "L1");
        assert_eq!(view["efficiency"], "1/5");
        assert_eq!(view["faculties"]["problem_solving"], "absent");
        assert_eq!(view["faculties"]["generation"], "absent");
        assert_eq!(view["declares_agi"], false);
        let handed = session.handoff(&task("transpose")).unwrap();
        assert_eq!(handed["ran"][1]["verdict"], "pass");
        assert_eq!(handed["ran"][2]["verdict"], "pass");
        assert_eq!(handed["ran"][3]["verdict"], "pass");
        assert!(handed["prepared"]["perception"]["reported"].is_null());
        assert_eq!(handed["prepared"]["attention"]["selected"], json!([]));
        assert_eq!(handed["session"]["faculties"]["perception"], "absent");
        assert_eq!(handed["session"]["faculties"]["attention"], "absent");
        assert_eq!(handed["session"]["faculties"]["memory"], "absent");
        assert_eq!(handed["session"]["faculties"]["problem_solving"], "absent");
        assert_eq!(handed["declares_agi"], false);
        let parties = serde_json::to_vec(&json!({
            "proposer_key": hex::encode(SigningKey::from_bytes(&[1; 32]).verifying_key().as_bytes()),
            "evaluator_key": hex::encode(SigningKey::from_bytes(&[2; 32]).verifying_key().as_bytes()),
            "proposer_entity": "proposer",
            "evaluator_entity": "evaluator",
            "proposer_environment": "local",
            "evaluator_environment": "other",
            "proposer_network": "loopback",
            "evaluator_network": "none"
        }))
        .unwrap();
        let linked = session.link(&parties).unwrap();
        assert_eq!(linked["linked"], true);
        assert_eq!(linked["receipt_issued"], true);
        assert_eq!(linked["session"]["receipt"]["valid"], true);
        assert_eq!(linked["session"]["receipt"]["bytes"], 174);
        assert_eq!(linked["session"]["assessment"], "pending");
        assert_eq!(linked["declares_agi"], false);
        let draft = session.bundle_draft().unwrap();
        assert!(draft["signature_hex"].is_null());
        assert!(draft["public_key_hex"].is_null());
        assert_eq!(draft["process_public_key"], session.view()["process_public_key"]);
        assert_eq!(draft["declares_agi"], false);
        assert_eq!(session.view()["assessment"], "pending");
        let mut early = Session::new();
        assert!(early.link(&parties).is_err());
        assert!(
            session.run_grid(&task("identity")).unwrap()["assessment"] == "contested"
                || session.view()["actions"][1]["verdict"] == "fail"
        );
    }

    #[test]
    fn receipt_is_174_bytes_and_a_flipped_body_fails() {
        let mut session = Session::new();
        session.record("plan", "pass", b"plan");
        let view = session.issue_receipt().unwrap();
        let hex_body = view["receipt"]["hex"].as_str().unwrap();
        assert_eq!(hex::decode(hex_body).unwrap().len(), 174);
        assert_eq!(view["receipt"]["valid"], true);
        let mut body = hex::decode(hex_body).unwrap();
        body[10] ^= 1;
        let signature = Signature::from_slice(
            &hex::decode(view["receipt"]["signature_hex"].as_str().unwrap()).unwrap(),
        )
        .unwrap();
        assert!(session
            .key
            .verifying_key()
            .verify(&body, &signature)
            .is_err());
    }

    #[test]
    fn same_key_is_rejected_and_a_second_key_can_verify() {
        let proposer = hex::encode(SigningKey::from_bytes(&[1; 32]).verifying_key().as_bytes());
        let evaluator = hex::encode(SigningKey::from_bytes(&[2; 32]).verifying_key().as_bytes());
        let mut rejected = Session::new();
        let same = serde_json::to_vec(&json!({
            "proposer_key": proposer,
            "evaluator_key": proposer,
            "proposer_entity": "a",
            "evaluator_entity": "b",
            "proposer_environment": "a",
            "evaluator_environment": "b",
            "proposer_network": "a",
            "evaluator_network": "b"
        }))
        .unwrap();
        assert_eq!(
            rejected.separate(&same).unwrap()["separation"]["pass"],
            false
        );
        let mut session = Session::new();
        session.run_grid(&task("transpose")).unwrap();
        let distinct = serde_json::to_vec(&json!({
            "proposer_key": proposer,
            "evaluator_key": evaluator,
            "proposer_entity": "proposer",
            "evaluator_entity": "evaluator",
            "proposer_environment": "lab-a",
            "evaluator_environment": "lab-b",
            "proposer_network": "net-a",
            "evaluator_network": "net-b"
        }))
        .unwrap();
        session.separate(&distinct).unwrap();
        let issued = session.issue_receipt().unwrap();
        assert_eq!(issued["assessment"], "pending");
        assert!(session.verify_bundle(b"{}").is_err());
        assert_eq!(session.view()["assessment"], "pending");
        assert_eq!(session.view()["authority"], false);
        let receipt = issued["receipt"]["hex"].as_str().unwrap();
        let attested = Session::attest(&hex::encode([8; 32]), receipt).unwrap();
        let leaf = session.actions.last().unwrap().leaf;
        let index = session.graph.len() as u64 - 1;
        let proof = session.graph.prove(index).unwrap();
        let bundle = serde_json::to_vec(&json!({
            "receipt_hex": receipt,
            "signature_hex": attested["signature_hex"],
            "public_key_hex": attested["public_key_hex"],
            "leaf": leaf.to_string(),
            "root": session.graph.root().to_string(),
            "proof": proof
        }))
        .unwrap();
        let checked = session.verify_bundle(&bundle).unwrap();
        assert_eq!(checked["verdict"], "pass");
        assert_eq!(checked["session"]["assessment"], "pass");
        assert_eq!(checked["session"]["authority"], false);
        assert_eq!(checked["session"]["declares_agi"], false);
        let demo = crate::ops::run_demo("Demonstrate evidence-gated execution").unwrap();
        assert_eq!(demo["authority"], false);
        assert_eq!(demo["deployed"], false);
        assert_eq!(demo["deployment"], "inconclusive");
    }

    #[test]
    fn a_blank_entity_issues_no_receipt() {
        let mut session = Session::new();
        session.run_grid(&task("transpose")).unwrap();
        let parties = serde_json::to_vec(&json!({
            "proposer_key": hex::encode(SigningKey::from_bytes(&[1; 32]).verifying_key().as_bytes()),
            "evaluator_key": hex::encode(SigningKey::from_bytes(&[2; 32]).verifying_key().as_bytes()),
            "proposer_entity": "proposer",
            "evaluator_entity": "   ",
            "proposer_environment": "lab-a",
            "evaluator_environment": "lab-b",
            "proposer_network": "net-a",
            "evaluator_network": "net-b"
        }))
        .unwrap();
        let response = crate::serve::handle("POST", "/api/link", &parties, &mut session);
        assert_eq!(response.status, 200);
        let body: Value = serde_json::from_slice(&response.body).unwrap();
        assert_eq!(body["linked"], false);
        assert_eq!(body["receipt_issued"], false);
        assert_eq!(body["declares_agi"], false);
        assert_eq!(body["reason"], "the parties were not separated, so no receipt was issued");
        assert_eq!(body["session"]["separation"]["pass"], false);
        assert_eq!(body["session"]["separation"]["reason"], "entity is missing");
        assert_eq!(body["session"]["assessment"], "contested");
        assert_eq!(body["session"]["authority"], false);
        assert_eq!(body["session"]["declares_agi"], false);
        assert_eq!(body["session"]["receipt"]["valid"], false);
    }

    #[test]
    fn an_invalid_third_key_stays_fail_closed() {
        let mut session = Session::new();
        session.run_grid(&task("transpose")).unwrap();
        let parties = serde_json::to_vec(&json!({
            "proposer_key": hex::encode(SigningKey::from_bytes(&[1; 32]).verifying_key().as_bytes()),
            "evaluator_key": hex::encode(SigningKey::from_bytes(&[2; 32]).verifying_key().as_bytes()),
            "proposer_entity": "proposer",
            "evaluator_entity": "evaluator",
            "proposer_environment": "lab-a",
            "evaluator_environment": "lab-b",
            "proposer_network": "net-a",
            "evaluator_network": "net-b"
        }))
        .unwrap();
        session.separate(&parties).unwrap();
        let issued = session.issue_receipt().unwrap();
        let receipt = issued["receipt"]["hex"].as_str().unwrap();
        let leaf = session.actions.last().unwrap().leaf.to_string();
        let root = session.graph.root().to_string();
        let proof = session.graph.prove(session.graph.len() as u64 - 1).unwrap();
        let malformed = serde_json::to_vec(&json!({
            "receipt_hex": receipt,
            "signature_hex": "11".repeat(64),
            "public_key_hex": "ff",
            "leaf": leaf,
            "root": root,
            "proof": proof
        }))
        .unwrap();
        let response = crate::serve::handle("POST", "/api/bundle", &malformed, &mut session);
        assert_eq!(response.status, 400);
        let body: Value = serde_json::from_slice(&response.body).unwrap();
        assert_eq!(body["error"], "public key must be 32 bytes");
        assert_eq!(body["authority"], false);
        assert!(body.get("verdict").is_none());
        assert_eq!(session.view()["assessment"], "pending");
        assert_eq!(session.view()["receipt"]["valid"], true);
        assert_eq!(session.view()["declares_agi"], false);

        let third = SigningKey::from_bytes(&[3; 32]);
        let rejected = serde_json::to_vec(&json!({
            "receipt_hex": receipt,
            "signature_hex": hex::encode(third.sign(b"not-the-receipt").to_bytes()),
            "public_key_hex": hex::encode(third.verifying_key().as_bytes()),
            "leaf": session.actions.last().unwrap().leaf.to_string(),
            "root": session.graph.root().to_string(),
            "proof": session.graph.prove(session.graph.len() as u64 - 1).unwrap()
        }))
        .unwrap();
        let checked = session.verify_bundle(&rejected).unwrap();
        assert_eq!(checked["verdict"], "fail");
        assert_eq!(checked["reason"], "signature rejected");
        assert_eq!(checked["declares_agi"], false);
        assert_eq!(checked["session"]["authority"], false);
        assert_eq!(checked["session"]["assessment"], "contested");
        assert_eq!(checked["session"]["receipt"]["valid"], false);
    }

    #[test]
    fn correction_keeps_the_failed_action() {
        let mut session = Session::new();
        session.record("bitflip", "fail", b"changed");
        assert_eq!(session.view()["assessment"], "contested");
        session.correct().unwrap();
        assert_eq!(session.actions[0].verdict, "fail");
        assert_eq!(session.actions[1].corrects, Some(0));
        assert!(session.correct().is_err());
    }

    #[test]
    fn local_seek_ends_without_an_arc_score() {
        let mut session = Session::new();
        session
            .run_arc3(br#"{"action":"1"}"#)
            .unwrap();
        let view = session.run_arc3(br#"{"action":"1"}"#).unwrap();
        assert_eq!(view["arc3"]["won"], true);
        assert_eq!(view["arc3"]["level"], 1);
        assert_eq!(view["arc3"]["actions"], 2);
        assert_eq!(view["arc3"]["official"], false);
        assert!(view["arc3"]["score"].is_null());
        assert_eq!(view["declares_agi"], false);
        let next = session.run_arc3(br#"{"action":"3"}"#).unwrap();
        assert_eq!(next["arc3"]["level"], 2);
        assert_eq!(next["arc3"]["won"], false);
    }

    #[test]
    fn faculty_files_pass_only_when_recomputed() {
        let other = hex::encode(SigningKey::from_bytes(&[8; 32]).verifying_key().as_bytes());
        let process = hex::encode(
            SigningKey::from_bytes(&PROCESS_SEED)
                .verifying_key()
                .as_bytes(),
        );
        let mut session = Session::new();
        let generation = include_str!(
            "../../agi-coder-cognition/fixtures/generation/pass.json"
        );
        let view = session.run_generation(generation.as_bytes()).unwrap();
        assert_eq!(view["faculties"]["generation"], "pass");
        assert_eq!(view["declares_agi"], false);
        let executive = include_str!(
            "../../agi-coder-cognition/fixtures/executive/pass.json"
        );
        assert_eq!(
            session.run_executive(executive.as_bytes()).unwrap()["faculties"]["executive_function"],
            "pass"
        );
        let social = include_str!("../../agi-coder-cognition/fixtures/social/pass.json")
            .replace("PENDING_OTHER_KEY", &other);
        assert_eq!(
            session.run_social(social.as_bytes()).unwrap()["faculties"]["social_cognition"],
            "pass"
        );
        let meta = include_str!(
            "../../agi-coder-cognition/fixtures/metacognition/agree.json"
        );
        let view = session.run_metacognition(meta.as_bytes()).unwrap();
        assert_eq!(view["faculties"]["metacognition"], "pass");
        assert_eq!(view["last_check"]["declares_agi"], false);
        assert_eq!(view["last_check"]["verdict"], "pass");

        let mut failed = Session::new();
        let production = include_str!(
            "../../agi-coder-cognition/fixtures/executive/production.json"
        );
        let view = failed.run_executive(production.as_bytes()).unwrap();
        assert_eq!(view["faculties"]["executive_function"], "fail");
        assert_eq!(view["assessment"], "contested");
        let self_claim = include_str!(
            "../../agi-coder-cognition/fixtures/social/self-claim.json"
        )
        .replace("PENDING_PROCESS_KEY", &process);
        assert_eq!(
            failed.run_social(self_claim.as_bytes()).unwrap()["faculties"]["social_cognition"],
            "fail"
        );
        let disagree = include_str!(
            "../../agi-coder-cognition/fixtures/metacognition/disagree.json"
        );
        assert_eq!(
            failed.run_metacognition(disagree.as_bytes()).unwrap()["faculties"]["metacognition"],
            "fail"
        );
        let ambiguous = include_str!(
            "../../agi-coder-cognition/fixtures/generation/ambiguous.json"
        );
        assert_eq!(
            failed.run_generation(ambiguous.as_bytes()).unwrap()["faculties"]["generation"],
            "fail"
        );
    }

    #[test]
    fn a_faculty_log_is_recomputed_when_reloaded() {
        let root = std::env::temp_dir().join(format!("agi-faculties-{}", std::process::id()));
        let path = root.join("faculties.json");
        let _ = std::fs::remove_dir_all(&root);
        let mut session = Session::new();
        let pass = include_str!("../../agi-coder-cognition/fixtures/perception/pass.json");
        session.run_perception(pass.as_bytes()).unwrap();
        session.save_faculties(&path).unwrap();
        let mut restored = Session::new();
        restored.load_faculties(&path).unwrap();
        let view = restored.view();
        assert_eq!(view["faculties"]["perception"], "pass");
        assert_eq!(view["declares_agi"], false);
        let misread = include_str!("../../agi-coder-cognition/fixtures/perception/misread.json");
        let mut failed = Session::new();
        failed.run_perception(misread.as_bytes()).unwrap();
        failed.save_faculties(&path).unwrap();
        let mut again = Session::new();
        again.load_faculties(&path).unwrap();
        assert_eq!(again.view()["faculties"]["perception"], "fail");
        let _ = std::fs::remove_dir_all(&root);
    }
}
