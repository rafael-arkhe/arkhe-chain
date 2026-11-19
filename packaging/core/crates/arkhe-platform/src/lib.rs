//! On-prem seats, a file meter, a draft invoice, and an operator probe report.
//!
//! Nothing here collects money or certifies an SLA. A draft invoice is not revenue.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SeatFile {
    pub schema: String,
    pub seat_limit: u32,
    pub seats: Vec<Seat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Seat {
    pub id: String,
    pub label: String,
    pub active: bool,
}

#[derive(Debug, Clone)]
pub struct Platform {
    pub seats: SeatFile,
    pub meter_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct MeterEvent {
    pub schema: String,
    pub idempotency_key: String,
    pub seat: String,
    pub receipt_id: String,
    pub overall: String,
    pub units: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MeterOutcome {
    Appended,
    Replay,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PriceBook {
    pub schema: String,
    pub status: String,
    pub currency: String,
    pub unit_price_minor: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct InvoiceDraft {
    pub schema: String,
    pub status: String,
    pub collects_payment: bool,
    pub currency: String,
    pub unit_price_minor: i64,
    pub lines: Vec<InvoiceLine>,
    pub total_minor: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct InvoiceLine {
    pub seat: String,
    pub units: u64,
    pub amount_minor: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SlaSpec {
    pub schema: String,
    pub window_start: DateTime<Utc>,
    pub window_end: DateTime<Utc>,
    pub probe_interval_seconds: u64,
    pub max_failed_probes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Probe {
    pub at: DateTime<Utc>,
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SlaReport {
    pub schema: String,
    pub observed: String,
    pub customer_commitment: bool,
    pub failed_probes: u64,
    pub notes: Vec<String>,
}

pub fn load_seats(path: &Path) -> anyhow::Result<SeatFile> {
    let file: SeatFile = serde_json::from_slice(&fs::read(path)?)?;
    validate_seats(&file)?;
    Ok(file)
}

pub fn validate_seats(file: &SeatFile) -> anyhow::Result<()> {
    if file.schema != "arkhe-seats/v1" {
        anyhow::bail!("seat file schema is not arkhe-seats/v1");
    }
    if file.seat_limit == 0 || file.seat_limit > 10_000 {
        anyhow::bail!("seat_limit must be 1 to 10000");
    }
    let mut seen = BTreeMap::new();
    let mut active = 0u32;
    for seat in &file.seats {
        if !valid_id(&seat.id) || seat.label.is_empty() || seat.label.len() > 128 {
            anyhow::bail!("seat id or label is out of range");
        }
        if seen.insert(seat.id.clone(), ()).is_some() {
            anyhow::bail!("duplicate seat {}", seat.id);
        }
        if seat.active {
            active += 1;
        }
    }
    if active > file.seat_limit {
        anyhow::bail!("active seats exceed seat_limit");
    }
    Ok(())
}

pub fn require_active(file: &SeatFile, seat_id: &str) -> anyhow::Result<()> {
    match file.seats.iter().find(|seat| seat.id == seat_id) {
        Some(seat) if seat.active => Ok(()),
        Some(_) => anyhow::bail!("seat is inactive"),
        None => anyhow::bail!("seat is unknown"),
    }
}

pub fn record(dir: &Path, event: &MeterEvent) -> anyhow::Result<MeterOutcome> {
    if event.schema != "arkhe-meter/v1" || event.units != 1 {
        anyhow::bail!("meter event must be one unit of arkhe-meter/v1");
    }
    if !valid_key(&event.idempotency_key) || !valid_id(&event.seat) || !is_hex64(&event.receipt_id) {
        anyhow::bail!("meter identity is out of range");
    }
    if !matches!(event.overall.as_str(), "PASS" | "FAIL" | "INCONCLUSIVE") {
        anyhow::bail!("overall is not a verdict");
    }
    fs::create_dir_all(dir)?;
    let path = dir.join("events.jsonl");
    for prior in read_events(&path)? {
        if prior.idempotency_key == event.idempotency_key {
            if prior.seat != event.seat || prior.receipt_id != event.receipt_id {
                anyhow::bail!("idempotency key already recorded for another receipt");
            }
            return Ok(MeterOutcome::Replay);
        }
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "{}", serde_json::to_string(event)?)?;
    Ok(MeterOutcome::Appended)
}

pub fn bill(dir: &Path, book: &PriceBook) -> anyhow::Result<InvoiceDraft> {
    if book.schema != "arkhe-price-book/v1" || book.status != "operator-supplied" {
        anyhow::bail!("price book must be operator-supplied arkhe-price-book/v1");
    }
    if book.currency.len() != 3 || !book.currency.chars().all(|char| char.is_ascii_uppercase()) {
        anyhow::bail!("currency must be three uppercase letters");
    }
    if book.unit_price_minor < 0 {
        anyhow::bail!("unit price cannot be negative");
    }
    let mut units_by_seat: BTreeMap<String, u64> = BTreeMap::new();
    for event in read_events(&dir.join("events.jsonl"))? {
        let total = units_by_seat.entry(event.seat).or_insert(0);
        *total = total.checked_add(event.units).ok_or_else(|| anyhow::anyhow!("unit overflow"))?;
    }
    let mut lines = Vec::new();
    let mut total_minor: i64 = 0;
    for (seat, units) in units_by_seat {
        let amount = i64::try_from(units)
            .ok()
            .and_then(|count| count.checked_mul(book.unit_price_minor))
            .ok_or_else(|| anyhow::anyhow!("amount overflow"))?;
        total_minor = total_minor.checked_add(amount).ok_or_else(|| anyhow::anyhow!("amount overflow"))?;
        lines.push(InvoiceLine { seat, units, amount_minor: amount });
    }
    Ok(InvoiceDraft {
        schema: "arkhe-invoice-draft/v1".to_string(),
        status: "draft".to_string(),
        collects_payment: false,
        currency: book.currency.clone(),
        unit_price_minor: book.unit_price_minor,
        lines,
        total_minor,
    })
}

pub fn observe_sla(spec: &SlaSpec, probes: &[Probe]) -> anyhow::Result<SlaReport> {
    if spec.schema != "arkhe-sla/v1" {
        anyhow::bail!("sla schema is not arkhe-sla/v1");
    }
    if spec.window_end <= spec.window_start || spec.probe_interval_seconds == 0 || spec.probe_interval_seconds > 86_400 {
        anyhow::bail!("sla window or interval is out of range");
    }
    let mut notes = vec!["this report is the operator's own probes, not a commitment sold to a customer".into()];
    if probes.is_empty() {
        notes.push("no probes in the window".into());
        return Ok(report("INCONCLUSIVE", 0, notes));
    }
    let mut ordered = probes.to_vec();
    ordered.sort_by_key(|probe| probe.at);
    let interval = spec.probe_interval_seconds as i64;
    let gap = |left: DateTime<Utc>, right: DateTime<Utc>| (right - left).num_seconds() > interval;
    if gap(spec.window_start, ordered[0].at) || gap(ordered[ordered.len() - 1].at, spec.window_end) {
        notes.push("probes do not cover the window".into());
        return Ok(report("INCONCLUSIVE", ordered.iter().filter(|probe| !probe.ok).count() as u64, notes));
    }
    for pair in ordered.windows(2) {
        if gap(pair[0].at, pair[1].at) {
            notes.push("probes leave a gap inside the window".into());
            return Ok(report("INCONCLUSIVE", ordered.iter().filter(|probe| !probe.ok).count() as u64, notes));
        }
    }
    let failed = ordered.iter().filter(|probe| !probe.ok).count() as u64;
    if failed > spec.max_failed_probes {
        notes.push("failed probes exceed the operator threshold".into());
        return Ok(report("FAIL", failed, notes));
    }
    Ok(report("COVERED", failed, notes))
}

fn report(observed: &str, failed: u64, notes: Vec<String>) -> SlaReport {
    SlaReport {
        schema: "arkhe-sla-report/v1".to_string(),
        observed: observed.to_string(),
        customer_commitment: false,
        failed_probes: failed,
        notes,
    }
}

fn read_events(path: &Path) -> anyhow::Result<Vec<MeterEvent>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = fs::File::open(path)?;
    let mut events = Vec::new();
    for line in std::io::BufReader::new(file).lines() {
        let line = line?;
        if line.is_empty() {
            continue;
        }
        events.push(serde_json::from_str(&line)?);
    }
    Ok(events)
}

fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 64 && value.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn valid_key(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && value.bytes().all(|byte| byte.is_ascii_graphic())
}

fn is_hex64(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn seats(limit: u32, active: bool) -> SeatFile {
        SeatFile {
            schema: "arkhe-seats/v1".to_string(),
            seat_limit: limit,
            seats: vec![Seat { id: "lab".into(), label: "Lab".into(), active }],
        }
    }

    fn event(key: &str) -> MeterEvent {
        MeterEvent {
            schema: "arkhe-meter/v1".to_string(),
            idempotency_key: key.into(),
            seat: "lab".into(),
            receipt_id: "ab".repeat(32),
            overall: "PASS".into(),
            units: 1,
        }
    }

    #[test]
    fn unknown_seat_and_over_limit_fail() {
        let file = seats(1, true);
        assert!(require_active(&file, "other").is_err());
        assert!(require_active(&seats(1, false), "lab").is_err());
        let mut over = seats(1, true);
        over.seats.push(Seat { id: "two".into(), label: "Two".into(), active: true });
        assert!(validate_seats(&over).is_err());
    }

    #[test]
    fn replay_bills_one_unit_and_refuses_an_adopted_price() {
        let dir = std::env::temp_dir().join(format!("arkhe-meter-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(record(&dir, &event("k1")).unwrap(), MeterOutcome::Appended);
        assert_eq!(record(&dir, &event("k1")).unwrap(), MeterOutcome::Replay);
        assert!(record(&dir, &MeterEvent { receipt_id: "cd".repeat(32), ..event("k1") }).is_err());
        let book = PriceBook {
            schema: "arkhe-price-book/v1".into(),
            status: "operator-supplied".into(),
            currency: "USD".into(),
            unit_price_minor: 100,
        };
        let invoice = bill(&dir, &book).unwrap();
        assert_eq!(invoice.total_minor, 100);
        assert!(!invoice.collects_payment);
        assert_eq!(invoice.status, "draft");
        let adopted = PriceBook { status: "not-adopted".into(), ..book };
        assert!(bill(&dir, &adopted).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn sla_without_probes_stays_inconclusive() {
        let start = Utc.with_ymd_and_hms(2026, 11, 17, 0, 0, 0).unwrap();
        let spec = SlaSpec {
            schema: "arkhe-sla/v1".into(),
            window_start: start,
            window_end: start + chrono::Duration::minutes(2),
            probe_interval_seconds: 60,
            max_failed_probes: 0,
        };
        let empty = observe_sla(&spec, &[]).unwrap();
        assert_eq!(empty.observed, "INCONCLUSIVE");
        assert!(!empty.customer_commitment);
        let probes = vec![
            Probe { at: start, ok: true },
            Probe { at: start + chrono::Duration::seconds(60), ok: false },
            Probe { at: spec.window_end, ok: true },
        ];
        let failed = observe_sla(&spec, &probes).unwrap();
        assert_eq!(failed.observed, "FAIL");
        let covered = observe_sla(&spec, &[probes[0].clone(), Probe { at: probes[1].at, ok: true }, probes[2].clone()]).unwrap();
        assert_eq!(covered.observed, "COVERED");
        assert!(!covered.customer_commitment);
    }
}
