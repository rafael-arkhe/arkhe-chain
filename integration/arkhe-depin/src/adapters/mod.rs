pub mod filecoin;
pub mod gensyn;
pub mod helium;
pub mod vangrid;

use crate::{types::NativeReceipt, Error};

/// Structural normalize/validate for a provider-specific receipt DTO.
pub trait ReceiptAdapter {
    type Receipt;
    fn normalize(receipt: &Self::Receipt) -> Result<NativeReceipt, Error>;
    fn validate(receipt: &NativeReceipt) -> Result<(), Error>;
}

/// Dispatch validation by the receipt's declared provider.
pub fn validate_native_receipt(receipt: &NativeReceipt) -> Result<(), Error> {
    match receipt.provider {
        crate::types::DePINProvider::Gensyn => gensyn::GensynAdapter::validate(receipt),
        crate::types::DePINProvider::Filecoin => filecoin::FilecoinAdapter::validate(receipt),
        crate::types::DePINProvider::Helium => helium::HeliumAdapter::validate(receipt),
        crate::types::DePINProvider::Vangrid => vangrid::VangridAdapter::validate(receipt),
    }
}

pub(crate) fn ensure_match(
    normalized: &NativeReceipt,
    receipt: &NativeReceipt,
) -> Result<(), Error> {
    if normalized.receipt_hash != receipt.receipt_hash
        || normalized.payload != receipt.payload
        || normalized.issued_at != receipt.issued_at
        || normalized.provider != receipt.provider
        || normalized.kind != receipt.kind
    {
        return Err(Error::InvalidReceipt("normalization mismatch"));
    }
    Ok(())
}
