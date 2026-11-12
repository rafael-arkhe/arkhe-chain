//! Local checkpoint of an MMR root. Publication to an external log is not configured.
use agi_coder_core::ContentHash;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LocalCheckpoint {
    pub root: ContentHash,
    pub leaf_count: u64,
    pub published: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Witness {
    pub root: ContentHash,
    pub leaf_count: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum AnchorError {
    NotConfigured,
    RootMismatch,
}

pub fn local_checkpoint(root: ContentHash, leaf_count: u64) -> LocalCheckpoint {
    LocalCheckpoint {
        root,
        leaf_count,
        published: false,
    }
}

/// A witness that names a different root is rejected.
/// A witness that names the same root is still not an external publication.
pub fn accept_external_witness(
    checkpoint: &LocalCheckpoint,
    witness: &Witness,
) -> Result<(), AnchorError> {
    if witness.root != checkpoint.root || witness.leaf_count != checkpoint.leaf_count {
        return Err(AnchorError::RootMismatch);
    }
    Err(AnchorError::NotConfigured)
}

pub fn transparency_status() -> serde_json::Value {
    serde_json::json!({
        "published": false,
        "reason": "No transparency log is configured. anchor remains local-only."
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checkpoint_is_not_published() {
        let checkpoint = local_checkpoint(ContentHash::hash(b"root"), 2);
        assert!(!checkpoint.published);
        assert_eq!(transparency_status()["published"], false);
    }

    #[test]
    fn witness_cannot_promote_a_local_root() {
        let checkpoint = local_checkpoint(ContentHash::hash(b"root"), 2);
        assert_eq!(
            accept_external_witness(
                &checkpoint,
                &Witness {
                    root: ContentHash::hash(b"other"),
                    leaf_count: 2,
                }
            ),
            Err(AnchorError::RootMismatch)
        );
        assert_eq!(
            accept_external_witness(
                &checkpoint,
                &Witness {
                    root: checkpoint.root,
                    leaf_count: 2,
                }
            ),
            Err(AnchorError::NotConfigured)
        );
    }
}
