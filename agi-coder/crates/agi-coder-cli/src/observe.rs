//! Observations for the four gaps that still lack an external proof.
//! Writing these files does not load weights, open a database, edit a repository, or query a forge.

use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::time::Duration;

use serde_json::{json, Value};

pub fn write_observations(workspace: &Path, output: &Path) -> Result<Value, String> {
    let rendered = output.to_string_lossy();
    if rendered.trim().is_empty() || rendered.contains("://") {
        return Err("observation output must be a local directory".into());
    }
    std::fs::create_dir_all(output).map_err(|error| error.to_string())?;
    let reports = [
        ("deepinfer.json", probe_deepinfer(workspace)),
        (
            "postgres.json",
            probe_postgres("127.0.0.1:5432".parse().expect("loopback port")),
        ),
        ("autonomy.json", probe_autonomy()),
        ("hosted-ci.json", probe_ci(workspace)),
    ];
    for (name, report) in &reports {
        if report["declares_agi"] != false {
            return Err("an observation must not declare AGI".into());
        }
        let bytes = serde_json::to_vec_pretty(report).map_err(|error| error.to_string())?;
        std::fs::write(output.join(name), bytes).map_err(|error| error.to_string())?;
    }
    Ok(json!({
        "declares_agi": false,
        "files": reports.len(),
        "weights_loaded": false,
        "native_generation": false,
        "connected": false,
        "deployed": false,
        "editor": false,
        "executed": false,
        "path": output.display().to_string()
    }))
}

pub fn probe_deepinfer(workspace: &Path) -> Value {
    let config = workspace
        .join("integrations")
        .join("deepinfer")
        .join("engine.local.json");
    if !config.is_file() {
        return json!({
            "weights_loaded": false,
            "native_generation": false,
            "config_present": false,
            "declares_agi": false,
            "reason": "engine.local.json is absent. No weights were loaded and the bridge was not started."
        });
    }
    let text = std::fs::read_to_string(&config).unwrap_or_default();
    let parsed: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    let model = parsed
        .get("model_directory")
        .and_then(Value::as_str)
        .unwrap_or("");
    let weights = !model.is_empty() && Path::new(model).join("config.json").is_file();
    json!({
        "weights_loaded": weights,
        "native_generation": false,
        "config_present": true,
        "declares_agi": false,
        "reason": if weights {
            "A model config.json was found. The native engine was not started, so native_generation stays false."
        } else {
            "engine.local.json does not point at a local model config.json. The bridge was not started."
        }
    })
}

pub fn probe_postgres(addr: SocketAddr) -> Value {
    let tcp_open = TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok();
    json!({
        "connected": false,
        "migration_applied": false,
        "tcp_open": tcp_open,
        "address": addr.to_string(),
        "declares_agi": false,
        "reason": if tcp_open {
            "A TCP listener answered. This process did not open a database session or apply the migration."
        } else {
            "No listener answered. PostgreSQL is not connected and the migration was not applied."
        }
    })
}

pub fn probe_autonomy() -> Value {
    json!({
        "deployed": false,
        "editor": false,
        "production": false,
        "verdict": "inconclusive",
        "declares_agi": false,
        "reason": "No repository editor ran. This observation does not deploy."
    })
}

pub fn probe_ci(workspace: &Path) -> Value {
    let gh_present = std::process::Command::new("gh")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success());
    let remote_present = std::process::Command::new("git")
        .args(["remote"])
        .current_dir(workspace)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .is_some_and(|output| !output.stdout.iter().all(u8::is_ascii_whitespace));
    let reason = match (gh_present, remote_present) {
        (false, false) => "gh is not installed and no git remote was listed. No workflow run was observed.",
        (false, true) => "gh is not installed. No workflow run was observed.",
        (true, false) => "No git remote was listed. No workflow run was observed.",
        (true, true) => "This process did not query a forge. No workflow run was observed.",
    };
    json!({
        "executed": false,
        "conclusion": "not_observed",
        "gh_present": gh_present,
        "remote_present": remote_present,
        "declares_agi": false,
        "reason": reason
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observations_stay_negative_without_external_proof() {
        let root = std::env::temp_dir().join(format!("agi-observe-{}", std::process::id()));
        let output = root.join("out");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let summary = write_observations(&root, &output).expect("write");
        assert_eq!(summary["declares_agi"], false);
        assert_eq!(summary["weights_loaded"], false);
        assert_eq!(summary["connected"], false);
        assert_eq!(summary["deployed"], false);
        assert_eq!(summary["editor"], false);
        assert_eq!(summary["executed"], false);
        for name in [
            "deepinfer.json",
            "postgres.json",
            "autonomy.json",
            "hosted-ci.json",
        ] {
            let value: Value =
                serde_json::from_slice(&std::fs::read(output.join(name)).unwrap()).unwrap();
            assert_eq!(value["declares_agi"], false, "{name}");
        }
        let deepinfer: Value = serde_json::from_slice(
            &std::fs::read(output.join("deepinfer.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(deepinfer["weights_loaded"], false);
        assert_eq!(deepinfer["native_generation"], false);
        let postgres: Value =
            serde_json::from_slice(&std::fs::read(output.join("postgres.json")).unwrap()).unwrap();
        assert_eq!(postgres["connected"], false);
        assert_eq!(postgres["migration_applied"], false);
        let autonomy: Value =
            serde_json::from_slice(&std::fs::read(output.join("autonomy.json")).unwrap()).unwrap();
        assert_eq!(autonomy["deployed"], false);
        assert_eq!(autonomy["editor"], false);
        let ci: Value =
            serde_json::from_slice(&std::fs::read(output.join("hosted-ci.json")).unwrap()).unwrap();
        assert_eq!(ci["executed"], false);
        assert_eq!(ci["conclusion"], "not_observed");
        assert!(write_observations(&root, Path::new("https://example.test/obs")).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }
}
