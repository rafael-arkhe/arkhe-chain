use crate::{cbor, ContentHash, OperationId, Timestamp};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelfCheckResult {
    Pass,
    Fail,
    Skipped,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TestResults {
    pub passed: u32,
    pub failed: u32,
    pub skipped: u32,
}
impl TestResults {
    pub fn result(&self) -> SelfCheckResult {
        if self.failed > 0 {
            SelfCheckResult::Fail
        } else if self.passed > 0 && self.skipped == 0 {
            SelfCheckResult::Pass
        } else {
            SelfCheckResult::Skipped
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerExecutionRecord {
    pub operation_id: OperationId,
    pub intent_digest: ContentHash,
    pub prev_hash: Option<ContentHash>,
    pub worker: String,
    pub plan_digest: ContentHash,
    pub output: ContentHash,
    pub tests: TestResults,
    pub test_artifact: ContentHash,
    pub self_check: SelfCheckResult,
    pub completed_at: Timestamp,
    pub signer: String,
    pub record_hash: ContentHash,
    pub signature: Vec<u8>,
}
impl WorkerExecutionRecord {
    pub fn compute_hash(&self) -> Result<ContentHash, crate::Error> {
        let data = (
            &self.operation_id,
            &self.intent_digest,
            &self.prev_hash,
            &self.worker,
            &self.plan_digest,
            &self.output,
            &self.tests,
            &self.test_artifact,
            self.self_check,
            self.completed_at,
            &self.signer,
        );
        Ok(ContentHash::domain(
            "AGI/WER/v1",
            &[&cbor::canonical(&data)?],
        ))
    }
    pub fn sign(mut self, key: &SigningKey) -> Result<Self, crate::Error> {
        self.signer = hex::encode(key.verifying_key().as_bytes());
        self.self_check = self.tests.result();
        self.record_hash = self.compute_hash()?;
        self.signature = key.sign(self.record_hash.as_bytes()).to_bytes().to_vec();
        Ok(self)
    }
    pub fn verify(&self) -> Result<(), crate::Error> {
        if self.compute_hash()? != self.record_hash || self.self_check != self.tests.result() {
            return Err(crate::Error::Signature);
        }
        let public: [u8; 32] = hex::decode(&self.signer)
            .map_err(|_| crate::Error::Signature)?
            .try_into()
            .map_err(|_| crate::Error::Signature)?;
        let key = VerifyingKey::from_bytes(&public).map_err(|_| crate::Error::Signature)?;
        let signature =
            Signature::from_slice(&self.signature).map_err(|_| crate::Error::Signature)?;
        key.verify_strict(self.record_hash.as_bytes(), &signature)
            .map_err(|_| crate::Error::Signature)
    }
}
