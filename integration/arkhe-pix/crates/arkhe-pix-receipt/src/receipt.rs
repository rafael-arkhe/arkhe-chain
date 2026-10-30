use crate::error::PixError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// PIX receipt — a *client-side* artifact. It is not the BCB record;
/// it references the BCB `end_to_end_id` and adds the purpose binding
/// that BCB does not carry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PixReceipt {
    pub profile: String,
    pub label: String,
    pub v: u32,
    pub end_to_end_id: String, // BCB E2E format
    pub txid: String,
    pub amount_cents: u64, // integers only, never floats
    pub currency: String,  // "BRL"
    pub settled_at: i64,   // unix seconds (from BCB, not from signer)
    pub payer: PartyRef,
    pub recipient: PartyRef,
    /// blake3 hex of what was paid for (e.g. an E02 dataset digest)
    pub purpose_hash: Option<String>,
    /// blake3 hex of the KYA passport that authorized the payer
    pub passport_digest: Option<String>,
    /// Free-form, but JCS-canonicalized
    #[serde(default, deserialize_with = "unique_metadata")]
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PartyRef {
    pub tax_id_kind: TaxIdKind,
    pub value: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaxIdKind {
    Cpf,
    Cnpj,
    Email,
    Phone,
    Random,
}

impl PixReceipt {
    pub fn validate(&self) -> Result<(), PixError> {
        if self.profile != "arkhe-pix-receipt@1" || self.label != "synthetic-poc" {
            return Err(PixError::InvalidProfile);
        }
        if self.v != 1 {
            return Err(PixError::UnsupportedVersion(self.v));
        }
        if !is_valid_e2e(&self.end_to_end_id) {
            return Err(PixError::InvalidEndToEndId);
        }
        if self.amount_cents == 0 {
            return Err(PixError::InvalidAmount);
        }
        if self.currency != "BRL" {
            return Err(PixError::InvalidCurrency);
        }
        if self.amount_cents > 999_999_999_999
            || self.settled_at < 0
            || self.settled_at > 9_007_199_254_740_991
        {
            return Err(PixError::InvalidBounds);
        }
        if !(26..=35).contains(&self.txid.len())
            || !self.txid.bytes().all(|b| b.is_ascii_alphanumeric())
        {
            return Err(PixError::InvalidBounds);
        }
        for digest in [&self.purpose_hash, &self.passport_digest]
            .into_iter()
            .flatten()
        {
            if digest.len() != 64
                || !digest
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            {
                return Err(PixError::InvalidBounds);
            }
        }
        for party in [&self.payer, &self.recipient] {
            if party.value.is_empty()
                || party.value.len() > 128
                || party.value.chars().any(char::is_control)
                || party
                    .display_name
                    .as_ref()
                    .is_some_and(|n| n.len() > 128 || n.chars().any(char::is_control))
            {
                return Err(PixError::InvalidBounds);
            }
        }
        if self.metadata.len() > 16
            || self.metadata.iter().any(|(k, v)| {
                k.is_empty()
                    || k.len() > 64
                    || v.len() > 256
                    || k.chars().any(char::is_control)
                    || v.chars().any(char::is_control)
            })
        {
            return Err(PixError::InvalidBounds);
        }
        Ok(())
    }

    /// BLAKE3 over `JCS(PixReceipt)`.
    pub fn digest(&self) -> Result<[u8; 32], PixError> {
        self.validate()?;
        let canonical = serde_jcs::to_vec(self).map_err(|e| PixError::Jcs(e.to_string()))?;
        let mut h = blake3::Hasher::new();
        h.update(b"ARKHE:PIX:RECEIPT:v1\0");
        h.update(&canonical);
        Ok(h.finalize().into())
    }

    pub fn digest_hex(&self) -> Result<String, PixError> {
        Ok(hex::encode(self.digest()?))
    }
}

/// Syntax from BCB API Pix 2.10.0 EndToEndId; no existence/settlement check.
fn is_valid_e2e(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_alphanumeric())
}

fn unique_metadata<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<BTreeMap<String, String>, D::Error> {
    struct Unique;
    impl<'de> serde::de::Visitor<'de> for Unique {
        type Value = BTreeMap<String, String>;
        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("unique bounded metadata keys")
        }
        fn visit_map<A: serde::de::MapAccess<'de>>(
            self,
            mut access: A,
        ) -> Result<Self::Value, A::Error> {
            let mut map = BTreeMap::new();
            while let Some((key, value)) = access.next_entry::<String, String>()? {
                if map.len() >= 16 || map.insert(key, value).is_some() {
                    return Err(serde::de::Error::custom("metadata duplicate or limit"));
                }
            }
            Ok(map)
        }
    }
    deserializer.deserialize_map(Unique)
}
