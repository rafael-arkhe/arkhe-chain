use crate::{
    crypto::{canonical, digest, Envelope, Hash},
    require, Result,
};
use async_trait::async_trait;
use ed25519_dalek::{SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;
pub const PROFILE: &str = "arkhe-ritual-mock-v1";
pub const PLATFORM: &[u8] = b"AKG:RITUAL:MOCK-PLATFORM:v1\0";
pub const ANALYSIS: &[u8] = b"AKG:RITUAL:ANALYSIS:v1\0";
pub const AUTH: &[u8] = b"AKG:RITUAL:AUTHORIZATION:v1\0";
pub const RECEIPT: &[u8] = b"AKG:RITUAL:RECEIPT:v1\0";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub tenant: Uuid,
    pub operation: Hash,
    pub intent: Hash,
    pub parameters: Hash,
    pub input: Hash,
    pub policy: Hash,
    pub effect_index: u32,
    pub destination: String,
    pub payload_digest: Hash,
}
impl Request {
    pub fn commitment(&self) -> Result<Hash> {
        digest(b"AKG:RITUAL:REQUEST:v1\0", self)
    }
    pub fn effect_id(&self) -> Result<Hash> {
        // Logical execution identity excludes policy/analysis/attestation revisions.
        // Payload and all authorization context are checked separately against the
        // stored effect: changing them must not create a second execution silently.
        digest(
            b"AKG:RITUAL:EFFECT:v1\0",
            &(
                self.tenant,
                self.operation,
                self.parameters,
                self.effect_index,
                &self.destination,
            ),
        )
    }
    pub fn check_payload(&self, payload: &[u8]) -> Result<()> {
        require(
            crate::crypto::hash(b"AKG:RITUAL:PAYLOAD:v1\0", payload) == self.payload_digest,
            "payload mismatch",
        )
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Challenge {
    pub id: Uuid,
    pub tenant: Uuid,
    pub nonce: Hash,
    pub request: Hash,
    pub profile: String,
    pub expires: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlatformClaim {
    pub profile: String,
    pub measurement: Hash,
    pub instance: Hash,
    pub app_key: Hash,
    pub challenge: Uuid,
    pub nonce: Hash,
    pub tenant: Uuid,
    pub request: Hash,
    pub expires: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Analysis {
    pub request: Request,
    pub challenge: Uuid,
    pub nonce: Hash,
    pub profile: String,
    pub attestation: Hash,
    pub output: Hash,
}
#[derive(Debug, Clone)]
pub struct AnalysisBundle {
    pub platform: Envelope,
    pub statement: Envelope,
}

/// Only the verifier can construct this value; it carries the exact authenticated statement.
pub struct VerifiedAnalysis {
    analysis: Analysis,
    digest: Hash,
}
impl VerifiedAnalysis {
    pub fn analysis(&self) -> &Analysis {
        &self.analysis
    }
    pub fn commitment(&self) -> Hash {
        self.digest
    }
}
pub struct MockPlatformVerifier {
    key: VerifyingKey,
    measurements: HashSet<Hash>,
    enabled: bool,
}
impl MockPlatformVerifier {
    pub fn new(
        key: VerifyingKey,
        measurements: impl IntoIterator<Item = Hash>,
        enabled: bool,
    ) -> Self {
        Self {
            key,
            measurements: measurements.into_iter().collect(),
            enabled,
        }
    }
    pub fn verify(
        &self,
        bundle: &AnalysisBundle,
        challenge: &Challenge,
        request: &Request,
        payload: &[u8],
        now: i64,
    ) -> Result<VerifiedAnalysis> {
        require(self.enabled, "mock attestation disabled")?;
        request.check_payload(payload)?;
        let p: PlatformClaim = bundle.platform.open(PLATFORM, &self.key)?;
        let key = VerifyingKey::from_bytes(&p.app_key)
            .map_err(|_| crate::Error::Rejected("app key invalid"))?;
        let a: Analysis = bundle.statement.open(ANALYSIS, &key)?;
        require(
            p.profile == PROFILE && challenge.profile == PROFILE && a.profile == PROFILE,
            "profile mismatch",
        )?;
        require(
            self.measurements.contains(&p.measurement),
            "measurement not approved",
        )?;
        require(
            p.expires > now && challenge.expires > now && p.expires <= challenge.expires,
            "attestation expired",
        )?;
        require(
            p.challenge == challenge.id && a.challenge == challenge.id,
            "challenge mismatch",
        )?;
        require(
            p.nonce == challenge.nonce && a.nonce == challenge.nonce,
            "nonce mismatch",
        )?;
        require(
            p.tenant == request.tenant && challenge.tenant == request.tenant,
            "tenant mismatch",
        )?;
        require(
            p.request == request.commitment()?
                && challenge.request == p.request
                && a.request == *request,
            "request mismatch",
        )?;
        require(
            a.attestation == digest(b"AKG:RITUAL:PLATFORM-ENVELOPE:v1\0", &bundle.platform)?,
            "attestation digest mismatch",
        )?;
        Ok(VerifiedAnalysis {
            digest: digest(ANALYSIS, &a)?,
            analysis: a,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Authorization {
    pub id: Uuid,
    pub challenge: Uuid,
    pub tenant: Uuid,
    pub request: Hash,
    pub effect: Hash,
    pub analysis: Hash,
    pub policy: Hash,
    pub profile: String,
    pub allow: bool,
    pub issued: i64,
    pub expires: i64,
}
impl Authorization {
    pub fn commitment(&self) -> Result<Hash> {
        digest(AUTH, self)
    }
}
/// Implementations must evaluate the exact request, not just recognize its policy digest.
#[async_trait]
pub trait GatePolicy: Send + Sync {
    async fn authorize(&self, analysis: &VerifiedAnalysis) -> Result<()>;
}
pub struct GateIssuer {
    key: SigningKey,
}
impl GateIssuer {
    pub fn new(key: SigningKey) -> Self {
        Self { key }
    }
    pub fn public_key(&self) -> VerifyingKey {
        self.key.verifying_key()
    }
    pub async fn issue(
        &self,
        gate: &dyn GatePolicy,
        verified: &VerifiedAnalysis,
        challenge: &Challenge,
        now: i64,
        ttl: i64,
    ) -> Result<Envelope> {
        require(
            ttl > 0 && ttl <= 300 && challenge.expires > now,
            "authorization ttl invalid",
        )?;
        let a = verified.analysis();
        require(
            a.challenge == challenge.id
                && a.nonce == challenge.nonce
                && a.request.commitment()? == challenge.request
                && a.request.tenant == challenge.tenant,
            "gate challenge mismatch",
        )?;
        gate.authorize(verified).await?;
        let auth = Authorization {
            id: Uuid::new_v4(),
            challenge: challenge.id,
            tenant: a.request.tenant,
            request: a.request.commitment()?,
            effect: a.request.effect_id()?,
            analysis: verified.commitment(),
            policy: a.request.policy,
            profile: a.profile.clone(),
            allow: true,
            issued: now,
            expires: (now + ttl).min(challenge.expires),
        };
        Envelope::sign(&auth, AUTH, &self.key)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DestinationEvidence {
    pub effect: Hash,
    pub payload: Hash,
    pub destination: String,
    pub result: Hash,
    pub succeeded: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecutionReceipt {
    pub effect: Hash,
    pub attempt: Uuid,
    pub epoch: i64,
    pub authorization: Hash,
    pub analysis: Hash,
    pub policy: Hash,
    pub evidence: DestinationEvidence,
    pub dispatched_at: i64,
    pub observed_at: i64,
}
impl ExecutionReceipt {
    pub fn commitment(&self) -> Result<Hash> {
        digest(RECEIPT, self)
    }
}
pub fn receipt_evidence_bytes(receipt: &ExecutionReceipt) -> Result<Vec<u8>> {
    canonical(receipt)
}
