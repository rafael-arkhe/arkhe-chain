mod status_support;
mod support;
use arkhe_kya_experimental::{policy::*, status::StatusPurpose};
fn run(policy: VerifierPolicy, revoked: bool, status_present: bool) -> serde_json::Value {
    let (p, c) = support::fixture();
    let mut bytes = vec![0; 16384];
    if revoked {
        bytes[0] = 0x80;
    }
    let status = serde_json::to_string(&status_support::status(
        &p,
        0,
        &bytes,
        StatusPurpose::Revocation,
    ))
    .unwrap();
    verify_under_policy(
        &serde_json::to_string(&p).unwrap(),
        &serde_json::to_string(&c).unwrap(),
        if status_present { Some(&status) } else { None },
        &serde_json::to_string(&policy).unwrap(),
    )
}
#[test]
fn policy_requires_tee_rejects_not_attested() {
    let r = run(
        VerifierPolicy {
            require_tee: true,
            ..VerifierPolicy::default()
        },
        false,
        true,
    );
    assert_eq!(r["decision"], "REJECT");
    assert!(r["reasons"]
        .as_array()
        .unwrap()
        .contains(&"runtime_not_attested".into()));
}
#[test]
fn policy_allows_not_attested_only_with_limitations() {
    let r = run(VerifierPolicy::default(), false, true);
    assert_eq!(r["decision"], "ACCEPT_WITH_LIMITATIONS");
    assert_eq!(r["authorization_granted"], false);
    assert_eq!(r["checks"]["principal_legal_identity"], "NOT_VERIFIED");
}
#[test]
fn optional_status_does_not_hide_revoked_evidence_and_default_requires_it() {
    assert_eq!(
        run(VerifierPolicy::default(), false, false)["decision"],
        "REJECT"
    );
    let p = VerifierPolicy {
        require_revocation_check: false,
        ..VerifierPolicy::default()
    };
    assert_eq!(
        run(p.clone(), false, false)["decision"],
        "ACCEPT_WITH_LIMITATIONS"
    );
    assert_eq!(run(p, true, true)["decision"], "REJECT");
}
#[test]
fn policy_freshness_and_unsupported_requirements_fail_closed() {
    assert_eq!(
        run(
            VerifierPolicy {
                minimum_status_sequence: 8,
                ..VerifierPolicy::default()
            },
            false,
            true
        )["decision"],
        "REJECT"
    );
    assert_eq!(
        run(
            VerifierPolicy {
                max_status_age_seconds: 149,
                ..VerifierPolicy::default()
            },
            false,
            true
        )["decision"],
        "REJECT"
    );
    assert_eq!(
        run(
            VerifierPolicy {
                require_icp_brasil: true,
                ..VerifierPolicy::default()
            },
            false,
            true
        )["decision"],
        "REJECT"
    );
    assert_eq!(
        run(
            VerifierPolicy {
                require_anchor: true,
                ..VerifierPolicy::default()
            },
            false,
            true
        )["decision"],
        "REJECT"
    );
}
#[test]
fn self_declared_success_cannot_replace_cryptographic_evidence() {
    let (_, c) = support::fixture();
    let forged = r#"{"declaration":{"credential_revocation":"not_revoked","runtime_model":"attested","principal_legal_identity":"ativa"}}"#;
    let r = verify_under_policy(
        forged,
        &serde_json::to_string(&c).unwrap(),
        None,
        &serde_json::to_string(&VerifierPolicy::default()).unwrap(),
    );
    assert_eq!(r["decision"], "REJECT");
}
