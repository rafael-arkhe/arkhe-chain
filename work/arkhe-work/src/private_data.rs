use arkhe_core::Digest32;

pub struct PrivateData {
    pub owner: String,
    pub ciphertext: Vec<u8>,
    pub key_ref: String,
    pub plaintext_digest: Digest32,
    pub expires_at: i64,
}

impl PrivateData {
    pub fn is_accessible_by(&self, caller: &str, now: i64) -> bool {
        !self.owner.trim().is_empty()
            && self.owner == caller
            && !self.ciphertext.is_empty()
            && !self.key_ref.trim().is_empty()
            && self.plaintext_digest != Digest32::ZERO
            && now < self.expires_at
    }
}

// Deliberately no conversion to EvidenceEnvelope exists here.
