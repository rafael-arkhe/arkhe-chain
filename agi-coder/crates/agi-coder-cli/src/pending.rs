//! Reports for capabilities that still lack an external proof.
//! Each field is a result this process can actually produce.

pub fn gpu_attestation() -> serde_json::Value {
    serde_json::json!({
        "verified": false,
        "reason": "GPU attestation provider is not configured. No hardware claim has been verified."
    })
}

pub fn hosted_ci() -> serde_json::Value {
    serde_json::json!({
        "executed": false,
        "conclusion": "not_observed",
        "reason": "Workflows are authored in .github/workflows. This process does not query a forge and does not report a green run."
    })
}

pub fn desktop_shell() -> serde_json::Value {
    serde_json::json!({
        "packaged": false,
        "toolkit": "none",
        "operator": "agi ui --bind 127.0.0.1:8791",
        "reason": "No desktop window is linked. The operator remains the loopback page."
    })
}

pub fn pending() -> serde_json::Value {
    serde_json::json!({
        "authority": false,
        "deepinfer_engine": agi_coder_inference::engine_status(),
        "postgres": agi_coder_journal::postgres_status(),
        "transparency": agi_coder_wormgraph::transparency_status(),
        "gpu_tee": gpu_attestation(),
        "autonomy": agi_coder_cognition::production_deployment(),
        "hosted_ci": hosted_ci(),
        "desktop_shell": desktop_shell()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_reports_stay_unproven() {
        let report = pending();
        assert_eq!(report["authority"], false);
        assert_eq!(report["deepinfer_engine"]["weights_loaded"], false);
        assert_eq!(report["deepinfer_engine"]["native_generation"], false);
        assert_eq!(report["postgres"]["connected"], false);
        assert_eq!(report["transparency"]["published"], false);
        assert_eq!(report["gpu_tee"]["verified"], false);
        assert_eq!(report["autonomy"]["deployed"], false);
        assert_eq!(report["autonomy"]["editor"], false);
        assert_eq!(report["hosted_ci"]["executed"], false);
        assert_eq!(report["desktop_shell"]["packaged"], false);
    }
}
