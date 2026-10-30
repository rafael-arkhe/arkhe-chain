//! Fail-closed orchestration. Adapters MUST authenticate, replay and commit atomically.
//! No placeholder adapter accepts a match or grants a reward.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MatchSummary {
    pub match_id: String,
    pub seed: u64,
    pub ticks: u32,
    pub waves: u32,
    pub absorbed: u32,
    pub bosses: u32,
    pub final_hash: [u8; 32],
    pub claimed_base_points: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reject {
    Ticket,
    Replay,
    Mismatch,
    HumanProof,
    Commit,
    Overflow,
}

pub struct AuthContext {
    pub tenant: String,
    pub player: String,
}
pub struct Submission {
    pub summary: MatchSummary,
    pub replay: Vec<u8>,
    pub human_proof: Vec<u8>,
}
pub struct Ticket {
    pub match_id: String,
    pub tenant: String,
    pub player: String,
    pub seed: u64,
    pub ranked: bool,
    pub booster: bool,
    pub vip_bonus_bps: u16,
    pub rewarded_double: bool,
}

pub trait Integrity {
    /// Check server-issued ticket, expiry, seed, rules hash and reward grant.
    fn ticket(&self, auth: &AuthContext, id: &str) -> Result<Ticket, Reject>;
    /// Execute version-pinned deterministic simulation, bound input size/ticks,
    /// verify hash chain, enforce gestures, cooldowns, revive grants and score.
    fn replay(&self, ticket: &Ticket, bytes: &[u8]) -> Result<MatchSummary, Reject>;
    /// Verify UltraHonk proof with pinned circuit/key, match-bound challenge,
    /// audience, season and unique nullifier. Absence/errors reject ranked play.
    fn human(&self, ticket: &Ticket, proof: &[u8]) -> Result<(), Reject>;
}

pub trait RewardLedger {
    /// One serializable DB transaction: consume match/grant/nullifier, append
    /// AKG-CBOR-v1 evidence with parents + MMR outbox, update balance. Unique
    /// (tenant, match) means retries return SAME receipt and never credit twice.
    /// Same id with different payload fails. Failures roll everything back.
    fn commit_once(
        &self,
        ticket: &Ticket,
        verified: &MatchSummary,
        points: u64,
    ) -> Result<String, Reject>;
}

pub fn base_points(s: &MatchSummary) -> u64 {
    u64::from(s.ticks / 60)
        + u64::from(s.waves) * 25
        + u64::from(s.absorbed) * 2
        + u64::from(s.bosses) * 500
}

pub fn validate(
    auth: &AuthContext,
    request: &Submission,
    integrity: &impl Integrity,
    ledger: &impl RewardLedger,
) -> Result<String, Reject> {
    let t = integrity.ticket(auth, &request.summary.match_id)?;
    if t.tenant != auth.tenant
        || t.player != auth.player
        || t.match_id != request.summary.match_id
        || t.seed != request.summary.seed
    {
        return Err(Reject::Ticket);
    }
    if request.replay.len() > 4_000_000
        || request.human_proof.len() > 131_072
        || request.summary.ticks == 0
        || request.summary.ticks > 108_000
    {
        return Err(Reject::Replay);
    }
    if t.ranked {
        integrity.human(&t, &request.human_proof)?;
    }
    let replayed = integrity.replay(&t, &request.replay)?;
    if replayed != request.summary || base_points(&replayed) != replayed.claimed_base_points {
        return Err(Reject::Mismatch);
    }
    let points = base_points(&replayed)
        .checked_mul(if t.booster { 2 } else { 1 })
        .and_then(|v| v.checked_mul(if t.rewarded_double { 2 } else { 1 }))
        .and_then(|v| v.checked_mul(10_000 + u64::from(t.vip_bonus_bps)))
        .ok_or(Reject::Overflow)?
        / 10_000;
    ledger.commit_once(&t, &replayed, points)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    struct Gate {
        summary: MatchSummary,
        ranked: bool,
        reject_human: bool,
    }
    impl Integrity for Gate {
        fn ticket(&self, a: &AuthContext, id: &str) -> Result<Ticket, Reject> {
            Ok(Ticket {
                match_id: id.into(),
                tenant: a.tenant.clone(),
                player: a.player.clone(),
                seed: 42,
                ranked: self.ranked,
                booster: true,
                vip_bonus_bps: 1000,
                rewarded_double: true,
            })
        }
        fn replay(&self, _: &Ticket, _: &[u8]) -> Result<MatchSummary, Reject> {
            Ok(self.summary.clone())
        }
        fn human(&self, _: &Ticket, _: &[u8]) -> Result<(), Reject> {
            if self.reject_human {
                Err(Reject::HumanProof)
            } else {
                Ok(())
            }
        }
    }
    struct Ledger(Cell<u64>);
    impl RewardLedger for Ledger {
        fn commit_once(&self, _: &Ticket, _: &MatchSummary, p: u64) -> Result<String, Reject> {
            self.0.set(p);
            Ok("receipt".into())
        }
    }
    fn fixture() -> (AuthContext, Submission, Gate, Ledger) {
        let s = MatchSummary {
            match_id: "match-1".into(),
            seed: 42,
            ticks: 3600,
            waves: 2,
            absorbed: 10,
            bosses: 1,
            final_hash: [7; 32],
            claimed_base_points: 630,
        };
        (
            AuthContext {
                tenant: "t".into(),
                player: "p".into(),
            },
            Submission {
                summary: s.clone(),
                replay: vec![],
                human_proof: vec![],
            },
            Gate {
                summary: s,
                ranked: false,
                reject_human: false,
            },
            Ledger(Cell::new(0)),
        )
    }
    #[test]
    fn rejects_forged_score_without_credit() {
        let (a, mut s, g, l) = fixture();
        s.summary.claimed_base_points += 1;
        assert_eq!(validate(&a, &s, &g, &l), Err(Reject::Mismatch));
        assert_eq!(l.0.get(), 0);
    }
    #[test]
    fn rejects_missing_human_proof_without_credit() {
        let (a, s, mut g, l) = fixture();
        g.ranked = true;
        g.reject_human = true;
        assert_eq!(validate(&a, &s, &g, &l), Err(Reject::HumanProof));
        assert_eq!(l.0.get(), 0);
    }
    #[test]
    fn derives_rewards_from_server_entitlements() {
        let (a, s, g, l) = fixture();
        assert!(validate(&a, &s, &g, &l).is_ok());
        assert_eq!(l.0.get(), 2772);
    }
    #[test]
    fn rejects_wrong_seed_without_credit() {
        let (a, mut s, g, l) = fixture();
        s.summary.seed = 999;
        assert_eq!(validate(&a, &s, &g, &l), Err(Reject::Ticket));
        assert_eq!(l.0.get(), 0);
    }
    #[test]
    fn rejects_replay_limit_without_credit() {
        let (a, mut s, g, l) = fixture();
        s.summary.ticks = 108001;
        assert_eq!(validate(&a, &s, &g, &l), Err(Reject::Replay));
        assert_eq!(l.0.get(), 0);
    }
}
