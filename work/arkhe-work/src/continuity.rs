use arkhe_core::Digest32;

#[derive(Debug, Clone)]
pub struct EmergencyProcedure {
    pub procedure_id: Digest32,
    pub transition: String,
    pub policy_digest: Digest32,
    pub required_quorum: usize,
    pub authorized_operators: Vec<String>,
    pub not_before: i64,
    pub not_after: i64,
    pub replay_nonce: Digest32,
}

pub fn unique_authorized_quorum(p: &EmergencyProcedure, signer_ids: &[String]) -> bool {
    if p.required_quorum == 0 {
        return false;
    }
    let mut unique = signer_ids.to_vec();
    unique.sort();
    unique.dedup();
    unique.len() >= p.required_quorum
        && unique
            .iter()
            .all(|s| !s.trim().is_empty() && p.authorized_operators.contains(s))
}

impl EmergencyProcedure {
    pub fn validate(&self, signer_ids: &[String], now: i64) -> Result<(), &'static str> {
        if self.procedure_id == Digest32::ZERO
            || self.policy_digest == Digest32::ZERO
            || self.replay_nonce == Digest32::ZERO
        {
            return Err("zero digest in emergency procedure");
        }
        if self.transition.trim().is_empty() {
            return Err("empty emergency transition");
        }
        if self.not_before > self.not_after || now < self.not_before || now >= self.not_after {
            return Err("emergency procedure outside validity window");
        }
        if !unique_authorized_quorum(self, signer_ids) {
            return Err("insufficient or unauthorized emergency quorum");
        }
        Ok(())
    }
}
