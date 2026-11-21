//! Durable SQLite WAL backend for [`arkhe_governance::activation::ActivationStore`].
//!
//! Layer boundary (see `docs/CAMADA-0.md` §4):
//! `arkhe-governance` keeps the activation protocol pure (no clock, no I/O).
//! This module owns the SQLite WAL transaction boundary so that active policy
//! state, single-use proposal consumption, and the durable outbox event advance
//! atomically inside a single `BEGIN IMMEDIATE` transaction with
//! `PRAGMA synchronous = FULL`.

use arkhe_core::CanonicalEncode;
use arkhe_governance::activation::{ActivationEvent, ActivationStore, Active, CommitError};
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

/// SQLite WAL-backed durable [`ActivationStore`] with idempotent outbox reconciliation.
pub struct SqliteActivationStore {
    conn: Connection,
    fault: FaultInjection,
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
                "SELECT COUNT(*) = 3 FROM sqlite_master
                 WHERE type = 'table'
                   AND name IN ('activation_active', 'activation_consumed', 'activation_outbox')",
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
                ",
            )
            .map_err(|e| format_sqlite_err(&e))?;
            tx.commit().map_err(|e| format_sqlite_err(&e))?;
        }
        Ok(Self {
            conn,
            fault: FaultInjection::None,
        })
    }

    /// Arm a controlled crash point for subprocess durability tests.
    pub fn set_fault_injection(&mut self, fault: FaultInjection) {
        self.fault = fault;
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
