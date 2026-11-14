use arkhe_core::{
    measurement::{
        check_comparable, coverage, MeasurementError, MeasurementRecord, Reach,
        MEASUREMENT_VERSION,
    },
    CanonicalEncode, Digest32,
};

const T0: u64 = 1_790_000_000;
const MINUTE: u64 = 60;

fn record(reach: Reach, start: u64, secs: u64) -> MeasurementRecord {
    MeasurementRecord {
        version: MEASUREMENT_VERSION,
        metric_id: "serving.step_latency.p99".into(),
        unit: "ns".into(),
        value: 18_400_000,
        sample_count: 4_096,
        window_start_unix: start,
        window_end_unix: start + secs,
        reach,
        collector_id: "arkhe/cgroup-collector/v1".into(),
        configuration_digest: Digest32([9; 32]),
        operation_id: None,
    }
}

fn window(start: u64) -> MeasurementRecord {
    record(Reach::Observed, start, MINUTE)
}

#[test]
fn a_record_survives_a_canonical_round_trip() {
    let mut r = window(T0);
    r.operation_id = Some(Digest32([3; 32]));
    let bytes = r.canonical_bytes();
    assert_eq!(MeasurementRecord::from_canonical_bytes(&bytes).unwrap(), r);
    assert_ne!(r.object_digest(), Digest32::ZERO);
}

#[test]
fn a_baseline_window_names_no_operation_and_is_still_observed() {
    let r = window(T0);
    assert_eq!(r.operation_id, None);
    assert!(r.satisfies_reach(Reach::Observed));
    r.validate().unwrap();
}

#[test]
fn real_work_answers_every_reach_requirement() {
    for required in [
        Reach::Observed,
        Reach::Synthetic,
        Reach::Proxy,
        Reach::Projected,
    ] {
        assert!(Reach::Observed.satisfies(required));
    }
}

#[test]
fn the_weak_reaches_never_substitute_for_each_other_or_for_real_work() {
    let weak = [Reach::Synthetic, Reach::Proxy, Reach::Projected];
    for held in weak {
        assert!(held.satisfies(held));
        assert!(!held.satisfies(Reach::Observed));
        for required in weak.iter().copied().filter(|r| *r != held) {
            assert!(!held.satisfies(required));
        }
    }
}

#[test]
fn a_synthetic_window_cannot_join_a_series_of_real_work() {
    let records = [
        window(T0),
        record(Reach::Synthetic, T0 + MINUTE, MINUTE),
    ];
    assert_eq!(
        check_comparable(&records),
        Err(MeasurementError::Incomparable("reach"))
    );
}

#[test]
fn windows_measured_under_another_configuration_are_not_comparable() {
    let mut other = window(T0 + MINUTE);
    other.configuration_digest = Digest32([1; 32]);
    assert_eq!(
        check_comparable(&[window(T0), other]),
        Err(MeasurementError::Incomparable("configuration_digest"))
    );
}

#[test]
fn windows_from_another_collector_or_metric_are_not_comparable() {
    let mut collector = window(T0 + MINUTE);
    collector.collector_id = "arkhe/nvml-collector/v1".into();
    assert_eq!(
        check_comparable(&[window(T0), collector]),
        Err(MeasurementError::Incomparable("collector_id"))
    );
    let mut metric = window(T0 + MINUTE);
    metric.metric_id = "serving.step_latency.p50".into();
    assert_eq!(
        check_comparable(&[window(T0), metric]),
        Err(MeasurementError::Incomparable("metric_id"))
    );
}

#[test]
fn contiguous_windows_cover_their_span_without_gaps() {
    let records: Vec<_> = (0..4).map(|k| window(T0 + k * MINUTE)).collect();
    let c = coverage(&records).unwrap();
    assert_eq!(c.records, 4);
    assert_eq!(c.sample_count, 4 * 4_096);
    assert_eq!(c.window_start_unix, T0);
    assert_eq!(c.window_end_unix, T0 + 4 * MINUTE);
    assert!(c.is_contiguous());
    assert_eq!(c.observed_secs(), 4 * MINUTE);
}

#[test]
fn an_unobserved_stretch_is_reported_as_a_gap_not_smoothed_over() {
    let records = [window(T0), window(T0 + 3 * MINUTE)];
    let c = coverage(&records).unwrap();
    assert_eq!(c.gaps, vec![(T0 + MINUTE, T0 + 3 * MINUTE)]);
    assert!(!c.is_contiguous());
    assert_eq!(c.observed_secs(), 2 * MINUTE);
    assert_eq!(c.window_end_unix - c.window_start_unix, 4 * MINUTE);
}

#[test]
fn records_out_of_order_yield_the_same_coverage() {
    let ordered = [window(T0), window(T0 + MINUTE), window(T0 + 4 * MINUTE)];
    let shuffled = [window(T0 + 4 * MINUTE), window(T0), window(T0 + MINUTE)];
    assert_eq!(coverage(&ordered).unwrap(), coverage(&shuffled).unwrap());
}

#[test]
fn overlapping_windows_are_refused_rather_than_counted_twice() {
    let records = [window(T0), record(Reach::Observed, T0 + 30, MINUTE)];
    assert_eq!(coverage(&records), Err(MeasurementError::Overlap));
}

#[test]
fn coverage_of_nothing_is_not_an_empty_series() {
    assert_eq!(coverage(&[]), Err(MeasurementError::Empty));
}

#[test]
fn a_window_with_no_samples_is_not_a_measurement() {
    let mut r = window(T0);
    r.sample_count = 0;
    assert_eq!(
        r.validate(),
        Err(MeasurementError::Schema("sample_count must be positive"))
    );
}

#[test]
fn a_number_that_names_no_configuration_is_refused_at_the_boundary() {
    let mut r = window(T0);
    r.configuration_digest = Digest32::ZERO;
    assert_eq!(
        r.validate(),
        Err(MeasurementError::Schema("configuration_digest"))
    );
}

#[test]
fn an_empty_or_reversed_window_is_refused() {
    let mut empty = window(T0);
    empty.window_end_unix = empty.window_start_unix;
    let mut reversed = window(T0);
    reversed.window_end_unix = reversed.window_start_unix - 1;
    for r in [empty, reversed] {
        assert_eq!(
            r.validate(),
            Err(MeasurementError::Schema(
                "window_end_unix must follow window_start_unix"
            ))
        );
    }
}

#[test]
fn a_zero_operation_id_is_refused_instead_of_passing_as_a_baseline() {
    let mut r = window(T0);
    r.operation_id = Some(Digest32::ZERO);
    assert_eq!(r.validate(), Err(MeasurementError::Schema("operation_id")));
}

#[test]
fn an_unsupported_version_or_malformed_identifier_is_refused() {
    let mut version = window(T0);
    version.version = MEASUREMENT_VERSION + 1;
    assert_eq!(
        version.validate(),
        Err(MeasurementError::Schema("unsupported version"))
    );
    let mut unit = window(T0);
    unit.unit = "nano seconds".into();
    assert_eq!(unit.validate(), Err(MeasurementError::Schema("unit")));
}

#[test]
fn decoding_rejects_an_unknown_reach_and_an_unknown_field() {
    let bytes = window(T0).canonical_bytes();
    let decoded = MeasurementRecord::from_canonical_bytes(&bytes).unwrap();
    assert_eq!(decoded.reach, Reach::Observed);
    assert_eq!(Reach::parse("estimated"), None);
    let truncated = &bytes[..bytes.len() - 1];
    assert!(MeasurementRecord::from_canonical_bytes(truncated).is_err());
}
