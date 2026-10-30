//! Domain-bound challenge for external principal CMS validation in the JS host.
use serde_json::json;

pub fn challenge(passport_json: &str, context_json: &str) -> Result<String, String> {
    crate::verify(passport_json, context_json)?;
    let passport: crate::Passport =
        serde_json::from_str(passport_json).map_err(|_| "INVALID_PASSPORT")?;
    let context: crate::Context =
        serde_json::from_str(context_json).map_err(|_| "INVALID_CONTEXT")?;
    let receipt_digest = crate::status_composition::passport_digest(&passport)?;
    let data = json!({"receipt_digest":receipt_digest,"audience":context.audience,"action":context.action,"challenge":context.challenge});
    let bytes = arkhe_kya_primitives::payload(b"ARKHE:KYA:PRINCIPAL-BINDING:v1\0", &data)?;
    Ok(format!(
        "ARKHE:KYA:PRINCIPAL:v1:{}",
        blake3::hash(&bytes).to_hex()
    ))
}

#[wasm_bindgen::prelude::wasm_bindgen]
pub fn principal_authorization_challenge(passport_json: &str, context_json: &str) -> String {
    match challenge(passport_json,context_json) {
        Ok(challenge)=>json!({"outcome":"CHALLENGE_READY","profile":crate::PROFILE,"label":crate::LABEL,"challenge":challenge}).to_string(),
        Err(reason)=>json!({"outcome":"NOT_VERIFIABLE","profile":crate::PROFILE,"label":crate::LABEL,"reason":reason}).to_string(),
    }
}
