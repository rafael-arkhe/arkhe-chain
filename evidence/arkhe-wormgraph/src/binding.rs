//! AKG-IDBIND v1 — binding an Arkhe roster key to an external identity.
//!
//! A binding says "this Arkhe key and this Nostr/Radicle key are held for the
//! same role and scope". It needs both signatures (bidirectional possession):
//! the Arkhe key signs the binding digest, and the external key signs it in
//! its own protocol — a NIP-01 event for Nostr, a domain-separated Ed25519
//! signature for a Radicle did:key. Without a binding in force, an external
//! key is only a `ProviderIdentity`: metadata, never authority.
//!
//! Times are declared unix seconds, not trusted clocks. Authority over the
//! Arkhe key comes from the `GovernanceRoster` (AKG-IDENTITY-0002); what a
//! role may do is decided downstream, never here.
use crate::roster::{GovernanceRoster, RosterViolation};
use arkhe_core::canonical::Cbor;
use arkhe_core::evidence::EvidenceEnvelope;
use arkhe_core::Digest32;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const DOMAIN_BINDING: &[u8] = b"AKG:IDBIND:v1\0";
pub const DOMAIN_BINDING_SIG: &[u8] = b"AKG:IDBIND-SIG:v1\0";
pub const DOMAIN_EXTERNAL_SIG: &[u8] = b"AKG:IDBIND-EXT:v1\0";
pub const DOMAIN_SIGNED: &[u8] = b"AKG:IDBIND-SIGNED:v1\0";
pub const DOMAIN_REVOCATION: &[u8] = b"AKG:IDBIND-REVOKE:v1\0";
pub const DOMAIN_REVOCATION_SIG: &[u8] = b"AKG:IDBIND-REVOKE-SIG:v1\0";
/// NIP-78 application data (parameterized replaceable).
pub const NOSTR_BINDING_KIND: u64 = 30078;
pub const NOSTR_D_PREFIX: &str = "akg-idbind:";
pub const BINDING_KIND: &str = "ArkheIdentityBinding";
pub const REVOCATION_KIND: &str = "ArkheIdentityBindingRevocation";
const MAX_SCOPE: usize = 128;
const MAX_TEXT: usize = 1024;
const MAX_TAGS: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExternalKind {
    /// BIP-340 x-only secp256k1 public key (the bytes inside `npub1…`).
    NostrNpub,
    /// Ed25519 public key of a `did:key` (Radicle node/delegate).
    RadicleDidKey,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BindingRole {
    Publisher,
    Delegate,
    Seed,
    Witness,
}

impl ExternalKind {
    fn as_str(self) -> &'static str {
        match self {
            ExternalKind::NostrNpub => "nostr-npub",
            ExternalKind::RadicleDidKey => "radicle-did-key",
        }
    }
}
impl BindingRole {
    fn as_str(self) -> &'static str {
        match self {
            BindingRole::Publisher => "publisher",
            BindingRole::Delegate => "delegate",
            BindingRole::Seed => "seed",
            BindingRole::Witness => "witness",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IdentityBinding {
    pub version: u64,
    pub arkhe_key: [u8; 32],
    pub external_kind: ExternalKind,
    pub external_id: [u8; 32],
    pub role: BindingRole,
    /// What the binding covers, e.g. a repository identifier.
    pub scope: String,
    pub valid_from: i64,
    #[serde(deserialize_with = "Option::deserialize")]
    pub valid_until: Option<i64>,
}

/// NIP-01 event by the external key; `pubkey` is the binding's `external_id`
/// and `id` is recomputed, so neither is carried.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NostrEventProof {
    pub created_at: u64,
    pub tags: Vec<Vec<String>>,
    pub content: String,
    #[serde(with = "hex64")]
    pub sig: [u8; 64],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExternalProof {
    Nostr(NostrEventProof),
    Ed25519(#[serde(with = "hex64")] [u8; 64]),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedBinding {
    pub binding: IdentityBinding,
    #[serde(with = "hex64")]
    pub arkhe_signature: [u8; 64],
    pub external_proof: ExternalProof,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BindingRevocation {
    pub binding_digest: Digest32,
    /// Effective from this declared time; earlier uses stay attributable.
    pub revoked_at: i64,
    pub reason: String,
    pub signer: [u8; 32],
    #[serde(with = "hex64")]
    pub signature: [u8; 64],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindingViolation {
    Malformed,
    RosterInvalid(RosterViolation),
    ArkheKeyNotInRoster,
    /// The roster did not cover the Arkhe key at `valid_from` or at `at`.
    ArkheKeyOutsideWindow,
    ArkheSignatureInvalid,
    ExternalProofMissing,
    ExternalProofInvalid,
    NotYetValid,
    Expired,
    Revoked,
}

impl IdentityBinding {
    pub fn validate(&self) -> Result<(), BindingViolation> {
        let ok = self.version == 1
            && !self.scope.is_empty()
            && self.scope.len() <= MAX_SCOPE
            && self
                .scope
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._@+-/:".contains(&b))
            && self.valid_from >= 0
            && self.valid_until.is_none_or(|u| u >= self.valid_from)
            // One key cannot attest possession of itself.
            && !(self.external_kind == ExternalKind::RadicleDidKey
                && self.external_id == self.arkhe_key);
        ok.then_some(()).ok_or(BindingViolation::Malformed)
    }

    pub fn to_cbor(&self) -> Cbor {
        let pairs: Vec<(&str, Cbor)> = vec![
            ("version", Cbor::Uint(self.version)),
            ("arkhe_key", Cbor::Bytes(self.arkhe_key.to_vec())),
            (
                "external_kind",
                Cbor::Text(self.external_kind.as_str().into()),
            ),
            ("external_id", Cbor::Bytes(self.external_id.to_vec())),
            ("role", Cbor::Text(self.role.as_str().into())),
            ("scope", Cbor::Text(self.scope.clone())),
            ("valid_from", Cbor::Uint(self.valid_from as u64)),
            (
                "valid_until",
                self.valid_until
                    .map_or(Cbor::Null, |u| Cbor::Uint(u as u64)),
            ),
        ];
        Cbor::Map(pairs.into_iter().map(|(k, v)| (k.into(), v)).collect())
    }

    /// Valid only after `validate`; negative times are rejected there.
    pub fn digest(&self) -> Digest32 {
        Digest32::blake3(DOMAIN_BINDING, &self.to_cbor().encode())
    }

    pub fn covers(&self, at: i64) -> Result<(), BindingViolation> {
        if at < self.valid_from {
            return Err(BindingViolation::NotYetValid);
        }
        if self.valid_until.is_some_and(|u| at > u) {
            return Err(BindingViolation::Expired);
        }
        Ok(())
    }

    /// Unsigned NIP-01 event template the external Nostr key must sign.
    pub fn nostr_template(&self, created_at: u64, content: &str) -> NostrEventProof {
        NostrEventProof {
            created_at,
            tags: vec![vec![
                "d".into(),
                format!("{NOSTR_D_PREFIX}{}", self.digest().to_hex()),
            ]],
            content: content.into(),
            sig: [0; 64],
        }
    }
}

fn message(domain: &[u8], digest: Digest32) -> Vec<u8> {
    [domain, &digest.0].concat()
}

impl NostrEventProof {
    /// NIP-01 id: SHA-256 of `[0,pubkey,created_at,kind,tags,content]`.
    pub fn event_id(&self, pubkey: &[u8; 32]) -> Result<[u8; 32], BindingViolation> {
        let mut json = format!(
            "[0,\"{}\",{},{},[",
            hex::encode(pubkey),
            self.created_at,
            NOSTR_BINDING_KIND
        );
        for (i, tag) in self.tags.iter().enumerate() {
            json.push_str(if i == 0 { "[" } else { ",[" });
            for (j, item) in tag.iter().enumerate() {
                if j > 0 {
                    json.push(',');
                }
                nip01_string(item, &mut json)?;
            }
            json.push(']');
        }
        json.push_str("],");
        nip01_string(&self.content, &mut json)?;
        json.push(']');
        Ok(Sha256::digest(json.as_bytes()).into())
    }

    fn check(&self, binding: &IdentityBinding) -> Result<(), BindingViolation> {
        let expected_d = format!("{NOSTR_D_PREFIX}{}", binding.digest().to_hex());
        let d_tags: Vec<_> = self
            .tags
            .iter()
            .filter(|t| t.first().is_some_and(|n| n == "d"))
            .collect();
        let shape = self.tags.len() <= MAX_TAGS
            && self.content.len() <= MAX_TEXT
            && self.tags.iter().all(|t| !t.is_empty() && t.len() <= 8)
            && d_tags.len() == 1
            && d_tags[0].len() == 2
            && d_tags[0][1] == expected_d;
        if !shape {
            return Err(BindingViolation::ExternalProofInvalid);
        }
        let id = self.event_id(&binding.external_id)?;
        let key = k256::schnorr::VerifyingKey::from_bytes(&binding.external_id)
            .map_err(|_| BindingViolation::ExternalProofInvalid)?;
        let sig = k256::schnorr::Signature::try_from(&self.sig[..])
            .map_err(|_| BindingViolation::ExternalProofInvalid)?;
        key.verify_raw(&id, &sig)
            .map_err(|_| BindingViolation::ExternalProofInvalid)
    }
}

/// NIP-01 escaping; other control characters are rejected rather than guessed.
fn nip01_string(s: &str, out: &mut String) -> Result<(), BindingViolation> {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 || c == '\u{7f}' => {
                return Err(BindingViolation::ExternalProofInvalid)
            }
            c => out.push(c),
        }
    }
    out.push('"');
    Ok(())
}

impl SignedBinding {
    pub fn to_cbor(&self) -> Cbor {
        let proof = match &self.external_proof {
            ExternalProof::Nostr(e) => Cbor::Map(vec![
                ("kind".into(), Cbor::Text("nostr".into())),
                ("created_at".into(), Cbor::Uint(e.created_at)),
                (
                    "tags".into(),
                    Cbor::Array(
                        e.tags
                            .iter()
                            .map(|t| Cbor::Array(t.iter().cloned().map(Cbor::Text).collect()))
                            .collect(),
                    ),
                ),
                ("content".into(), Cbor::Text(e.content.clone())),
                ("sig".into(), Cbor::Bytes(e.sig.to_vec())),
            ]),
            ExternalProof::Ed25519(sig) => Cbor::Map(vec![
                ("kind".into(), Cbor::Text("ed25519".into())),
                ("sig".into(), Cbor::Bytes(sig.to_vec())),
            ]),
        };
        Cbor::Map(vec![
            ("binding".into(), self.binding.to_cbor()),
            (
                "arkhe_signature".into(),
                Cbor::Bytes(self.arkhe_signature.to_vec()),
            ),
            ("external_proof".into(), proof),
        ])
    }

    /// MMR leaf bytes: binding plus both proofs, canonical.
    pub fn canonical_bytes(&self) -> Vec<u8> {
        self.to_cbor().encode()
    }

    pub fn signed_digest(&self) -> Digest32 {
        Digest32::blake3(DOMAIN_SIGNED, &self.canonical_bytes())
    }

    /// Both directions of possession, independent of any roster or time.
    pub fn verify_signatures(&self) -> Result<(), BindingViolation> {
        let b = &self.binding;
        b.validate()?;
        let digest = b.digest();
        let arkhe =
            VerifyingKey::from_bytes(&b.arkhe_key).map_err(|_| BindingViolation::Malformed)?;
        arkhe
            .verify(
                &message(DOMAIN_BINDING_SIG, digest),
                &Signature::from_bytes(&self.arkhe_signature),
            )
            .map_err(|_| BindingViolation::ArkheSignatureInvalid)?;
        match (&self.external_proof, b.external_kind) {
            (ExternalProof::Nostr(event), ExternalKind::NostrNpub) => event.check(b),
            (ExternalProof::Ed25519(sig), ExternalKind::RadicleDidKey) => {
                if sig == &[0; 64] {
                    return Err(BindingViolation::ExternalProofMissing);
                }
                VerifyingKey::from_bytes(&b.external_id)
                    .map_err(|_| BindingViolation::ExternalProofInvalid)?
                    .verify(
                        &message(DOMAIN_EXTERNAL_SIG, digest),
                        &Signature::from_bytes(sig),
                    )
                    .map_err(|_| BindingViolation::ExternalProofInvalid)
            }
            _ => Err(BindingViolation::ExternalProofInvalid),
        }
        .map_err(|e| match (&self.external_proof, e) {
            (ExternalProof::Nostr(n), _) if n.sig == [0; 64] => {
                BindingViolation::ExternalProofMissing
            }
            (_, e) => e,
        })
    }
}

impl BindingRevocation {
    pub fn core_digest(&self) -> Digest32 {
        let core = Cbor::Map(vec![
            (
                "binding_digest".into(),
                Cbor::Bytes(self.binding_digest.0.to_vec()),
            ),
            (
                "revoked_at".into(),
                Cbor::Uint(self.revoked_at.max(0) as u64),
            ),
            ("reason".into(), Cbor::Text(self.reason.clone())),
            ("signer".into(), Cbor::Bytes(self.signer.to_vec())),
        ]);
        Digest32::blake3(DOMAIN_REVOCATION, &core.encode())
    }

    pub fn sign(
        binding_digest: Digest32,
        revoked_at: i64,
        reason: &str,
        signer: &SigningKey,
    ) -> Self {
        let mut revocation = Self {
            binding_digest,
            revoked_at,
            reason: reason.into(),
            signer: signer.verifying_key().to_bytes(),
            signature: [0; 64],
        };
        revocation.signature = signer
            .sign(&message(DOMAIN_REVOCATION_SIG, revocation.core_digest()))
            .to_bytes();
        revocation
    }

    /// The binding's own Arkhe key, or any roster member active at `revoked_at`,
    /// may revoke: revocation only ever removes authority.
    fn effective(&self, binding: &IdentityBinding, roster: &GovernanceRoster) -> bool {
        let authorized = self.signer == binding.arkhe_key
            || roster
                .entry_for(&self.signer)
                .is_some_and(|e| e.covers(self.revoked_at));
        self.revoked_at >= 0
            && self.reason.len() <= MAX_TEXT
            && self.binding_digest == binding.digest()
            && authorized
            && VerifyingKey::from_bytes(&self.signer).is_ok_and(|k| {
                k.verify(
                    &message(DOMAIN_REVOCATION_SIG, self.core_digest()),
                    &Signature::from_bytes(&self.signature),
                )
                .is_ok()
            })
    }
}

/// Sign the Arkhe side. The external side is produced by the external key holder.
pub fn sign_arkhe(binding: &IdentityBinding, key: &SigningKey) -> [u8; 64] {
    key.sign(&message(DOMAIN_BINDING_SIG, binding.digest()))
        .to_bytes()
}

/// Radicle/Ed25519 external side, for tooling and tests.
pub fn sign_external_ed25519(binding: &IdentityBinding, key: &SigningKey) -> [u8; 64] {
    key.sign(&message(DOMAIN_EXTERNAL_SIG, binding.digest()))
        .to_bytes()
}

/// Nostr external side, for tooling and tests (real users sign with their own
/// Nostr signer over `NostrEventProof::event_id`).
pub fn sign_external_nostr(
    binding: &IdentityBinding,
    mut template: NostrEventProof,
    key: &k256::schnorr::SigningKey,
    aux_rand: &[u8; 32],
) -> Result<NostrEventProof, BindingViolation> {
    let id = template.event_id(&binding.external_id)?;
    let sig = key
        .sign_raw(&id, aux_rand)
        .map_err(|_| BindingViolation::ExternalProofInvalid)?;
    template.sig = sig.to_bytes();
    Ok(template)
}

/// Whether `signed` is in force at declared time `at`.
///
/// Checks, in order: roster integrity; both signatures; the Arkhe key's roster
/// window at `valid_from` and at `at`; the binding window; and every
/// revocation. Revocations that fail verification carry no authority and are
/// ignored; a verified one effective at or before `at` refuses the binding.
pub fn binding_in_force(
    signed: &SignedBinding,
    revocations: &[BindingRevocation],
    roster: &GovernanceRoster,
    parent_roster: Option<&GovernanceRoster>,
    at: i64,
) -> Result<BindingRole, BindingViolation> {
    roster
        .verify(parent_roster, at)
        .map_err(BindingViolation::RosterInvalid)?;
    signed.verify_signatures()?;
    let b = &signed.binding;
    let entry = roster
        .entry_for(&b.arkhe_key)
        .ok_or(BindingViolation::ArkheKeyNotInRoster)?;
    if !entry.covers(b.valid_from) || !entry.covers(at) {
        return Err(BindingViolation::ArkheKeyOutsideWindow);
    }
    b.covers(at)?;
    if revocations
        .iter()
        .any(|r| r.revoked_at <= at && r.effective(b, roster))
    {
        return Err(BindingViolation::Revoked);
    }
    Ok(b.role)
}

/// All bindings of one external identity share a subject.
pub fn binding_subject(kind: ExternalKind, id: &[u8; 32]) -> Digest32 {
    Digest32::blake3(
        b"AKG:IDBIND:SUBJECT:v1\0",
        &[kind.as_str().as_bytes(), b"\0", id].concat(),
    )
}

pub fn binding_envelope(signed: &SignedBinding, causal_parents: Vec<Digest32>) -> EvidenceEnvelope {
    let b = &signed.binding;
    EvidenceEnvelope {
        record_hash: b.digest(),
        kind: BINDING_KIND.into(),
        subject: binding_subject(b.external_kind, &b.external_id),
        payload_digest: signed.signed_digest(),
        policy_digest: None,
        causal_parents,
    }
}

pub fn revocation_envelope(
    revocation: &BindingRevocation,
    binding: &IdentityBinding,
) -> EvidenceEnvelope {
    EvidenceEnvelope {
        record_hash: revocation.core_digest(),
        kind: REVOCATION_KIND.into(),
        subject: binding_subject(binding.external_kind, &binding.external_id),
        payload_digest: revocation.core_digest(),
        policy_digest: None,
        causal_parents: vec![revocation.binding_digest],
    }
}

mod hex64 {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(v: &[u8; 64], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&hex::encode(v))
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; 64], D::Error> {
        let text = String::deserialize(d)?;
        hex::decode(&text)
            .ok()
            .and_then(|b| b.try_into().ok())
            .ok_or_else(|| serde::de::Error::custom("expected 64-byte hex"))
    }
}
