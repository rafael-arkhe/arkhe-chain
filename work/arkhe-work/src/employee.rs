use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmployeeIdentity {
    pub did: String,
    pub work_public_key: Vec<u8>,
    pub privacy_key_ref: String,
    pub active: bool,
}

impl EmployeeIdentity {
    pub fn is_eligible_signer(&self) -> bool {
        self.active
            && self.did.starts_with("did:")
            && self.did == self.did.trim()
            && self.work_public_key.len() == 32
            && self.work_public_key.iter().any(|b| *b != 0)
            && !self.privacy_key_ref.trim().is_empty()
    }
}
