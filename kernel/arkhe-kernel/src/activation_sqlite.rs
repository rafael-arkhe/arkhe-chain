//! Durable SQLite WAL backend for [`arkhe_governance::activation::ActivationStore`].
//!
//! Layer boundary (see `docs/CAMADA-0.md` §4):
//! `arkhe-governance` keeps the activation protocol pure (no clock, no I/O).
//! This module owns the SQLite WAL transaction boundary so that active policy
//! state, single-use proposal consumption, and the durable outbox event advance
//! atomically inside a single `BEGIN IMMEDIATE` transaction with
//! `PRAGMA synchronous = FULL`.

use arkhe_core::CanonicalEncode;
use arkhe_governance::activation::{
    activate, Activated, ActivationError, ActivationEvent, ActivationStore, Active, CommitError,
};
use arkhe_governance::policy_bundle::{SignaturePolicy, SignedPolicyBundle, TrustStore};
use rusqlite::{params, Connection, Error as SqliteError, OptionalExtension, TransactionBehavior};
use std::io::Write;
use std::path::Path;
use std::time::Duration;

/// Controlled crash points for subprocess durability and outbox redelivery tests.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FaultInjection {
    #[default]
    None,
    BeforeCommit,
    AfterCommitBeforeProjection,
    AfterExternalProjectionBeforeMark,
}

fn trigger_armed_abort(tag: &str) -> ! {
    let mut err = std::io::stderr();
    let _ = writeln!(err, "ARKHE_FAULT_ARMED:{tag}");
    let _ = err.flush();
    std::process::abort();
}

fn format_sqlite_err(err: &SqliteError) -> String {
    match err {
        SqliteError::SqliteFailure(ffi_err, msg) => format!(
            "sqlite error (code={:?}, extended={}): {}",
            ffi_err.code,
            ffi_err.extended_code,
            msg.as_deref().unwrap_or("no message")
        ),
        other => other.to_string(),
    }
}

/// Durable outbox entry written in the same transaction as active state and consumption.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutboxRecord {
    pub event_seq: u64,
    pub event: ActivationEvent,
    /// Canonical `blake3:<64hex>` digest of `event` (`AKG:POLICY:ACTIVATION:v1\0`).
    pub event_digest: String,
    pub projected: bool,
}

/// Consistent read snapshot of the store for a single `policy_id`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoreSnapshot {
    pub active: Option<Active>,
    pub consumed_count: usize,
    pub outbox_events: Vec<OutboxRecord>,
}

/// Errors produced during outbox reconciliation and external projection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutboxError {
    Storage(String),
    IntegrityViolation { seq: u64, reason: String },
    ProjectionFailed { seq: u64, reason: String },
}

impl From<SqliteError> for OutboxError {
    fn from(err: SqliteError) -> Self {
        OutboxError::Storage(format_sqlite_err(&err))
    }
}

/// Active policy record loaded together with its persisted signed bundle,
/// candidate bytes, and committed activation event digest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoadedActiveBundle {
    pub active: Active,
    pub bundle: SignedPolicyBundle,
    pub candidate_bytes: Vec<u8>,
    pub activation_event_digest: String,
}

struct StagedBundle {
    bundle_json: String,
    candidate_bytes: Vec<u8>,
    bundle_digest: String,
    candidate_digest: String,
}

/// SQLite WAL-backed durable [`ActivationStore`] with idempotent outbox reconciliation.
pub struct SqliteActivationStore {
    conn: Connection,
    fault: FaultInjection,
    staged_bundle: Option<StagedBundle>,
}

