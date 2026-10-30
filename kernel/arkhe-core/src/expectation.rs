//! ExecutionExpectation v1 (AKG:EXPECT:v1) and AbsenceRecord v1 (AKG:ABSENCE:v1).
//! A WER proves that work ran; it cannot prove that work which should have run
//! did not. An expectation declares a cadence for one module; auditing it
//! against admitted WERs turns each silent window into positive evidence.
//! Pure and clock-free: the caller supplies `now` and admission times taken
//! from the evidence log, never from the worker's own claims.
use crate::canonical::Cbor;
use crate::{worker::WorkerExecutionRecord, CanonicalEncode, Digest32};
use serde::{Deserialize, Serialize};

pub const EXPECTATION_VERSION: u64 = 1;
pub const ABSENCE_VERSION: u64 = 1;
pub const MAX_ID_BYTES: usize = 128;
/// Bounds one audit call; callers advance `from_window` to catch up further.
pub const MAX_WINDOWS_PER_AUDIT: u64 = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecutionExpectation {
    pub version: u64,
    pub expectation_id: String,
    /// Matched against `WorkerExecutionRecord::module_id`.
    pub module_id: String,
    /// Start of window 0, in Unix seconds.
    pub anchor_unix: u64,
    /// Window `k` is `[anchor + k*period, anchor + (k+1)*period)`.
    pub period_secs: u64,
    /// Late admissions up to `grace_secs` after a window still satisfy it.
    /// Strictly less than `period_secs`.
    pub grace_secs: u64,
    pub policy_digest: Digest32,
}

