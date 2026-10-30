mod support;
use arkhe_kya_experimental::presentation::*;
#[test]
fn container_preserves_signed_receipt_but_rejects_embedded_trust_and_declarations() {
    let (p, c) = support::fixture();
    let presentation = Presentation {
        format: PRESENTATION_FORMAT.into(),
        label: "synthetic-poc".into(),
        receipt: p,
        status: None,
    };
    let json = serde_json::to_string(&presentation).unwrap();
    let (receipt, status) = Presentation::parse(&json).unwrap().parts().unwrap();
    assert!(status.is_none());
    assert!(arkhe_kya_experimental::verify(&receipt, &serde_json::to_string(&c).unwrap()).is_ok());
    for field in ["policy", "context", "declaration"] {
        assert!(
            Presentation::parse(&json.replacen('{', &format!("{{\"{field}\":{{}},"), 1)).is_err()
        );
    }
    assert!(Presentation::parse(&json.replacen(
        "\"format\":",
        "\"format\":\"duplicate\",\"format\":",
        1
    ))
    .is_err());
}
