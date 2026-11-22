//! L1 process/UID separation protocol and dual Unix-socket executor daemon.
//!
//! Security boundary enforced here:
//! - Public request socket (`request.sock`): authorized agent UID may connect and submit
//!   a bounded JSON request (`PublicRequest`). Connecting grants ZERO execution authority.
//!   The OS-observed peer UID (`SO_PEERCRED` on Linux) is mapped to a principal and MUST
//!   match the intent/mandate `requested_by`; JSON cannot override OS identity.
//! - Administrative socket (`admin.sock`): restricted to `operator_uid` by BOTH OS socket
//!   permissions (`EACCES` for agent UID) and `SO_PEERCRED` (`peer.uid == operator_uid`).
//!   Operator identity is derived strictly from OS credentials (`os-uid:<uid>:pid:<pid>`),
//!   never from JSON (`AdminRequest` rejects unknown fields including `operator`).
//! - Conservative fail-closed startup: opens `SqliteDispatchJournal::open_halted`, so all
//!   agent dispatches are refused with `kill_switch_engaged: initial_conservative_halt`
//!   until the authenticated operator explicitly disengages via `admin.sock`.

use crate::{log_key, mandate_key, policy_digest, Evidence, Fixture, LabPolicy, Writer};
use arkhe_governance::PolicyBinding;
use arkhe_kernel::{
    broker::CapabilityBroker,
    broker_sqlite::{
        AuthenticatedOperator, GlobalKillSwitchState, KillSwitchAuditEntry, SqliteDispatchJournal,
    },
    ContainmentGate,
};
use arkhe_verify_core::action_proof::Trust;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};