impl SqliteActivationStore {
    /// Open or initialize a durable SQLite WAL activation database on disk.
    ///
    /// Rejects `:memory:` and empty paths because durability across process
    /// crashes requires a filesystem-backed database.
    pub fn open(path: &Path, busy_timeout_ms: u64) -> Result<Self, String> {
        if path == Path::new(":memory:") || path.as_os_str().is_empty() {
            return Err("durable activation store requires a filesystem database".into());
        }
        let mut conn = Connection::open(path).map_err(|e| format_sqlite_err(&e))?;
        conn.busy_timeout(Duration::from_millis(busy_timeout_ms))
            .map_err(|e| format_sqlite_err(&e))?;

        let mode: String = conn
            .query_row("PRAGMA journal_mode;", [], |r| r.get(0))
            .map_err(|e| format_sqlite_err(&e))?;
        if !mode.eq_ignore_ascii_case("wal") {
            conn.execute_batch("PRAGMA journal_mode = WAL;")
                .map_err(|e| format_sqlite_err(&e))?;
        }
        conn.execute_batch("PRAGMA synchronous = FULL;")
            .map_err(|e| format_sqlite_err(&e))?;

        let schema_ready: bool = conn
            .query_row(
                "SELECT COUNT(*) = 5 FROM sqlite_master
                 WHERE type = 'table'
                   AND name IN (
                     'activation_active',
                     'activation_consumed',
                     'activation_outbox',
                     'activation_bundles',
                     'review_approvals_consumed'
                   )",
                [],
                |r| r.get(0),
            )
            .map_err(|e| format_sqlite_err(&e))?;

        if !schema_ready {
            let tx = conn
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|e| format_sqlite_err(&e))?;
            tx.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS activation_active (
                    policy_id TEXT PRIMARY KEY,
                    version INTEGER NOT NULL CHECK(version > 0),
                    candidate_digest TEXT NOT NULL,
                    context_digest TEXT NOT NULL,
                    proposal_id TEXT NOT NULL,
                    activated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS activation_consumed (
                    proposal_id TEXT PRIMARY KEY CHECK(length(proposal_id) = 32),
                    policy_id TEXT NOT NULL,
                    consumed_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS activation_outbox (
                    event_seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    policy_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    proposal_id TEXT UNIQUE NOT NULL,
                    previous_candidate_digest TEXT,
                    candidate_digest TEXT NOT NULL,
                    context_digest TEXT NOT NULL,
                    activated_at INTEGER NOT NULL,
                    event_digest TEXT NOT NULL,
                    projected INTEGER NOT NULL DEFAULT 0 CHECK(projected IN (0, 1))
                );

                CREATE TABLE IF NOT EXISTS activation_bundles (
                    proposal_id TEXT PRIMARY KEY CHECK(length(proposal_id) = 32),
                    policy_id TEXT NOT NULL,
                    bundle_json TEXT NOT NULL,
                    candidate_bytes BLOB NOT NULL,
                    bundle_digest TEXT NOT NULL,
                    candidate_digest TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS review_approvals_consumed (
                    approval_id TEXT PRIMARY KEY CHECK(length(approval_id) = 32),
                    action_digest TEXT NOT NULL,
                    policy_digest TEXT NOT NULL,
                    activation_event_digest TEXT NOT NULL,
                    consumed_at INTEGER NOT NULL
                );
                ",
            )
            .map_err(|e| format_sqlite_err(&e))?;
            tx.commit().map_err(|e| format_sqlite_err(&e))?;
        }
        Ok(Self {
            conn,
            fault: FaultInjection::None,
            staged_bundle: None,
        })
    }

    /// Arm a controlled crash point for subprocess durability tests.
    pub fn set_fault_injection(&mut self, fault: FaultInjection) {
        self.fault = fault;
    }

    /// Atomically consume a single-use review approval bound to `(action_digest,
    /// policy_digest, activation_event_digest)` inside a `BEGIN IMMEDIATE` SQLite
    /// WAL transaction. Returns `Ok(true)` if newly consumed, `Ok(false)` if this
    /// `approval_id` was already consumed.
    pub fn consume_review_approval(
        &mut self,
        approval_id: &str,
        action_digest: &str,
        policy_digest: &str,
        activation_event_digest: &str,
        consumed_at: i64,
    ) -> Result<bool, String> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format_sqlite_err(&e))?;
        let inserted = tx
            .execute(
                "INSERT INTO review_approvals_consumed
                    (approval_id, action_digest, policy_digest, activation_event_digest, consumed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(approval_id) DO NOTHING",
                params![
                    approval_id,
                    action_digest,
                    policy_digest,
                    activation_event_digest,
                    consumed_at
                ],
            )
            .map_err(|e| format_sqlite_err(&e))?;
        tx.commit().map_err(|e| format_sqlite_err(&e))?;
        Ok(inserted == 1)
    }

