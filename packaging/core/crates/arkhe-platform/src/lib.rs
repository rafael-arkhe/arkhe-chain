//! On-prem seats, a file meter, a draft invoice, and an operator probe report.
//!
//! Nothing here collects money or certifies an SLA. A draft invoice is not revenue.

use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

pub const CALLER_TOKEN_SCHEMA: &str = "arkhe-caller-token/v1";
pub const CALLER_AUTH_KEY_SCHEMA: &str = "arkhe-caller-auth-key/v1";
pub const CALLER_TOKEN_DOMAIN: &[u8] = b"ARKHE-CALLER-TOKEN-V1\n";
pub const RECONCILE_SCHEMA: &str = "arkhe-reconcile/v1";

/// Operator public key used to verify signed caller identity tokens (P-03).
/// Separate from `X-Arkhe-Seat` (which remains strictly a metering unit).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CallerAuthKey {
    pub schema: String,
    pub public_key_hex: String,
}

/// Operator-signed caller credential bound to a specific `seat` (P-03).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CallerToken {
    pub schema: String,
    pub seat: String,
    pub subject: String,
    pub issued_at: i64,
    pub expires_at: i64,
    pub nonce: String,
    pub signature: String,
}

fn caller_token_preimage(token: &CallerToken) -> Vec<u8> {
    let body = serde_json::json!({
        "expires_at": token.expires_at,
        "issued_at": token.issued_at,
        "nonce": token.nonce,
        "schema": token.schema,
        "seat": token.seat,
        "subject": token.subject,
    });
    let mut out = CALLER_TOKEN_DOMAIN.to_vec();
    out.extend_from_slice(serde_json::to_string(&body).expect("json").as_bytes());
    out
}

/// Sign a [`CallerToken`] using the operator's Ed25519 signing seed.
pub fn sign_caller_token(
    seat: &str,
    subject: &str,
    issued_at: i64,
    expires_at: i64,
    nonce: &str,
    seed: [u8; 32],
) -> anyhow::Result<CallerToken> {
    if !valid_id(seat) {
        anyhow::bail!("seat id is out of range");
    }
    if subject.is_empty() || subject.len() > 128 || !valid_key(nonce) {
        anyhow::bail!("subject or nonce is out of range");
    }
    if expires_at <= issued_at {
        anyhow::bail!("expires_at must be greater than issued_at");
    }
    let mut token = CallerToken {
        schema: CALLER_TOKEN_SCHEMA.to_string(),
        seat: seat.to_string(),
        subject: subject.to_string(),
        issued_at,
        expires_at,
        nonce: nonce.to_string(),
        signature: String::new(),
    };
    let key = SigningKey::from_bytes(&seed);
    let sig = key.sign(&caller_token_preimage(&token));
    token.signature = hex::encode(sig.to_bytes());
    Ok(token)
}

/// Load a [`CallerAuthKey`] (public key only) from disk.
pub fn load_caller_auth_key(path: &Path) -> anyhow::Result<CallerAuthKey> {
    let key: CallerAuthKey = serde_json::from_slice(&fs::read(path)?)?;
    validate_caller_auth_key(&key)?;
    Ok(key)
}

pub fn validate_caller_auth_key(key: &CallerAuthKey) -> anyhow::Result<VerifyingKey> {
    if key.schema != CALLER_AUTH_KEY_SCHEMA {
        anyhow::bail!("caller auth key schema is not {CALLER_AUTH_KEY_SCHEMA}");
    }
    let bytes = hex::decode(&key.public_key_hex)?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("caller auth public_key_hex must be 32 bytes"))?;
    Ok(VerifyingKey::from_bytes(&arr)?)
}

/// Verify an operator-signed [`CallerToken`] at `now_unix` (P-03).
pub fn verify_caller_token(
    token: &CallerToken,
    auth_key: &CallerAuthKey,
    now_unix: i64,
) -> anyhow::Result<()> {
    if token.schema != CALLER_TOKEN_SCHEMA {
        anyhow::bail!("caller token schema is not {CALLER_TOKEN_SCHEMA}");
    }
    if !valid_id(&token.seat) || token.subject.is_empty() || token.subject.len() > 128 || !valid_key(&token.nonce) {
        anyhow::bail!("caller token fields out of range");
    }
    if now_unix < token.issued_at || now_unix >= token.expires_at {
        anyhow::bail!("caller token is outside validity window");
    }
    let vk = validate_caller_auth_key(auth_key)?;
    let sig_bytes = hex::decode(&token.signature)?;
    let sig = Signature::from_slice(&sig_bytes)
        .map_err(|_| anyhow::anyhow!("caller token signature length invalid"))?;
    vk.verify_strict(&caller_token_preimage(token), &sig)
        .map_err(|_| anyhow::anyhow!("caller token signature verification failed"))?;
    Ok(())
}

