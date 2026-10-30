use wasm_bindgen::prelude::*;

/// Offline cryptographic/claims check for the Arkhe Ed25519 ID-JAG profile.
/// The caller must supply trusted key/issuer/audience/client, current time and enforce
/// live registration revocation and replay separately. This function grants no authority.
#[wasm_bindgen]
pub fn verify_auth_assertion(
    token: &str,
    public_key_hex: &str,
    issuer: &str,
    kid: &str,
    audience: &str,
    client_id: &str,
    now: i64,
) -> Result<String, JsValue> {
    use arkhe_auth_md::token::{verify, TokenState, Trust, ID_JAG};
    let fail = |message: &str| JsValue::from_str(message);
    let bytes: [u8; 32] = hex::decode(public_key_hex)
        .map_err(|_| fail("invalid public key"))?
        .try_into()
        .map_err(|_| fail("invalid public key length"))?;
    let key =
        ed25519_dalek::VerifyingKey::from_bytes(&bytes).map_err(|_| fail("invalid public key"))?;
    let trust = Trust {
        issuer: issuer.into(),
        kid: kid.into(),
        key,
        audience: audience.into(),
        client_id: client_id.into(),
        max_lifetime: 600,
        max_auth_age: 3600,
    };
    let verified = verify(token, ID_JAG, &trust, now, &[], &mut TokenState::default())
        .map_err(|e| fail(&e.to_string()))?;
    Ok(verified.digest().to_hex())
}

#[wasm_bindgen]
pub fn blake3_hex(input: &[u8]) -> String {
    hex::encode(arkhe_verify_core::hash::blake3_256(input))
}

#[wasm_bindgen]
pub fn canonicalize_gguf_json(json: &str) -> Result<String, JsValue> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let bytes = arkhe_verify_core::gguf::canonical::canonicalize_metadata(&v)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(hex::encode(bytes))
}

#[wasm_bindgen]
pub fn canonicalize_c2pa_json(json: &str) -> Result<String, JsValue> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let bytes = arkhe_verify_core::c2pa::claim::canonicalize_claim_v2(&v)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(hex::encode(bytes))
}

/// Build the exact hex payload an Arkhe C2PA claim signer must sign. This only
/// prepares bytes; it does not sign, authenticate the signer or grant authority.
#[wasm_bindgen]
pub fn c2pa_claim_signing_payload(
    claim_json: &str,
    kid: &str,
    issuer: &str,
    alg: &str,
) -> Result<String, JsValue> {
    let claim: serde_json::Value =
        serde_json::from_str(claim_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let payload = arkhe_verify_core::c2pa::signature::signing_payload(&claim, kid, issuer, alg)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(hex::encode(payload))
}

/// Verify an Arkhe C2PA claim signature against pinned Ed25519 trust roots.
/// Standard C2PA/COSE validation, trust-root provenance and signer intent are
/// explicitly not performed by this profile.
#[wasm_bindgen]
pub fn verify_c2pa_claim_signature(
    envelope_json: &str,
    trust_roots_json: &str,
) -> Result<String, JsValue> {
    let result = arkhe_verify_core::c2pa::signature::verify(envelope_json, trust_roots_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Verify a BLAKE3 MMR proof offline; anchoring transport is not an authority.
#[wasm_bindgen]
pub fn verify_mmr(
    leaf: &[u8],
    leaf_count: u32,
    proof_json: &str,
    root: &[u8],
) -> Result<bool, JsValue> {
    let proof: Vec<arkhe_verify_core::mmr::ProofStep> =
        serde_json::from_str(proof_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let root: [u8; 32] = root
        .try_into()
        .map_err(|_| JsValue::from_str("root must be 32 bytes"))?;
    arkhe_verify_core::mmr::verify_proof(leaf, leaf_count as usize, &proof, &root)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
/// Synthetic CIN-like evidence only. Does not verify government identity or anchoring.
#[wasm_bindgen]
pub fn verify_gov_synthetic(
    credential: &[u8],
    bundle_json: &str,
    trusted_key_hex: &str,
) -> Result<bool, JsValue> {
    if bundle_json.len() > 16384 {
        return Err(JsValue::from_str("bundle too large"));
    }
    let bundle: arkhe_verify_core::gov::Bundle =
        serde_json::from_str(bundle_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let key: [u8; 32] = hex::decode(trusted_key_hex)
        .map_err(|_| JsValue::from_str("invalid trust key"))?
        .try_into()
        .map_err(|_| JsValue::from_str("invalid trust key length"))?;
    arkhe_verify_core::gov::verify(credential, &bundle, &key)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
/// Checks a synthetic lifecycle receipt against explicit host trust, time and challenge.
/// Does not validate native CIN/CMS signatures or fetch OCSP/CRLs.
#[wasm_bindgen]
pub fn verify_gov_lifecycle(
    receipt_json: &str,
    trust_json: &str,
    context_json: &str,
) -> Result<bool, JsValue> {
    if receipt_json.len() > 16384 || trust_json.len() > 4096 || context_json.len() > 4096 {
        return Err(JsValue::from_str("lifecycle input too large"));
    }
    let fail = |_| JsValue::from_str("invalid lifecycle JSON");
    let receipt = serde_json::from_str(receipt_json).map_err(fail)?;
    let trust = serde_json::from_str(trust_json).map_err(fail)?;
    let context = serde_json::from_str(context_json).map_err(fail)?;
    arkhe_verify_core::gov_lifecycle::verify(&receipt, &trust, &context)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
