//! Durable SQLite WAL persistence for the Arkhe x 0x Solana Swap HTTP gateway.
//!
//! Guarantees:
//! - `PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;`
//! - Atomic `BEGIN IMMEDIATE` single-use tracking of authenticated 0x HTTP responses
//!   (`consumed_0x_responses`), written ONLY after RFC 9421 Ed25519 verification passes.
//! - Atomic `BEGIN IMMEDIATE` single-use consumption of issued test authorizations
//!   (`issued_authorizations`) at the signing boundary across process restarts.
//! - Append-only receipt log (`swap_receipts`) with BLAKE3 integrity verification on `open()`
//!   and deterministic `arkhe_verify_core::rbb::mmr` Frontier & inclusion proofs.

use std::path::Path;
use std::time::Duration;

use arkhe_verify_core::hash::blake3_256;
use arkhe_verify_core::rbb::mmr::{self, Frontier, Proof};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthConsumeStatus {
    Consumed,
    NotFound,
    AlreadyConsumed,
    Expired,
    DigestMismatch {
        expected_sha256: String,
        expected_blake3: String,
    },
}

#[derive(Debug, Clone)]
pub struct AppendedReceipt {
    pub seq: u64,
    pub leaf_digest: [u8; 32],
    pub leaf_count: u64,
    pub mmr_root: [u8; 32],
    pub mmr_proof: Proof,
}

