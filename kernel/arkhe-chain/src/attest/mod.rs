//! Signed attestations and single-use authorizations.
//!
//! An attestation binds a statement to a signer. Admission checks the
//! signature, the domain, and the replay and quota limits. It does not check
//! that the statement is true. Authority is checked again when an approval
//! is executed, against the grants and revocations in force at that height.

use std::collections::{BTreeMap, BTreeSet};

use arkhe_core::Digest32;
use arkhe_verify_core::rbb::mmr::{self, Frontier, Proof};
use libp2p::identity::ed25519;

mod rotation;

#[allow(unused_imports)]
pub use rotation::{
    build_rotation_proof, check_rotation, rotation_commitment, RotationOutcome, EMPTY_SEGMENT_ROOT,
    MAX_LEAVES, ROTATION_PROOF_LEN,
};

use crate::error::ChainError;
use crate::tx::account_id;

pub const ATTEST_VERSION: u8 = 1;
/// Ed25519 over the attestation id. The only scheme this verifier accepts.
pub const ATTEST_SCHEME_ED25519: u8 = 1;
/// Attestations and receipts share one MMR, bounded by the local prover.
pub const ATTEST_MAX_RECORDS: usize = 4096;
pub const ATTEST_SIGNER_QUOTA: usize = 64;
/// The audience a node's own registry accepts.
pub const ATTEST_AUDIENCE: &str = "arkhe-chain/attest";
pub const ATTEST_MAX_OPS_PER_BLOCK: usize = 64;
pub const ATTEST_POOL_CAPACITY: usize = 256;

const ID_DOMAIN: &[u8] = b"AKG:CHAIN:ATTEST:v1\0";
const SIG_DOMAIN: &[u8] = b"AKG:CHAIN:ATTEST:SIG:v1\0";
const RECEIPT_DOMAIN: &[u8] = b"AKG:CHAIN:ATTEST:RECEIPT:v1\0";
const POLICY_DOMAIN: &[u8] = b"AKG:CHAIN:ATTEST:POLICY:v1\0";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Role {
    Requester = 1,
    Author = 2,
    Evaluator = 3,
    Approver = 4,
}

impl Role {
    pub(crate) fn from_u8(tag: u8) -> Option<Self> {
        match tag {
            1 => Some(Self::Requester),
            2 => Some(Self::Author),
            3 => Some(Self::Evaluator),
            4 => Some(Self::Approver),
            _ => None,
        }
    }

    pub(crate) fn from_name(name: &str) -> Option<Self> {
        [
            Self::Requester,
            Self::Author,
            Self::Evaluator,
            Self::Approver,
        ]
        .into_iter()
        .find(|role| role.name() == name)
    }

    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Requester => "requester",
            Self::Author => "author",
            Self::Evaluator => "evaluator",
            Self::Approver => "approver",
        }
    }
}