pub const MAX_FRAME_BYTES: usize = 65_536;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeerIdentity {
    pub uid: u32,
    pub gid: u32,
    pub pid: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct L1Config {
    pub allowed_agents: BTreeMap<u32, String>,
    pub operator_uid: u32,
    pub target_dir: PathBuf,
    pub database_path: PathBuf,
    pub host_now: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicRequest {
    pub fixture: Fixture,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PublicResponse {
    pub ok: bool,
    pub error: Option<String>,
    pub observed_peer: PeerIdentity,
    pub observed_caller: Option<String>,
    pub executor_entered: bool,
    pub effect_completed: bool,
    pub cached_receipt: bool,
    pub receipt: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AdminAction {
    Status,
    Engage,
    Disengage,
}

/// Administrative request sent over `admin.sock`.
/// Deliberately contains NO `operator` field: operator identity is derived strictly
/// from OS peer credentials (`SO_PEERCRED`), never from client JSON.
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdminRequest {
    pub action: AdminAction,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AdminResponse {
    pub ok: bool,
    pub error: Option<String>,
    pub observed_peer: PeerIdentity,
    pub derived_operator: Option<String>,
    pub state: Option<GlobalKillSwitchState>,
    pub audit: Option<Vec<KillSwitchAuditEntry>>,
}

fn validate_target_confined(target_dir: &Path, candidate: &Path) -> Result<(), String> {
    let canonical_dir = std::fs::canonicalize(target_dir)
        .map_err(|e| format!("protected_target_dir_unavailable: {e}"))?;
    let Some(parent) = candidate.parent() else {
        return Err("target_outside_protected_dir".into());
    };
    let Some(file_name) = candidate.file_name() else {
        return Err("target_outside_protected_dir".into());
    };
    let mut name_components = Path::new(file_name).components();
    match (name_components.next(), name_components.next()) {
        (Some(Component::Normal(_)), None) => {}
        _ => return Err("target_outside_protected_dir".into()),
    }
    let canonical_parent =
        std::fs::canonicalize(parent).map_err(|_| "target_outside_protected_dir".to_owned())?;
    if canonical_parent != canonical_dir {
        return Err("target_outside_protected_dir".into());
    }
    if let Ok(meta) = std::fs::symlink_metadata(candidate) {
        if meta.file_type().is_symlink() {
            return Err("target_symlink_rejected".into());
        }
    }
    Ok(())
}

fn now_unix_ns() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as i64)
        .unwrap_or(0)
}

pub async fn handle_public_request(
    peer: PeerIdentity,
    raw_frame: &[u8],
    cfg: &L1Config,
) -> PublicResponse {
    let reject = |caller: Option<String>, msg: String| PublicResponse {
        ok: false,
        error: Some(msg),
        observed_peer: peer,
        observed_caller: caller,
        executor_entered: false,
        effect_completed: false,
        cached_receipt: false,
        receipt: None,
    };

    if raw_frame.len() > MAX_FRAME_BYTES {
        return reject(None, "request_frame_too_large".into());
    }
    let Some(observed_caller) = cfg.allowed_agents.get(&peer.uid).cloned() else {
        return reject(
            None,
            format!("unauthorized_peer_uid: uid={} not allowlisted", peer.uid),
        );
    };
    let request: PublicRequest = match serde_json::from_slice(raw_frame) {
        Ok(req) => req,
        Err(err) => {
            return reject(
                Some(observed_caller),
                format!("invalid_public_request: {err}"),
            );
        }
    };
    let fixture = request.fixture;
    if fixture.intent.requested_by != observed_caller
        || fixture.proof.mandate.requested_by != observed_caller
    {
        return reject(
            Some(observed_caller.clone()),
            format!(
                "peer_identity_mismatch: os_caller={observed_caller} intent={} mandate={}",
                fixture.intent.requested_by, fixture.proof.mandate.requested_by
            ),
        );
    }
    if let Err(err) = validate_target_confined(&cfg.target_dir, &fixture.args.path) {
        return reject(Some(observed_caller), err);
    }

    let journal = match SqliteDispatchJournal::open_halted(&cfg.database_path) {
        Ok(j) => j,
        Err(err) => return reject(Some(observed_caller), format!("journal_open_failed: {err}")),
    };
    let policy = PolicyBinding {
        policy_id: "native-lab".into(),
        version: 1,
        policy_digest: policy_digest(),
    };
    let trust = Trust {
        mandate_key: mandate_key().verifying_key(),
        log_key: log_key().verifying_key(),
        policy_digest: policy_digest(),
        checkpoint: fixture.proof.checkpoint.clone(),
        now: cfg.host_now,
        max_checkpoint_age: 2000,
    };
    let entered = Arc::new(AtomicBool::new(false));
    let finished = Arc::new(AtomicBool::new(false));
    let writer = Writer {
        args: fixture.args.clone(),
        entered: entered.clone(),
        finished: finished.clone(),
        pause: None,
    };
    let mut broker = CapabilityBroker::new(ContainmentGate::new(LabPolicy), journal, writer);
    let result = broker
        .execute(
            &fixture.intent,
            &fixture.worker,
            &policy,
            &Evidence(fixture.envelope),
            &fixture.proof,
            &trust,
        )
        .await;
    let entered_val = entered.load(Ordering::SeqCst);
    let finished_val = finished.load(Ordering::SeqCst);
    PublicResponse {
        ok: result.is_ok(),
        error: result.as_ref().err().cloned(),
        observed_peer: peer,
        observed_caller: Some(observed_caller),
        executor_entered: entered_val,
        effect_completed: finished_val,
        cached_receipt: result.is_ok() && !entered_val,
        receipt: result.ok(),
    }
}

pub fn handle_admin_request(peer: PeerIdentity, raw_frame: &[u8], cfg: &L1Config) -> AdminResponse {
    let reject = |derived: Option<String>, msg: String| AdminResponse {
        ok: false,
        error: Some(msg),
        observed_peer: peer,
        derived_operator: derived,
        state: None,
        audit: None,
    };

    if raw_frame.len() > MAX_FRAME_BYTES {
        return reject(None, "admin_frame_too_large".into());
    }
    if peer.uid != cfg.operator_uid {
        return reject(
            None,
            format!(
                "unauthorized_admin_peer_uid: uid={} expected={}",
                peer.uid, cfg.operator_uid
            ),
        );
    }
    let operator = AuthenticatedOperator::from_os_peer(peer.uid, peer.pid);
    let derived = Some(operator.as_str().to_owned());
    let request: AdminRequest = match serde_json::from_slice(raw_frame) {
        Ok(req) => req,
        Err(err) => return reject(derived, format!("invalid_admin_request: {err}")),
    };
    let mut journal = match SqliteDispatchJournal::open_halted(&cfg.database_path) {
        Ok(j) => j,
        Err(err) => return reject(derived, format!("journal_open_failed: {err}")),
    };
    let now_ns = now_unix_ns();
    match request.action {
        AdminAction::Status => {
            let state = match journal.global_kill_switch_state() {
                Ok(s) => s,
                Err(err) => return reject(derived, err),
            };
            let audit = match journal.kill_switch_audit_log() {
                Ok(a) => a,
                Err(err) => return reject(derived, err),
            };
            AdminResponse {
                ok: true,
                error: None,
                observed_peer: peer,
                derived_operator: derived,
                state: Some(state),
                audit: Some(audit),
            }
        }
        AdminAction::Engage => {
            let reason = request.reason.as_deref().unwrap_or("");
            match journal.engage_global_kill_switch_as(&operator, reason, now_ns) {
                Ok(state) => AdminResponse {
                    ok: true,
                    error: None,
                    observed_peer: peer,
                    derived_operator: derived,
                    state: Some(state),
                    audit: journal.kill_switch_audit_log().ok(),
                },
                Err(err) => reject(derived, err),
            }
        }
        AdminAction::Disengage => {
            let reason = request.reason.as_deref().unwrap_or("");
            match journal.disengage_global_kill_switch_as(&operator, reason, now_ns) {
                Ok(state) => AdminResponse {
                    ok: true,
                    error: None,
                    observed_peer: peer,
                    derived_operator: derived,
                    state: Some(state),
                    audit: journal.kill_switch_audit_log().ok(),
                },
                Err(err) => reject(derived, err),
            }
        }
    }
}

#[cfg(unix)]
pub async fn serve_l1(
    cfg: L1Config,
    request_sock: PathBuf,
    admin_sock: PathBuf,
    request_mode: u32,
    admin_mode: u32,
    ready_file: Option<PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    use std::os::unix::fs::PermissionsExt;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::UnixListener;

    // Initialize conservative halted DB upfront so initial_conservative_halt is persisted
    // before any socket accepts a connection.
    drop(SqliteDispatchJournal::open_halted(&cfg.database_path)?);

    let _ = std::fs::remove_file(&request_sock);
    let _ = std::fs::remove_file(&admin_sock);

    let req_listener = UnixListener::bind(&request_sock)?;
    std::fs::set_permissions(&request_sock, std::fs::Permissions::from_mode(request_mode))?;

    let admin_listener = UnixListener::bind(&admin_sock)?;
    std::fs::set_permissions(&admin_sock, std::fs::Permissions::from_mode(admin_mode))?;

    if let Some(ready) = &ready_file {
        std::fs::write(ready, format!("pid={}\n", std::process::id()))?;
    }

    async fn read_bounded(stream: &mut tokio::net::UnixStream) -> std::io::Result<Vec<u8>> {
        let mut buf = Vec::new();
        stream
            .take((MAX_FRAME_BYTES + 1) as u64)
            .read_to_end(&mut buf)
            .await?;
        Ok(buf)
    }

    let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;

    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => break,
            _ = sigterm.recv() => break,
            accepted = req_listener.accept() => {
                let (mut stream, _) = accepted?;
                let cred = stream.peer_cred()?;
                let peer = PeerIdentity {
                    uid: cred.uid(),
                    gid: cred.gid(),
                    pid: cred.pid(),
                };
                let frame = read_bounded(&mut stream).await?;
                let resp = handle_public_request(peer, &frame, &cfg).await;
                let bytes = serde_json::to_vec(&resp)?;
                let _ = stream.write_all(&bytes).await;
                let _ = stream.write_all(b"\n").await;
                let _ = stream.shutdown().await;
            }
            accepted = admin_listener.accept() => {
                let (mut stream, _) = accepted?;
                let cred = stream.peer_cred()?;
                let peer = PeerIdentity {
                    uid: cred.uid(),
                    gid: cred.gid(),
                    pid: cred.pid(),
                };
                let frame = read_bounded(&mut stream).await?;
                let resp = handle_admin_request(peer, &frame, &cfg);
                let bytes = serde_json::to_vec(&resp)?;
                let _ = stream.write_all(&bytes).await;
                let _ = stream.write_all(b"\n").await;
                let _ = stream.shutdown().await;
            }
        }
    }

    let _ = std::fs::remove_file(&request_sock);
    let _ = std::fs::remove_file(&admin_sock);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{prepare, prepare_for_caller};
    use std::time::{Duration, Instant};

    fn test_env(name: &str) -> (PathBuf, L1Config) {
        let root =
            std::env::temp_dir().join(format!("arkhe-l1-unit-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let target_dir = root.join("target");
        let db_dir = root.join("db");
        std::fs::create_dir_all(&target_dir).unwrap();
        std::fs::create_dir_all(&db_dir).unwrap();
        let mut allowed_agents = BTreeMap::new();
        allowed_agents.insert(2001, "lab-agent".to_owned());
        let cfg = L1Config {
            allowed_agents,
            operator_uid: 2002,
            target_dir,
            database_path: db_dir.join("dispatch.sqlite"),
            host_now: 102,
        };
        (root, cfg)
    }

    #[tokio::test]
    async fn l1_contract_conservative_halt_os_identity_and_admin_separation() {
        let (root, cfg) = test_env("contract");
        let agent = PeerIdentity {
            uid: 2001,
            gid: 2001,
            pid: Some(41001),
        };
        let operator = PeerIdentity {
            uid: 2002,
            gid: 2002,
            pid: Some(42002),
        };
        let stranger = PeerIdentity {
            uid: 2999,
            gid: 2999,
            pid: Some(49999),
        };

        let target = cfg.target_dir.join("approved.txt");
        let valid_fixture = prepare(target.clone(), b"l1-req-1").unwrap();
        let valid_req = serde_json::to_vec(&PublicRequest {
            fixture: valid_fixture.clone(),
        })
        .unwrap();

        // 1. Conservative startup: halted until operator activates.
        let initial_attempt = handle_public_request(agent, &valid_req, &cfg).await;
        assert!(!initial_attempt.ok);
        assert!(initial_attempt
            .error
            .as_deref()
            .unwrap()
            .starts_with("kill_switch_engaged: initial_conservative_halt"));
        assert!(!target.exists());

        // 2. Agent cannot activate/resume over admin interface.
        let agent_resume = handle_admin_request(
            agent,
            br#"{"action":"disengage","reason":"agent trying to resume"}"#,
            &cfg,
        );
        assert!(!agent_resume.ok);
        assert!(agent_resume
            .error
            .as_deref()
            .unwrap()
            .starts_with("unauthorized_admin_peer_uid"));

        // 3. Admin interface rejects JSON attempting to inject an `operator` field.
        let forged_op_field = handle_admin_request(
            operator,
            br#"{"action":"disengage","operator":"forged","reason":"test"}"#,
            &cfg,
        );
        assert!(!forged_op_field.ok);
        assert!(forged_op_field
            .error
            .as_deref()
            .unwrap()
            .contains("invalid_admin_request"));

        // 4. Operator activates; operator identity comes strictly from OS peer credentials.
        let activated = handle_admin_request(
            operator,
            br#"{"action":"disengage","reason":"authorized startup"}"#,
            &cfg,
        );
        assert!(activated.ok);
        assert_eq!(
            activated.derived_operator.as_deref(),
            Some("os-uid:2002:pid:42002")
        );
        assert!(!activated.state.as_ref().unwrap().engaged);

        // 5. Unauthorized stranger UID cannot use public interface.
        let stranger_attempt = handle_public_request(stranger, &valid_req, &cfg).await;
        assert!(!stranger_attempt.ok);
        assert!(stranger_attempt
            .error
            .as_deref()
            .unwrap()
            .starts_with("unauthorized_peer_uid"));
        assert!(!target.exists());

        // 6. OS identity cannot be overridden by JSON requested_by spoofing.
        let spoofed_fixture =
            prepare_for_caller(cfg.target_dir.join("spoof.txt"), b"l1-spoof", "other-agent")
                .unwrap();
        let spoof_req = serde_json::to_vec(&PublicRequest {
            fixture: spoofed_fixture,
        })
        .unwrap();
        let spoof_resp = handle_public_request(agent, &spoof_req, &cfg).await;
        assert!(!spoof_resp.ok);
        assert!(spoof_resp
            .error
            .as_deref()
            .unwrap()
            .starts_with("peer_identity_mismatch"));

        // 7. Path escape outside protected target_dir is rejected.
        let escape_fixture = prepare(root.join("escaped.txt"), b"l1-escape").unwrap();
        let escape_req = serde_json::to_vec(&PublicRequest {
            fixture: escape_fixture,
        })
        .unwrap();
        let escape_resp = handle_public_request(agent, &escape_req, &cfg).await;
        assert!(!escape_resp.ok);
        assert_eq!(
            escape_resp.error.as_deref(),
            Some("target_outside_protected_dir")
        );

        // 8. Authorized agent without valid mandate connects, but produces NO effect.
        let mut bad_mandate = prepare(cfg.target_dir.join("no-mandate.txt"), b"l1-bad").unwrap();
        bad_mandate.proof.mandate_signature.clear();
        let bad_req = serde_json::to_vec(&PublicRequest {
            fixture: bad_mandate,
        })
        .unwrap();
        let bad_resp = handle_public_request(agent, &bad_req, &cfg).await;
        assert!(!bad_resp.ok);
        assert!(!cfg.target_dir.join("no-mandate.txt").exists());

        // 9. Authorized agent with valid mandate succeeds via public interface.
        let ok_resp = handle_public_request(agent, &valid_req, &cfg).await;
        assert!(ok_resp.ok);
        assert!(ok_resp.effect_completed);
        assert_eq!(ok_resp.observed_caller.as_deref(), Some("lab-agent"));
        assert!(target.exists());

        // 10. Operator engages kill switch -> next valid agent request blocked in <1s.
        let t0 = Instant::now();
        let halted = handle_admin_request(
            operator,
            br#"{"action":"engage","reason":"incident halt"}"#,
            &cfg,
        );
        assert!(halted.ok);
        let next_target = cfg.target_dir.join("after-halt.txt");
        let next_fixture = prepare(next_target.clone(), b"l1-req-2").unwrap();
        let next_req = serde_json::to_vec(&PublicRequest {
            fixture: next_fixture,
        })
        .unwrap();
        let blocked = handle_public_request(agent, &next_req, &cfg).await;
        assert!(t0.elapsed() < Duration::from_secs(1));
        assert!(!blocked.ok);
        assert!(blocked
            .error
            .as_deref()
            .unwrap()
            .starts_with("kill_switch_engaged: incident halt"));
        assert!(!next_target.exists());

        // 11. Oversized frame fails closed.
        let huge = vec![b' '; MAX_FRAME_BYTES + 1];
        let huge_resp = handle_public_request(agent, &huge, &cfg).await;
        assert!(!huge_resp.ok);
        assert_eq!(huge_resp.error.as_deref(), Some("request_frame_too_large"));

        let _ = std::fs::remove_dir_all(&root);
    }
}
