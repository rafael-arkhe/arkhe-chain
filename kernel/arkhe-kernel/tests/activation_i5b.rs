#![cfg(feature = "sqlite-activation")]
//! Durable activation tests (criterion I5b-A through I5b-D).
//!
//! Exercises the real `arkhe_governance::activation::activate` protocol against
//! `arkhe_kernel::activation_sqlite::SqliteActivationStore` on disk with SQLite WAL,
//! `PRAGMA synchronous = FULL`, `BEGIN IMMEDIATE`, real subprocess `abort()` crashes,
//! intermediate-read outbox redelivery, and concurrent outbox projectors colliding
//! inside the projection callback.

use arkhe_core::CanonicalEncode;
use arkhe_governance::activation::{
    activate, candidate_digest, ActivationError, ActivationEvent, ActivationStore, Active,
    CommitError, Proposal, TargetKind, PROPOSAL_SCHEMA,
};
use arkhe_governance::policy_bundle::{
    sign_policy_bundle, PolicyPayload, SignaturePolicy, SignedPolicyBundle, TrustStore,
};
use arkhe_kernel::activation_sqlite::{
    FaultInjection, OutboxError, OutboxRecord, SqliteActivationStore,
};
use ed25519_dalek::SigningKey;
use rusqlite::{params, Connection, TransactionBehavior};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Barrier, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(unix)]
use std::os::unix::process::ExitStatusExt;

const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const KEY_ID: &str = "dev-founder-key-NOT-FOR-PRODUCTION";
const ISSUED_AT: i64 = 1_795_132_800;
const EXPIRES_AT: i64 = 1_797_724_800;
const NOW: i64 = 1_795_257_737;
const BUSY_TIMEOUT_MS: u64 = 5_000;

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(prefix: &str) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("arkhe-i5b-{prefix}-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        Self { path: dir }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestTempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn signing_key() -> SigningKey {
    // Public test key only.
    SigningKey::from_bytes(&[123; 32])
}

fn trust_store() -> TrustStore {
    let mut store = TrustStore::new();
    store.insert_signing(KEY_ID, &signing_key()).unwrap();
    store
}

fn make_proposal(nonce: u8, previous: Option<&str>, candidate: &[u8]) -> Proposal {
    Proposal {
        schema: PROPOSAL_SCHEMA.into(),
        proposal_id: format!("{nonce:02x}").repeat(16),
        agent_id: AGENT_ID.into(),
        previous_candidate_digest: previous.map(str::to_owned),
        target_kind: TargetKind::Policy,
        candidate_digest: candidate_digest(candidate),
        context_digest: format!("blake3:{}", "ab".repeat(32)),
        scope: "engineering".into(),
    }
}

fn make_bundle(policy_id: &str, version: u64, proposal: &Proposal) -> SignedPolicyBundle {
    sign_policy_bundle(
        PolicyPayload {
            policy_id: policy_id.into(),
            statements: serde_json::to_value(proposal).unwrap(),
        },
        version,
        1,
        "arkhe-founder",
        KEY_ID,
        ISSUED_AT,
        EXPIRES_AT,
        &signing_key(),
    )
}

/// Verify the child died at the exact armed fault point via `std::process::abort()`.
fn assert_armed_abort(out: &Output, expected_tag: &str) {
    assert!(
        !out.status.success(),
        "child process unexpectedly succeeded (status={:?})",
        out.status
    );
    #[cfg(unix)]
    {
        assert_eq!(
            out.status.signal(),
            Some(6),
            "expected termination by SIGABRT (signal 6), got {:?}",
            out.status
        );
    }
    #[cfg(windows)]
    {
        // On Windows, a Rust `panic!` exits with code 101, whereas `std::process::abort()`
        // terminates abnormally (e.g., STATUS_STACK_BUFFER_OVERRUN / 0xC0000409 or exit 3).
        assert_ne!(
            out.status.code(),
            Some(101),
            "child panicked (exit 101) instead of hitting armed abort(): stderr={}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    let expected_line = format!("ARKHE_FAULT_ARMED:{expected_tag}");
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        stderr.lines().any(|line| line.trim() == expected_line),
        "expected exact marker line '{expected_line}' in stderr, got:\n{stderr}"
    );
}

/// Initialize the separate SQLite WAL external destination database once before
/// concurrent projectors connect (avoids simultaneous rollback->WAL mode upgrades
/// on a brand-new file, where SQLite returns SQLITE_BUSY without waiting).
fn init_external_log(ext_db: &Path) -> Result<(), OutboxError> {
    let conn = Connection::open(ext_db)?;
    conn.busy_timeout(Duration::from_millis(BUSY_TIMEOUT_MS))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         CREATE TABLE IF NOT EXISTS external_mmr_log (
             event_seq INTEGER PRIMARY KEY,
             event_digest TEXT NOT NULL,
             candidate_digest TEXT NOT NULL
         );",
    )?;
    Ok(())
}

