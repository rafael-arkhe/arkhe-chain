use arkhe_p2p::verify::{ExpectedDigests, VerifiedBlob};
use serde::{Deserialize, Serialize};

/// Observation of a verifier-first acquisition attempt.
/// Publisher identity is distribution metadata, never artifact authority.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DistributionObservation {
    pub sha256: [u8; 32],
    pub blake3: [u8; 32],
    pub candidates_tried: usize,
    pub publisher: Option<String>,
    /// False when acquisition exhausted candidates without a verified blob.
    pub complete: bool,
}

impl DistributionObservation {
    pub fn from_verified(
        blob: &VerifiedBlob,
        candidates_tried: usize,
        publisher: Option<String>,
    ) -> Self {
        let digests = blob.digests();
        Self {
            sha256: digests.sha256,
            blake3: digests.blake3,
            candidates_tried,
            publisher,
            complete: true,
        }
    }

    pub fn incomplete(
        expected: ExpectedDigests,
        candidates_tried: usize,
        publisher: Option<String>,
    ) -> Self {
        Self {
            sha256: expected.sha256,
            blake3: expected.blake3,
            candidates_tried,
            publisher,
            complete: false,
        }
    }

    pub fn validate_structure(&self) -> bool {
        self.candidates_tried > 0
            && !(self.complete && self.sha256 == [0; 32] && self.blake3 == [0; 32])
    }
}
