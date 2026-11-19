//! Map stored v4 precommits into [`CanonicalVote`] for quorum verdict (C2).
//! Wire signatures remain `AKG:CHAIN:PRECOMMIT:v4`; this does not change live storage.

use std::collections::HashMap;

use crate::{precommit_message, Precommit, CHAIN_ID};

use super::bft_commit::bft_commit;
use super::canonical_vote::{CanonicalVote, VoteType};
use super::CommitVerdict;

/// Build a canonical vote from a v4 precommit. Fails when `round` does not fit `u32`.
pub fn precommit_to_canonical_vote(precommit: &Precommit) -> Result<CanonicalVote, String> {
    if precommit.parts != 1 || precommit.part_hash != precommit.block_hash {
        return Err("part header must equal block hash".into());
    }
    if precommit.chain_id != CHAIN_ID {
        return Err("wrong chain_id".into());
    }
    let round = u32::try_from(precommit.round).map_err(|_| "round overflow".to_string())?;
    Ok(CanonicalVote::new(
        precommit.validator_id.clone(),
        precommit.height,
        round,
        Some(precommit.block_hash),
        0,
        VoteType::Precommit,
    ))
}

fn verify_v4_precommit(
    vote: &CanonicalVote,
    signature: &[u8],
    validator_keys: &HashMap<String, libp2p::identity::ed25519::PublicKey>,
) -> bool {
    let Some(public) = validator_keys.get(&vote.part) else {
        return false;
    };
    let Some(block_id) = vote.block_id else {
        return false;
    };
    let round = u64::from(vote.round);
    let Ok(signature): Result<[u8; 64], _> = signature.try_into() else {
        return false;
    };
    let message = precommit_message(vote.height, round, &block_id, 1, &block_id, &vote.chain_id);
    public.verify(&message, &signature)
}

/// Aggregate stored v4 precommits at `height` through [`bft_commit`]. Does not
/// move the tip or persist commits; live [`crate::ArkheNode::bft_commit`] is unchanged.
pub fn commit_verdict_from_precommits(
    height: u64,
    canonical_hash: [u8; 32],
    precommits: &[Precommit],
    validator_power: &HashMap<String, u64>,
    validator_keys: &HashMap<String, libp2p::identity::ed25519::PublicKey>,
) -> CommitVerdict {
    let mut votes = Vec::with_capacity(precommits.len());
    let mut signatures = Vec::with_capacity(precommits.len());
    for precommit in precommits {
        if precommit.height != height || precommit.block_hash != canonical_hash {
            continue;
        }
        match precommit_to_canonical_vote(precommit) {
            Ok(vote) => {
                votes.push(vote);
                signatures.push(precommit.signature.to_vec());
            }
            Err(reason) => {
                return CommitVerdict::InvalidVote { reason };
            }
        }
    }
    let keys = validator_keys.clone();
    bft_commit(&votes, &signatures, validator_power, move |vote, sig| {
        verify_v4_precommit(vote, sig, &keys)
    })
}