/// Atomic idempotent external destination in a separate SQLite WAL database.
/// Uses `INSERT ... ON CONFLICT(event_seq) DO NOTHING` inside `BEGIN IMMEDIATE`
/// (eliminating TOCTOU between read and insert) and rejects divergent digests.
fn apply_to_external_log_atomic(ext_db: &Path, rec: &OutboxRecord) -> Result<(), OutboxError> {
    let mut conn = Connection::open(ext_db)?;
    conn.busy_timeout(Duration::from_millis(BUSY_TIMEOUT_MS))?;
    conn.execute_batch("PRAGMA synchronous = FULL;")?;

    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let seq_i64 = i64::try_from(rec.event_seq)
        .map_err(|_| OutboxError::Storage("event_seq exceeds i64".into()))?;
    let inserted = tx.execute(
        "INSERT INTO external_mmr_log (event_seq, event_digest, candidate_digest)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(event_seq) DO NOTHING",
        params![seq_i64, &rec.event_digest, &rec.event.candidate_digest],
    )?;

    if inserted == 0 {
        let (prev_event_digest, prev_cand_digest): (String, String) = tx.query_row(
            "SELECT event_digest, candidate_digest FROM external_mmr_log WHERE event_seq = ?1",
            params![seq_i64],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if prev_event_digest != rec.event_digest || prev_cand_digest != rec.event.candidate_digest {
            return Err(OutboxError::IntegrityViolation {
                seq: rec.event_seq,
                reason: "divergent digest on redelivery".into(),
            });
        }
    }

    tx.commit()?;
    Ok(())
}

struct TimedBarrier {
    target: usize,
    state: Mutex<(usize, bool)>, // (arrived_count, aborted)
    cv: Condvar,
}

impl TimedBarrier {
    fn new(target: usize) -> Self {
        Self {
            target,
            state: Mutex::new((0, false)),
            cv: Condvar::new(),
        }
    }

    fn wait_with_timeout(&self, timeout: Duration) -> Result<(), String> {
        let mut guard = self
            .state
            .lock()
            .map_err(|_| "barrier mutex poisoned".to_string())?;
        if guard.1 {
            return Err("barrier aborted by peer exit/panic".into());
        }
        guard.0 += 1;
        if guard.0 >= self.target {
            self.cv.notify_all();
            return Ok(());
        }
        let deadline = Instant::now() + timeout;
        while guard.0 < self.target && !guard.1 {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                guard.1 = true;
                self.cv.notify_all();
                return Err("timed out waiting for peer projector".into());
            }
            let (new_guard, wait_res) = self
                .cv
                .wait_timeout(guard, remaining)
                .map_err(|_| "barrier mutex poisoned during wait".to_string())?;
            guard = new_guard;
            if wait_res.timed_out() && guard.0 < self.target {
                guard.1 = true;
                self.cv.notify_all();
                return Err("timed out waiting for peer projector".into());
            }
        }
        if guard.1 {
            Err("barrier aborted by peer exit/panic".into())
        } else {
            Ok(())
        }
    }

    fn abort_all(&self) {
        if let Ok(mut guard) = self.state.lock() {
            guard.1 = true;
            self.cv.notify_all();
        }
    }
}

