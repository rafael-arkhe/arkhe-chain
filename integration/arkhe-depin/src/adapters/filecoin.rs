use crate::{
    adapters::{ensure_match, ReceiptAdapter},
    types::{DePINProvider, NativeReceipt, ReceiptKind},
    Error,
};
use arkhe_core::Digest32;
use serde::{Deserialize, Serialize};

/// Proposed synthetic deal receipt; not an authenticated Filecoin wire format.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FilecoinDealReceipt {
    pub deal_id: String,
    pub provider_id: String,
    pub piece_cid: String,
    pub client_id: String,
    pub sealed_at: i64,
}

impl FilecoinDealReceipt {
    pub fn to_native_receipt(&self) -> Result<NativeReceipt, Error> {
        FilecoinAdapter::normalize(self)
    }
}

pub struct FilecoinAdapter;

impl ReceiptAdapter for FilecoinAdapter {
    type Receipt = FilecoinDealReceipt;

    fn normalize(receipt: &FilecoinDealReceipt) -> Result<NativeReceipt, Error> {
        if receipt.deal_id.trim().is_empty()
            || receipt.provider_id.trim().is_empty()
            || receipt.piece_cid.trim().is_empty()
            || receipt.client_id.trim().is_empty()
            || receipt.sealed_at < 0
        {
            return Err(Error::InvalidReceipt("invalid filecoin deal fields"));
        }
        let payload = serde_json::to_vec(receipt)?;
        Ok(NativeReceipt {
            provider: DePINProvider::Filecoin,
            kind: ReceiptKind::FilecoinDeal,
            receipt_hash: Digest32::blake3(b"ARKHE/DEPIN/RECEIPT/v1", &payload),
            payload,
            issued_at: receipt.sealed_at,
        })
    }

    fn validate(receipt: &NativeReceipt) -> Result<(), Error> {
        let decoded: FilecoinDealReceipt = serde_json::from_slice(&receipt.payload)?;
        ensure_match(&Self::normalize(&decoded)?, receipt)
    }
}

impl FilecoinAdapter {
    pub fn normalize(receipt: &FilecoinDealReceipt) -> Result<NativeReceipt, Error> {
        <Self as ReceiptAdapter>::normalize(receipt)
    }

    pub fn validate(receipt: &NativeReceipt) -> Result<(), Error> {
        <Self as ReceiptAdapter>::validate(receipt)
    }
}