    /// Run [`arkhe_governance::activation::activate`] while atomically persisting
    /// the signed bundle and candidate bytes inside the same SQLite WAL transaction.
    pub fn activate_bundle(
        &mut self,
        bundle: &SignedPolicyBundle,
        candidate_bytes: &[u8],
        trust_store: &TrustStore,
        signature_policy: SignaturePolicy,
        now: i64,
    ) -> Result<Activated, ActivationError> {
        let bundle_json = serde_json::to_string(bundle)
            .map_err(|e| ActivationError::Storage(format!("serialize bundle: {e}")))?;
        let bundle_digest = format!("blake3:{}", bundle.digest().to_hex());
        let cand_digest = arkhe_governance::activation::candidate_digest(candidate_bytes);
        self.staged_bundle = Some(StagedBundle {
            bundle_json,
            candidate_bytes: candidate_bytes.to_vec(),
            bundle_digest,
            candidate_digest: cand_digest,
        });
        let result = activate(
            self,
            bundle,
            candidate_bytes,
            trust_store,
            signature_policy,
            now,
        );
        self.staged_bundle = None;
        result
    }

    /// Load the active policy record together with its persisted signed bundle,
    /// candidate bytes, and committed activation event digest directly from SQLite.
    pub fn load_active_bundle(
        &self,
        policy_id: &str,
    ) -> Result<Option<LoadedActiveBundle>, String> {
        let Some(active) = self.active(policy_id)? else {
            return Ok(None);
        };
        let row: Option<(String, Vec<u8>, String, String)> = self
            .conn
            .query_row(
                "SELECT b.bundle_json, b.candidate_bytes, b.candidate_digest, o.event_digest
                 FROM activation_bundles b
                 INNER JOIN activation_outbox o ON o.proposal_id = b.proposal_id
                 WHERE b.proposal_id = ?1 AND b.policy_id = ?2",
                params![&active.proposal_id, policy_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(|e| format_sqlite_err(&e))?;

        let (bundle_json, candidate_bytes, stored_cand_digest, activation_event_digest) = row
            .ok_or_else(|| {
                format!(
                    "missing persisted bundle/outbox record for active proposal {}",
                    active.proposal_id
                )
            })?;

        if stored_cand_digest != active.candidate_digest {
            return Err("stored bundle candidate_digest diverges from active state".into());
        }

        let bundle: SignedPolicyBundle = serde_json::from_str(&bundle_json)
            .map_err(|e| format!("corrupted persisted SignedPolicyBundle JSON: {e}"))?;

        Ok(Some(LoadedActiveBundle {
            active,
            bundle,
            candidate_bytes,
            activation_event_digest,
        }))
    }

    /// Inspect active policy, total consumed proposals, and all outbox events.
    pub fn snapshot(&self, policy_id: &str) -> Result<StoreSnapshot, String> {
        let active = self.active(policy_id)?;
        let consumed_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM activation_consumed", [], |r| r.get(0))
            .map_err(|e| format_sqlite_err(&e))?;
        let outbox_events = self.query_outbox(false)?;
        Ok(StoreSnapshot {
            active,
            consumed_count: usize::try_from(consumed_count).unwrap_or(0),
            outbox_events,
        })
    }

    /// Return all outbox events still pending external projection (`projected = 0`).
    pub fn pending_outbox(&self) -> Result<Vec<OutboxRecord>, String> {
        self.query_outbox(true)
    }

    /// Reconcile pending outbox events with no injected fault.
    ///
    /// Returns the number of events **newly marked (`projected: 0 -> 1`) by this call**
    /// (i.e., the sum of rows affected by `UPDATE activation_outbox SET projected = 1
    /// WHERE event_seq = ?1 AND projected = 0`). Under concurrent projectors, both may
    /// deliver to an idempotent external receiver, but only the first to update the row
    /// counts that event in its return value.
    pub fn reconcile_outbox<F>(&mut self, project_fn: F) -> Result<usize, OutboxError>
    where
        F: FnMut(&OutboxRecord) -> Result<(), OutboxError>,
    {
        self.reconcile_outbox_with_fault(FaultInjection::None, project_fn)
    }

    /// Reconcile pending outbox events, optionally aborting after external projection
    /// and before persisting `projected = 1`.
    ///
    /// Returns the number of events **newly marked (`projected: 0 -> 1`) by this call**
    /// (not delivery attempts).
    pub fn reconcile_outbox_with_fault<F>(
        &mut self,
        fault: FaultInjection,
        mut project_fn: F,
    ) -> Result<usize, OutboxError>
    where
        F: FnMut(&OutboxRecord) -> Result<(), OutboxError>,
    {
        let pending = self.query_outbox(true).map_err(OutboxError::Storage)?;
        let mut marked_count = 0usize;
        for record in pending {
            project_fn(&record)?;

            if fault == FaultInjection::AfterExternalProjectionBeforeMark {
                trigger_armed_abort("after_external_projection_before_mark");
            }

            let seq_i64 = i64::try_from(record.event_seq)
                .map_err(|_| OutboxError::Storage("event_seq exceeds i64".into()))?;
            let tx = self
                .conn
                .transaction_with_behavior(TransactionBehavior::Immediate)?;
            let updated_rows = tx.execute(
                "UPDATE activation_outbox SET projected = 1 WHERE event_seq = ?1 AND projected = 0",
                params![seq_i64],
            )?;
            tx.commit()?;
            marked_count += updated_rows;
        }
        Ok(marked_count)
    }

    fn query_outbox(&self, only_unprojected: bool) -> Result<Vec<OutboxRecord>, String> {
        let sql = if only_unprojected {
            "SELECT event_seq, policy_id, version, proposal_id, previous_candidate_digest,
                    candidate_digest, context_digest, activated_at, event_digest, projected
             FROM activation_outbox
             WHERE projected = 0
             ORDER BY event_seq ASC"
        } else {
            "SELECT event_seq, policy_id, version, proposal_id, previous_candidate_digest,
                    candidate_digest, context_digest, activated_at, event_digest, projected
             FROM activation_outbox
             ORDER BY event_seq ASC"
        };

        let mut stmt = self.conn.prepare(sql).map_err(|e| format_sqlite_err(&e))?;
        let rows = stmt
            .query_map([], |r| {
                let seq: i64 = r.get(0)?;
                let version: i64 = r.get(2)?;
                let projected: i64 = r.get(9)?;
                Ok(OutboxRecord {
                    event_seq: u64::try_from(seq).unwrap_or(0),
                    event: ActivationEvent {
                        policy_id: r.get(1)?,
                        version: u64::try_from(version).unwrap_or(0),
                        proposal_id: r.get(3)?,
                        previous_candidate_digest: r.get(4)?,
                        candidate_digest: r.get(5)?,
                        context_digest: r.get(6)?,
                        activated_at: r.get(7)?,
                    },
                    event_digest: r.get(8)?,
                    projected: projected != 0,
                })
            })
            .map_err(|e| format_sqlite_err(&e))?;

        let mut out = Vec::new();
        for item in rows {
            out.push(item.map_err(|e| format_sqlite_err(&e))?);
        }
        Ok(out)
    }
}

impl ActivationStore for SqliteActivationStore {
    fn active(&self, policy_id: &str) -> Result<Option<Active>, String> {
        let row: Option<(i64, String, String, String, i64)> = self
            .conn
            .query_row(
                "SELECT version, candidate_digest, context_digest, proposal_id, activated_at
                 FROM activation_active
                 WHERE policy_id = ?1",
                params![policy_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()
            .map_err(|e| format_sqlite_err(&e))?;

        match row {
            None => Ok(None),
            Some((version, candidate_digest, context_digest, proposal_id, activated_at)) => {
                let version = u64::try_from(version)
                    .map_err(|_| "negative version in activation_active".to_string())?;
                Ok(Some(Active {
                    policy_id: policy_id.to_string(),
                    version,
                    candidate_digest,
                    context_digest,
                    proposal_id,
                    activated_at,
                }))
            }
        }
    }

    fn is_consumed(&self, proposal_id: &str) -> Result<bool, String> {
        self.conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM activation_consumed WHERE proposal_id = ?1)",
                params![proposal_id],
                |r| r.get(0),
            )
            .map_err(|e| format_sqlite_err(&e))
    }

    fn commit(
        &mut self,
        expected_candidate_digest: Option<&str>,
        next: &Active,
        event: &ActivationEvent,
    ) -> Result<(), CommitError> {
        let staged = self.staged_bundle.take();

        if next.policy_id != event.policy_id
            || next.version != event.version
            || next.proposal_id != event.proposal_id
            || next.candidate_digest != event.candidate_digest
            || next.context_digest != event.context_digest
            || next.activated_at != event.activated_at
        {
            return Err(CommitError::Storage(
                "active record and activation event fields diverge".into(),
            ));
        }

        let version_i64 = i64::try_from(next.version)
            .map_err(|_| CommitError::Storage("version exceeds i64".into()))?;

        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| CommitError::Storage(format_sqlite_err(&e)))?;

        // 1. Single-use consumption checked and recorded BEFORE the CAS.
        //    Only a conflict on `proposal_id` maps to `AlreadyConsumed`; every
        //    other SQLite error (CHECK, NOT NULL, BUSY, I/O) stays `Storage`.
        let inserted = tx
            .execute(
                "INSERT INTO activation_consumed (proposal_id, policy_id, consumed_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(proposal_id) DO NOTHING",
                params![&next.proposal_id, &next.policy_id, next.activated_at],
            )
            .map_err(|e| CommitError::Storage(format_sqlite_err(&e)))?;

        if inserted == 0 {
            return Err(CommitError::AlreadyConsumed);
        }

        // 2. Authoritative Compare-And-Swap under the exclusive write lock.
        let held: Option<(i64, String)> = tx
            .query_row(
                "SELECT version, candidate_digest
                 FROM activation_active
                 WHERE policy_id = ?1",
                params![&next.policy_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| CommitError::Storage(format_sqlite_err(&e)))?;

        let held_digest = held.as_ref().map(|(_, d)| d.clone());
        if held_digest.as_deref() != expected_candidate_digest {
            return Err(CommitError::Conflict {
                actual: held_digest,
            });
        }

        if let Some((active_version, _)) = held {
            if version_i64 <= active_version {
                return Err(CommitError::Storage(format!(
                    "stale version inside transaction: active={active_version}, proposed={version_i64}"
                )));
            }
        }

        // 3. Atomic state update + durable outbox insert in the same transaction.
        tx.execute(
            "INSERT INTO activation_active
                (policy_id, version, candidate_digest, context_digest, proposal_id, activated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(policy_id) DO UPDATE SET
                version = excluded.version,
                candidate_digest = excluded.candidate_digest,
                context_digest = excluded.context_digest,
                proposal_id = excluded.proposal_id,
                activated_at = excluded.activated_at",
            params![
                &next.policy_id,
                version_i64,
                &next.candidate_digest,
                &next.context_digest,
                &next.proposal_id,
                next.activated_at
            ],
        )
        .map_err(|e| CommitError::Storage(format_sqlite_err(&e)))?;

        let event_digest = format!("blake3:{}", event.object_digest().to_hex());
        tx.execute(
            "INSERT INTO activation_outbox
                (policy_id, version, proposal_id, previous_candidate_digest,
                 candidate_digest, context_digest, activated_at, event_digest, projected)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)",
            params![
                &event.policy_id,
                version_i64,
                &event.proposal_id,
                &event.previous_candidate_digest,
                &event.candidate_digest,
                &event.context_digest,
                event.activated_at,
                &event_digest
            ],
        )
        .map_err(|e| CommitError::Storage(format_sqlite_err(&e)))?;

        if let Some(bundle_art) = staged {
            if bundle_art.candidate_digest != next.candidate_digest {
                return Err(CommitError::Storage(
                    "staged bundle candidate_digest diverges from active record".into(),
                ));
            }
            tx.execute(
                "INSERT INTO activation_bundles
                    (proposal_id, policy_id, bundle_json, candidate_bytes, bundle_digest, candidate_digest)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &next.proposal_id,
                    &next.policy_id,
                    &bundle_art.bundle_json,
                    &bundle_art.candidate_bytes,
                    &bundle_art.bundle_digest,
                    &bundle_art.candidate_digest
                ],
            )
            .map_err(|e| CommitError::Storage(format_sqlite_err(&e)))?;
        }

        if self.fault == FaultInjection::BeforeCommit {
            trigger_armed_abort("pre_commit");
        }

        tx.commit()
            .map_err(|e| CommitError::Storage(format_sqlite_err(&e)))?;

        if self.fault == FaultInjection::AfterCommitBeforeProjection {
            trigger_armed_abort("post_commit_before_projection");
        }

        Ok(())
    }
}