/// RAII guard: triggers `abort_all()` if a projector thread exits early (e.g. `Ok(0)`)
/// or unwinds via `panic!` before reaching the callback barrier.
struct BarrierDropGuard {
    barrier: Arc<TimedBarrier>,
    reached_barrier: bool,
}

impl Drop for BarrierDropGuard {
    fn drop(&mut self) {
        if !self.reached_barrier {
            self.barrier.abort_all();
        }
    }
}

#[test]
fn t01_race_seq_94d72e43_exclusivity_and_chaining() {
    let dir = TestTempDir::new("t01");
    let db_path = dir.path().join("race_94d72e43.sqlite");
    let policy_id = "RACE-SEQ-94d72e43";

    // 1. Seed genesis (version 1) through the real signed activation protocol.
    let parent_bytes = b"RACE-PARENT-1db2c87d";
    let genesis_prop = make_proposal(0x01, None, parent_bytes);
    let genesis_bundle = make_bundle(policy_id, 1, &genesis_prop);

    let mut setup_store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
    let genesis_activated = activate(
        &mut setup_store,
        &genesis_bundle,
        parent_bytes,
        &trust_store(),
        SignaturePolicy::Required,
        1_795_257_725,
    )
    .expect("genesis activation succeeds");
    let parent_digest = genesis_activated.active.candidate_digest.clone();

    // 2. Three concurrent contenders (raceA, raceB, raceC) signed against the same predecessor,
    //    synchronized on Barrier(3) right before the authoritative SQLite BEGIN IMMEDIATE commit.
    let contenders: Vec<(&str, u8, &[u8])> = vec![
        ("raceA-1795257737", 0x0A, b"payload:raceA-1795257737"),
        ("raceB-1795257737", 0x0B, b"payload:raceB-1795257737"),
        ("raceC-1795257737", 0x0C, b"payload:raceC-1795257737"),
    ];

    let barrier = Arc::new(Barrier::new(contenders.len()));
    let mut handles = Vec::new();

    for (writer_id, nonce, payload) in contenders {
        let b = Arc::clone(&barrier);
        let p = db_path.clone();
        let parent = parent_digest.clone();
        let payload = payload.to_vec();

        handles.push(thread::spawn(move || {
            let prop = make_proposal(nonce, Some(&parent), &payload);
            let bundle = make_bundle(policy_id, 2, &prop);
            // Verify signature & candidate bytes against the real governance layer.
            bundle
                .verify(&trust_store(), 1, SignaturePolicy::Required, NOW)
                .expect("contender bundle verifies");
            assert_eq!(candidate_digest(&payload), prop.candidate_digest);

            let next = Active {
                policy_id: policy_id.into(),
                version: 2,
                candidate_digest: prop.candidate_digest.clone(),
                context_digest: prop.context_digest.clone(),
                proposal_id: prop.proposal_id.clone(),
                activated_at: NOW,
            };
            let event = ActivationEvent {
                policy_id: policy_id.into(),
                version: 2,
                proposal_id: prop.proposal_id,
                previous_candidate_digest: Some(parent.clone()),
                candidate_digest: prop.candidate_digest.clone(),
                context_digest: prop.context_digest,
                activated_at: NOW,
            };

            let mut store = SqliteActivationStore::open(&p, BUSY_TIMEOUT_MS).unwrap();
            b.wait();
            let res = store.commit(Some(&parent), &next, &event);
            (writer_id, prop.candidate_digest, res)
        }));
    }

    let mut committed = Vec::new();
    let mut conflicts = Vec::new();
    let mut storage_errors = Vec::new();

    for h in handles {
        let (wid, cand_digest, res) = h.join().unwrap();
        match res {
            Ok(()) => committed.push((wid, cand_digest)),
            Err(CommitError::Conflict { actual }) => conflicts.push((wid, actual)),
            Err(other) => storage_errors.push((wid, other)),
        }
    }

    assert!(
        storage_errors.is_empty(),
        "unexpected storage/busy errors: {storage_errors:?}"
    );
    assert_eq!(committed.len(), 1, "exactly one contender must win");
    assert_eq!(conflicts.len(), 2, "two contenders must observe Conflict");

    let (_, winner_digest) = &committed[0];
    for (wid, observed) in &conflicts {
        assert_eq!(
            observed.as_deref(),
            Some(winner_digest.as_str()),
            "loser {wid} must observe winner digest"
        );
    }

    // 3. Intermediate persisted inspection (after A/B/C, before D).
    let mid_snap = setup_store.snapshot(policy_id).unwrap();
    let mid_active = mid_snap.active.expect("active policy present");
    assert_eq!(mid_active.version, 2);
    assert_eq!(mid_active.candidate_digest, *winner_digest);
    assert_eq!(mid_snap.consumed_count, 2); // genesis + winner
    assert_eq!(mid_snap.outbox_events.len(), 2);

    // 4a. raceD with stale parent (original genesis digest) -> ConcurrencyConflict via full activate().
    let stale_d_bytes = b"payload:raceD-stale";
    let stale_d_prop = make_proposal(0xD0, Some(&parent_digest), stale_d_bytes);
    let stale_d_bundle = make_bundle(policy_id, 3, &stale_d_prop);
    let stale_res = activate(
        &mut setup_store,
        &stale_d_bundle,
        stale_d_bytes,
        &trust_store(),
        SignaturePolicy::Required,
        1_795_257_765,
    );
    assert_eq!(
        stale_res,
        Err(ActivationError::ConcurrencyConflict {
            expected: Some(parent_digest),
            actual: Some(winner_digest.clone()),
        })
    );

    // 4b. raceD chained to winner_digest -> COMMITTED via full activate().
    let chained_d_bytes = b"payload:raceD-1795257765";
    let chained_d_prop = make_proposal(0xD1, Some(winner_digest), chained_d_bytes);
    let chained_d_bundle = make_bundle(policy_id, 3, &chained_d_prop);
    let chained_res = activate(
        &mut setup_store,
        &chained_d_bundle,
        chained_d_bytes,
        &trust_store(),
        SignaturePolicy::Required,
        1_795_257_765,
    )
    .expect("chained D succeeds");

    assert_eq!(chained_res.active.version, 3);
    assert_eq!(
        chained_res.active.candidate_digest,
        candidate_digest(chained_d_bytes)
    );

    let final_snap = setup_store.snapshot(policy_id).unwrap();
    assert_eq!(final_snap.active.unwrap().version, 3);
    assert_eq!(final_snap.consumed_count, 3);
    assert_eq!(final_snap.outbox_events.len(), 3);
}