/// Parse a `Bearer <token>` header value (accepts raw JSON or hex-encoded JSON).
pub fn parse_bearer_caller_token(header_value: &str) -> anyhow::Result<CallerToken> {
    let raw = header_value
        .strip_prefix("Bearer ")
        .ok_or_else(|| anyhow::anyhow!("authorization header must start with Bearer"))?
        .trim();
    if raw.starts_with('{') {
        Ok(serde_json::from_str(raw)?)
    } else {
        let bytes = hex::decode(raw)?;
        Ok(serde_json::from_slice(&bytes)?)
    }
}

/// One observation row exported from `provenance_observations` for P-07 reconciliation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ObservationRow {
    pub observed_at: DateTime<Utc>,
    #[serde(default)]
    pub seat: Option<String>,
    #[serde(default)]
    pub idempotency_key: Option<String>,
    pub receipt_id: String,
    pub overall: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReconcileDiscrepancy {
    pub source: String,
    pub seat: String,
    pub receipt_id: String,
    pub overall: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct SeatReconcileSummary {
    pub meter_units: u64,
    pub db_rows: u64,
    pub missing_in_db: u64,
    pub missing_in_meter: u64,
}

/// Operator reconciliation report comparing `events.jsonl` (billing source of
/// truth) against `provenance_observations` rows (P-07).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReconcileReport {
    pub schema: String,
    pub ok: bool,
    pub meter_count: usize,
    pub db_count: usize,
    pub missing_in_db: Vec<ReconcileDiscrepancy>,
    pub missing_in_meter: Vec<ReconcileDiscrepancy>,
    pub by_seat: BTreeMap<String, SeatReconcileSummary>,
}