/// Evidence that no matching WER was admitted for one closed window.
/// Contains no evaluation time, so re-auditing a window yields the same digest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AbsenceRecord {
    pub version: u64,
    pub expectation_digest: Digest32,
    pub module_id: String,
    pub window_index: u64,
    pub window_start_unix: u64,
    pub window_end_unix: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ExpectationError {
    #[error("schema: {0}")]
    Schema(&'static str),
    #[error("window arithmetic overflows u64")]
    Overflow,
    #[error("audit spans more than {MAX_WINDOWS_PER_AUDIT} windows")]
    TooManyWindows,
}

impl ExecutionExpectation {
    pub fn validate(&self) -> Result<(), ExpectationError> {
        let fail = |m| Err(ExpectationError::Schema(m));
        if self.version != EXPECTATION_VERSION {
            return fail("unsupported version");
        }
        if !is_id(&self.expectation_id) {
            return fail("expectation_id");
        }
        if !is_id(&self.module_id) {
            return fail("module_id");
        }
        if self.period_secs == 0 {
            return fail("period_secs");
        }
        if self.grace_secs >= self.period_secs {
            return fail("grace_secs must be below period_secs");
        }
        Ok(())
    }

    /// `[start, end)` of window `k`.
    pub fn window(&self, k: u64) -> Result<(u64, u64), ExpectationError> {
        let start = k
            .checked_mul(self.period_secs)
            .and_then(|o| o.checked_add(self.anchor_unix))
            .ok_or(ExpectationError::Overflow)?;
        let end = start
            .checked_add(self.period_secs)
            .ok_or(ExpectationError::Overflow)?;
        Ok((start, end))
    }

    /// Number of windows whose grace period has fully elapsed at `now_unix`.
    pub fn closed_windows(&self, now_unix: u64) -> u64 {
        self.anchor_unix
            .checked_add(self.grace_secs)
            .and_then(|first_close| now_unix.checked_sub(first_close))
            .and_then(|elapsed| elapsed.checked_div(self.period_secs))
            .unwrap_or(0)
    }

    /// Audit every closed window from `from_window` on. `admitted` pairs each
    /// WER with its admission time in the evidence log. Open windows are never
    /// judged: absence is only asserted once the grace period has passed.
    pub fn audit(
        &self,
        from_window: u64,
        now_unix: u64,
        admitted: &[(u64, &WorkerExecutionRecord)],
    ) -> Result<Vec<AbsenceRecord>, ExpectationError> {
        self.validate()?;
        let closed = self.closed_windows(now_unix);
        if closed.saturating_sub(from_window) > MAX_WINDOWS_PER_AUDIT {
            return Err(ExpectationError::TooManyWindows);
        }
        let times: Vec<u64> = admitted
            .iter()
            .filter(|(_, wer)| wer.module_id == self.module_id)
            .map(|(at, _)| *at)
            .collect();
        let in_range = |from: u64, to: u64| {
            times
                .iter()
                .copied()
                .filter(move |t| (from..to).contains(t))
        };
        // A run admitted in the first `grace_secs` of window k+1 is late for
        // window k only when k had no on-time run. Each run then credits at
        // most one window, so a single run can never hide a silent window.
        let late_for = |k: u64| -> Result<Vec<u64>, ExpectationError> {
            let (start, end) = self.window(k)?;
            if in_range(start, end).next().is_some() {
                return Ok(Vec::new());
            }
            let late_end = end
                .checked_add(self.grace_secs)
                .ok_or(ExpectationError::Overflow)?;
            Ok(in_range(end, late_end).collect())
        };
        let expectation_digest = self.object_digest();
        let mut absences = Vec::new();
        for k in from_window..closed {
            let (start, end) = self.window(k)?;
            let credited_to_previous = match k.checked_sub(1) {
                Some(prev) => late_for(prev)?,
                None => Vec::new(),
            };
            let satisfied = in_range(start, end).any(|t| !credited_to_previous.contains(&t))
                || !late_for(k)?.is_empty();
            if !satisfied {
                absences.push(AbsenceRecord {
                    version: ABSENCE_VERSION,
                    expectation_digest,
                    module_id: self.module_id.clone(),
                    window_index: k,
                    window_start_unix: start,
                    window_end_unix: end,
                });
            }
        }
        Ok(absences)
    }

    pub fn to_cbor(&self) -> Cbor {
        map(vec![
            ("version", Cbor::Uint(self.version)),
            ("expectation_id", Cbor::Text(self.expectation_id.clone())),
            ("module_id", Cbor::Text(self.module_id.clone())),
            ("anchor_unix", Cbor::Uint(self.anchor_unix)),
            ("period_secs", Cbor::Uint(self.period_secs)),
            ("grace_secs", Cbor::Uint(self.grace_secs)),
            ("policy_digest", bytes(self.policy_digest)),
        ])
    }
}

impl AbsenceRecord {
    pub fn to_cbor(&self) -> Cbor {
        map(vec![
            ("version", Cbor::Uint(self.version)),
            ("expectation_digest", bytes(self.expectation_digest)),
            ("module_id", Cbor::Text(self.module_id.clone())),
            ("window_index", Cbor::Uint(self.window_index)),
            ("window_start_unix", Cbor::Uint(self.window_start_unix)),
            ("window_end_unix", Cbor::Uint(self.window_end_unix)),
        ])
    }
}

impl CanonicalEncode for ExecutionExpectation {
    const DOMAIN_OBJECT: &'static [u8] = b"AKG:EXPECT:v1\0";

    fn unsigned_projection(&self) -> serde_json::Value {
        serde_json::to_value(self).expect("typed ExecutionExpectation")
    }

    fn canonical_bytes(&self) -> Vec<u8> {
        self.to_cbor().encode()
    }
}

impl CanonicalEncode for AbsenceRecord {
    const DOMAIN_OBJECT: &'static [u8] = b"AKG:ABSENCE:v1\0";

    fn unsigned_projection(&self) -> serde_json::Value {
        serde_json::to_value(self).expect("typed AbsenceRecord")
    }

    fn canonical_bytes(&self) -> Vec<u8> {
        self.to_cbor().encode()
    }
}

fn map(pairs: Vec<(&str, Cbor)>) -> Cbor {
    Cbor::Map(pairs.into_iter().map(|(k, v)| (k.to_owned(), v)).collect())
}
fn bytes(d: Digest32) -> Cbor {
    Cbor::Bytes(d.0.to_vec())
}
fn is_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= MAX_ID_BYTES
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._@+-/:".contains(&b))
}
