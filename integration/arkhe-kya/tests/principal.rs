mod support;
#[test]
fn principal_challenge_is_deterministic_and_requires_valid_receipt_context() {
    let (p, c) = support::fixture();
    let p = serde_json::to_string(&p).unwrap();
    let c = serde_json::to_string(&c).unwrap();
    let first = arkhe_kya_experimental::principal::challenge(&p, &c).unwrap();
    assert_eq!(
        first,
        arkhe_kya_experimental::principal::challenge(&p, &c).unwrap()
    );
    assert!(first.starts_with("ARKHE:KYA:PRINCIPAL:v1:"));
    assert!(arkhe_kya_experimental::principal::challenge("{}", &c).is_err());
    assert!(arkhe_kya_experimental::principal::challenge(
        &p,
        &c.replace("read:proof", "write:money")
    )
    .is_err());
}