#[test]
fn t02_replay_after_state_restore_and_strict_constraint_classification() {
    let dir = TestTempDir::new("t02");
    let db_path = dir.path().join("replay_isolated.sqlite");
    let policy_id = "SEQ-REPLAY-01";

    let mut store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
    let gen_bytes = b"genesis-v1";
    let gen_prop = make_proposal(0x10, None, gen_bytes);
    let gen_activated = activate(
        &mut store,
        &make_bundle(policy_id, 1, &gen_prop),
        gen_bytes,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    )
    .unwrap();

    let v2_bytes = b"policy-v2";
    let v2_prop = make_proposal(0x42, Some(&gen_activated.active.candidate_digest), v2_bytes);
    let v2_bundle = make_bundle(policy_id, 2, &v2_prop);
    let v2_activated = activate(
        &mut store,
        &v2_bundle,
        v2_bytes,
        &trust_store(),
        SignaturePolicy::Required,
        NOW + 10,
    )
    .unwrap();

    // Restore activation_active back to genesis while preserving activation_consumed.
    {
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "UPDATE activation_active
             SET version = ?1, candidate_digest = ?2, context_digest = ?3,
                 proposal_id = ?4, activated_at = ?5
             WHERE policy_id = ?6",
            params![
                gen_activated.active.version as i64,
                &gen_activated.active.candidate_digest,
                &gen_activated.active.context_digest,
                &gen_activated.active.proposal_id,
                gen_activated.active.activated_at,
                policy_id
            ],
        )
        .unwrap();
    }

    // 1. Full protocol rejects replay as AlreadyConsumed BEFORE the CAS.
    let replay_res = activate(
        &mut store,
        &v2_bundle,
        v2_bytes,
        &trust_store(),
        SignaturePolicy::Required,
        NOW + 20,
    );
    assert_eq!(
        replay_res,
        Err(ActivationError::AlreadyConsumed {
            proposal_id: v2_prop.proposal_id.clone()
        })
    );

    // 2. Authoritative SQLite commit() ALSO returns AlreadyConsumed via ON CONFLICT(proposal_id).
    let direct_replay = store.commit(
        Some(&gen_activated.active.candidate_digest),
        &v2_activated.active,
        &v2_activated.event,
    );
    assert_eq!(direct_replay, Err(CommitError::AlreadyConsumed));

    // 3. Non-PK constraint violation (CHECK(length(proposal_id) = 32)) MUST stay CommitError::Storage,
    //    never misclassified as AlreadyConsumed.
    let mut bad_active = v2_activated.active.clone();
    bad_active.proposal_id = "bad-short-id".into();
    let mut bad_event = v2_activated.event.clone();
    bad_event.proposal_id = "bad-short-id".into();
    let constraint_res = store.commit(
        Some(&gen_activated.active.candidate_digest),
        &bad_active,
        &bad_event,
    );
    assert!(
        matches!(constraint_res, Err(CommitError::Storage(_))),
        "CHECK constraint violation must map to CommitError::Storage, got {constraint_res:?}"
    );
}

