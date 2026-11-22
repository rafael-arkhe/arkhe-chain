//! Optional standalone durable broker journal. Does not replace PostgreSQL.
//!
//! L2 persisted global kill switch (`broker_global_kill_switch`):
//! - Enforced as a singleton row (`id = 1`) with an append-only audit log
//!   (`broker_kill_switch_audit`).
//! - Checked fail-closed both before broker admission and atomically inside
//!   every `BEGIN IMMEDIATE` dispatch/reservation transaction (no TOCTOU).
//! - Cross-process persistence and sub-second enforcement are provided here;
//!   preventing a same-UID hostile process from writing the SQLite file
//!   directly requires L1 OS process/UID isolation.
use crate::broker::{DispatchJournal, Reservation};
use crate::kill_switch_model::{
    decide_complete, decide_reserve, decide_toggle, evaluate_kill_switch, CompleteOutcome,
    ObservedKillSwitch, ReserveOutcome, SlotState, ToggleOutcome,
};
use arkhe_core::Digest32;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path, time::Duration};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InitialKillSwitchMode {
    /// Conservative fail-closed startup: initializes `engaged = 1` and refuses all
    /// dispatches until an operator authenticated at a protected boundary activates it.
    Halted,
    /// Permissive initial mode (`engaged = 0`), retained for legacy/unit tests.
    /// Conservative deployments MUST use `SqliteDispatchJournal::open_halted`.
    Open,
}

/// Operator identity observed at a protected administrative boundary (for example,
/// Linux `SO_PEERCRED` on a restricted admin Unix socket). Callers must never
/// construct this blindly from an unauthenticated JSON field.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthenticatedOperator {
    principal: String,
}

impl AuthenticatedOperator {
    /// Construct from OS-verified peer credentials (UID and optional PID).
    pub fn from_os_peer(uid: u32, pid: Option<i32>) -> Self {
        let principal = match pid {
            Some(pid) => format!("os-uid:{uid}:pid:{pid}"),
            None => format!("os-uid:{uid}"),
        };
        Self { principal }
    }

    /// Construct from an already-authenticated boundary principal.
    /// Validates non-empty syntax only; authentication is the caller boundary's duty.
    pub fn from_verified_boundary(principal: impl Into<String>) -> Result<Self, String> {
        let principal = principal.into();
        if principal.trim().is_empty() {
            return Err("kill_switch_operator_required".into());
        }
        Ok(Self { principal })
    }

