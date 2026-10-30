mod status_support;
mod support;
use arkhe_kya_experimental::{policy::VerifierPolicy, status::StatusPurpose};
use std::{fs, process::Command};

#[test]
fn cli_recomputes_checks_and_exits_nonzero_for_revoked_receipt() {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("arkhe-kya-cli-{}-{unique}", std::process::id()));
    fs::create_dir(&dir).unwrap();
    let (p, c) = support::fixture();
    let policy = VerifierPolicy::default();
    for (name, value) in [
        ("receipt", serde_json::to_string(&p).unwrap()),
        ("context", serde_json::to_string(&c).unwrap()),
        ("policy", serde_json::to_string(&policy).unwrap()),
    ] {
        fs::write(dir.join(name), value).unwrap();
    }
    for revoked in [false, true] {
        let mut raw = vec![0; 16384];
        if revoked {
            raw[0] = 0x80;
        }
        let status = status_support::status(&p, 0, &raw, StatusPurpose::Revocation);
        fs::write(dir.join("status"), serde_json::to_vec(&status).unwrap()).unwrap();
        let output = Command::new(env!("CARGO_BIN_EXE_arkhe-kya"))
            .arg("verify")
            .args([
                dir.join("receipt"),
                dir.join("context"),
                dir.join("policy"),
                dir.join("status"),
            ])
            .output()
            .unwrap();
        let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(output.status.success(), !revoked);
        assert_eq!(
            report["decision"],
            if revoked {
                "REJECT"
            } else {
                "ACCEPT_WITH_LIMITATIONS"
            }
        );
    }
    for name in ["receipt", "context", "policy", "status"] {
        fs::remove_file(dir.join(name)).unwrap();
    }
    fs::remove_dir(dir).unwrap();
}

#[test]
fn persisted_floor_survives_processes_and_remembers_authenticated_revocation() {
    use arkhe_kya_experimental::presentation::{Presentation, PRESENTATION_FORMAT};
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("arkhe-kya-state-{}-{unique}", std::process::id()));
    fs::create_dir(&dir).unwrap();
    let (p, c) = support::fixture();
    fs::write(dir.join("context"), serde_json::to_vec(&c).unwrap()).unwrap();
    fs::write(
        dir.join("policy"),
        serde_json::to_vec(&VerifierPolicy::default()).unwrap(),
    )
    .unwrap();
    let init = Command::new(env!("CARGO_BIN_EXE_arkhe-kya"))
        .arg("state-init")
        .arg(dir.join("state"))
        .output()
        .unwrap();
    assert!(init.status.success());
    for (sequence, revoked, forged, expected_decision, expected_floor) in [
        (7, false, false, "ACCEPT_WITH_LIMITATIONS", 7),
        (8, true, false, "REJECT", 8),
        (7, false, false, "REJECT", 8),
        (99, false, true, "REJECT", 8),
    ] {
        let mut raw = vec![0; 16384];
        if revoked {
            raw[0] = 0x80;
        }
        let mut status = status_support::status(&p, 0, &raw, StatusPurpose::Revocation);
        status.status_list.as_mut().unwrap().list.sequence = sequence;
        status_support::resign(&mut status);
        if forged {
            status.status_list.as_mut().unwrap().signature = "00".repeat(64);
        }
        let presentation = Presentation {
            format: PRESENTATION_FORMAT.into(),
            label: "synthetic-poc".into(),
            receipt: p.clone(),
            status: Some(status),
        };
        fs::write(
            dir.join("presentation"),
            serde_json::to_vec(&presentation).unwrap(),
        )
        .unwrap();
        let result = Command::new(env!("CARGO_BIN_EXE_arkhe-kya"))
            .arg("verify-presentation")
            .args([
                dir.join("presentation"),
                dir.join("context"),
                dir.join("policy"),
                dir.join("state"),
            ])
            .output()
            .unwrap();
        let report: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
        assert_eq!(report["decision"], expected_decision, "{report}");
        assert_eq!(
            report["status_state"]["current_floor"], expected_floor,
            "{report}"
        );
        let state: serde_json::Value =
            serde_json::from_slice(&fs::read(dir.join("state")).unwrap()).unwrap();
        assert_eq!(state["rows"][0]["sequence"], expected_floor);
        if sequence == 7 && expected_floor == 8 {
            assert_eq!(
                report["checks"]["reason"],
                "STATUS_LIST_MISMATCH_OR_ROLLBACK"
            );
        }
    }
    for name in ["context", "policy", "state", "presentation"] {
        fs::remove_file(dir.join(name)).unwrap();
    }
    fs::remove_dir(dir).unwrap();
}

#[test]
fn missing_corrupt_or_locked_state_fails_closed_without_implicit_reset() {
    use arkhe_kya_experimental::presentation::{Presentation, PRESENTATION_FORMAT};
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-kya-state-errors-{}-{unique}",
        std::process::id()
    ));
    fs::create_dir(&dir).unwrap();
    let (p, c) = support::fixture();
    let status = status_support::status(&p, 0, &vec![0; 16384], StatusPurpose::Revocation);
    let presentation = Presentation {
        format: PRESENTATION_FORMAT.into(),
        label: "synthetic-poc".into(),
        receipt: p,
        status: Some(status),
    };
    fs::write(
        dir.join("presentation"),
        serde_json::to_vec(&presentation).unwrap(),
    )
    .unwrap();
    fs::write(dir.join("context"), serde_json::to_vec(&c).unwrap()).unwrap();
    fs::write(
        dir.join("policy"),
        serde_json::to_vec(&VerifierPolicy::default()).unwrap(),
    )
    .unwrap();
    let check = |reason: &str| {
        let result = Command::new(env!("CARGO_BIN_EXE_arkhe-kya"))
            .arg("verify-presentation")
            .args([
                dir.join("presentation"),
                dir.join("context"),
                dir.join("policy"),
                dir.join("state"),
            ])
            .output()
            .unwrap();
        let report: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
        assert!(!result.status.success());
        assert!(
            report["reasons"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!(reason)),
            "{report}"
        );
    };
    check("STATE_UNAVAILABLE");
    fs::write(dir.join("state"), "corrupted").unwrap();
    check("STATE_INVALID");
    assert_eq!(fs::read_to_string(dir.join("state")).unwrap(), "corrupted");
    let init = Command::new(env!("CARGO_BIN_EXE_arkhe-kya"))
        .arg("state-init")
        .arg(dir.join("state"))
        .output()
        .unwrap();
    assert!(!init.status.success());
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(dir.join("state"))
        .unwrap();
    lock.try_lock().unwrap();
    check("STATE_LOCK_FAILED");
    drop(lock);
    for name in ["context", "policy", "state", "presentation"] {
        fs::remove_file(dir.join(name)).unwrap();
    }
    fs::remove_dir(dir).unwrap();
}
