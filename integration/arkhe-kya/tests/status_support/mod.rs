use arkhe_kya_experimental::{status::*, status_composition::passport_digest, Passport, LABEL};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signer, SigningKey};
use std::io::Write;

pub fn encode(raw: &[u8]) -> String {
    let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    gzip.write_all(raw).unwrap();
    format!("u{}", URL_SAFE_NO_PAD.encode(gzip.finish().unwrap()))
}
pub fn resign(e: &mut StatusEnvelope) {
    let principal = SigningKey::from_bytes(&[1; 32]);
    e.binding_signature = hex::encode(
        principal
            .sign(&binding_payload(&e.binding).unwrap())
            .to_bytes(),
    );
    if let Some(s) = &mut e.status_list {
        s.signature = hex::encode(principal.sign(&list_payload(&s.list).unwrap()).to_bytes());
    }
}
pub fn status(
    passport: &Passport,
    index: u32,
    raw: &[u8],
    purpose: StatusPurpose,
) -> StatusEnvelope {
    let mut e = StatusEnvelope {
        binding: PassportStatus {
            profile: STATUS_PROFILE.into(),
            label: LABEL.into(),
            issuer: passport.record.principal_did.clone(),
            passport_digest: passport_digest(passport).unwrap(),
            status_list_credential: "https://example.test/status/1".into(),
            status_list_index: index,
            status_purpose: purpose,
        },
        binding_signature: String::new(),
        status_list: Some(SignedStatusList {
            list: StatusList {
                profile: STATUS_PROFILE.into(),
                label: LABEL.into(),
                id: "https://example.test/status/1".into(),
                issuer: passport.record.principal_did.clone(),
                status_purpose: purpose,
                sequence: 7,
                valid_from: 1000,
                valid_until: 1500,
                encoded_list: encode(raw),
            },
            signature: String::new(),
        }),
    };
    resign(&mut e);
    e
}
