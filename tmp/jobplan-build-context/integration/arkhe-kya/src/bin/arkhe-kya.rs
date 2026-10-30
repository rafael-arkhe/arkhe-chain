use std::{fs::File, io::Read};
mod state;
fn read(path: &str, limit: u64) -> Result<String, String> {
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| "FILE_UNAVAILABLE")?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "FILE_READ_FAILED")?;
    if bytes.len() as u64 > limit {
        return Err("FILE_TOO_LARGE".into());
    }
    String::from_utf8(bytes).map_err(|_| "INVALID_UTF8".into())
}
fn run() -> Result<serde_json::Value, String> {
    let a: Vec<_> = std::env::args().skip(1).collect();
    if a.len() == 2 && a[0] == "state-init" {
        state::initialize(&a[1])?;
        return Ok(
            serde_json::json!({"operation":"state-init","ok":true,"label":arkhe_kya_experimental::LABEL}),
        );
    }
    if a.len() == 5 && a[0] == "verify-presentation" {
        use arkhe_kya_experimental::{
            policy::{verify_under_policy, VerifierPolicy},
            presentation::Presentation,
        };
        let presentation = Presentation::parse(&read(&a[1], 160 * 1024)?)?;
        let context = read(&a[2], 4096)?;
        let mut policy: VerifierPolicy =
            serde_json::from_str(&read(&a[3], 4096)?).map_err(|_| "POLICY_INVALID")?;
        let mut state = state::Guard::open(&a[4])?;
        let (receipt, status) = presentation.parts()?;
        let scope = presentation
            .status
            .as_ref()
            .map(|e| {
                arkhe_kya_experimental::canonical(&serde_json::json!([
                    e.binding.issuer,
                    e.binding.status_list_credential,
                    e.binding.status_purpose
                ]))
                .map(|bytes| blake3::hash(&bytes).to_hex().to_string())
            })
            .transpose()?;
        if let Some(scope) = &scope {
            policy.minimum_status_sequence = policy.minimum_status_sequence.max(state.floor(scope));
        }
        let mut report = verify_under_policy(
            &receipt,
            &context,
            status.as_deref(),
            &serde_json::to_string(&policy).map_err(|_| "POLICY_INVALID")?,
        );
        if let (Some(scope), Some(envelope)) = (&scope, &presentation.status) {
            let before = state.floor(scope);
            // These outcomes only arise after authenticating the binding and list.
            // Retain a newer revoked snapshot too, despite rejecting the receipt.
            let authenticated = report["checks"]["status_observation"]["sequence"]
                .as_u64()
                .is_some()
                || report["checks"]["reason"] == "CredentialRevoked";
            if authenticated {
                let sequence = envelope
                    .status_list
                    .as_ref()
                    .ok_or("STATE_EVIDENCE_MISSING")?
                    .list
                    .sequence;
                state.advance(scope, sequence)?;
            }
            report["status_state"] = serde_json::json!({"persisted":true,"authenticated_snapshot":authenticated,"previous_floor":before,"current_floor":state.floor(scope),"scope_digest":scope});
        } else {
            report["status_state"] = serde_json::json!({"persisted":true,"status_observed":false});
        }
        report["presentation_format"] =
            arkhe_kya_experimental::presentation::PRESENTATION_FORMAT.into();
        return Ok(report);
    }
    if !(a.len() == 4 || a.len() == 5) || a[0] != "verify" {
        return Err("usage: arkhe-kya verify RECEIPT CONTEXT POLICY [STATUS_ENVELOPE] | state-init NEW_STATE | verify-presentation PRESENTATION CONTEXT POLICY STATE".into());
    }
    let p = read(&a[1], 32768)?;
    let c = read(&a[2], 4096)?;
    let policy = read(&a[3], 4096)?;
    let status = a.get(4).map(|path| read(path, 100000)).transpose()?;
    let mut report =
        arkhe_kya_experimental::policy::verify_under_policy(&p, &c, status.as_deref(), &policy);
    report["status_state"] = serde_json::json!({"persisted":false,"warning":"Stateless compatibility command; caller must persist its sequence floor."});
    Ok(report)
}
fn main() {
    let report = run().unwrap_or_else(|reason| {
        serde_json::json!({"decision":"REJECT", "profile":arkhe_kya_experimental::PROFILE,
        "label":arkhe_kya_experimental::LABEL, "reasons":[reason], "authorization_granted":false})
    });
    println!("{}", report);
    if report["decision"] != "ACCEPT_WITH_LIMITATIONS"
        && !(report["operation"] == "state-init" && report["ok"] == true)
    {
        std::process::exit(1);
    }
}
