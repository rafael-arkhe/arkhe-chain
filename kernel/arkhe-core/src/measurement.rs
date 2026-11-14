//! MeasurementRecord v1 (AKG:MEASURE:v1). A measurement is a claim about a
//! quantity, made by a named collector, over a window, under an execution
//! configuration the record names by digest. The record carries the *reach* of
//! that claim — real governed work, a stand-in workload, a substitute signal or
//! a model's output — so a reader can refuse to count one as another.
//!
//! What a record cannot establish: that the collector measured correctly, that
//! its sensor was calibrated, or that the named configuration was the one in
//! force. A signature over this record attests the collector's statement and
//! nothing further; establishing the measurement itself needs evidence of a
//! different kind. Treat the value as the collector's claim, not as fact.
//!
//! This module summarises nothing. Comparability and coverage are decidable
//! from the records; a value is not. A p99 over the union of two windows is not
//! derivable from the two p99s, so no API here offers to combine values, and a
//! caller that needs a combined statistic must go back to the samples.
//!
//! Pure and clock-free: window bounds come from the records, never from a clock
//! read here.
use crate::canonical::{decode_canonical, Cbor, DecodeError};
use crate::fields::{digest, is_id, nullable, text, uint, Fields};
use crate::{CanonicalEncode, Digest32};
use serde::{Deserialize, Serialize};

pub const MEASUREMENT_VERSION: u64 = 1;
/// Bounds one comparability check; a caller with more records folds in batches.
pub const MAX_RECORDS_PER_SERIES: usize = 10_000;

/// What the number is a claim about. The four are distinct classifications, not
/// degrees of confidence: a projection is not a weak measurement, it is not a
/// measurement. Only `Observed` is the governed workload itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reach {
    /// Measured on the governed workload under the named configuration.
    Observed,
    /// Measured on a generated workload standing in for the governed one.
    Synthetic,
    /// Measured on a different quantity taken to track the one named.
    Proxy,
    /// Computed from a model or extrapolation; no window was measured.
    Projected,
}

