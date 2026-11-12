use crate::{
    adapters::{ensure_match, ReceiptAdapter},
    types::{DePINProvider, NativeReceipt, ReceiptKind},
    Error,
};
use arkhe_core::Digest32;
use serde::{Deserialize, Serialize};

/// Proposed synthetic job receipt; not an authenticated Vangrid wire format.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VangridJobReceipt {
    pub job_id: String,
    pub node_id: String,
    pub resource_class: String,
    pub input_commitment: String,
    pub output_commitment: String,
    pub completed_at: i64,
}

impl VangridJobReceipt {
    pub fn to_native_receipt(&self) -> Result<NativeReceipt, Error> {
        VangridAdapter::normalize(self)
    }
}

pub struct VangridAdapter;

impl ReceiptAdapter for VangridAdapter {
    type Receipt = VangridJobReceipt;

    fn normalize(receipt: &VangridJobReceipt) -> Result<NativeReceipt, Error> {
        if receipt.job_id.trim().is_empty()
            || receipt.node_id.trim().is_empty()
            || receipt.resource_class.trim().is_empty()
            || receipt.input_commitment.trim().is_empty()
            || receipt.output_commitment.trim().is_empty()
            || receipt.completed_at < 0
        {
            return Err(Error::InvalidReceipt("invalid vangrid job fields"));
        }
        let payload = serde_json::to_vec(receipt)?;
        Ok(NativeReceipt {
            provider: DePINProvider::Vangrid,
            kind: ReceiptKind::VangridJob,
            receipt_hash: Digest32::blake3(b"ARKHE/DEPIN/RECEIPT/v1", &payload),
            payload,
            issued_at: receipt.completed_at,
        })
    }

    fn validate(receipt: &NativeReceipt) -> Result<(), Error> {
        let decoded: VangridJobReceipt = serde_json::from_slice(&receipt.payload)?;
        ensure_match(&Self::normalize(&decoded)?, receipt)
    }
}

impl VangridAdapter {
    pub fn normalize(receipt: &VangridJobReceipt) -> Result<NativeReceipt, Error> {
        <Self as ReceiptAdapter>::normalize(receipt)
    }

    pub fn validate(receipt: &NativeReceipt) -> Result<(), Error> {
        <Self as ReceiptAdapter>::validate(receipt)
    }
}
