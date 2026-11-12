use crate::{
    adapters::{ensure_match, ReceiptAdapter},
    types::{DePINProvider, NativeReceipt, ReceiptKind},
    Error,
};
use arkhe_core::Digest32;
use serde::{Deserialize, Serialize};

/// Proposed synthetic witness receipt; not an authenticated Helium wire format.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HeliumWitnessReceipt {
    pub hotspot_id: String,
    pub challenge_id: String,
    pub witnesses: Vec<String>,
    pub observed_at: i64,
}

impl HeliumWitnessReceipt {
    pub fn to_native_receipt(&self) -> Result<NativeReceipt, Error> {
        HeliumAdapter::normalize(self)
    }
}

pub struct HeliumAdapter;

impl ReceiptAdapter for HeliumAdapter {
    type Receipt = HeliumWitnessReceipt;

    fn normalize(receipt: &HeliumWitnessReceipt) -> Result<NativeReceipt, Error> {
        if receipt.hotspot_id.trim().is_empty()
            || receipt.challenge_id.trim().is_empty()
            || receipt.witnesses.is_empty()
            || receipt.witnesses.iter().any(|w| w.trim().is_empty())
            || receipt
                .witnesses
                .iter()
                .enumerate()
                .any(|(i, w)| receipt.witnesses[..i].contains(w))
            || receipt.observed_at < 0
        {
            return Err(Error::InvalidReceipt("invalid helium witness fields"));
        }
        let payload = serde_json::to_vec(receipt)?;
        Ok(NativeReceipt {
            provider: DePINProvider::Helium,
            kind: ReceiptKind::HeliumWitness,
            receipt_hash: Digest32::blake3(b"ARKHE/DEPIN/RECEIPT/v1", &payload),
            payload,
            issued_at: receipt.observed_at,
        })
    }

    fn validate(receipt: &NativeReceipt) -> Result<(), Error> {
        let decoded: HeliumWitnessReceipt = serde_json::from_slice(&receipt.payload)?;
        ensure_match(&Self::normalize(&decoded)?, receipt)
    }
}

impl HeliumAdapter {
    pub fn normalize(receipt: &HeliumWitnessReceipt) -> Result<NativeReceipt, Error> {
        <Self as ReceiptAdapter>::normalize(receipt)
    }

    pub fn validate(receipt: &NativeReceipt) -> Result<(), Error> {
        <Self as ReceiptAdapter>::validate(receipt)
    }
}
