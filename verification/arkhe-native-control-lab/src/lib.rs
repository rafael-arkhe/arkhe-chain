//! Fixture adapter to the REAL Arkhe broker + L1 dual-socket OS-peer boundary.
//! Not a production service; test credentials are public and reproducible.
pub mod l1;

use arkhe_core::{
    evidence::{EvidenceEnvelope, EvidenceReader},
    work::{ContextEntry, ContextKind, RequestIdentity, WorkIntent, WorkIntentType},
    worker::{CognitiveOperation, WorkerExecutionRecord},
    Digest32,
};
use arkhe_governance::{EvidenceKindRequirement, PolicyBinding, PolicyResolver, PolicyVerdict};
use arkhe_kernel::broker::CapabilityExecutor;
use arkhe_verify_core::{
    action_proof::{self, ActionProof, Checkpoint, Mandate},
    mmr,
};
use async_trait::async_trait;
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

// Public test credentials, deliberately reproducible. NEVER use for real authority.
pub fn mandate_key() -> SigningKey {
    SigningKey::from_bytes(&[71; 32])
}
pub fn log_key() -> SigningKey {
    SigningKey::from_bytes(&[73; 32])
}
pub fn policy_digest() -> Digest32 {
    Digest32::blake3(b"LAB:POLICY", b"native-fs-v1")
}

pub struct LabPolicy;
impl PolicyResolver for LabPolicy {
    fn resolve(&self, intent: &WorkIntent, binding: &PolicyBinding) -> PolicyVerdict {
        if intent.intent_type == WorkIntentType::Implement
            && intent.requested_by == "lab-agent"
            && binding.policy_digest == policy_digest()
        {
            PolicyVerdict::Allow
        } else {
            PolicyVerdict::Deny("outside fixture policy".into())
        }
    }
    fn required_worker_evidence(
        &self,
        _: &WorkIntent,
        _: &PolicyBinding,
    ) -> Option<EvidenceKindRequirement> {
        Some(EvidenceKindRequirement {
            allowed_modules: vec!["native-lab".into()],
            allowed_operations: vec![CognitiveOperation::Analyze],
        })
    }
}

pub struct Evidence(pub EvidenceEnvelope);
#[async_trait]
impl EvidenceReader for Evidence {
    async fn get(&self, hash: Digest32) -> Result<Option<EvidenceEnvelope>, String> {
        Ok((hash == self.0.record_hash).then(|| self.0.clone()))
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WriteArgs {
    pub path: PathBuf,
    pub content: String,
}
impl WriteArgs {
    pub fn target(&self) -> Digest32 {
        Digest32::blake3(b"LAB:TARGET", self.path.to_string_lossy().as_bytes())
    }
    pub fn parameters(&self) -> Digest32 {
        Digest32::blake3(
            b"LAB:PARAMETERS",
            &serde_json::to_vec(self).expect("serializable fixture args"),
        )
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fixture {
    pub args: WriteArgs,
    pub intent: WorkIntent,
    pub worker: WorkerExecutionRecord,
    pub envelope: EvidenceEnvelope,
    pub proof: ActionProof,
}

pub fn prepare_for_caller(
    path: PathBuf,
    request_tag: &[u8],
    requested_by: &str,
) -> Result<Fixture, String> {
    let args = WriteArgs {
        path,
        content: "authorized native Arkhe effect\n".into(),
    };
    let source = Digest32::blake3(b"LAB:SOURCE", b"known fixture");
    let worker = WorkerExecutionRecord {
        classification: None,
        operation: Some(CognitiveOperation::Analyze),
        module_id: "native-lab".into(),
        module_version: "1".into(),
        input_digest: source,
        output_digest: args.parameters(),
        evidence_refs: vec![source],
        confidence_bps: None,
        uncertainty_note: None,
        execution_id: "native-lab-fixture".into(),
    };
    let hash = worker.digest();
    let intent = WorkIntent {
        requested_by: requested_by.into(),
        intent_type: WorkIntentType::Implement,
        target: args.target(),
        parameters_digest: args.parameters(),
        context: vec![
            ContextEntry {
                kind: ContextKind::SourceReport,
                hash: source,
            },
            ContextEntry {
                kind: ContextKind::AnalysisRecord,
                hash,
            },
        ],
        context_refs: vec![],
        request_identity: RequestIdentity::new(request_tag),
        claimed_created_at: 100,
    };
    let envelope = EvidenceEnvelope {
        record_hash: hash,
        kind: "WorkerExecutionRecord".into(),
        subject: source,
        payload_digest: hash,
        policy_digest: None,
        causal_parents: vec![source],
    };
    let mandate = Mandate {
        profile: action_proof::PROFILE.into(),
        requested_by: intent.requested_by.clone(),
        intent_type: intent.intent_type.clone(),
        operation_id: intent.operation_id(),
        target: intent.target,
        policy_digest: policy_digest(),
        allowed_parameters: vec![intent.parameters_digest],
        issued_at: 100,
        expires_at: 1000,
    };
    let payload = action_proof::mandate_bytes(&mandate).map_err(str::to_owned)?;
    let (root, steps) = mmr::build_root_and_proof(std::slice::from_ref(&payload), 0)
        .map_err(|e| format!("{e:?}"))?;
    let checkpoint = Checkpoint {
        profile_digest: mmr::profile::PROFILE_DIGEST_HEX.into(),
        root,
        leaf_count: 1,
        issued_at: 101,
    };
    let proof = ActionProof {
        mandate_signature: mandate_key().sign(&payload).to_bytes().to_vec(),
        mandate,
        checkpoint_signature: log_key()
            .sign(&action_proof::checkpoint_bytes(&checkpoint).map_err(str::to_owned)?)
            .to_bytes()
            .to_vec(),
        checkpoint,
        leaf_index: 0,
        steps,
    };
    Ok(Fixture {
        args,
        intent,
        worker,
        envelope,
        proof,
    })
}

pub fn prepare(path: PathBuf, request_tag: &[u8]) -> Result<Fixture, String> {
    prepare_for_caller(path, request_tag, "lab-agent")
}

pub struct Writer {
    pub args: WriteArgs,
    pub entered: Arc<AtomicBool>,
    pub finished: Arc<AtomicBool>,
    pub pause: Option<PathBuf>,
}

impl CapabilityExecutor for Writer {
    fn execute(&mut self, intent: &WorkIntent) -> Result<Vec<u8>, String> {
        if intent.target != self.args.target() || intent.parameters_digest != self.args.parameters()
        {
            return Err("executor arguments differ from authorized commitments".into());
        }
        self.entered.store(true, Ordering::SeqCst);
        if let Some(prefix) = &self.pause {
            fs::write(
                prefix.with_extension("ready"),
                b"admitted and reserved; waiting before effect",
            )
            .map_err(|e| e.to_string())?;
            let started = Instant::now();
            while !prefix.with_extension("release").exists() {
                if started.elapsed() > Duration::from_secs(15) {
                    return Err("fixture release timeout".into());
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        // Flat fresh fixture target only. No claim of general hostile path confinement.
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.args.path)
            .map_err(|e| e.to_string())?;
        file.write_all(self.args.content.as_bytes())
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        self.finished.store(true, Ordering::SeqCst);
        serde_json::to_vec(&json!({
            "target": self.args.path,
            "parameters": intent.parameters_digest,
        }))
        .map_err(|e| e.to_string())
    }
}
