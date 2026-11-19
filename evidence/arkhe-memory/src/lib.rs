use arkhe_core::{evidence::EvidenceReader, Digest32};
use arkhe_verify_core::mmr::{
    build_root_and_proof,
    profile::{PROFILE_DIGEST_HEX, PROFILE_ID},
    verify_proof_at, ProofStep,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Episode {
    pub episode_hash: Digest32,
    pub content_digest: Digest32,
    pub trajectory_root: Digest32,
    pub evidence_ref: Digest32,
}

impl Episode {
    pub fn compute_hash(
        content_digest: Digest32,
        trajectory_root: Digest32,
        evidence_ref: Digest32,
    ) -> Digest32 {
        let mut payload = Vec::with_capacity(96);
        payload.extend_from_slice(&content_digest.0);
        payload.extend_from_slice(&trajectory_root.0);
        payload.extend_from_slice(&evidence_ref.0);
        Digest32::blake3(b"AKG:EPISODE:v0-REF\0", &payload)
    }
}

/// Offline-verifiable MMR inclusion bundle for an admitted `Episode`.
/// Verification proves inclusion relative to a caller-supplied root and
/// structural binding of `episode_hash`; checkpoint authentication stays external.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EpisodeProofBundle {
    pub profile_id: String,
    pub profile_digest_hex: String,
    pub episode: Episode,
    pub leaf_count: usize,
    pub leaf_index: usize,
    pub mmr_root: [u8; 32],
    pub proof: Vec<ProofStep>,
}

#[derive(Default)]
struct MemoryState {
    episodes: HashMap<Digest32, Episode>,
    ordered_hashes: Vec<Digest32>,
}

pub struct EpisodicMemory<R: EvidenceReader> {
    reader: Arc<R>,
    state: RwLock<MemoryState>,
}

impl<R: EvidenceReader> EpisodicMemory<R> {
    pub fn new(reader: Arc<R>) -> Self {
        Self {
            reader,
            state: RwLock::new(MemoryState::default()),
        }
    }

    pub async fn append_verified(
        &self,
        content_digest: Digest32,
        trajectory_root: Digest32,
        evidence_ref: Digest32,
    ) -> Result<Episode, String> {
        if evidence_ref == Digest32::ZERO {
            return Err("zero evidence_ref is not admissible".into());
        }
        if self.reader.get(evidence_ref).await?.is_none() {
            return Err("evidence_ref is not readable/verified".into());
        }
        let episode_hash = Episode::compute_hash(content_digest, trajectory_root, evidence_ref);
        let episode = Episode {
            episode_hash,
            content_digest,
            trajectory_root,
            evidence_ref,
        };
        let mut guard = self.state.write().await;
        if let Some(existing) = guard.episodes.get(&episode_hash) {
            return Ok(existing.clone());
        }
        guard.ordered_hashes.push(episode_hash);
        guard.episodes.insert(episode_hash, episode.clone());
        Ok(episode)
    }

    pub async fn retrieve(&self, id: Digest32) -> Option<Episode> {
        self.state.read().await.episodes.get(&id).cloned()
    }

    /// Produces an `arkhe-mmr@1` inclusion proof bundle over the append-only episode log.
    pub async fn prove_episode(&self, id: Digest32) -> Result<EpisodeProofBundle, String> {
        let guard = self.state.read().await;
        let episode = guard
            .episodes
            .get(&id)
            .cloned()
            .ok_or_else(|| "episode not found".to_string())?;
        let leaf_index = guard
            .ordered_hashes
            .iter()
            .position(|h| *h == id)
            .ok_or_else(|| "episode missing from ordered log".to_string())?;
        let leaves: Vec<Vec<u8>> = guard.ordered_hashes.iter().map(|h| h.0.to_vec()).collect();
        let (mmr_root, proof) =
            build_root_and_proof(&leaves, leaf_index).map_err(|e| e.to_string())?;
        Ok(EpisodeProofBundle {
            profile_id: PROFILE_ID.into(),
            profile_digest_hex: PROFILE_DIGEST_HEX.into(),
            episode,
            leaf_count: leaves.len(),
            leaf_index,
            mmr_root,
            proof,
        })
    }
}

/// Offline verification of an `EpisodeProofBundle` against a caller-supplied trusted root.
pub fn verify_episode_bundle(
    bundle: &EpisodeProofBundle,
    trusted_root: &[u8; 32],
) -> Result<(), String> {
    if trusted_root == &[0u8; 32] {
        return Err("unauthenticated zero MMR root".into());
    }
    if bundle.profile_id != PROFILE_ID || bundle.profile_digest_hex != PROFILE_DIGEST_HEX {
        return Err("unsupported MMR profile".into());
    }
    if bundle.episode.evidence_ref == Digest32::ZERO {
        return Err("zero evidence_ref".into());
    }
    let expected_hash = Episode::compute_hash(
        bundle.episode.content_digest,
        bundle.episode.trajectory_root,
        bundle.episode.evidence_ref,
    );
    if expected_hash != bundle.episode.episode_hash {
        return Err("episode_hash does not match content, trajectory, and evidence_ref".into());
    }
    if &bundle.mmr_root != trusted_root {
        return Err("bundle root does not match caller-pinned root".into());
    }
    let included = verify_proof_at(
        &bundle.episode.episode_hash.0,
        bundle.leaf_count,
        bundle.leaf_index,
        &bundle.proof,
        trusted_root,
    )
    .map_err(|e| e.to_string())?;
    if !included {
        return Err("episode MMR inclusion proof failed".into());
    }
    Ok(())
}