#[test]
fn t03_subprocess_crash_pre_and_post_commit_with_armed_marker() {
    let policy_id = "SEQ-CRASH";
    let gen_bytes = b"genesis-crash";
    let cand_bytes = b"candidate-crash";

    if let Ok(mode) = std::env::var("ARKHE_I5B_CRASH_CHILD_MODE") {
        let db_path = PathBuf::from(std::env::var("ARKHE_I5B_CRASH_DB_PATH").unwrap());
        let mut store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
        let fault = match mode.as_str() {
            "pre_commit" => FaultInjection::BeforeCommit,
            "post_commit" => FaultInjection::AfterCommitBeforeProjection,
            other => panic!("unknown crash mode: {other}"),
        };
        store.set_fault_injection(fault);

        let gen_digest = candidate_digest(gen_bytes);
        let prop = make_proposal(0x99, Some(&gen_digest), cand_bytes);
        let bundle = make_bundle(policy_id, 2, &prop);
        let _ = activate(
            &mut store,
            &bundle,
            cand_bytes,
            &trust_store(),
            SignaturePolicy::Required,
            NOW + 50,
        );
        return;
    }

    let dir = TestTempDir::new("t03");
    let exe = std::env::current_exe().unwrap();
    let gen_digest = candidate_digest(gen_bytes);
    let cand_digest = candidate_digest(cand_bytes);
    let cand_prop = make_proposal(0x99, Some(&gen_digest), cand_bytes);
    let expected_event_digest = format!(
        "blake3:{}",
        ActivationEvent {
            policy_id: policy_id.into(),
            version: 2,
            proposal_id: cand_prop.proposal_id,
            previous_candidate_digest: Some(gen_digest.clone()),
            candidate_digest: cand_digest.clone(),
            context_digest: cand_prop.context_digest,
            activated_at: NOW + 50,
        }
        .object_digest()
        .to_hex()
    );

    // --- Case A: Crash immediately BEFORE COMMIT ---
    let db_pre = dir.path().join("crash_pre.sqlite");
    {
        let mut s = SqliteActivationStore::open(&db_pre, BUSY_TIMEOUT_MS).unwrap();
        let gen_prop = make_proposal(0x11, None, gen_bytes);
        activate(
            &mut s,
            &make_bundle(policy_id, 1, &gen_prop),
            gen_bytes,
            &trust_store(),
            SignaturePolicy::Required,
            NOW,
        )
        .unwrap();
    }

    let out_pre = Command::new(&exe)
        .arg("--exact")
        .arg("t03_subprocess_crash_pre_and_post_commit_with_armed_marker")
        .env("ARKHE_I5B_CRASH_CHILD_MODE", "pre_commit")
        .env("ARKHE_I5B_CRASH_DB_PATH", &db_pre)
        .output()
        .unwrap();
    assert_armed_abort(&out_pre, "pre_commit");

    let store_pre = SqliteActivationStore::open(&db_pre, BUSY_TIMEOUT_MS).unwrap();
    let snap_pre = store_pre.snapshot(policy_id).unwrap();
    let active_pre = snap_pre.active.unwrap();
    assert_eq!(active_pre.version, 1);
    assert_eq!(active_pre.candidate_digest, gen_digest);
    assert_eq!(snap_pre.consumed_count, 1);
    assert_eq!(snap_pre.outbox_events.len(), 1);

    // --- Case B: Crash immediately AFTER COMMIT, BEFORE projection ---
    let db_post = dir.path().join("crash_post.sqlite");
    {
        let mut s = SqliteActivationStore::open(&db_post, BUSY_TIMEOUT_MS).unwrap();
        let gen_prop = make_proposal(0x11, None, gen_bytes);
        activate(
            &mut s,
            &make_bundle(policy_id, 1, &gen_prop),
            gen_bytes,
            &trust_store(),
            SignaturePolicy::Required,
            NOW,
        )
        .unwrap();
    }

    let out_post = Command::new(&exe)
        .arg("--exact")
        .arg("t03_subprocess_crash_pre_and_post_commit_with_armed_marker")
        .env("ARKHE_I5B_CRASH_CHILD_MODE", "post_commit")
        .env("ARKHE_I5B_CRASH_DB_PATH", &db_post)
        .output()
        .unwrap();
    assert_armed_abort(&out_post, "post_commit_before_projection");

    let store_post = SqliteActivationStore::open(&db_post, BUSY_TIMEOUT_MS).unwrap();
    let snap_post = store_post.snapshot(policy_id).unwrap();
    let active_post = snap_post.active.unwrap();
    assert_eq!(active_post.version, 2);
    assert_eq!(active_post.candidate_digest, cand_digest);
    assert_eq!(snap_post.consumed_count, 2);
    assert_eq!(snap_post.outbox_events.len(), 2);
    assert!(!snap_post.outbox_events[1].projected);
    assert_eq!(
        snap_post.outbox_events[1].event_digest,
        expected_event_digest
    );
}

