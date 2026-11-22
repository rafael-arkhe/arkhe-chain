//! CLI entrypoint for the Arkhe native control lab (v1/L2 CLI + L1 Unix-socket daemon).
use arkhe_core::Digest32;
use arkhe_governance::PolicyBinding;
use arkhe_kernel::{
    broker::CapabilityBroker, broker_sqlite::SqliteDispatchJournal, ContainmentGate,
};
use arkhe_native_lab::{
    l1::L1Config, log_key, mandate_key, policy_digest, prepare, prepare_for_caller, Evidence,
    Fixture, LabPolicy, Writer,
};
use arkhe_verify_core::action_proof::Trust;
use serde_json::json;
use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

#[cfg_attr(not(unix), allow(dead_code))]
struct ServeL1Args {
    cfg: L1Config,
    request_sock: PathBuf,
    admin_sock: PathBuf,
    request_mode: u32,
    admin_mode: u32,
    ready_file: Option<PathBuf>,
}

fn parse_serve_l1_args(args: &[String]) -> Result<ServeL1Args, String> {
    let mut allowed_agents = BTreeMap::new();
    let mut operator_uid: Option<u32> = None;
    let mut target_dir: Option<PathBuf> = None;
    let mut database_path: Option<PathBuf> = None;
    let mut request_sock: Option<PathBuf> = None;
    let mut admin_sock: Option<PathBuf> = None;
    let mut request_mode: u32 = 0o660;
    let mut admin_mode: u32 = 0o660;
    let mut host_now: i64 = 102;
    let mut ready_file: Option<PathBuf> = None;

    let mut i = 2;
    while i < args.len() {
        let flag = args[i].as_str();
        let val = args
            .get(i + 1)
            .ok_or_else(|| format!("missing value for {flag}"))?;
        match flag {
            "--agent-uid" => {
                let (uid_s, caller) = val
                    .split_once('=')
                    .ok_or("--agent-uid requires UID=CALLER format")?;
                let uid: u32 = uid_s.parse().map_err(|_| "invalid agent uid")?;
                if caller.trim().is_empty() {
                    return Err("empty agent caller name".into());
                }
                allowed_agents.insert(uid, caller.to_owned());
            }
            "--operator-uid" => {
                operator_uid = Some(val.parse().map_err(|_| "invalid operator uid")?);
            }
            "--target-dir" => target_dir = Some(PathBuf::from(val)),
            "--database" => database_path = Some(PathBuf::from(val)),
            "--request-sock" => request_sock = Some(PathBuf::from(val)),
            "--admin-sock" => admin_sock = Some(PathBuf::from(val)),
            "--request-mode" => {
                request_mode =
                    u32::from_str_radix(val.trim_start_matches("0o"), 8).map_err(|_| "bad mode")?;
            }
            "--admin-mode" => {
                admin_mode =
                    u32::from_str_radix(val.trim_start_matches("0o"), 8).map_err(|_| "bad mode")?;
            }
            "--host-now" => {
                host_now = val.parse().map_err(|_| "invalid host-now")?;
            }
            "--ready-file" => ready_file = Some(PathBuf::from(val)),
            other => return Err(format!("unknown serve-l1 argument: {other}")),
        }
        i += 2;
    }

    if allowed_agents.is_empty() {
        return Err("at least one --agent-uid UID=CALLER is required".into());
    }
    let cfg = L1Config {
        allowed_agents,
        operator_uid: operator_uid.ok_or("--operator-uid is required")?,
        target_dir: target_dir.ok_or("--target-dir is required")?,
        database_path: database_path.ok_or("--database is required")?,
        host_now,
    };
    Ok(ServeL1Args {
        cfg,
        request_sock: request_sock.ok_or("--request-sock is required")?,
        admin_sock: admin_sock.ok_or("--admin-sock is required")?,
        request_mode,
        admin_mode,
        ready_file,
    })
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("prepare") && (3..=5).contains(&args.len()) {
        let tag = args
            .get(3)
            .map(String::as_bytes)
            .unwrap_or(b"native-lab-fixed-logical-request");
        let fixture = match args.get(4) {
            Some(caller) => prepare_for_caller(PathBuf::from(&args[2]), tag, caller)?,
            None => prepare(PathBuf::from(&args[2]), tag)?,
        };
        println!("{}", serde_json::to_string(&fixture)?);
        return Ok(());
    }
    if args.get(1).map(String::as_str) == Some("serve-l1") {
        let parsed = parse_serve_l1_args(&args)?;
        #[cfg(unix)]
        {
            arkhe_native_lab::l1::serve_l1(
                parsed.cfg,
                parsed.request_sock,
                parsed.admin_sock,
                parsed.request_mode,
                parsed.admin_mode,
                parsed.ready_file,
            )
            .await?;
            return Ok(());
        }
        #[cfg(not(unix))]
        {
            let _ = parsed;
            return Err(
                "serve-l1 requires Unix domain sockets and OS peer credentials (SO_PEERCRED on Linux/Unix)"
                    .into(),
            );
        }
    }
    if args.get(1).map(String::as_str) == Some("kill-switch") {
        let action = args.get(2).map(String::as_str).unwrap_or("");
        let db = args.get(3).ok_or(
            "usage: kill-switch status DATABASE | kill-switch engage|disengage DATABASE OPERATOR REASON [NOW_NS]",
        )?;
        let mut journal = SqliteDispatchJournal::open(std::path::Path::new(db))?;
        match action {
            "status" => {
                let state = journal.global_kill_switch_state()?;
                let audit = journal.kill_switch_audit_log()?;
                println!(
                    "{}",
                    serde_json::to_string(&json!({ "state": state, "audit": audit }))?
                );
                return Ok(());
            }
            "engage" | "disengage" => {
                let operator = args.get(4).ok_or("operator required")?;
                let reason = args.get(5).ok_or("reason required")?;
                let now_ns = match args.get(6) {
                    Some(raw) => raw.parse::<i64>()?,
                    None => std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)?
                        .as_nanos() as i64,
                };
                let state = if action == "engage" {
                    journal.engage_global_kill_switch(operator, reason, now_ns)?
                } else {
                    journal.disengage_global_kill_switch(operator, reason, now_ns)?
                };
                println!("{}", serde_json::to_string(&state)?);
                return Ok(());
            }
            _ => {
                return Err(
                    "usage: kill-switch status DATABASE | kill-switch engage|disengage DATABASE OPERATOR REASON [NOW_NS]"
                        .into(),
                );
            }
        }
    }
    if args.len() < 5 || args[1] != "execute" {
        return Err(
            "usage: prepare ABSOLUTE_TARGET [REQUEST_TAG] [CALLER] | execute FIXTURE DATABASE MODE [PAUSE_PREFIX] | kill-switch ... | serve-l1 ..."
                .into(),
        );
    }
    let mut fixture: Fixture = serde_json::from_slice(&fs::read(&args[2])?)?;
    let mode = args[4].as_str();
    if mode == "missing" {
        fixture.proof.mandate_signature.clear();
    }
    if mode == "altered" {
        fixture.args.content.push_str("unauthorized change");
    }
    if mode == "altered_destination" {
        fixture.args.path.set_file_name("wrong-destination.txt");
    }
    if mode == "altered_intent" {
        fixture.intent.parameters_digest = Digest32::ZERO;
    }
    if mode == "race" {
        let start = PathBuf::from(args.get(5).ok_or("race start marker missing")?);
        fs::write(
            start.with_extension(format!("ready-{}", std::process::id())),
            b"ready",
        )?;
        let began = Instant::now();
        while !start.exists() {
            if began.elapsed() > Duration::from_secs(15) {
                return Err("race start timeout".into());
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }
    let policy = PolicyBinding {
        policy_id: "native-lab".into(),
        version: 1,
        policy_digest: policy_digest(),
    };
    let now = if mode == "expired" { 1000 } else { 102 };
    let trust = Trust {
        mandate_key: mandate_key().verifying_key(),
        log_key: log_key().verifying_key(),
        policy_digest: policy_digest(),
        checkpoint: fixture.proof.checkpoint.clone(),
        now,
        max_checkpoint_age: 2000,
    };
    let entered = Arc::new(AtomicBool::new(false));
    let finished = Arc::new(AtomicBool::new(false));
    let writer = Writer {
        args: fixture.args.clone(),
        entered: entered.clone(),
        finished: finished.clone(),
        pause: if mode == "pause" {
            args.get(5).map(PathBuf::from)
        } else {
            None
        },
    };
    let journal = SqliteDispatchJournal::open(std::path::Path::new(&args[3]))?;
    let mut broker = CapabilityBroker::new(ContainmentGate::new(LabPolicy), journal, writer);
    if mode == "stopped" {
        broker.set_emergency_stop(true);
    }
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
    println!(
        "{}",
        serde_json::to_string(&json!({
            "ok": result.is_ok(),
            "error": result.as_ref().err(),
            "executor_entered": entered.load(Ordering::SeqCst),
            "effect_completed": finished.load(Ordering::SeqCst),
            "cached_receipt": result.is_ok() && !entered.load(Ordering::SeqCst),
            "host_trust_now": now,
            "mode": mode,
            "pid": std::process::id(),
            "receipt": result.ok(),
        }))?
    );
    Ok(())
}