#[derive(Debug, Clone)]
pub struct StoredReceiptBundle {
    pub seq: u64,
    pub receipt_id: String,
    pub leaf_json: Vec<u8>,
    pub leaf_digest: [u8; 32],
    pub signature_hex: String,
    pub verdict: String,
    pub final_outcome: String,
    pub leaf_count: u64,
    pub mmr_root: [u8; 32],
    pub mmr_proof: Proof,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SolanaSwapStoreStats {
    pub receipt_count: u64,
    pub consumed_0x_count: u64,
    pub issued_auth_count: u64,
    pub consumed_auth_count: u64,
    pub signing_boundary_event_count: u64,
    pub onchain_confirmation_count: u64,
    pub pending_reconciliation_count: u64,
    pub mmr_root_hex: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingReconciliationRow {
    pub receipt_id: String,
    pub tx_signature: String,
    pub enqueued_at: i64,
    pub attempts: u64,
    pub last_error: Option<String>,
    pub completed: bool,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredConfirmationRow {
    pub receipt_id: String,
    pub tx_signature: String,
    pub slot: u64,
    pub confirmation_status: String,
    pub reconciliation_status: String,
    pub report_json: Vec<u8>,
    pub signature_hex: String,
    pub recorded_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReceiptSummaryRow {
    pub seq: u64,
    pub receipt_id: String,
    pub leaf_digest: String,
    pub verdict: String,
    pub final_outcome: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SigningBoundaryEventRow {
    pub seq: u64,
    pub auth_id: String,
    pub accepted: bool,
    pub reject_code: Option<String>,
    pub received_sha256: String,
    pub received_blake3: String,
    pub recorded_at: i64,
}

pub struct SqliteSolanaSwapStore {
    conn: Connection,
    records: Vec<[u8; 32]>,
    frontier: Frontier,
}

impl SqliteSolanaSwapStore {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("sqlite open failed: {e}"))?;
        conn.busy_timeout(Duration::from_millis(5_000))
            .map_err(|e| format!("sqlite busy_timeout failed: {e}"))?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = FULL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS consumed_0x_responses (
                response_sig_digest TEXT PRIMARY KEY,
                key_id              TEXT NOT NULL,
                created_at          INTEGER NOT NULL,
                consumed_at         INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS issued_authorizations (
                auth_id         TEXT PRIMARY KEY,
                message_sha256  TEXT NOT NULL,
                message_blake3  TEXT NOT NULL,
                expires_at      INTEGER NOT NULL,
                consumed        INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1)),
                consumed_at     INTEGER
            );

            CREATE TABLE IF NOT EXISTS swap_receipts (
                seq            INTEGER PRIMARY KEY,
                receipt_id     TEXT UNIQUE NOT NULL,
                leaf_json      BLOB NOT NULL,
                leaf_digest    TEXT NOT NULL,
                signature_hex  TEXT NOT NULL,
                verdict        TEXT NOT NULL,
                final_outcome  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS signing_boundary_events (
                seq              INTEGER PRIMARY KEY AUTOINCREMENT,
                auth_id          TEXT NOT NULL,
                accepted         INTEGER NOT NULL CHECK (accepted IN (0, 1)),
                reject_code      TEXT,
                received_sha256  TEXT NOT NULL,
                received_blake3  TEXT NOT NULL,
                recorded_at      INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS onchain_confirmations (
                receipt_id            TEXT PRIMARY KEY,
                tx_signature          TEXT NOT NULL,
                slot                  INTEGER NOT NULL,
                confirmation_status   TEXT NOT NULL,
                reconciliation_status TEXT NOT NULL,
                report_json           BLOB NOT NULL,
                signature_hex         TEXT NOT NULL,
                recorded_at           INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pending_reconciliations (
                receipt_id    TEXT PRIMARY KEY,
                tx_signature  TEXT NOT NULL,
                enqueued_at   INTEGER NOT NULL,
                attempts      INTEGER NOT NULL DEFAULT 0,
                last_error    TEXT,
                completed     INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
                completed_at  INTEGER
            );
            ",
        )
        .map_err(|e| format!("sqlite schema init failed: {e}"))?;

        let mut records = Vec::new();
        let mut frontier = Frontier::default();
        {
            let mut stmt = conn
                .prepare("SELECT seq, leaf_json, leaf_digest FROM swap_receipts ORDER BY seq ASC")
                .map_err(|e| format!("sqlite prepare failed: {e}"))?;
            let rows = stmt
                .query_map([], |row| {
                    let seq: i64 = row.get(0)?;
                    let leaf_json: Vec<u8> = row.get(1)?;
                    let leaf_digest: String = row.get(2)?;
                    Ok((seq, leaf_json, leaf_digest))
                })
                .map_err(|e| format!("sqlite query failed: {e}"))?;

            for (expected_seq, row) in rows.enumerate() {
                let (seq, leaf_json, stored_digest) =
                    row.map_err(|e| format!("sqlite row decode failed: {e}"))?;
                if seq < 0 || seq as usize != expected_seq {
                    return Err(format!(
                        "swap_receipts sequence gap: expected {expected_seq}, got {seq}"
                    ));
                }
                let computed = blake3_256(&leaf_json);
                if hex::encode(computed) != stored_digest {
                    return Err(format!(
                        "swap_receipts integrity failure at seq {seq}: stored digest mismatch"
                    ));
                }
                frontier
                    .append(&computed)
                    .map_err(|e| format!("mmr frontier replay error: {e:?}"))?;
                records.push(computed);
            }
        }

        Ok(Self {
            conn,
            records,
            frontier,
        })
    }

    pub fn health(&self) -> Result<(), String> {
        let one: i64 = self
            .conn
            .query_row("SELECT 1", [], |row| row.get(0))
            .map_err(|e| format!("sqlite health check failed: {e}"))?;
        if one != 1 {
            return Err("unexpected health query result".to_string());
        }
        Ok(())
    }

    /// Atomically marks an authenticated 0x response signature digest as consumed.
    /// Returns `Ok(true)` on first use, `Ok(false)` on replay.
    pub fn consume_0x_response_once(
        &mut self,
        response_sig_digest: &str,
        key_id: &str,
        created_at: i64,
        consumed_at: i64,
    ) -> Result<bool, String> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format!("sqlite tx begin failed: {e}"))?;
        let inserted = tx
            .execute(
                "INSERT OR IGNORE INTO consumed_0x_responses (response_sig_digest, key_id, created_at, consumed_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![response_sig_digest, key_id, created_at, consumed_at],
            )
            .map_err(|e| format!("sqlite insert consumed_0x_responses failed: {e}"))?;
        tx.commit()
            .map_err(|e| format!("sqlite tx commit failed: {e}"))?;
        Ok(inserted == 1)
    }

    /// Persists a newly issued single-use test authorization bound to the compiled MessageV0 digests.
    pub fn record_issued_authorization(
        &mut self,
        auth_id: &str,
        message_sha256: &str,
        message_blake3: &str,
        expires_at: i64,
    ) -> Result<(), String> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format!("sqlite tx begin failed: {e}"))?;
        tx.execute(
            "INSERT INTO issued_authorizations (auth_id, message_sha256, message_blake3, expires_at, consumed, consumed_at)
             VALUES (?1, ?2, ?3, ?4, 0, NULL)",
            params![auth_id, message_sha256, message_blake3, expires_at],
        )
        .map_err(|e| format!("sqlite insert issued_authorizations failed: {e}"))?;
        tx.commit()
            .map_err(|e| format!("sqlite tx commit failed: {e}"))?;
        Ok(())
    }