#[test]
fn t04_outbox_redelivery_proven_via_intermediate_destination_read() {
    if std::env::var("ARKHE_I5B_OUTBOX_CRASH_CHILD").is_ok() {
        let db_path = PathBuf::from(std::env::var("ARKHE_I5B_OUTBOX_DB").unwrap());
        let ext_path = PathBuf::from(std::env::var("ARKHE_I5B_OUTBOX_EXT_DB").unwrap());
        let mut store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
        let _ = store
            .reconcile_outbox_with_fault(FaultInjection::AfterExternalProjectionBeforeMark, |ev| {
                apply_to_external_log_atomic(&ext_path, ev)
            });
        return;
    }

    let dir = TestTempDir::new("t04");
    let db_path = dir.path().join("outbox_main.sqlite");
    let ext_path = dir.path().join("external_mmr.sqlite");
    init_external_log(&ext_path).unwrap();
    let exe = std::env::current_exe().unwrap();
    let policy_id = "SEQ-OUTBOX";
    let cand_bytes = b"candidate-outbox";
    let cand_digest = candidate_digest(cand_bytes);

    let expected_event_digest = {
        let mut store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
        let prop = make_proposal(0x55, None, cand_bytes);
        let activated = activate(
            &mut store,
            &make_bundle(policy_id, 1, &prop),
            cand_bytes,
            &trust_store(),
            SignaturePolicy::Required,
            NOW,
        )
        .unwrap();
        format!("blake3:{}", activated.event.object_digest().to_hex())
    };

    // 1. Child applies external effect and aborts BEFORE marking projected = 1.
    let child_out = Command::new(&exe)
        .arg("--exact")
        .arg("t04_outbox_redelivery_proven_via_intermediate_destination_read")
        .env("ARKHE_I5B_OUTBOX_CRASH_CHILD", "1")
        .env("ARKHE_I5B_OUTBOX_DB", &db_path)
        .env("ARKHE_I5B_OUTBOX_EXT_DB", &ext_path)
        .output()
        .unwrap();
    assert_armed_abort(&child_out, "after_external_projection_before_mark");

    // 2. Intermediate read BEFORE restart reconciliation:
    //    proves the effect already exists in the external destination while projected == false.
    let mut recovered_store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
    let mid_snap = recovered_store.snapshot(policy_id).unwrap();
    assert_eq!(mid_snap.outbox_events.len(), 1);
    assert!(!mid_snap.outbox_events[0].projected);

    {
        let ext_conn = Connection::open(&ext_path).unwrap();
        let (seq, ev_dig, c_dig): (i64, String, String) = ext_conn
            .query_row(
                "SELECT event_seq, event_digest, candidate_digest
                 FROM external_mmr_log WHERE event_seq = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(seq, 1);
        assert_eq!(ev_dig, expected_event_digest);
        assert_eq!(c_dig, cand_digest);
    }

    // 3. Restart reconciliation redelivers the same event and marks projected = 1.
    let marked = recovered_store
        .reconcile_outbox(|ev| apply_to_external_log_atomic(&ext_path, ev))
        .unwrap();
    assert_eq!(marked, 1);
    assert!(recovered_store.snapshot(policy_id).unwrap().outbox_events[0].projected);

    // 4. External destination still holds exactly 1 row with the same seq & digests.
    {
        let ext_conn = Connection::open(&ext_path).unwrap();
        let (count, seq, ev_dig, c_dig): (i64, i64, String, String) = ext_conn
            .query_row(
                "SELECT COUNT(*), MIN(event_seq), MIN(event_digest), MIN(candidate_digest)
                 FROM external_mmr_log",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(seq, 1);
        assert_eq!(ev_dig, expected_event_digest);
        assert_eq!(c_dig, cand_digest);
    }

    // 5. Divergent redelivery for the same event_seq must fail with IntegrityViolation.
    let mut tampered = recovered_store.snapshot(policy_id).unwrap().outbox_events[0].clone();
    tampered.event.candidate_digest = format!("blake3:{}", "ff".repeat(32));
    assert!(matches!(
        apply_to_external_log_atomic(&ext_path, &tampered),
        Err(OutboxError::IntegrityViolation { seq: 1, .. })
    ));
}

#[test]
fn t05_concurrent_outbox_projectors_are_atomic() {
    let dir = TestTempDir::new("t05");
    let db_path = dir.path().join("concurrent_proj_main.sqlite");
    let ext_path = dir.path().join("concurrent_proj_ext.sqlite");
    init_external_log(&ext_path).unwrap();
    let policy_id = "SEQ-CONC-PROJ";
    let cand_bytes = b"candidate-concurrent-proj";
    let cand_digest = candidate_digest(cand_bytes);

    let expected_event_digest = {
        let mut store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
        let prop = make_proposal(0x77, None, cand_bytes);
        let activated = activate(
            &mut store,
            &make_bundle(policy_id, 1, &prop),
            cand_bytes,
            &trust_store(),
            SignaturePolicy::Required,
            NOW,
        )
        .unwrap();
        format!("blake3:{}", activated.event.object_digest().to_hex())
    };

    // Scope note: `global_deadline` bounds the main thread's wait and invokes
    // `barrier.abort_all()` on expiry to wake any projector still at the barrier;
    // `BarrierDropGuard` signals the barrier if a projector exits before reaching it
    // (error, early Ok(0), or unwinding panic). Force-terminating a thread blocked
    // inside a driver call requires running in a supervised subprocess (as in T03/T04).
    let global_deadline = Instant::now() + Duration::from_secs(10);
    let barrier = Arc::new(TimedBarrier::new(2));
    let delivery_attempts = Arc::new(Mutex::new(Vec::new()));
    let (tx, rx) = mpsc::channel::<(usize, Result<usize, OutboxError>)>();

    for projector_id in 0..2 {
        let b = Arc::clone(&barrier);
        let attempts = Arc::clone(&delivery_attempts);
        let db = db_path.clone();
        let ext = ext_path.clone();
        let tx_clone = tx.clone();

        thread::spawn(move || {
            let mut drop_guard = BarrierDropGuard {
                barrier: Arc::clone(&b),
                reached_barrier: false,
            };

            let res: Result<usize, OutboxError> = (|| {
                let mut s = SqliteActivationStore::open(&db, BUSY_TIMEOUT_MS)
                    .map_err(OutboxError::Storage)?;
                s.reconcile_outbox(|ev| {
                    assert!(!ev.projected, "projector must have read unprojected event");
                    attempts.lock().unwrap().push((
                        projector_id,
                        ev.event_seq,
                        ev.event_digest.clone(),
                        ev.event.candidate_digest.clone(),
                    ));
                    drop_guard.reached_barrier = true;
                    b.wait_with_timeout(Duration::from_secs(5))
                        .map_err(OutboxError::Storage)?;
                    apply_to_external_log_atomic(&ext, ev)
                })
            })();

            let _ = tx_clone.send((projector_id, res));
        });
    }
    drop(tx);

    let mut pending_ids: BTreeSet<usize> = [0, 1].into_iter().collect();
    let mut marked_counts = Vec::with_capacity(2);

    while !pending_ids.is_empty() {
        let remaining = global_deadline.saturating_duration_since(Instant::now());
        match rx.recv_timeout(remaining) {
            Ok((pid, res)) => {
                assert!(
                    pending_ids.remove(&pid),
                    "duplicate message from projector_id={pid}"
                );
                marked_counts
                    .push(res.unwrap_or_else(|e| panic!("projector_id={pid} failed: {e:?}")));
            }
            Err(RecvTimeoutError::Disconnected) => {
                barrier.abort_all();
                panic!(
                    "channel disconnected before all projectors reported; missing projector_ids={pending_ids:?} (likely panicked before send)"
                );
            }
            Err(RecvTimeoutError::Timeout) => {
                barrier.abort_all();
                panic!(
                    "global 10s deadline exceeded waiting for projectors; missing projector_ids={pending_ids:?}"
                );
            }
        }
    }

    // 1. Both projectors read the unprojected event and attempted external delivery.
    let recorded = delivery_attempts.lock().unwrap();
    assert_eq!(
        recorded.len(),
        2,
        "both projectors must attempt external delivery"
    );
    assert_eq!(recorded[0].1, 1);
    assert_eq!(recorded[1].1, 1);
    assert_eq!(recorded[0].2, expected_event_digest);
    assert_eq!(recorded[1].2, expected_event_digest);
    assert_eq!(recorded[0].3, cand_digest);
    assert_eq!(recorded[1].3, cand_digest);

    // 2. Exactly one projector marked the 0 -> 1 transition.
    marked_counts.sort_unstable();
    assert_eq!(marked_counts, vec![0, 1]);

    // 3. Outbox is marked projected = 1 and external destination has exactly 1 row.
    let final_store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
    assert!(final_store.snapshot(policy_id).unwrap().outbox_events[0].projected);

    let ext_conn = Connection::open(&ext_path).unwrap();
    let (ext_count, ext_seq, ext_ev_dig, ext_cand_dig): (i64, i64, String, String) = ext_conn
        .query_row(
            "SELECT COUNT(*), MIN(event_seq), MIN(event_digest), MIN(candidate_digest)
             FROM external_mmr_log",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap();
    assert_eq!(ext_count, 1);
    assert_eq!(ext_seq, 1);
    assert_eq!(ext_ev_dig, expected_event_digest);
    assert_eq!(ext_cand_dig, cand_digest);
}
