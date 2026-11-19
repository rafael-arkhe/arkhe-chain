//! Finality verdict from a batch of signed canonical precommits.

use std::collections::{HashMap, HashSet};

use super::canonical_vote::{CanonicalVote, VoteType, CANONICAL_CHAIN_ID};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommitVerdict {
    Commit {
        height: u64,
        block_id: [u8; 32],
        voting_power: u64,
    },
    QuorumAbsent {
        height: u64,
        max_power: u64,
        needed: u64,
    },
    /// Two distinct block ids each hold strictly more than two thirds of the
    /// total configured validator power (impossible without double-voting parts).
    Equivocation {
        height: u64,
        conflicting: Vec<[u8; 32]>,
    },
    InvalidVote {
        reason: String,
    },
}

pub fn total_validator_power(validator_power: &HashMap<String, u64>) -> u64 {
    validator_power.values().copied().sum()
}

fn strictly_more_than_two_thirds(power: u64, total: u64) -> bool {
    total > 0 && power.saturating_mul(3) > total.saturating_mul(2)
}

fn needed_power(total: u64) -> u64 {
    // Smallest power that strictly exceeds two thirds of `total`.
    total
        .saturating_mul(2)
        .checked_div(3)
        .unwrap_or(0)
        .saturating_add(1)
}

/// Verify signatures and aggregate stake per `(height, block_id)` for precommits.
/// `verify_sig` is injected: no validator keys live in this module.
pub fn bft_commit<F>(
    votes: &[CanonicalVote],
    signatures: &[Vec<u8>],
    validator_power: &HashMap<String, u64>,
    verify_sig: F,
) -> CommitVerdict
where
    F: Fn(&CanonicalVote, &[u8]) -> bool,
{
    if votes.len() != signatures.len() {
        return CommitVerdict::InvalidVote {
            reason: "votes/signatures length mismatch".into(),
        };
    }

    let total_network = total_validator_power(validator_power);
    if total_network == 0 {
        return CommitVerdict::InvalidVote {
            reason: "empty validator set".into(),
        };
    }

    let mut seen_parts: HashSet<(u64, String)> = HashSet::new();
    let mut by_height: HashMap<u64, HashMap<[u8; 32], u64>> = HashMap::new();
    let mut max_height = 0u64;
    let mut any_precommit = false;

    for (vote, sig) in votes.iter().zip(signatures.iter()) {
        if vote.chain_id != CANONICAL_CHAIN_ID {
            return CommitVerdict::InvalidVote {
                reason: "wrong chain_id".into(),
            };
        }
        if vote.part.is_empty() {
            return CommitVerdict::InvalidVote {
                reason: "missing part".into(),
            };
        }
        if !verify_sig(vote, sig) {
            return CommitVerdict::InvalidVote {
                reason: "bad signature".into(),
            };
        }
        if vote.vote_type != VoteType::Precommit {
            continue;
        }
        any_precommit = true;
        let power = *validator_power.get(&vote.part).unwrap_or(&0);
        if power == 0 {
            return CommitVerdict::InvalidVote {
                reason: format!("non-validator part: {}", vote.part),
            };
        }
        let key = (vote.height, vote.part.clone());
        if !seen_parts.insert(key) {
            return CommitVerdict::InvalidVote {
                reason: format!("duplicate part at height {}: {}", vote.height, vote.part),
            };
        }
        let Some(block_id) = vote.block_id else {
            continue;
        };
        max_height = max_height.max(vote.height);
        *by_height
            .entry(vote.height)
            .or_default()
            .entry(block_id)
            .or_insert(0) += power;
    }

    if !any_precommit {
        return CommitVerdict::QuorumAbsent {
            height: max_height,
            max_power: 0,
            needed: needed_power(total_network),
        };
    }

    let height = by_height.keys().copied().max().unwrap_or(max_height);
    let Some(blocks) = by_height.get(&height) else {
        return CommitVerdict::QuorumAbsent {
            height,
            max_power: 0,
            needed: needed_power(total_network),
        };
    };

    let mut quorum_hits: Vec<([u8; 32], u64)> = blocks
        .iter()
        .filter(|(_, stake)| strictly_more_than_two_thirds(**stake, total_network))
        .map(|(id, stake)| (*id, *stake))
        .collect();

    if quorum_hits.len() > 1 {
        quorum_hits.sort_by_key(|(id, _)| *id);
        return CommitVerdict::Equivocation {
            height,
            conflicting: quorum_hits.iter().map(|(id, _)| *id).collect(),
        };
    }

    if let Some((block_id, voting_power)) = quorum_hits.pop() {
        return CommitVerdict::Commit {
            height,
            block_id,
            voting_power,
        };
    }

    let max_power = blocks.values().copied().max().unwrap_or(0);
    CommitVerdict::QuorumAbsent {
        height,
        max_power,
        needed: needed_power(total_network),
    }
}