    /// Atomically verifies exact message digest binding and consumes a single-use authorization.
    pub fn consume_authorization_once(
        &mut self,
        auth_id: &str,
        received_sha256: &str,
        received_blake3: &str,
        now_unix_seconds: i64,
    ) -> Result<AuthConsumeStatus, String> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format!("sqlite tx begin failed: {e}"))?;

        let row: Option<(String, String, i64, i64)> = tx
            .query_row(
                "SELECT message_sha256, message_blake3, expires_at, consumed
                 FROM issued_authorizations WHERE auth_id = ?1",
                params![auth_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(|e| format!("sqlite query issued_authorizations failed: {e}"))?;

        let Some((expected_sha256, expected_blake3, expires_at, consumed)) = row else {
            tx.rollback().ok();
            return Ok(AuthConsumeStatus::NotFound);
        };

        if consumed != 0 {
            tx.rollback().ok();
            return Ok(AuthConsumeStatus::AlreadyConsumed);
        }

        if now_unix_seconds > expires_at {
            tx.rollback().ok();
            return Ok(AuthConsumeStatus::Expired);
        }

        if received_sha256 != expected_sha256 || received_blake3 != expected_blake3 {
            tx.rollback().ok();
            return Ok(AuthConsumeStatus::DigestMismatch {
                expected_sha256,
                expected_blake3,
            });
        }

        let updated = tx
            .execute(
                "UPDATE issued_authorizations SET consumed = 1, consumed_at = ?2
                 WHERE auth_id = ?1 AND consumed = 0",
                params![auth_id, now_unix_seconds],
            )
            .map_err(|e| format!("sqlite update issued_authorizations failed: {e}"))?;
        if updated != 1 {
            tx.rollback().ok();
            return Ok(AuthConsumeStatus::AlreadyConsumed);
        }

        tx.commit()
            .map_err(|e| format!("sqlite tx commit failed: {e}"))?;
        Ok(AuthConsumeStatus::Consumed)
    }

    /// Appends a signed decision receipt atomically to SQLite WAL and advances the MMR frontier.
    pub fn append_receipt(
        &mut self,
        receipt_id: &str,
        leaf_json: &[u8],
        signature_hex: &str,
        verdict: &str,
        final_outcome: &str,
    ) -> Result<AppendedReceipt, String> {
        let leaf_digest = blake3_256(leaf_json);
        let leaf_digest_hex = hex::encode(leaf_digest);
        let seq = self.records.len() as u64;

        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format!("sqlite tx begin failed: {e}"))?;
        tx.execute(
            "INSERT INTO swap_receipts (seq, receipt_id, leaf_json, leaf_digest, signature_hex, verdict, final_outcome)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                seq as i64,
                receipt_id,
                leaf_json,
                leaf_digest_hex,
                signature_hex,
                verdict,
                final_outcome
            ],
        )
        .map_err(|e| format!("sqlite insert swap_receipts failed: {e}"))?;
        tx.commit()
            .map_err(|e| format!("sqlite tx commit failed: {e}"))?;

        self.records.push(leaf_digest);
        self.frontier
            .append(&leaf_digest)
            .map_err(|e| format!("mmr frontier append failed: {e:?}"))?;
        let mmr_root = self
            .frontier
            .root()
            .map_err(|e| format!("mmr root failed: {e:?}"))?;
        let mmr_proof = mmr::prove(&self.records, seq as usize)
            .map_err(|e| format!("mmr prove failed: {e:?}"))?;

        Ok(AppendedReceipt {
            seq,
            leaf_digest,
            leaf_count: self.records.len() as u64,
            mmr_root,
            mmr_proof,
        })
    }

    pub fn get_receipt_bundle(&self, receipt_id: &str) -> Result<Option<StoredReceiptBundle>, String> {
        let row: Option<(i64, Vec<u8>, String, String, String, String)> = self
            .conn
            .query_row(
                "SELECT seq, leaf_json, leaf_digest, signature_hex, verdict, final_outcome
                 FROM swap_receipts WHERE receipt_id = ?1",
                params![receipt_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .optional()
            .map_err(|e| format!("sqlite query swap_receipts failed: {e}"))?;

        let Some((seq_i64, leaf_json, stored_digest, signature_hex, verdict, final_outcome)) = row
        else {
            return Ok(None);
        };
        let seq = seq_i64 as u64;
        let leaf_digest = blake3_256(&leaf_json);
        if hex::encode(leaf_digest) != stored_digest {
            return Err(format!("stored receipt integrity violation at seq {seq}"));
        }
        let mmr_root = self
            .frontier
            .root()
            .map_err(|e| format!("mmr root failed: {e:?}"))?;
        let mmr_proof = mmr::prove(&self.records, seq as usize)
            .map_err(|e| format!("mmr prove failed: {e:?}"))?;

        Ok(Some(StoredReceiptBundle {
            seq,
            receipt_id: receipt_id.to_string(),
            leaf_json,
            leaf_digest,
            signature_hex,
            verdict,
            final_outcome,
            leaf_count: self.records.len() as u64,
            mmr_root,
            mmr_proof,
        }))
    }

    pub fn stats(&self) -> Result<SolanaSwapStoreStats, String> {
        let consumed_0x_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM consumed_0x_responses", [], |r| r.get(0))
            .map_err(|e| format!("sqlite count consumed_0x_responses failed: {e}"))?;
        let issued_auth_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM issued_authorizations", [], |r| r.get(0))
            .map_err(|e| format!("sqlite count issued_authorizations failed: {e}"))?;
        let consumed_auth_count: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM issued_authorizations WHERE consumed = 1",
                [],
                |r| r.get(0),
            )
            .map_err(|e| format!("sqlite count consumed auths failed: {e}"))?;
        let signing_boundary_event_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM signing_boundary_events", [], |r| r.get(0))
            .map_err(|e| format!("sqlite count signing_boundary_events failed: {e}"))?;
        let onchain_confirmation_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM onchain_confirmations", [], |r| r.get(0))
            .map_err(|e| format!("sqlite count onchain_confirmations failed: {e}"))?;
        let pending_reconciliation_count: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM pending_reconciliations WHERE completed = 0",
                [],
                |r| r.get(0),
            )
            .map_err(|e| format!("sqlite count pending_reconciliations failed: {e}"))?;
        let mmr_root_hex = if self.records.is_empty() {
            None
        } else {
            Some(hex::encode(
                self.frontier
                    .root()
                    .map_err(|e| format!("mmr root failed: {e:?}"))?,
            ))
        };

        Ok(SolanaSwapStoreStats {
            receipt_count: self.records.len() as u64,
            consumed_0x_count: consumed_0x_count as u64,
            issued_auth_count: issued_auth_count as u64,
            consumed_auth_count: consumed_auth_count as u64,
            signing_boundary_event_count: signing_boundary_event_count as u64,
            onchain_confirmation_count: onchain_confirmation_count as u64,
            pending_reconciliation_count: pending_reconciliation_count as u64,
            mmr_root_hex,
        })
    }

    pub fn enqueue_pending_reconciliation(
        &mut self,
        receipt_id: &str,
        tx_signature: &str,
        enqueued_at: i64,
    ) -> Result<bool, String> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format!("sqlite tx begin failed: {e}"))?;
        let inserted = tx
            .execute(
                "INSERT OR IGNORE INTO pending_reconciliations (receipt_id, tx_signature, enqueued_at)
                 VALUES (?1, ?2, ?3)",
                params![receipt_id, tx_signature, enqueued_at],
            )
            .map_err(|e| format!("sqlite insert pending_reconciliations failed: {e}"))?;
        tx.commit()
            .map_err(|e| format!("sqlite tx commit failed: {e}"))?;
        Ok(inserted == 1)
    }

    pub fn list_pending_reconciliations(
        &self,
        limit: u64,
    ) -> Result<Vec<PendingReconciliationRow>, String> {
        let clamped = limit.clamp(1, 200) as i64;
        let mut stmt = self
            .conn
            .prepare(
                "SELECT receipt_id, tx_signature, enqueued_at, attempts, last_error, completed, completed_at
                 FROM pending_reconciliations
                 WHERE completed = 0
                 ORDER BY enqueued_at ASC LIMIT ?1",
            )
            .map_err(|e| format!("sqlite prepare pending_reconciliations failed: {e}"))?;
        let rows = stmt
            .query_map(params![clamped], |r| {
                Ok(PendingReconciliationRow {
                    receipt_id: r.get(0)?,
                    tx_signature: r.get(1)?,
                    enqueued_at: r.get(2)?,
                    attempts: r.get::<_, i64>(3)? as u64,
                    last_error: r.get(4)?,
                    completed: r.get::<_, i64>(5)? != 0,
                    completed_at: r.get(6)?,
                })
            })
            .map_err(|e| format!("sqlite query pending_reconciliations failed: {e}"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("sqlite row decode failed: {e}"))?);
        }
        Ok(out)
    }

    pub fn record_reconciliation_attempt(
        &mut self,
        receipt_id: &str,
        last_error: Option<&str>,
        completed: bool,
        now_unix_seconds: i64,
    ) -> Result<(), String> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format!("sqlite tx begin failed: {e}"))?;
        let completed_at = if completed { Some(now_unix_seconds) } else { None };
        tx.execute(
            "UPDATE pending_reconciliations
             SET attempts = attempts + 1, last_error = ?2, completed = ?3, completed_at = ?4
             WHERE receipt_id = ?1",
            params![receipt_id, last_error, i64::from(completed), completed_at],
        )
        .map_err(|e| format!("sqlite update pending_reconciliations failed: {e}"))?;
        tx.commit()
            .map_err(|e| format!("sqlite tx commit failed: {e}"))?;
        Ok(())
    }

    pub fn latest_mmr_state(&self) -> Result<Option<(u64, [u8; 32])>, String> {
        if self.records.is_empty() {
            return Ok(None);
        }
        let root = self
            .frontier
            .root()
            .map_err(|e| format!("mmr root failed: {e:?}"))?;
        Ok(Some((self.records.len() as u64, root)))
    }

    /// Atomically persists an on-chain confirmation reconciliation bound to a receipt id.
    /// Returns `Ok(true)` if inserted, `Ok(false)` if this receipt already has a recorded confirmation.
    #[allow(clippy::too_many_arguments)]
    pub fn record_onchain_confirmation(
        &mut self,
        receipt_id: &str,
        tx_signature: &str,
        slot: u64,
        confirmation_status: &str,
        reconciliation_status: &str,
        report_json: &[u8],
        signature_hex: &str,
        recorded_at: i64,
    ) -> Result<bool, String> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format!("sqlite tx begin failed: {e}"))?;
        let inserted = tx
            .execute(
                "INSERT OR IGNORE INTO onchain_confirmations (
                    receipt_id, tx_signature, slot, confirmation_status,
                    reconciliation_status, report_json, signature_hex, recorded_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    receipt_id,
                    tx_signature,
                    slot as i64,
                    confirmation_status,
                    reconciliation_status,
                    report_json,
                    signature_hex,
                    recorded_at
                ],
            )
            .map_err(|e| format!("sqlite insert onchain_confirmations failed: {e}"))?;
        tx.commit()
            .map_err(|e| format!("sqlite tx commit failed: {e}"))?;
        Ok(inserted == 1)
    }

    pub fn get_onchain_confirmation(
        &self,
        receipt_id: &str,
    ) -> Result<Option<StoredConfirmationRow>, String> {
        self.conn
            .query_row(
                "SELECT receipt_id, tx_signature, slot, confirmation_status,
                        reconciliation_status, report_json, signature_hex, recorded_at
                 FROM onchain_confirmations WHERE receipt_id = ?1",
                params![receipt_id],
                |r| {
                    Ok(StoredConfirmationRow {
                        receipt_id: r.get(0)?,
                        tx_signature: r.get(1)?,
                        slot: r.get::<_, i64>(2)? as u64,
                        confirmation_status: r.get(3)?,
                        reconciliation_status: r.get(4)?,
                        report_json: r.get(5)?,
                        signature_hex: r.get(6)?,
                        recorded_at: r.get(7)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("sqlite query onchain_confirmations failed: {e}"))
    }

    pub fn record_signing_boundary_event(
        &mut self,
        auth_id: &str,
        accepted: bool,
        reject_code: Option<&str>,
        received_sha256: &str,
        received_blake3: &str,
        recorded_at: i64,
    ) -> Result<u64, String> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format!("sqlite tx begin failed: {e}"))?;
        tx.execute(
            "INSERT INTO signing_boundary_events (auth_id, accepted, reject_code, received_sha256, received_blake3, recorded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                auth_id,
                i64::from(accepted),
                reject_code,
                received_sha256,
                received_blake3,
                recorded_at
            ],
        )
        .map_err(|e| format!("sqlite insert signing_boundary_events failed: {e}"))?;
        let id = tx.last_insert_rowid() as u64;
        tx.commit()
            .map_err(|e| format!("sqlite tx commit failed: {e}"))?;
        Ok(id)
    }

    pub fn list_receipts(&self, limit: u64, offset: u64) -> Result<Vec<ReceiptSummaryRow>, String> {
        let clamped_limit = limit.clamp(1, 200) as i64;
        let mut stmt = self
            .conn
            .prepare(
                "SELECT seq, receipt_id, leaf_digest, verdict, final_outcome
                 FROM swap_receipts ORDER BY seq ASC LIMIT ?1 OFFSET ?2",
            )
            .map_err(|e| format!("sqlite prepare list_receipts failed: {e}"))?;
        let rows = stmt
            .query_map(params![clamped_limit, offset as i64], |r| {
                Ok(ReceiptSummaryRow {
                    seq: r.get::<_, i64>(0)? as u64,
                    receipt_id: r.get(1)?,
                    leaf_digest: r.get(2)?,
                    verdict: r.get(3)?,
                    final_outcome: r.get(4)?,
                })
            })
            .map_err(|e| format!("sqlite query list_receipts failed: {e}"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("sqlite row decode failed: {e}"))?);
        }
        Ok(out)
    }

    pub fn list_signing_boundary_events(
        &self,
        auth_id: Option<&str>,
    ) -> Result<Vec<SigningBoundaryEventRow>, String> {
        let mut out = Vec::new();
        if let Some(id) = auth_id {
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT seq, auth_id, accepted, reject_code, received_sha256, received_blake3, recorded_at
                     FROM signing_boundary_events WHERE auth_id = ?1 ORDER BY seq ASC",
                )
                .map_err(|e| format!("sqlite prepare signing_boundary_events failed: {e}"))?;
            let rows = stmt
                .query_map(params![id], |r| {
                    Ok(SigningBoundaryEventRow {
                        seq: r.get::<_, i64>(0)? as u64,
                        auth_id: r.get(1)?,
                        accepted: r.get::<_, i64>(2)? != 0,
                        reject_code: r.get(3)?,
                        received_sha256: r.get(4)?,
                        received_blake3: r.get(5)?,
                        recorded_at: r.get(6)?,
                    })
                })
                .map_err(|e| format!("sqlite query signing_boundary_events failed: {e}"))?;
            for row in rows {
                out.push(row.map_err(|e| format!("sqlite row decode failed: {e}"))?);
            }
        } else {
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT seq, auth_id, accepted, reject_code, received_sha256, received_blake3, recorded_at
                     FROM signing_boundary_events ORDER BY seq ASC LIMIT 500",
                )
                .map_err(|e| format!("sqlite prepare signing_boundary_events failed: {e}"))?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(SigningBoundaryEventRow {
                        seq: r.get::<_, i64>(0)? as u64,
                        auth_id: r.get(1)?,
                        accepted: r.get::<_, i64>(2)? != 0,
                        reject_code: r.get(3)?,
                        received_sha256: r.get(4)?,
                        received_blake3: r.get(5)?,
                        recorded_at: r.get(6)?,
                    })
                })
                .map_err(|e| format!("sqlite query signing_boundary_events failed: {e}"))?;
            for row in rows {
                out.push(row.map_err(|e| format!("sqlite row decode failed: {e}"))?);
            }
        }
        Ok(out)
    }
}
