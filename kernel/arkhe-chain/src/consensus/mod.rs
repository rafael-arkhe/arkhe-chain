//! CometBFT-style canonical votes and quorum aggregation (C2).
//!
//! Existing `Precommit` v4 wire format is unchanged; these modules define
//! deterministic vote bytes and a fail-closed commit verdict for tests and
//! future wiring.

pub mod bft_commit;
pub mod canonical_vote;

pub use bft_commit::{bft_commit, total_validator_power, CommitVerdict};
pub use canonical_vote::{CanonicalVote, VoteType, CANONICAL_CHAIN_ID};