/// What a block carries after its transactions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AttestOp {
    Admit(Attestation),
    /// Consume one approval. The op carries no signature of its own; the
    /// proposer signature over the block covers it.
    Execute {
        approval: [u8; 32],
        action: [u8; 32],
        artifact: [u8; 32],
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Claim {
    /// "I request this task, within this budget."
    Request { task: [u8; 32], budget: u64 },
    /// "I produced this artifact for that request."
    Artifact {
        request: [u8; 32],
        artifact: [u8; 32],
    },
    /// "I ran this suite in this environment on this artifact."
    Evaluation {
        artifact: [u8; 32],
        suite: [u8; 32],
        environment: [u8; 32],
        evidence: [u8; 32],
        passed: bool,
    },
    /// "I authorize this action on this artifact, given that evaluation."
    Approval {
        action: [u8; 32],
        artifact: [u8; 32],
        evaluation: [u8; 32],
        policy: [u8; 32],
    },
    /// "I withdraw the grant I gave."
    Revocation { delegate: String, role: Role },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Attestation {
    pub version: u8,
    pub scheme: u8,
    pub chain_id: String,
    pub genesis: [u8; 32],
    pub audience: String,
    pub signer: String,
    pub nonce: [u8; 32],
    /// First and last height at which the attestation has effect.
    pub not_before: u64,
    pub expires: u64,
    pub claim: Claim,
    pub signature: [u8; 64],
}

impl Attestation {
    /// Covers every field except the signature.
    pub fn id(&self) -> [u8; 32] {
        Digest32::blake3(ID_DOMAIN, &self.body()).0
    }

    /// Canonical bytes of every field except the signature. The block codec
    /// writes these bytes followed by the signature.
    pub(crate) fn body(&self) -> Vec<u8> {
        let mut body = vec![self.version, self.scheme];
        push_str(&mut body, &self.chain_id);
        body.extend_from_slice(&self.genesis);
        push_str(&mut body, &self.audience);
        push_str(&mut body, &self.signer);
        body.extend_from_slice(&self.nonce);
        body.extend_from_slice(&self.not_before.to_be_bytes());
        body.extend_from_slice(&self.expires.to_be_bytes());
        match &self.claim {
            Claim::Request { task, budget } => {
                body.push(1);
                body.extend_from_slice(task);
                body.extend_from_slice(&budget.to_be_bytes());
            }
            Claim::Artifact { request, artifact } => {
                body.push(2);
                body.extend_from_slice(request);
                body.extend_from_slice(artifact);
            }
            Claim::Evaluation {
                artifact,
                suite,
                environment,
                evidence,
                passed,
            } => {
                body.push(3);
                body.extend_from_slice(artifact);
                body.extend_from_slice(suite);
                body.extend_from_slice(environment);
                body.extend_from_slice(evidence);
                body.push(u8::from(*passed));
            }
            Claim::Approval {
                action,
                artifact,
                evaluation,
                policy,
            } => {
                body.push(4);
                body.extend_from_slice(action);
                body.extend_from_slice(artifact);
                body.extend_from_slice(evaluation);
                body.extend_from_slice(policy);
            }
            Claim::Revocation { delegate, role } => {
                body.push(5);
                push_str(&mut body, delegate);
                body.push(*role as u8);
            }
        }
        body
    }

    fn message(&self) -> Vec<u8> {
        let mut out = SIG_DOMAIN.to_vec();
        out.extend_from_slice(&self.id());
        out
    }
}

pub fn sign_attestation(att: &mut Attestation, secret_key: &[u8; 32]) -> Result<(), ChainError> {
    let signer = crate::signer_from(secret_key)?;
    att.signature = signer
        .sign(&att.message())
        .as_slice()
        .try_into()
        .map_err(|_| ChainError::UnverifiedSignature)?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Grant {
    pub delegate: String,
    pub role: Role,
    pub grantor: String,
    /// Last height at which the grant holds.
    pub expires: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AttestPolicy {
    pub keys: BTreeMap<String, [u8; 32]>,
    pub grants: Vec<Grant>,
}

impl AttestPolicy {
    fn check(&self) -> Result<(), ChainError> {
        for (account, key) in &self.keys {
            if !account_id(account) {
                return Err(ChainError::BadAccount);
            }
            ed25519::PublicKey::try_from_bytes(key).map_err(|_| ChainError::UnverifiedSignature)?;
        }
        let mut seen = BTreeSet::new();
        for grant in &self.grants {
            if !self.keys.contains_key(&grant.delegate) || !self.keys.contains_key(&grant.grantor) {
                return Err(ChainError::BadAccount);
            }
            if !seen.insert((grant.delegate.as_str(), grant.role)) {
                return Err(ChainError::Attest("policy"));
            }
        }
        Ok(())
    }

    /// Covers the keys and the grants. Revocations are registry state and
    /// are not part of the digest.
    pub fn digest(&self) -> [u8; 32] {
        let mut body = Vec::new();
        body.extend_from_slice(&(self.keys.len() as u32).to_be_bytes());
        for (account, key) in &self.keys {
            push_str(&mut body, account);
            body.extend_from_slice(key);
        }
        let mut grants: Vec<&Grant> = self.grants.iter().collect();
        grants.sort_by(|a, b| (&a.delegate, a.role).cmp(&(&b.delegate, b.role)));
        body.extend_from_slice(&(grants.len() as u32).to_be_bytes());
        for grant in grants {
            push_str(&mut body, &grant.delegate);
            body.push(grant.role as u8);
            push_str(&mut body, &grant.grantor);
            body.extend_from_slice(&grant.expires.to_be_bytes());
        }
        Digest32::blake3(POLICY_DOMAIN, &body).0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Receipt {
    pub approval: [u8; 32],
    pub evaluation: [u8; 32],
    pub artifact: [u8; 32],
    pub action: [u8; 32],
    pub height: u64,
    /// Index of the receipt leaf in the registry MMR.
    pub leaf: u64,
}

impl Receipt {
    pub fn record(&self) -> [u8; 32] {
        let mut body = Vec::new();
        body.extend_from_slice(&self.approval);
        body.extend_from_slice(&self.evaluation);
        body.extend_from_slice(&self.artifact);
        body.extend_from_slice(&self.action);
        body.extend_from_slice(&self.height.to_be_bytes());
        Digest32::blake3(RECEIPT_DOMAIN, &body).0
    }
}

/// What the registry can show about one admitted attestation. Each field is
/// a separate fact; none of them says the statement is true.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttestStatus {
    /// The signature verified against the policy key at admission.
    pub signature_valid: bool,
    /// The signer holds the role for this kind of claim at the asked height.
    pub authority_confirmed: bool,
    /// Leaf index in the registry MMR.
    pub included: u64,
    /// Leaf index of the receipt, for an approval that was executed.
    pub execution_recorded: Option<u64>,
    /// The claim names an evidence hash. The registry does not hold the
    /// evidence and does not check that it can be fetched.
    pub evidence_referenced: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttestRegistry {
    chain_id: String,
    genesis: [u8; 32],
    audience: String,
    policy: AttestPolicy,
    policy_digest: [u8; 32],
    records: Vec<[u8; 32]>,
    frontier: Frontier,
    attestations: BTreeMap<[u8; 32], (Attestation, u64)>,
    nonces: BTreeSet<(String, [u8; 32])>,
    per_signer: BTreeMap<String, usize>,
    revoked: BTreeMap<(String, Role), u64>,
    consumed: BTreeMap<[u8; 32], Receipt>,
}

impl AttestRegistry {
    pub fn new(
        chain_id: &str,
        genesis: [u8; 32],
        audience: &str,
        policy: AttestPolicy,
    ) -> Result<Self, ChainError> {
        if !account_id(chain_id) || !account_id(audience) {
            return Err(ChainError::Attest("domain"));
        }
        policy.check()?;
        Ok(Self {
            chain_id: chain_id.to_string(),
            genesis,
            audience: audience.to_string(),
            policy_digest: policy.digest(),
            policy,
            records: Vec::new(),
            frontier: Frontier::default(),
            attestations: BTreeMap::new(),
            nonces: BTreeSet::new(),
            per_signer: BTreeMap::new(),
            revoked: BTreeMap::new(),
            consumed: BTreeMap::new(),
        })
    }

    /// A registry with no keys and no grants. It admits nothing.
    pub(crate) fn unconfigured() -> Self {
        let policy = AttestPolicy::default();
        Self {
            chain_id: String::new(),
            genesis: [0u8; 32],
            audience: String::new(),
            policy_digest: policy.digest(),
            policy,
            records: Vec::new(),
            frontier: Frontier::default(),
            attestations: BTreeMap::new(),
            nonces: BTreeSet::new(),
            per_signer: BTreeMap::new(),
            revoked: BTreeMap::new(),
            consumed: BTreeMap::new(),
        }
    }

    /// The same domain and policy with no attestation, revocation or receipt.
    pub(crate) fn reset(&self) -> Self {
        Self {
            chain_id: self.chain_id.clone(),
            genesis: self.genesis,
            audience: self.audience.clone(),
            policy: self.policy.clone(),
            policy_digest: self.policy_digest,
            ..Self::unconfigured()
        }
    }

    pub fn chain_id(&self) -> &str {
        &self.chain_id
    }

    pub fn genesis(&self) -> &[u8; 32] {
        &self.genesis
    }

    pub fn policy_digest(&self) -> [u8; 32] {
        self.policy_digest
    }

    pub fn root(&self) -> Result<[u8; 32], ChainError> {
        self.frontier.root().map_err(|_| ChainError::Mmr)
    }

    pub fn count(&self) -> u64 {
        self.frontier.count
    }

    /// Record a signed statement. Order: version and scheme, domain, shape,
    /// window, signature, replay, quota, rotation, revocation authority, MMR.
    pub fn admit(
        &mut self,
        att: &Attestation,
        height: u64,
        rotation_proof: Option<&[u8]>,
    ) -> Result<[u8; 32], ChainError> {
        if att.version != ATTEST_VERSION || att.scheme != ATTEST_SCHEME_ED25519 {
            return Err(ChainError::Attest("version"));
        }
        if att.chain_id != self.chain_id
            || att.genesis != self.genesis
            || att.audience != self.audience
        {
            return Err(ChainError::Attest("domain"));
        }
        if !account_id(&att.signer) {
            return Err(ChainError::BadAccount);
        }
        if let Claim::Revocation { delegate, .. } = &att.claim {
            if !account_id(delegate) {
                return Err(ChainError::BadAccount);
            }
        }
        if att.not_before > att.expires || height < att.not_before || height > att.expires {
            return Err(ChainError::Attest("window"));
        }
        let key = self
            .policy
            .keys
            .get(&att.signer)
            .ok_or(ChainError::UnverifiedSignature)?;
        let public =
            ed25519::PublicKey::try_from_bytes(key).map_err(|_| ChainError::UnverifiedSignature)?;
        if !public.verify(&att.message(), &att.signature) {
            return Err(ChainError::UnverifiedSignature);
        }
        let nonce = (att.signer.clone(), att.nonce);
        if self.nonces.contains(&nonce) {
            return Err(ChainError::Attest("replay"));
        }
        self.ensure_capacity(rotation_proof)?;
        let used = self.per_signer.get(&att.signer).copied().unwrap_or(0);
        if used >= ATTEST_SIGNER_QUOTA {
            return Err(ChainError::Attest("quota"));
        }
        let revokes = match &att.claim {
            Claim::Revocation { delegate, role } => {
                let grant = self
                    .grant(delegate, *role)
                    .ok_or(ChainError::Attest("authority"))?;
                if grant.grantor != att.signer {
                    return Err(ChainError::Attest("authority"));
                }
                Some((delegate.clone(), *role))
            }
            _ => None,
        };
        let id = att.id();
        let leaf = self.frontier.append(&id).map_err(|_| ChainError::Mmr)?;
        self.records.push(id);
        self.nonces.insert(nonce);
        self.per_signer.insert(att.signer.clone(), used + 1);
        if let Some(key) = revokes {
            self.revoked.entry(key).or_insert(height);
        }
        self.attestations.insert(id, (att.clone(), leaf));
        Ok(id)
    }

    /// Consume one approval for one action on one artifact. `effect` runs
    /// after every check passed. If it fails, the approval stays unused and
    /// the registry is unchanged. If it succeeds, the approval is consumed
    /// and the receipt is appended in the same call.
    pub fn execute<T>(
        &mut self,
        approval: &[u8; 32],
        action: &[u8; 32],
        artifact: &[u8; 32],
        height: u64,
        rotation_proof: Option<&[u8]>,
        effect: impl FnOnce(&Receipt) -> Result<T, ChainError>,
    ) -> Result<(Receipt, T), ChainError> {
        self.ensure_capacity(rotation_proof)?;
        let (approved, _) = self
            .attestations
            .get(approval)
            .ok_or(ChainError::Attest("unknown"))?;
        let Claim::Approval {
            action: approved_action,
            artifact: approved_artifact,
            evaluation,
            policy,
        } = &approved.claim
        else {
            return Err(ChainError::Attest("kind"));
        };
        if self.consumed.contains_key(approval) {
            return Err(ChainError::Attest("consumed"));
        }
        if height < approved.not_before || height > approved.expires {
            return Err(ChainError::Attest("window"));
        }
        if !self.holds(&approved.signer, Role::Approver, height) {
            return Err(ChainError::Attest("authority"));
        }
        if *policy != self.policy_digest {
            return Err(ChainError::Attest("policy"));
        }
        if approved_action != action {
            return Err(ChainError::Attest("action"));
        }
        if approved_artifact != artifact {
            return Err(ChainError::Attest("artifact"));
        }
        let (evaluated, _) = self
            .attestations
            .get(evaluation)
            .ok_or(ChainError::Attest("link"))?;
        let Claim::Evaluation {
            artifact: evaluated_artifact,
            passed,
            ..
        } = &evaluated.claim
        else {
            return Err(ChainError::Attest("link"));
        };
        if evaluated_artifact != artifact {
            return Err(ChainError::Attest("link"));
        }
        if !*passed {
            return Err(ChainError::Attest("evaluation"));
        }
        if height < evaluated.not_before || height > evaluated.expires {
            return Err(ChainError::Attest("window"));
        }
        if !self.holds(&evaluated.signer, Role::Evaluator, height) {
            return Err(ChainError::Attest("authority"));
        }
        if evaluated.signer == approved.signer {
            return Err(ChainError::Attest("separation"));
        }
        let author = self.proposal_author(artifact, height)?;
        if author == approved.signer || author == evaluated.signer {
            return Err(ChainError::Attest("separation"));
        }
        let mut receipt = Receipt {
            approval: *approval,
            evaluation: *evaluation,
            artifact: *artifact,
            action: *action,
            height,
            leaf: self.frontier.count,
        };
        let record = receipt.record();
        let mut frontier = self.frontier.clone();
        receipt.leaf = frontier.append(&record).map_err(|_| ChainError::Mmr)?;
        let out = effect(&receipt)?;
        self.frontier = frontier;
        self.records.push(record);
        self.consumed.insert(*approval, receipt.clone());
        Ok((receipt, out))
    }

    pub fn receipt(&self, approval: &[u8; 32]) -> Option<&Receipt> {
        self.consumed.get(approval)
    }

    pub fn status(&self, id: &[u8; 32], height: u64) -> Option<AttestStatus> {
        let (att, leaf) = self.attestations.get(id)?;
        let authority_confirmed = match &att.claim {
            Claim::Request { .. } => self.holds(&att.signer, Role::Requester, height),
            Claim::Artifact { .. } => self.holds(&att.signer, Role::Author, height),
            Claim::Evaluation { .. } => self.holds(&att.signer, Role::Evaluator, height),
            Claim::Approval { .. } => self.holds(&att.signer, Role::Approver, height),
            Claim::Revocation { delegate, role } => self
                .grant(delegate, *role)
                .is_some_and(|grant| grant.grantor == att.signer),
        };
        Some(AttestStatus {
            signature_valid: true,
            authority_confirmed,
            included: *leaf,
            execution_recorded: self.consumed.get(id).map(|receipt| receipt.leaf),
            evidence_referenced: matches!(att.claim, Claim::Evaluation { .. }),
        })
    }

    /// Inclusion proof of one leaf against the current root and count.
    /// Check it with `arkhe_verify_core::rbb::mmr::verify`.
    pub fn inclusion_proof(&self, leaf: u64) -> Result<(Proof, [u8; 32], [u8; 32]), ChainError> {
        let index = usize::try_from(leaf).map_err(|_| ChainError::Mmr)?;
        let record = *self.records.get(index).ok_or(ChainError::Mmr)?;
        let proof = mmr::prove(&self.records, index).map_err(|_| ChainError::Mmr)?;
        Ok((proof, record, self.root()?))
    }

    fn grant(&self, delegate: &str, role: Role) -> Option<&Grant> {
        self.policy
            .grants
            .iter()
            .find(|grant| grant.delegate == delegate && grant.role == role)
    }

    fn holds(&self, account: &str, role: Role, height: u64) -> bool {
        let Some(grant) = self.grant(account, role) else {
            return false;
        };
        if height > grant.expires {
            return false;
        }
        match self.revoked.get(&(account.to_string(), role)) {
            Some(since) => height < *since,
            None => true,
        }
    }

    /// Signer of a proposal for `artifact` made by a current author for a
    /// request made by a current requester.
    fn proposal_author(&self, artifact: &[u8; 32], height: u64) -> Result<&str, ChainError> {
        for (att, _) in self.attestations.values() {
            let Claim::Artifact {
                request,
                artifact: declared,
            } = &att.claim
            else {
                continue;
            };
            if declared != artifact || !self.holds(&att.signer, Role::Author, height) {
                continue;
            }
            let Some((asked, _)) = self.attestations.get(request) else {
                continue;
            };
            if matches!(asked.claim, Claim::Request { .. })
                && self.holds(&asked.signer, Role::Requester, height)
            {
                return Ok(&att.signer);
            }
        }
        Err(ChainError::Attest("link"))
    }
}

fn push_str(buf: &mut Vec<u8>, s: &str) {
    let n = u32::try_from(s.len()).unwrap_or(u32::MAX);
    buf.extend_from_slice(&n.to_be_bytes());
    buf.extend_from_slice(s.as_bytes());
}
