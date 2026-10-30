use crate::{CanonicalValue, Digest};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u16)]
pub enum RelationTypeV1 {
    DerivedFrom = 1,
    RevisionOf = 2,
    Used = 3,
    GeneratedBy = 4,
    AuthorizedBy = 5,
    ClassifiedAs = 6,
    AttestedBy = 7,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CausalParentV1 {
    pub relation: RelationTypeV1,
    pub digest: Digest,
}

impl CausalParentV1 {
    pub fn to_canonical_value(&self) -> CanonicalValue {
        CanonicalValue::Array(vec![
            CanonicalValue::Unsigned(self.relation as u16 as u64),
            CanonicalValue::Unsigned(self.digest.algorithm().code() as u64),
            CanonicalValue::Bytes(self.digest.bytes().to_vec()),
        ])
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ArtifactEnvelopeV1 {
    pub artifact_id: Vec<u8>,
    pub digest: Digest,
    pub provenance: Vec<CausalParentV1>,
    /// Opaque protocol/profile-defined authentication evidence digest.
    pub authentication_ref: Option<Digest>,
    /// Opaque external anchor reference digest.
    pub anchor_ref: Option<Digest>,
    pub policy_ref: Digest,
}

impl ArtifactEnvelopeV1 {
    pub fn to_canonical_value(&self) -> CanonicalValue {
        let mut parents = self.provenance.clone();
        parents.sort_by(|a, b| {
            (
                a.relation as u16,
                a.digest.algorithm().code(),
                a.digest.bytes(),
            )
                .cmp(&(
                    b.relation as u16,
                    b.digest.algorithm().code(),
                    b.digest.bytes(),
                ))
        });
        parents.dedup_by(|a, b| a == b);

        CanonicalValue::Array(vec![
            CanonicalValue::Unsigned(1), // ArtifactEnvelope schema version
            CanonicalValue::Bytes(self.artifact_id.clone()),
            digest_value(&self.digest),
            CanonicalValue::Array(
                parents
                    .iter()
                    .map(CausalParentV1::to_canonical_value)
                    .collect(),
            ),
            optional_digest_value(self.authentication_ref.as_ref()),
            optional_digest_value(self.anchor_ref.as_ref()),
            digest_value(&self.policy_ref),
        ])
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TimeEvidenceV1 {
    None,
    LocalClock { unix_millis: i64 },
    ExternalRef { kind: u16, evidence_digest: Digest },
}

impl TimeEvidenceV1 {
    pub fn to_canonical_value(&self) -> CanonicalValue {
        match self {
            Self::None => CanonicalValue::Array(vec![CanonicalValue::Unsigned(0)]),
            Self::LocalClock { unix_millis } => CanonicalValue::Array(vec![
                CanonicalValue::Unsigned(1),
                integer_value(*unix_millis),
            ]),
            Self::ExternalRef {
                kind,
                evidence_digest,
            } => CanonicalValue::Array(vec![
                CanonicalValue::Unsigned(2),
                CanonicalValue::Unsigned(*kind as u64),
                digest_value(evidence_digest),
            ]),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EvidenceRecordV1 {
    pub record_id: Vec<u8>,
    pub envelope_digest: Digest,
    pub timestamp: TimeEvidenceV1,
    /// Opaque witness evidence digest; semantics are profile/policy-defined.
    pub witness_ref: Option<Digest>,
}

impl EvidenceRecordV1 {
    pub fn to_canonical_value(&self) -> CanonicalValue {
        CanonicalValue::Array(vec![
            CanonicalValue::Unsigned(1), // EvidenceRecord schema version
            CanonicalValue::Bytes(self.record_id.clone()),
            digest_value(&self.envelope_digest),
            self.timestamp.to_canonical_value(),
            optional_digest_value(self.witness_ref.as_ref()),
        ])
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
