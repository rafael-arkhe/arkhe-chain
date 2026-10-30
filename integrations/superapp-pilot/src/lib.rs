//! Local acceptance pilot. The Rust host is trusted; the WASM guest is not.
use arkhe_verify_core::mmr::{verify_proof_at, ProofStep};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::OpenOptions,
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, RwLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use wasmi::{Caller, Config, Engine, Linker, Module, Store, StoreLimits, StoreLimitsBuilder};

pub type Hash = [u8; 32];
pub type Result<T> = std::result::Result<T, String>;
pub const MAX_BYTES: usize = 1024 * 1024;
pub fn hash(b: &[u8]) -> Hash {
    Sha256::digest(b).into()
}
fn bytes(out: &mut Vec<u8>, b: &[u8]) -> Result<()> {
    if b.len() > MAX_BYTES {
        return Err("field too large".into());
    }
    let n = u32::try_from(b.len()).map_err(|_| "length overflow")?;
    out.extend_from_slice(&n.to_be_bytes());
    out.extend_from_slice(b);
    Ok(())
}
fn strings(out: &mut Vec<u8>, v: &[String]) -> Result<()> {
    if v.len() > 64 {
        return Err("too many entries".into());
    }
    out.extend_from_slice(
        &u32::try_from(v.len())
            .map_err(|_| "count overflow")?
            .to_be_bytes(),
    );
    for s in v {
        bytes(out, s.as_bytes())?;
    }
    Ok(())
}
fn verify(k: &Hash, msg: &[u8], sig: &[u8]) -> bool {
    let (Ok(k), Ok(s)) = (VerifyingKey::from_bytes(k), Signature::from_slice(sig)) else {
        return false;
    };
    k.verify_strict(msg, &s).is_ok()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub publisher: Hash,
    pub bundle_digest: Hash,
    pub imports: Vec<String>,
    pub permissions: Vec<String>,
    pub signature: Vec<u8>,
}
impl Manifest {
    pub fn unsigned_bytes(&self) -> Result<Vec<u8>> {
        let mut o = b"ARKHE:PILOT:MANIFEST:1\0".to_vec();
        bytes(&mut o, &self.publisher)?;
        bytes(&mut o, &self.bundle_digest)?;
        strings(&mut o, &self.imports)?;
        strings(&mut o, &self.permissions)?;
        Ok(o)
    }
    pub fn sign(&mut self, key: &SigningKey) -> Result<()> {
        self.publisher = key.verifying_key().to_bytes();
        self.signature = key.sign(&self.unsigned_bytes()?).to_bytes().to_vec();
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Checkpoint {
    pub root: Hash,
    pub count: usize,
    pub epoch: u64,
    pub signature: Vec<u8>,
}
impl Checkpoint {
    pub fn unsigned_bytes(&self) -> Vec<u8> {
        let mut o = b"ARKHE:PILOT:CHECKPOINT:1\0".to_vec();
        o.extend_from_slice(&self.root);
        o.extend_from_slice(&(self.count as u64).to_be_bytes());
        o.extend_from_slice(&self.epoch.to_be_bytes());
        o
    }
    pub fn sign(&mut self, key: &SigningKey) {
        self.signature = key.sign(&self.unsigned_bytes()).to_bytes().to_vec();
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub max_age_seconds: u64,
    pub fuel: u64,
    pub memory_bytes: usize,
    pub allowed_apis: Vec<String>,
}
impl Policy {
    pub fn digest(&self) -> Result<Hash> {
        let mut o = b"ARKHE:PILOT:POLICY:1\0".to_vec();
        o.extend_from_slice(&self.max_age_seconds.to_be_bytes());
        o.extend_from_slice(&self.fuel.to_be_bytes());
        o.extend_from_slice(&(self.memory_bytes as u64).to_be_bytes());
        strings(&mut o, &self.allowed_apis)?;
        Ok(hash(&o))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TrustRoot {
    pub publisher_keys: Vec<Hash>,
    pub checkpoint_keys: Vec<Hash>,
    pub gate_keys: Vec<Hash>,
    pub policy: Policy,
}
impl TrustRoot {
    fn fingerprint(&self) -> Result<Hash> {
        Ok(hash(&serde_json::to_vec(self).map_err(|e| e.to_string())?))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Artifact {
    pub manifest: Manifest,
    pub bundle: Vec<u8>,
    pub checkpoint: Checkpoint,
    pub leaf_index: usize,
    pub proof: Vec<ProofStep>,
}
pub trait Clock: Send + Sync {
    fn now(&self) -> u64;
}
pub struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("host clock before epoch")
            .as_secs()
    }
}
static NEXT_CLIENT: AtomicU64 = AtomicU64::new(1);
#[derive(Clone)]
pub struct Client {
    trust: Arc<RwLock<TrustRoot>>,
    clock: Arc<dyn Clock>,
    log: PathBuf,
    id: u64,
}
/// Only the trusted host can create or pass this capability. Guest never receives it.
pub struct AdmissionToken {
    artifact: Artifact,
    trust_digest: Hash,
    issued_at: u64,
    expires_at: u64,
    executable: bool,
    client_id: u64,
    consent: Vec<String>,
}
impl AdmissionToken {
    pub fn can_query(&self) -> bool {
        true
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Event {
    pub epoch: u64,
    pub api: String,
    pub allowed: bool,
    pub reason: String,
}
impl Client {
    pub fn new(trust: TrustRoot, clock: Arc<dyn Clock>, log: PathBuf) -> Self {
        Self {
            trust: Arc::new(RwLock::new(trust)),
            clock,
            log,
            id: NEXT_CLIENT.fetch_add(1, Ordering::Relaxed),
        }
    }
    pub fn replace_trust(&self, trust: TrustRoot) {
        *self.trust.write().expect("trust lock") = trust;
    }
    pub fn admit(&self, artifact: &Artifact, consent: Vec<String>) -> Result<AdmissionToken> {
        let t = self.trust.read().map_err(|_| "trust lock")?;
        let now = self.clock.now();
        let m = &artifact.manifest;
        let cp = &artifact.checkpoint;
        if artifact.bundle.len() > MAX_BYTES {
            return Err("bundle too large".into());
        }
        if !t.publisher_keys.contains(&m.publisher)
            || !verify(&m.publisher, &m.unsigned_bytes()?, &m.signature)
        {
            return Err("publisher signature not trusted".into());
        }
        if hash(&artifact.bundle) != m.bundle_digest {
            return Err("bundle digest mismatch".into());
        }
        if cp.count == 0 || cp.count > 1_000_000 || artifact.proof.len() > 64 {
            return Err("MMR limits".into());
        }
        if !t
            .checkpoint_keys
            .iter()
            .any(|k| verify(k, &cp.unsigned_bytes(), &cp.signature))
        {
            return Err("checkpoint signature not trusted".into());
        }
        if !verify_proof_at(
            &m.unsigned_bytes()?,
            cp.count,
            artifact.leaf_index,
            &artifact.proof,
            &cp.root,
        )
        .map_err(|e| e.to_string())?
        {
            return Err("MMR inclusion invalid".into());
        }
        if cp.epoch > now {
            return Err("checkpoint in future".into());
        }
        let expires_at = cp
            .epoch
            .checked_add(t.policy.max_age_seconds)
            .ok_or("expiry overflow")?;
        Ok(AdmissionToken {
            artifact: artifact.clone(),
            trust_digest: t.fingerprint()?,
            issued_at: now,
            expires_at,
            executable: now <= expires_at,
            client_id: self.id,
            consent,
        })
    }
    pub fn can_execute(&self, token: &AdmissionToken) -> bool {
        self.validate(token).is_ok()
    }
    pub fn status(&self, token: &AdmissionToken) -> &'static str {
        if self.can_execute(token) {
            "ADMITTED"
        } else {
            "EVIDENCE_DEGRADED"
        }
    }
    fn validate(&self, token: &AdmissionToken) -> Result<()> {
        let t = self.trust.read().map_err(|_| "trust lock")?;
        let now = self.clock.now();
        if token.client_id != self.id {
            return Err("different client".into());
        }
        if token.trust_digest != t.fingerprint()? {
            return Err("trust or policy changed".into());
        }
        if now < token.issued_at || now > token.expires_at || !token.executable {
            return Err("EVIDENCE_DEGRADED: checkpoint expired or clock rollback".into());
        }
        Ok(())
    }
    fn append(&self, event: &Event) -> Result<()> {
        let mut line = serde_json::to_vec(event).map_err(|e| e.to_string())?;
        line.push(b'\n');
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log)
            .map_err(|e| e.to_string())?;
        file.write_all(&line)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())
    }
    pub fn call_api(&self, token: &AdmissionToken, api: &str) -> Result<i32> {
        let check = self.validate(token).and_then(|_| {
            let t = self.trust.read().map_err(|_| "trust lock")?;
            if !token.artifact.manifest.permissions.iter().any(|p| p == api) {
                return Err("api not declared".into());
            }
            if !token.consent.iter().any(|p| p == api) {
                return Err("user consent missing".into());
            }
            if !t.policy.allowed_apis.iter().any(|p| p == api) {
                return Err("api denied by policy".into());
            }
            Ok(())
        });
        let event = Event {
            epoch: self.clock.now(),
            api: api.into(),
            allowed: check.is_ok(),
            reason: check
                .as_ref()
                .err()
                .cloned()
                .unwrap_or_else(|| "allowed".into()),
        };
        // Logging failure prevents even allowed calls. No physical device API in pilot.
        self.append(&event)?;
        check?;
        Ok(1)
    }
    pub fn execute_candidate(&self, token: &AdmissionToken, candidate: &[u8]) -> Result<i32> {
        self.validate(token)?;
        if hash(candidate) != token.artifact.manifest.bundle_digest {
            return Err("bundle substituted".into());
        }
        // Execute the immutable owned copy, never reread a URL or path after admission.
        self.execute(token)
    }
    pub fn execute(&self, token: &AdmissionToken) -> Result<i32> {
        self.validate(token)?;
        let policy = self.trust.read().map_err(|_| "trust lock")?.policy.clone();
        let mut config = Config::default();
        config.consume_fuel(true);
        let engine = Engine::new(&config);
        let module = Module::new(&engine, &token.artifact.bundle[..]).map_err(|e| e.to_string())?;
        for import in module.imports() {
            let name = format!("{}.{}", import.module(), import.name());
            if !token.artifact.manifest.imports.contains(&name)
                || !matches!(name.as_str(), "arkhe.camera" | "arkhe.contacts")
            {
                return Err(format!("import not admitted: {name}"));
            }
        }
        struct Host<'a> {
            client: &'a Client,
            token: &'a AdmissionToken,
            limits: StoreLimits,
            log_failed: bool,
        }
        let host = Host {
            client: self,
            token,
            limits: StoreLimitsBuilder::new()
                .memory_size(policy.memory_bytes)
                .table_elements(1024)
                .instances(1)
                .memories(1)
                .tables(1)
                .build(),
            log_failed: false,
        };
        let mut store = Store::new(&engine, host);
        store.limiter(|h| &mut h.limits);
        store.set_fuel(policy.fuel).map_err(|e| e.to_string())?;
        let mut linker = Linker::<Host<'_>>::new(&engine);
        for api in ["camera", "contacts"] {
            linker
                .func_wrap(
                    "arkhe",
                    api,
                    move |mut caller: Caller<'_, Host<'_>>| -> i32 {
                        let h = caller.data();
                        match h.client.call_api(h.token, api) {
                            Ok(v) => v,
                            Err(_) => {
                                caller.data_mut().log_failed = true;
                                -1
                            }
                        }
                    },
                )
                .map_err(|e| e.to_string())?;
        }
        self.validate(token)?;
        let instance = linker
            .instantiate(&mut store, &module)
            .and_then(|p| p.start(&mut store))
            .map_err(|e| e.to_string())?;
        let run = instance
            .get_typed_func::<(), i32>(&store, "run")
            .map_err(|e| e.to_string())?;
        let value = run.call(&mut store, ()).map_err(|e| e.to_string())?;
        if store.data().log_failed {
            return Err("guest API denied; see durable audit".into());
        }
        self.validate(token)?;
        Ok(value)
    }
}
/// Real HTTP transport with timeout and response bound; no alternate source on failure.
pub fn fetch_artifact(url: &str) -> Result<Artifact> {
    let parsed = reqwest::Url::parse(url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https"
        && !(parsed.scheme() == "http"
            && matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")))
    {
        return Err("HTTPS required outside loopback".into());
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("provider unavailable; no fallback: {e}"))?;
    let mut b = Vec::new();
    response
        .take((MAX_BYTES * 8 + 1) as u64)
        .read_to_end(&mut b)
        .map_err(|e| e.to_string())?;
    if b.len() > MAX_BYTES * 8 {
        return Err("response too large".into());
    }
    serde_json::from_slice(&b).map_err(|e| e.to_string())
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvidencePackage {
    pub version: u32,
    pub artifact: Artifact,
    pub policy: Policy,
    pub policy_digest: Hash,
    pub evaluated_at: u64,
    pub decision: String,
    pub consent: Vec<String>,
    pub events: Vec<Event>,
    pub gate_pubkey: Hash,
    pub gate_signature: Vec<u8>,
}
impl EvidencePackage {
    pub fn unsigned_bytes(&self) -> Result<Vec<u8>> {
        let mut o = b"ARKHE:PILOT:PACKAGE:1\0".to_vec();
        let a = &self.artifact;
        o.extend_from_slice(&self.version.to_be_bytes());
        bytes(&mut o, &a.manifest.unsigned_bytes()?)?;
        bytes(&mut o, &a.manifest.signature)?;
        bytes(&mut o, &a.bundle)?;
        bytes(&mut o, &a.checkpoint.unsigned_bytes())?;
        bytes(&mut o, &a.checkpoint.signature)?;
        o.extend_from_slice(&(a.leaf_index as u64).to_be_bytes());
        if a.proof.len() > 64 {
            return Err("proof too long".into());
        }
        o.extend_from_slice(&(a.proof.len() as u32).to_be_bytes());
        for p in &a.proof {
            bytes(&mut o, p.kind.as_bytes())?;
            bytes(&mut o, p.direction.as_bytes())?;
            bytes(&mut o, &p.hash)?;
        }
        bytes(&mut o, &self.policy.digest()?)?;
        bytes(&mut o, &self.policy_digest)?;
        o.extend_from_slice(&self.evaluated_at.to_be_bytes());
        bytes(&mut o, self.decision.as_bytes())?;
        strings(&mut o, &self.consent)?;
        if self.events.len() > 1024 {
            return Err("too many events".into());
        }
        o.extend_from_slice(&(self.events.len() as u32).to_be_bytes());
        for e in &self.events {
            o.extend_from_slice(&e.epoch.to_be_bytes());
            bytes(&mut o, e.api.as_bytes())?;
            o.push(u8::from(e.allowed));
            bytes(&mut o, e.reason.as_bytes())?;
        }
        bytes(&mut o, &self.gate_pubkey)?;
        Ok(o)
    }
    pub fn sign(&mut self, key: &SigningKey) -> Result<()> {
        self.gate_pubkey = key.verifying_key().to_bytes();
        self.gate_signature = key.sign(&self.unsigned_bytes()?).to_bytes().to_vec();
        Ok(())
    }
}

/// Reproducible PUBLIC TEST KEYS only. Never use for real trust or private data.
pub mod demo {
    use super::*;
    use arkhe_verify_core::mmr::build_root_and_proof;
    pub fn fixture(now: u64) -> (Artifact, TrustRoot, SigningKey) {
        let publisher = SigningKey::from_bytes(&[11; 32]);
        let cp_key = SigningKey::from_bytes(&[22; 32]);
        let gate = SigningKey::from_bytes(&[33; 32]);
        let bundle = wat::parse_str("(module (import \"arkhe\" \"camera\" (func $camera (result i32))) (func (export \"run\") (result i32) call $camera))").unwrap();
        let mut manifest = Manifest {
            publisher: [0; 32],
            bundle_digest: hash(&bundle),
            imports: vec!["arkhe.camera".into()],
            permissions: vec!["camera".into()],
            signature: vec![],
        };
        manifest.sign(&publisher).unwrap();
        let leaves = vec![
            b"previous evidence".to_vec(),
            manifest.unsigned_bytes().unwrap(),
            b"other evidence".to_vec(),
        ];
        let (root, proof) = build_root_and_proof(&leaves, 1).unwrap();
        let mut checkpoint = Checkpoint {
            root,
            count: leaves.len(),
            epoch: now,
            signature: vec![],
        };
        checkpoint.sign(&cp_key);
        let artifact = Artifact {
            manifest,
            bundle,
            checkpoint,
            leaf_index: 1,
            proof,
        };
        let trust = TrustRoot {
            publisher_keys: vec![publisher.verifying_key().to_bytes()],
            checkpoint_keys: vec![cp_key.verifying_key().to_bytes()],
            gate_keys: vec![gate.verifying_key().to_bytes()],
            policy: Policy {
                max_age_seconds: 300,
                fuel: 100_000,
                memory_bytes: 1024 * 1024,
                allowed_apis: vec!["camera".into()],
            },
        };
        (artifact, trust, gate)
    }
}
