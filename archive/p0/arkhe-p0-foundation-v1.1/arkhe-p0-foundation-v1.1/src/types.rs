use crate::{
    digest_canonical, AlgorithmId, CanonicalValue, Digest, DigestError, HashDomain,
    ARKHE_CANONICAL_PROFILE_V1,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u16)]
pub enum RelationType {
    DerivedFrom = 1,
    RevisionOf = 2,
    Used = 3,
    GeneratedBy = 4,
    AuthorizedBy = 5,
    ClassifiedAs = 6,
    AttestedBy = 7,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CausalParent {
    pub relation: RelationType,
    pub digest: Digest,
}

#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct CausalProvenance {
    pub parents: Vec<CausalParent>,
}

impl CausalProvenance {
    pub fn normalized(&self) -> Vec<CausalParent> {
        let mut parents = self.parents.clone();
        parents.sort_by(|a, b| {
            (a.relation as u16, a.digest.algorithm().code(), a.digest.bytes())
                .cmp(&(b.relation as u16, b.digest.algorithm().code(), b.digest.bytes()))
        });
        parents.dedup();
        parents
    }

    fn to_canonical_value(&self) -> CanonicalValue {
        CanonicalValue::Array(
            self.normalized()
                .into_iter()
                .map(|p| CanonicalValue::Array(vec![
                    CanonicalValue::Unsigned(p.relation as u16 as u64),
                    digest_value(&p.digest),
                ]))
                .collect(),
        )
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ArtifactEnvelope {
    pub artifact_id: Vec<u8>,
    pub digest: Digest,
    pub provenance: CausalProvenance,
    /// Digest/reference to profile-defined authentication evidence.
    pub authentication: Option<Digest>,
    /// Digest/reference to profile-defined external anchor evidence.
    pub anchor: Option<Digest>,
    pub policy_ref: Digest,
}

impl ArtifactEnvelope {
    pub fn to_canonical_value(&self) -> CanonicalValue {
        CanonicalValue::Array(vec![
            CanonicalValue::Unsigned(1),
            CanonicalValue::Bytes(self.artifact_id.clone()),
            digest_value(&self.digest),
            self.provenance.to_canonical_value(),
            optional_digest_value(self.authentication.as_ref()),
            optional_digest_value(self.anchor.as_ref()),
            digest_value(&self.policy_ref),
        ])
    }

    pub fn digest(&self, algorithm: AlgorithmId) -> Result<Digest, DigestError> {
        digest_canonical(
            algorithm,
            HashDomain::ArtifactEnvelope,
            ARKHE_CANONICAL_PROFILE_V1,
            &self.to_canonical_value(),
        )
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TimeEvidence {
    None,
    LocalClock { unix_millis: i64 },
    ExternalRef { kind: u16, evidence_digest: Digest },
}

impl TimeEvidence {
    fn to_canonical_value(&self) -> CanonicalValue {
        match self {
            Self::None => CanonicalValue::Array(vec![CanonicalValue::Unsigned(0)]),
            Self::LocalClock { unix_millis } => CanonicalValue::Array(vec![
                CanonicalValue::Unsigned(1),
                integer_value(*unix_millis),
            ]),
            Self::ExternalRef { kind, evidence_digest } => CanonicalValue::Array(vec![
                CanonicalValue::Unsigned(2),
                CanonicalValue::Unsigned(*kind as u64),
                digest_value(evidence_digest),
            ]),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EvidenceRecord {
    pub record_id: Vec<u8>,
    pub envelope_digest: Digest,
    pub timestamp: TimeEvidence,
    /// Optional because witness requirements are profile/policy dependent.
    pub witness: Option<Digest>,
}

impl EvidenceRecord {
    pub fn to_canonical_value(&self) -> CanonicalValue {
        CanonicalValue::Array(vec![
            CanonicalValue::Unsigned(1),
            CanonicalValue::Bytes(self.record_id.clone()),
            digest_value(&self.envelope_digest),
            self.timestamp.to_canonical_value(),
            optional_digest_value(self.witness.as_ref()),
        ])
    }

    pub fn digest(&self, algorithm: AlgorithmId) -> Result<Digest, DigestError> {
        digest_canonical(
            algorithm,
            HashDomain::EvidenceRecord,
            ARKHE_CANONICAL_PROFILE_V1,
            &self.to_canonical_value(),
        )
    }
}

fn digest_value(digest: &Digest) -> CanonicalValue {
    CanonicalValue::Array(vec![
        CanonicalValue::Unsigned(digest.algorithm().code() as u64),
        CanonicalValue::Bytes(digest.bytes().to_vec()),
    ])
}

fn optional_digest_value(digest: Option<&Digest>) -> CanonicalValue {
    match digest {
        None => CanonicalValue::Null,
        Some(d) => digest_value(d),
    }
}

fn integer_value(value: i64) -> CanonicalValue {
    if value >= 0 {
        CanonicalValue::Unsigned(value as u64)
    } else {
        CanonicalValue::Negative(value)
    }
}
