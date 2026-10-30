#[path = "../tests/status_support/mod.rs"]
mod status_support;
#[path = "../tests/support/mod.rs"]
mod support;
use arkhe_kya_experimental::*;

fn main() {
    let (passport, context) = support::fixture();
    let good = serde_json::to_string(&passport).unwrap();
    let context_json = serde_json::to_string(&context).unwrap();
    let mut bad = passport.clone();
    bad.agent_signature = "00".repeat(64);
    let cases: Vec<_> = [good.clone(), serde_json::to_string(&bad).unwrap(),
        good.replacen('{', "{\"unknown\":true,", 1)].into_iter().map(|input| {
        let native: serde_json::Value = serde_json::from_str(&verify_agent_integrity_record(&input, &context_json)).unwrap();
        serde_json::json!({"passport_json": input, "context_json": context_json, "native_result": native})
    }).collect();
    let mut raw = vec![0; 16384];
    let clear = status_support::status(&passport, 0, &raw, status::StatusPurpose::Revocation);
    raw[0] = 0x80;
    let revoked = status_support::status(&passport, 0, &raw, status::StatusPurpose::Revocation);
    let mut unavailable = clear.clone();
    unavailable.status_list = None;
    let clear_json = serde_json::to_string(&clear).unwrap();
    let policy_cases: Vec<_> = [policy::VerifierPolicy::default(), policy::VerifierPolicy {
        require_tee:true, ..policy::VerifierPolicy::default()
    }, policy::VerifierPolicy { minimum_status_sequence:8, ..policy::VerifierPolicy::default() }].into_iter().map(|p| {
        let policy_json = serde_json::to_string(&p).unwrap();
        serde_json::json!({"policy_json":policy_json,"status_json":clear_json,
            "native_result":policy::verify_under_policy(&good,&context_json,Some(&clear_json),&policy_json)})
    }).collect();
    let status_cases: Vec<_> = [clear, revoked, unavailable].into_iter().map(|envelope| {
        let input = serde_json::to_string(&envelope).unwrap();
        serde_json::json!({ "status_json":input,
            "native_result":status_composition::verify_with_status(&good,&context_json,&input,7,status::StatusPurpose::Revocation) })
    }).collect();
    println!(
        "{}",
        serde_json::json!({ "principal_challenge":principal::challenge(&good,&context_json).unwrap(), "passport": passport, "context": context, "cases": cases, "status_cases":status_cases, "policy_cases":policy_cases,
        "warning": "Public deterministic test keys; synthetic model bytes, not a real GGUF. No anchor was published." })
    );
}
