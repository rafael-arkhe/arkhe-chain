//! Desktop conformance adapter, not a production match verification ABI.
use arkhe_core::{
    match_summary::MatchSummary, work::WorkIntent, worker::WorkerExecutionRecord, CanonicalEncode,
};
use serde::de::DeserializeOwned;

const LIMIT: usize = 8 * 1024 * 1024;

fn encode<T: CanonicalEncode + DeserializeOwned>(
    input: &[u8],
    validate: impl FnOnce(&T) -> Result<(), &'static str>,
) -> Result<Vec<u8>, ()> {
    let value: T = serde_json::from_slice(input).map_err(|_| ())?;
    validate(&value).map_err(|_| ())?;
    let hex = value
        .canonical_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    serde_json::to_vec(&serde_json::json!({
        "canonical_cbor_hex": hex,
        "record_hash": value.object_digest().to_hex(),
    }))
    .map_err(|_| ())
}

/// Component: 1 WorkIntent, 2 WER, 3 proposed Unity MatchSummary v1.
/// Returns positive output length; -1 rejected; -2 short output; -3 ABI/internal error.
/// Null output with capacity zero queries required size without writing memory.
/// # Safety
/// Non-null pointers must refer to readable/writable, non-overlapping buffers of
/// the supplied lengths for the entire synchronous call. Caller owns all buffers.
#[no_mangle]
pub unsafe extern "C" fn arkhe_conformance_encode(
    component: u32,
    input: *const u8,
    input_len: u32,
    output: *mut u8,
    capacity: u32,
) -> i32 {
    if input.is_null()
        || input_len == 0
        || input_len as usize > LIMIT
        || capacity as usize > LIMIT
        || (output.is_null() && capacity != 0)
    {
        return -3;
    }
    std::panic::catch_unwind(|| {
        let input = unsafe { std::slice::from_raw_parts(input, input_len as usize) };
        let result = match component {
            1 => encode::<WorkIntent>(input, |_| Ok(())),
            2 => encode::<WorkerExecutionRecord>(input, |_| Ok(())),
            3 => encode::<MatchSummary>(input, MatchSummary::validate),
            _ => return -3,
        };
        let Ok(bytes) = result else {
            return -1;
        };
        if bytes.len() > LIMIT {
            return -3;
        }
        if output.is_null() && capacity == 0 {
            return bytes.len() as i32;
        }
        if (capacity as usize) < bytes.len() {
            return -2;
        }
        unsafe {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), output, bytes.len());
        }
        bytes.len() as i32
    })
    .unwrap_or(-3)
}