/// Reconcile the file meter (`dir/events.jsonl`) against database observation rows (P-07).
///
/// The file meter remains the sole source of draft invoices; discrepancies are
/// reported by seat and never mutate verdicts or billing files.
pub fn reconcile(
    meter_dir: &Path,
    observations: &[ObservationRow],
    window_start: Option<DateTime<Utc>>,
    window_end: Option<DateTime<Utc>>,
) -> anyhow::Result<ReconcileReport> {
    let meter_events = read_events(&meter_dir.join("events.jsonl"))?;
    let filtered_obs: Vec<&ObservationRow> = observations
        .iter()
        .filter(|row| {
            let after_start = window_start.is_none_or(|s| row.observed_at >= s);
            let before_end = window_end.is_none_or(|e| row.observed_at <= e);
            after_start && before_end
        })
        .collect();

    // Multiset key: (seat_or_unknown, receipt_id, overall). If both sides carry
    // idempotency_key, match on idempotency_key as well.
    let mut db_counts: BTreeMap<(String, String, String, Option<String>), usize> = BTreeMap::new();
    let mut by_seat: BTreeMap<String, SeatReconcileSummary> = BTreeMap::new();

    for row in &filtered_obs {
        let seat = row.seat.clone().unwrap_or_else(|| "unknown".into());
        by_seat.entry(seat.clone()).or_default().db_rows += 1;
        let key = (seat, row.receipt_id.clone(), row.overall.clone(), row.idempotency_key.clone());
        *db_counts.entry(key).or_insert(0) += 1;
    }

    let mut missing_in_db = Vec::new();
    for ev in &meter_events {
        by_seat.entry(ev.seat.clone()).or_default().meter_units += ev.units;
        let exact_key = (
            ev.seat.clone(),
            ev.receipt_id.clone(),
            ev.overall.clone(),
            Some(ev.idempotency_key.clone()),
        );
        let fallback_key = (ev.seat.clone(), ev.receipt_id.clone(), ev.overall.clone(), None);
        let unknown_seat_key = ("unknown".into(), ev.receipt_id.clone(), ev.overall.clone(), None);

        let matched = if let Some(c) = db_counts.get_mut(&exact_key).filter(|c| **c > 0) {
            *c -= 1;
            true
        } else if let Some(c) = db_counts.get_mut(&fallback_key).filter(|c| **c > 0) {
            *c -= 1;
            true
        } else if let Some(c) = db_counts.get_mut(&unknown_seat_key).filter(|c| **c > 0) {
            *c -= 1;
            true
        } else {
            false
        };

        if !matched {
            by_seat.entry(ev.seat.clone()).or_default().missing_in_db += 1;
            missing_in_db.push(ReconcileDiscrepancy {
                source: "meter".into(),
                seat: ev.seat.clone(),
                receipt_id: ev.receipt_id.clone(),
                overall: ev.overall.clone(),
                idempotency_key: Some(ev.idempotency_key.clone()),
            });
        }
    }

    let mut missing_in_meter = Vec::new();
    for ((seat, receipt_id, overall, idempotency_key), remaining) in db_counts {
        for _ in 0..remaining {
            by_seat.entry(seat.clone()).or_default().missing_in_meter += 1;
            missing_in_meter.push(ReconcileDiscrepancy {
                source: "database".into(),
                seat: seat.clone(),
                receipt_id: receipt_id.clone(),
                overall: overall.clone(),
                idempotency_key: idempotency_key.clone(),
            });
        }
    }

    let ok = missing_in_db.is_empty() && missing_in_meter.is_empty();
    Ok(ReconcileReport {
        schema: RECONCILE_SCHEMA.into(),
        ok,
        meter_count: meter_events.len(),
        db_count: filtered_obs.len(),
        missing_in_db,
        missing_in_meter,
        by_seat,
    })
}

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

    #[test]
    fn p03_caller_token_verifies_strictly_and_rejects_tampering_or_expiry() {
        let seed = [0x42u8; 32];
        let pub_hex = hex::encode(SigningKey::from_bytes(&seed).verifying_key().to_bytes());
        let auth_key = CallerAuthKey {
            schema: CALLER_AUTH_KEY_SCHEMA.into(),
            public_key_hex: pub_hex,
        };
        let token = sign_caller_token("lab", "ops-client", 1_700_000_000, 1_700_003_600, "n1", seed).unwrap();
        verify_caller_token(&token, &auth_key, 1_700_000_100).unwrap();

        // Expired token rejected.
        assert!(verify_caller_token(&token, &auth_key, 1_700_003_600).is_err());

        // Seat tamper rejected.
        let mut tampered = token.clone();
        tampered.seat = "other".into();
        assert!(verify_caller_token(&tampered, &auth_key, 1_700_000_100).is_err());

        // Round-trip Bearer hex parsing.
        let header = format!("Bearer {}", hex::encode(serde_json::to_vec(&token).unwrap()));
        let parsed = parse_bearer_caller_token(&header).unwrap();
        assert_eq!(parsed, token);
    }

    #[test]
    fn p07_reconcile_reports_both_meter_only_and_db_only_discrepancies() {
        let dir = std::env::temp_dir().join(format!("arkhe-reconcile-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let shared = event("k-shared");
        let meter_only = MeterEvent {
            idempotency_key: "k-meter-only".into(),
            receipt_id: "11".repeat(32),
            ..event("k-meter-only")
        };
        record(&dir, &shared).unwrap();
        record(&dir, &meter_only).unwrap();

        let now = Utc.with_ymd_and_hms(2026, 11, 21, 12, 0, 0).unwrap();
        let obs = vec![
            ObservationRow {
                observed_at: now,
                seat: Some("lab".into()),
                idempotency_key: Some("k-shared".into()),
                receipt_id: shared.receipt_id.clone(),
                overall: "PASS".into(),
            },
            ObservationRow {
                observed_at: now,
                seat: Some("lab".into()),
                idempotency_key: Some("k-db-only".into()),
                receipt_id: "22".repeat(32),
                overall: "FAIL".into(),
            },
        ];

        let report = reconcile(&dir, &obs, None, None).unwrap();
        assert!(!report.ok);
        assert_eq!(report.missing_in_db.len(), 1);
        assert_eq!(report.missing_in_db[0].receipt_id, "11".repeat(32));
        assert_eq!(report.missing_in_meter.len(), 1);
        assert_eq!(report.missing_in_meter[0].receipt_id, "22".repeat(32));
        assert_eq!(report.by_seat["lab"].missing_in_db, 1);
        assert_eq!(report.by_seat["lab"].missing_in_meter, 1);

        // Matching rows produce ok == true.
        let matching_obs = vec![
            obs[0].clone(),
            ObservationRow {
                observed_at: now,
                seat: Some("lab".into()),
                idempotency_key: Some("k-meter-only".into()),
                receipt_id: "11".repeat(32),
                overall: "PASS".into(),
            },
        ];
        let ok_report = reconcile(&dir, &matching_obs, None, None).unwrap();
        assert!(ok_report.ok);
        let _ = fs::remove_dir_all(&dir);
    }
}
