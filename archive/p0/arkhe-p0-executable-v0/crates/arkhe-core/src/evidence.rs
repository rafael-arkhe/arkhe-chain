use crate::{CanonicalEncode, Digest, Result};
use minicbor::Encoder;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimeEvidence {
    None,
    LocalClock { unix_seconds: i64 },
    Rfc3161 { token_digest: Digest },
    Roughtime { proof_digest: Digest },
    TransparencyLog { log_id: String, entry_digest: Digest },
    ConsensusTime { system: String, unix_seconds: i64 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WitnessEvidence {
    Digest { kind: String, digest: Digest },
    Reference { kind: String, reference: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvidenceRecord {
    pub record_id: String,
    pub envelope_digest: Digest,
    pub timestamp: TimeEvidence,
    pub witness: Option<WitnessEvidence>,
}

impl CanonicalEncode for TimeEvidence {
    fn encode_canonical(&self, e: &mut Encoder<Vec<u8>>) -> Result<()> {
        match self {
            TimeEvidence::None => {
                e.array(1).map_err(crate::canonical::enc_err)?;
                e.u8(0).map_err(crate::canonical::enc_err)?;
            }
            TimeEvidence::LocalClock { unix_seconds } => {
                e.array(2).map_err(crate::canonical::enc_err)?;
                e.u8(1).map_err(crate::canonical::enc_err)?;
                e.i64(*unix_seconds).map_err(crate::canonical::enc_err)?;
            }
            TimeEvidence::Rfc3161 { token_digest } => {
                e.array(2).map_err(crate::canonical::enc_err)?;
                e.u8(2).map_err(crate::canonical::enc_err)?;
                token_digest.encode_canonical(e)?;
            }
            TimeEvidence::Roughtime { proof_digest } => {
                e.array(2).map_err(crate::canonical::enc_err)?;
                e.u8(3).map_err(crate::canonical::enc_err)?;
                proof_digest.encode_canonical(e)?;
            }
            TimeEvidence::TransparencyLog {
                log_id,
                entry_digest,
            } => {
                e.array(3).map_err(crate::canonical::enc_err)?;
                e.u8(4).map_err(crate::canonical::enc_err)?;
                e.str(log_id).map_err(crate::canonical::enc_err)?;
                entry_digest.encode_canonical(e)?;
            }
            TimeEvidence::ConsensusTime {
                system,
                unix_seconds,
            } => {
                e.array(3).map_err(crate::canonical::enc_err)?;
                e.u8(5).map_err(crate::canonical::enc_err)?;
                e.str(system).map_err(crate::canonical::enc_err)?;
                e.i64(*unix_seconds).map_err(crate::canonical::enc_err)?;
            }
        }
        Ok(())
    }
}

impl CanonicalEncode for EvidenceRecord {
    fn encode_canonical(&self, e: &mut Encoder<Vec<u8>>) -> Result<()> {
        e.array(4).map_err(crate::canonical::enc_err)?;
        e.str(&self.record_id).map_err(crate::canonical::enc_err)?;
        self.envelope_digest.encode_canonical(e)?;
        self.timestamp.encode_canonical(e)?;
        match &self.witness {
            None => e.null().map_err(crate::canonical::enc_err)?,
            Some(WitnessEvidence::Digest { kind, digest }) => {
                e.array(3).map_err(crate::canonical::enc_err)?;
                e.u8(1).map_err(crate::canonical::enc_err)?;
                e.str(kind).map_err(crate::canonical::enc_err)?;
                digest.encode_canonical(e)?;
            }
            Some(WitnessEvidence::Reference { kind, reference }) => {
                e.array(3).map_err(crate::canonical::enc_err)?;
                e.u8(2).map_err(crate::canonical::enc_err)?;
                e.str(kind).map_err(crate::canonical::enc_err)?;
                e.str(reference).map_err(crate::canonical::enc_err)?;
            }
        }
        Ok(())
    }
}