impl Reach {
    /// Whether a record of this reach answers a requirement for `required`.
    /// `Observed` answers every requirement, since real work is never a weaker
    /// claim than its stand-ins. The three weak reaches never substitute for
    /// each other: a proxy signal is not a synthetic run is not a projection.
    pub fn satisfies(self, required: Reach) -> bool {
        self == required || self == Reach::Observed
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Reach::Observed => "observed",
            Reach::Synthetic => "synthetic",
            Reach::Proxy => "proxy",
            Reach::Projected => "projected",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "observed" => Some(Reach::Observed),
            "synthetic" => Some(Reach::Synthetic),
            "proxy" => Some(Reach::Proxy),
            "projected" => Some(Reach::Projected),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MeasurementRecord {
    pub version: u64,
    /// Quantity and statistic together, e.g. `serving.step_latency.p99`.
    /// One id means one statistic: records under the same id are the same kind
    /// of claim, which is what makes a comparability check decidable.
    pub metric_id: String,
    /// Unit of `value`, fixed by `metric_id`, e.g. `ns`, `bytes`, `count`.
    pub unit: String,
    /// Integer in `unit`. No floats: the same record must encode to the same
    /// bytes on every host that re-derives this digest.
    pub value: u64,
    /// Samples behind `value`. A window with no samples is not a measurement.
    pub sample_count: u64,
    /// Half-open window `[start, end)` in Unix seconds, from the collector.
    pub window_start_unix: u64,
    pub window_end_unix: u64,
    pub reach: Reach,
    /// Collector identity and build, e.g. `arkhe/cgroup-collector/v1`. A reader
    /// that cannot name the collector cannot judge what the number means.
    pub collector_id: String,
    /// The effective execution configuration in force during the window, as the
    /// executor reported it — never a requested or declared profile.
    pub configuration_digest: Digest32,
    /// The governed operation this window belongs to. `None` is a baseline: a
    /// window in which no governed work was admitted. A baseline is still a
    /// measurement of real traffic, so its reach may be `Observed`.
    pub operation_id: Option<Digest32>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum MeasurementError {
    #[error("canonical CBOR: {0}")]
    Cbor(#[from] DecodeError),
    #[error("schema: {0}")]
    Schema(&'static str),
    #[error("records are not comparable: {0}")]
    Incomparable(&'static str),
    #[error("observation windows overlap; samples would be counted twice")]
    Overlap,
    #[error("no records")]
    Empty,
    #[error("more than {MAX_RECORDS_PER_SERIES} records in one series")]
    TooManyRecords,
    #[error("sample arithmetic overflows u64")]
    Overflow,
}

impl From<&'static str> for MeasurementError {
    fn from(m: &'static str) -> Self {
        Self::Schema(m)
    }
}

impl MeasurementRecord {
    pub fn validate(&self) -> Result<(), MeasurementError> {
        let fail = |m| Err(MeasurementError::Schema(m));
        if self.version != MEASUREMENT_VERSION {
            return fail("unsupported version");
        }
        if !is_id(&self.metric_id) {
            return fail("metric_id");
        }
        if !is_id(&self.unit) {
            return fail("unit");
        }
        if !is_id(&self.collector_id) {
            return fail("collector_id");
        }
        if self.sample_count == 0 {
            return fail("sample_count must be positive");
        }
        if self.window_end_unix <= self.window_start_unix {
            return fail("window_end_unix must follow window_start_unix");
        }
        // A number with no configuration behind it cannot be compared with any
        // other number, so it is refused at the boundary rather than stored.
        if self.configuration_digest == Digest32::ZERO {
            return fail("configuration_digest");
        }
        if self.operation_id == Some(Digest32::ZERO) {
            return fail("operation_id");
        }
        Ok(())
    }

    /// Whether this record answers a requirement for `required` reach.
    pub fn satisfies_reach(&self, required: Reach) -> bool {
        self.reach.satisfies(required)
    }

    /// Strict inverse of `canonical_bytes`.
    pub fn from_canonical_bytes(input: &[u8]) -> Result<Self, MeasurementError> {
        let mut f = Fields::new(decode_canonical(input)?)?;
        let value = Self {
            version: uint(f.take("version")?)?,
            metric_id: text(f.take("metric_id")?)?,
            unit: text(f.take("unit")?)?,
            value: uint(f.take("value")?)?,
            sample_count: uint(f.take("sample_count")?)?,
            window_start_unix: uint(f.take("window_start_unix")?)?,
            window_end_unix: uint(f.take("window_end_unix")?)?,
            reach: Reach::parse(&text(f.take("reach")?)?).ok_or("reach")?,
            collector_id: text(f.take("collector_id")?)?,
            configuration_digest: digest(f.take("configuration_digest")?)?,
            operation_id: nullable(f.take("operation_id")?, digest)?,
        };
        f.finish()?;
        value.validate()?;
        Ok(value)
    }

    pub fn to_cbor(&self) -> Cbor {
        map(vec![
            ("version", Cbor::Uint(self.version)),
            ("metric_id", Cbor::Text(self.metric_id.clone())),
            ("unit", Cbor::Text(self.unit.clone())),
            ("value", Cbor::Uint(self.value)),
            ("sample_count", Cbor::Uint(self.sample_count)),
            ("window_start_unix", Cbor::Uint(self.window_start_unix)),
            ("window_end_unix", Cbor::Uint(self.window_end_unix)),
            ("reach", Cbor::Text(self.reach.as_str().to_owned())),
            ("collector_id", Cbor::Text(self.collector_id.clone())),
            ("configuration_digest", bytes(self.configuration_digest)),
            (
                "operation_id",
                match self.operation_id {
                    Some(d) => bytes(d),
                    None => Cbor::Null,
                },
            ),
        ])
    }
}

/// What a set of comparable records covers. It reports reach, extent and the
/// holes; it reports no combined value, because the records do not determine
/// one. `gaps` is the part of `[start, end)` that no window covers — the
/// observation lacunae a receipt has to disclose rather than smooth over.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Coverage {
    pub reach: Reach,
    pub metric_id: String,
    pub unit: String,
    pub collector_id: String,
    pub configuration_digest: Digest32,
    pub records: usize,
    pub sample_count: u64,
    pub window_start_unix: u64,
    pub window_end_unix: u64,
    pub gaps: Vec<(u64, u64)>,
}

impl Coverage {
    pub fn is_contiguous(&self) -> bool {
        self.gaps.is_empty()
    }

    /// Seconds of `[window_start_unix, window_end_unix)` that a window covers.
    pub fn observed_secs(&self) -> u64 {
        let span = self.window_end_unix - self.window_start_unix;
        span - self.gaps.iter().map(|(a, b)| b - a).sum::<u64>()
    }
}

/// Every way a set of records can fail to describe one comparable series.
/// Mixing reaches is the failure this check exists for: a synthetic run counted
/// as delivered work is how an experiment turns into a false capability claim.
pub fn check_comparable(records: &[MeasurementRecord]) -> Result<(), MeasurementError> {
    let (first, rest) = records.split_first().ok_or(MeasurementError::Empty)?;
    if records.len() > MAX_RECORDS_PER_SERIES {
        return Err(MeasurementError::TooManyRecords);
    }
    for record in records {
        record.validate()?;
    }
    let fail = |m| Err(MeasurementError::Incomparable(m));
    for r in rest {
        if r.reach != first.reach {
            return fail("reach");
        }
        if r.metric_id != first.metric_id {
            return fail("metric_id");
        }
        if r.unit != first.unit {
            return fail("unit");
        }
        if r.collector_id != first.collector_id {
            return fail("collector_id");
        }
        if r.configuration_digest != first.configuration_digest {
            return fail("configuration_digest");
        }
    }
    Ok(())
}

/// Comparability, extent and gaps over `records`, in any order. Overlapping
/// windows are refused: two windows covering the same second would count those
/// samples twice, and no ordering of the records makes that sound.
pub fn coverage(records: &[MeasurementRecord]) -> Result<Coverage, MeasurementError> {
    check_comparable(records)?;
    let first = &records[0];
    let mut windows: Vec<(u64, u64)> = records
        .iter()
        .map(|r| (r.window_start_unix, r.window_end_unix))
        .collect();
    windows.sort_unstable();
    let mut gaps = Vec::new();
    for pair in windows.windows(2) {
        let (_, previous_end) = pair[0];
        let (next_start, _) = pair[1];
        if next_start < previous_end {
            return Err(MeasurementError::Overlap);
        }
        if next_start > previous_end {
            gaps.push((previous_end, next_start));
        }
    }
    let mut sample_count: u64 = 0;
    for r in records {
        sample_count = sample_count
            .checked_add(r.sample_count)
            .ok_or(MeasurementError::Overflow)?;
    }
    Ok(Coverage {
        reach: first.reach,
        metric_id: first.metric_id.clone(),
        unit: first.unit.clone(),
        collector_id: first.collector_id.clone(),
        configuration_digest: first.configuration_digest,
        records: records.len(),
        sample_count,
        window_start_unix: windows[0].0,
        window_end_unix: windows[windows.len() - 1].1,
        gaps,
    })
}

impl CanonicalEncode for MeasurementRecord {
    const DOMAIN_OBJECT: &'static [u8] = b"AKG:MEASURE:v1\0";

    fn unsigned_projection(&self) -> serde_json::Value {
        serde_json::to_value(self).expect("typed MeasurementRecord")
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