    pub fn as_str(&self) -> &str {
        &self.principal
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GlobalKillSwitchState {
    pub engaged: bool,
    pub reason: String,
    pub updated_by: String,
    pub updated_at_ns: i64,
    pub epoch: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KillSwitchAuditEntry {
    pub seq: i64,
    pub epoch: u64,
    pub engaged: bool,
    pub operator: String,
    pub reason: String,
    pub updated_at_ns: i64,
}

fn format_kill_switch_error(reason: &str) -> String {
    if reason.trim().is_empty() {
        "kill_switch_engaged".into()
    } else {
        format!("kill_switch_engaged: {reason}")
    }
}

fn check_kill_switch_in_conn(conn: &Connection) -> Result<(), String> {
    let row: Option<(i64, String)> = conn
        .query_row(
            "SELECT engaged, reason FROM broker_global_kill_switch WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("kill_switch_state_unavailable: {e}"))?;
    let raw_engaged = row.as_ref().map(|(e, _)| *e);
    match evaluate_kill_switch(raw_engaged) {
        ObservedKillSwitch::Disengaged => Ok(()),
        ObservedKillSwitch::Engaged => {
            let reason = row.as_ref().map(|(_, r)| r.as_str()).unwrap_or("");
            Err(format_kill_switch_error(reason))
        }
        ObservedKillSwitch::Unavailable => match raw_engaged {
            Some(other) => Err(format!("kill_switch_state_corrupted: {other}")),
            None => Err("kill_switch_state_unavailable: singleton row missing".into()),
        },
    }
}

fn read_observed_kill_switch(conn: &Connection) -> Result<(ObservedKillSwitch, String), String> {
    let row: Option<(i64, String)> = conn
        .query_row(
            "SELECT engaged, reason FROM broker_global_kill_switch WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("kill_switch_state_unavailable: {e}"))?;
    let raw = row.as_ref().map(|(e, _)| *e);
    let reason = row.map(|(_, r)| r).unwrap_or_default();
    Ok((evaluate_kill_switch(raw), reason))
}

pub struct SqliteDispatchJournal {
    connection: Connection,
    owners: HashMap<(String, Digest32), String>,
}
#[derive(Debug, PartialEq, Eq)]
pub enum TransactionalResult {
    Executed(Vec<u8>),
    Replay(Vec<u8>),
    Uncertain,
}

impl SqliteDispatchJournal {
    /// Atomic only for effects written through this same SQLite transaction.
    /// The trusted callback MUST NOT perform network/filesystem/provider effects.
    /// On callback error/panic the local effect, nonce and reservation roll back.
    pub fn transact_authenticated<F>(
        &mut self,
        caller: &str,
        operation: Digest32,
        binding: Digest32,
        nonce: Digest32,
        effect: F,
    ) -> Result<TransactionalResult, String>
    where
        F: FnOnce(&rusqlite::Transaction<'_>) -> Result<Vec<u8>, String>,
    {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        check_kill_switch_in_conn(&tx)?;
        let old:Option<(Vec<u8>,String,Option<Vec<u8>>)>=tx.query_row("SELECT binding,status,receipt FROM broker_dispatch WHERE caller=?1 AND operation=?2",params![caller,&operation.0[..]],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
        if let Some((old, status, receipt)) = old {
            if old != binding.0 {
                return Err("broker parameter/policy conflict".into());
            }
            let same:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM broker_authenticated_consumption WHERE caller=?1 AND nonce=?2 AND operation=?3)",params![caller,&nonce.0[..],&operation.0[..]],|r|r.get(0)).map_err(|e|e.to_string())?;
            if !same {
                return Err("authenticated nonce binding missing".into());
            }
            return match (status.as_str(), receipt) {
                ("COMPLETED", Some(r)) => Ok(TransactionalResult::Replay(r)),
                ("UNCERTAIN", None) => Ok(TransactionalResult::Uncertain),
                _ => Err("invalid persisted broker state".into()),
            };
        }
        let owner = uuid::Uuid::new_v4().to_string();
        tx.execute("INSERT INTO broker_dispatch(caller,operation,binding,owner,status) VALUES(?1,?2,?3,?4,'UNCERTAIN')",params![caller,&operation.0[..],&binding.0[..],owner]).map_err(|e|e.to_string())?;
        tx.execute(
            "INSERT INTO broker_authenticated_consumption(caller,nonce,operation) VALUES(?1,?2,?3)",
            params![caller, &nonce.0[..], &operation.0[..]],
        )
        .map_err(|_| "authenticated nonce already consumed".to_owned())?;
        let receipt = effect(&tx)?;
        let n=tx.execute("UPDATE broker_dispatch SET status='COMPLETED',receipt=?4 WHERE caller=?1 AND operation=?2 AND binding=?3 AND status='UNCERTAIN'",params![caller,&operation.0[..],&binding.0[..],&receipt]).map_err(|e|e.to_string())?;
        if n != 1 {
            return Err("invalid transactional completion".into());
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(TransactionalResult::Executed(receipt))
    }
}
impl SqliteDispatchJournal {
    /// Open with legacy permissive initial kill-switch mode (`Open`) for backward
    /// compatibility with existing tests. Conservative deployments MUST use [`Self::open_halted`].
    pub fn open(path: &Path) -> Result<Self, String> {
        Self::open_with_kill_switch_mode(path, InitialKillSwitchMode::Open)
    }

    /// Conservative fail-closed constructor: a brand-new database starts with
    /// `broker_global_kill_switch.engaged = 1` (`initial_conservative_halt`) and
    /// refuses all dispatches until an operator explicitly disengages it.
    pub fn open_halted(path: &Path) -> Result<Self, String> {
        Self::open_with_kill_switch_mode(path, InitialKillSwitchMode::Halted)
    }

    pub fn open_with_kill_switch_mode(
        path: &Path,
        initial_mode: InitialKillSwitchMode,
    ) -> Result<Self, String> {
        if path == Path::new(":memory:") || path.as_os_str().is_empty() {
            return Err("durable broker requires a filesystem database".into());
        }
        let connection = Connection::open(path).map_err(|e| e.to_string())?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
          CREATE TABLE IF NOT EXISTS broker_dispatch(
            caller TEXT NOT NULL, operation BLOB NOT NULL, binding BLOB NOT NULL,
            owner TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('UNCERTAIN','COMPLETED')),
            receipt BLOB, PRIMARY KEY(caller,operation),
            CHECK((status='COMPLETED')=(receipt IS NOT NULL)));
          CREATE TABLE IF NOT EXISTS broker_closed_consumption(
            closed BLOB PRIMARY KEY NOT NULL, caller TEXT NOT NULL, operation BLOB NOT NULL);
          CREATE TABLE IF NOT EXISTS broker_authenticated_consumption(
            caller TEXT NOT NULL, nonce BLOB NOT NULL, operation BLOB NOT NULL, PRIMARY KEY(caller,nonce));
          CREATE TABLE IF NOT EXISTS broker_kill_switch_audit(
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            epoch INTEGER NOT NULL,
            engaged INTEGER NOT NULL CHECK(engaged IN (0, 1)),
            operator TEXT NOT NULL,
            reason TEXT NOT NULL,
            updated_at_ns INTEGER NOT NULL);",
            )
            .map_err(|e| e.to_string())?;
        // Initialize the singleton kill-switch table atomically ONLY when it does
        // not yet exist. If an existing database has its singleton row deleted,
        // reopening MUST NOT silently re-insert a row (fail-closed across reopens).
        {
            let mut connection_ref = connection;
            let tx = connection_ref
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|e| e.to_string())?;
            let existed: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='broker_global_kill_switch')",
                    [],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !existed {
                tx.execute_batch(
                    "CREATE TABLE broker_global_kill_switch(
                       id INTEGER PRIMARY KEY CHECK(id = 1),
                       engaged INTEGER NOT NULL CHECK(engaged IN (0, 1)),
                       reason TEXT NOT NULL DEFAULT '',
                       updated_by TEXT NOT NULL DEFAULT '',
                       updated_at_ns INTEGER NOT NULL DEFAULT 0,
                       epoch INTEGER NOT NULL DEFAULT 0);",
                )
                .map_err(|e| e.to_string())?;
                match initial_mode {
                    InitialKillSwitchMode::Halted => {
                        tx.execute(
                            "INSERT INTO broker_global_kill_switch(id, engaged, reason, updated_by, updated_at_ns, epoch)
                             VALUES(1, 1, 'initial_conservative_halt', 'system:init', 0, 0)",
                            [],
                        )
                        .map_err(|e| e.to_string())?;
                        tx.execute(
                            "INSERT INTO broker_kill_switch_audit(epoch, engaged, operator, reason, updated_at_ns)
                             VALUES(0, 1, 'system:init', 'initial_conservative_halt', 0)",
                            [],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    InitialKillSwitchMode::Open => {
                        tx.execute(
                            "INSERT INTO broker_global_kill_switch(id, engaged, reason, updated_by, updated_at_ns, epoch)
                             VALUES(1, 0, '', '', 0, 0)",
                            [],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                }
            }
            tx.commit().map_err(|e| e.to_string())?;
            Ok(Self {
                connection: connection_ref,
                owners: HashMap::new(),
            })
        }
    }

    pub fn global_kill_switch_state(&self) -> Result<GlobalKillSwitchState, String> {
        let row: Option<(i64, String, String, i64, i64)> = self
            .connection
            .query_row(
                "SELECT engaged, reason, updated_by, updated_at_ns, epoch FROM broker_global_kill_switch WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()
            .map_err(|e| format!("kill_switch_state_unavailable: {e}"))?;
        let Some((engaged, reason, updated_by, updated_at_ns, epoch)) = row else {
            return Err("kill_switch_state_unavailable: singleton row missing".into());
        };
        let engaged = match engaged {
            0 => false,
            1 => true,
            other => return Err(format!("kill_switch_state_corrupted: {other}")),
        };
        let epoch = u64::try_from(epoch)
            .map_err(|_| format!("kill_switch_state_corrupted: negative epoch {epoch}"))?;
        Ok(GlobalKillSwitchState {
            engaged,
            reason,
            updated_by,
            updated_at_ns,
            epoch,
        })
    }

    pub fn kill_switch_audit_log(&self) -> Result<Vec<KillSwitchAuditEntry>, String> {
        let mut stmt = self
            .connection
            .prepare(
                "SELECT seq, epoch, engaged, operator, reason, updated_at_ns FROM broker_kill_switch_audit ORDER BY seq ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, i64>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut entries = Vec::new();
        for row in rows {
            let (seq, epoch, engaged, operator, reason, updated_at_ns) =
                row.map_err(|e| e.to_string())?;
            entries.push(KillSwitchAuditEntry {
                seq,
                epoch: u64::try_from(epoch)
                    .map_err(|_| format!("kill_switch_audit_corrupted: negative epoch {epoch}"))?,
                engaged: match engaged {
                    0 => false,
                    1 => true,
                    other => return Err(format!("kill_switch_audit_corrupted: {other}")),
                },
                operator,
                reason,
                updated_at_ns,
            });
        }
        Ok(entries)
    }

    fn set_global_kill_switch(
        &mut self,
        engaged: bool,
        operator: &str,
        reason: &str,
        now_ns: i64,
    ) -> Result<GlobalKillSwitchState, String> {
        if operator.trim().is_empty() {
            return Err("kill_switch_operator_required".into());
        }
        if reason.trim().is_empty() {
            return Err("kill_switch_reason_required".into());
        }
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let current: Option<(i64, i64)> = tx
            .query_row(
                "SELECT engaged, epoch FROM broker_global_kill_switch WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| format!("kill_switch_state_unavailable: {e}"))?;
        let observed = evaluate_kill_switch(current.map(|(e, _)| e));
        let current_epoch = current.and_then(|(_, ep)| u64::try_from(ep).ok());
        let (next_engaged, next_epoch_u64) = match decide_toggle(
            observed,
            current_epoch,
            engaged,
            !operator.trim().is_empty(),
            !reason.trim().is_empty(),
        ) {
            ToggleOutcome::Applied {
                next_engaged,
                next_epoch,
            } => (next_engaged, next_epoch),
            ToggleOutcome::RejectUnavailable => {
                return Err("kill_switch_state_unavailable: singleton row missing".into());
            }
            ToggleOutcome::RejectEpochOverflow => {
                return Err("kill_switch_epoch_overflow".into());
            }
            ToggleOutcome::RejectMissingMetadata => {
                return Err("kill_switch_metadata_required".into());
            }
        };
        let next_epoch =
            i64::try_from(next_epoch_u64).map_err(|_| "kill_switch_epoch_overflow".to_owned())?;
        let engaged_int = i64::from(next_engaged);
        let updated = tx
            .execute(
                "UPDATE broker_global_kill_switch SET engaged=?1, reason=?2, updated_by=?3, updated_at_ns=?4, epoch=?5 WHERE id=1",
                params![engaged_int, reason, operator, now_ns, next_epoch],
            )
            .map_err(|e| e.to_string())?;
        if updated != 1 {
            return Err("kill_switch_state_unavailable: singleton update failed".into());
        }
        tx.execute(
            "INSERT INTO broker_kill_switch_audit(epoch, engaged, operator, reason, updated_at_ns) VALUES(?1, ?2, ?3, ?4, ?5)",
            params![next_epoch, engaged_int, operator, reason, now_ns],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(GlobalKillSwitchState {
            engaged: next_engaged,
            reason: reason.to_owned(),
            updated_by: operator.to_owned(),
            updated_at_ns: now_ns,
            epoch: next_epoch_u64,
        })
    }

    pub fn engage_global_kill_switch_as(
        &mut self,
        operator: &AuthenticatedOperator,
        reason: &str,
        now_ns: i64,
    ) -> Result<GlobalKillSwitchState, String> {
        self.set_global_kill_switch(true, operator.as_str(), reason, now_ns)
    }

    pub fn disengage_global_kill_switch_as(
        &mut self,
        operator: &AuthenticatedOperator,
        reason: &str,
        now_ns: i64,
    ) -> Result<GlobalKillSwitchState, String> {
        self.set_global_kill_switch(false, operator.as_str(), reason, now_ns)
    }

    /// Convenience wrapper; does NOT authenticate `operator` on its own.
    /// Protected administrative boundaries MUST construct [`AuthenticatedOperator`]
    /// from OS or cryptographic credentials and call [`Self::engage_global_kill_switch_as`].
    pub fn engage_global_kill_switch(
        &mut self,
        operator: &str,
        reason: &str,
        now_ns: i64,
    ) -> Result<GlobalKillSwitchState, String> {
        let verified = AuthenticatedOperator::from_verified_boundary(operator)?;
        self.engage_global_kill_switch_as(&verified, reason, now_ns)
    }

    /// Convenience wrapper; does NOT authenticate `operator` on its own.
    /// Protected administrative boundaries MUST construct [`AuthenticatedOperator`]
    /// from OS or cryptographic credentials and call [`Self::disengage_global_kill_switch_as`].
    pub fn disengage_global_kill_switch(
        &mut self,
        operator: &str,
        reason: &str,
        now_ns: i64,
    ) -> Result<GlobalKillSwitchState, String> {
        let verified = AuthenticatedOperator::from_verified_boundary(operator)?;
        self.disengage_global_kill_switch_as(&verified, reason, now_ns)
    }
    fn reserve_inner(
        &mut self,
        caller: &str,
        operation: Digest32,
        binding: Digest32,
        closed: Option<Digest32>,
        nonce: Option<Digest32>,
    ) -> Result<Reservation, String> {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let (ks, ks_reason) = read_observed_kill_switch(&tx)?;
        let old: Option<(Vec<u8>,String,Option<Vec<u8>>)> = tx.query_row(
            "SELECT binding,status,receipt FROM broker_dispatch WHERE caller=?1 AND operation=?2",
            params![caller,&operation.0[..]], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
        let slot_state = match &old {
            None => SlotState::Empty,
            Some((old_binding, status, receipt)) => {
                if old_binding != &binding.0 {
                    SlotState::BindingConflict
                } else {
                    match (status.as_str(), receipt) {
                        ("COMPLETED", Some(_)) => SlotState::Completed,
                        ("UNCERTAIN", None) => SlotState::Uncertain {
                            owner_matches: false,
                        },
                        _ => return Err("invalid persisted broker state".into()),
                    }
                }
            }
        };
        match decide_reserve(ks, slot_state) {
            ReserveOutcome::RejectKillSwitchUnavailable => {
                return Err("kill_switch_state_unavailable: singleton row missing".into());
            }
            ReserveOutcome::RejectKillSwitchEngaged => {
                return Err(format_kill_switch_error(&ks_reason));
            }
            ReserveOutcome::RejectBindingConflict => {
                return Err("broker parameter/policy conflict".into());
            }
            ReserveOutcome::Replay | ReserveOutcome::Uncertain => {
                if let Some(closed) = closed {
                    let same:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM broker_closed_consumption WHERE closed=?1 AND caller=?2 AND operation=?3)",
                        params![&closed.0[..],caller,&operation.0[..]],|r|r.get(0)).map_err(|e|e.to_string())?;
                    if !same {
                        return Err("closed-mandate consumption binding missing".into());
                    }
                }
                if let Some(nonce) = nonce {
                    let same:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM broker_authenticated_consumption WHERE caller=?1 AND nonce=?2 AND operation=?3)",params![caller,&nonce.0[..],&operation.0[..]],|r|r.get(0)).map_err(|e|e.to_string())?;
                    if !same {
                        return Err("authenticated nonce binding missing".into());
                    }
                }
                let result = match old {
                    Some((_, status, Some(receipt))) if status == "COMPLETED" => {
                        Reservation::Replay(receipt)
                    }
                    Some((_, status, None)) if status == "UNCERTAIN" => Reservation::Uncertain,
                    _ => return Err("invalid persisted broker state".into()),
                };
                tx.commit().map_err(|e| e.to_string())?;
                return Ok(result);
            }
            ReserveOutcome::Acquire => {}
        }
        let owner = uuid::Uuid::new_v4().to_string();
        tx.execute("INSERT INTO broker_dispatch(caller,operation,binding,owner,status) VALUES(?1,?2,?3,?4,'UNCERTAIN')",
            params![caller,&operation.0[..],&binding.0[..],owner]).map_err(|e|e.to_string())?;
        if let Some(closed) = closed {
            tx.execute(
                "INSERT INTO broker_closed_consumption(closed,caller,operation) VALUES(?1,?2,?3)",
                params![&closed.0[..], caller, &operation.0[..]],
            )
            .map_err(|_| "closed mandate already consumed".to_owned())?;
        }
        if let Some(nonce) = nonce {
            tx.execute("INSERT INTO broker_authenticated_consumption(caller,nonce,operation) VALUES(?1,?2,?3)",params![caller,&nonce.0[..],&operation.0[..]])
                .map_err(|_|"authenticated nonce already consumed".to_owned())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        self.owners.insert((caller.into(), operation), owner);
        Ok(Reservation::Acquired)
    }
}
impl DispatchJournal for SqliteDispatchJournal {
    fn check_global_kill_switch(&self) -> Result<(), String> {
        check_kill_switch_in_conn(&self.connection)
    }
    fn reserve_authenticated(
        &mut self,
        caller: &str,
        operation: Digest32,
        binding: Digest32,
        nonce: Digest32,
    ) -> Result<Reservation, String> {
        self.reserve_inner(caller, operation, binding, None, Some(nonce))
    }
    fn reserve(
        &mut self,
        caller: &str,
        operation: Digest32,
        binding: Digest32,
    ) -> Result<Reservation, String> {
        self.reserve_inner(caller, operation, binding, None, None)
    }
    fn reserve_payment(
        &mut self,
        caller: &str,
        operation: Digest32,
        binding: Digest32,
        closed: Digest32,
    ) -> Result<Reservation, String> {
        self.reserve_inner(caller, operation, binding, Some(closed), None)
    }
    fn complete(
        &mut self,
        caller: &str,
        operation: Digest32,
        binding: Digest32,
        receipt: &[u8],
    ) -> Result<(), String> {
        let slot = (caller.into(), operation);
        let owner = self
            .owners
            .get(&slot)
            .ok_or("journal handle does not own reservation")?;
        let ks = read_observed_kill_switch(&self.connection)
            .map(|(k, _)| k)
            .unwrap_or(ObservedKillSwitch::Unavailable);
        let current_slot = SlotState::Uncertain {
            owner_matches: true,
        };
        if decide_complete(ks, current_slot) != CompleteOutcome::CommitCompleted {
            return Err("invalid broker completion transition".into());
        }
        let n=self.connection.execute("UPDATE broker_dispatch SET status='COMPLETED',receipt=?5 WHERE caller=?1 AND operation=?2 AND binding=?3 AND owner=?4 AND status='UNCERTAIN'",
            params![caller,&operation.0[..],&binding.0[..],owner,receipt]).map_err(|e|e.to_string())?;
        if n != 1 {
            return Err("invalid broker completion transition".into());
        }
        self.owners.remove(&slot);
        Ok(())
    }
}
