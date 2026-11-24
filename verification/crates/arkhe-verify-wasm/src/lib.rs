use wasm_bindgen::prelude::*;

/// Native-host ABI for the same policy verifier used by the browser binding.
/// Context is authoritative host input, not part of the agent's request.
fn policy_check_bytes(request: &[u8], context: &[u8]) -> i32 {
    if request.len() > 1_048_576 || context.len() > 65_536 {
        return -1;
    }
    let Ok(request) = serde_json::from_slice(request) else {
        return -1;
    };
    let Ok(context) = serde_json::from_slice(context) else {
        return -1;
    };
    i32::from(arkhe_verify_core::policy::evaluate(&request, &context).is_ok())
}

#[wasm_bindgen]
pub fn verify_policy_request(request_json: &str, trusted_context_json: &str) -> i32 {
    policy_check_bytes(request_json.as_bytes(), trusted_context_json.as_bytes())
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn arkhe_policy_alloc(length: u32) -> u32 {
    if length == 0 || length > 1_048_576 {
        return 0;
    }
    Box::into_raw(vec![0u8; length as usize].into_boxed_slice()) as *mut u8 as u32
}

/// # Safety
/// Pointer/length must identify a still-live buffer returned by arkhe_policy_alloc.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn arkhe_policy_free(pointer: u32, length: u32) {
    if pointer != 0 {
        let slice = std::ptr::slice_from_raw_parts_mut(pointer as *mut u8, length as usize);
        drop(unsafe { Box::from_raw(slice) });
    }
}

/// # Safety
/// Both pointer/length pairs must identify live guest allocations of those lengths.
/// The native trusted loader owns these allocations and writes the context itself.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn arkhe_policy_check(
    request: u32,
    request_len: u32,
    context: u32,
    context_len: u32,
) -> i32 {
    if request == 0 || context == 0 || request_len > 1_048_576 || context_len > 65_536 {
        return -1;
    }
    let request = unsafe { std::slice::from_raw_parts(request as *const u8, request_len as usize) };
    let context = unsafe { std::slice::from_raw_parts(context as *const u8, context_len as usize) };
    policy_check_bytes(request, context)
}

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

fn absence_check(
    expectation_json: &str,
    window_index: u64,
    record_hash: &str,
    now: u64,
) -> Result<String, String> {
    if expectation_json.len() > 32_768 {
        return Err("expectation too large".into());
    }
    let spec: arkhe_verify_core::absence::ExpectationSpec =
        serde_json::from_str(expectation_json).map_err(|e| e.to_string())?;
    let verdict = arkhe_verify_core::absence::verify(&spec, window_index, record_hash, now)?;
    serde_json::to_string(&verdict).map_err(|e| e.to_string())
}

/// Offline check that `record_hash` is the AbsenceRecord of `window_index` for
/// this expectation. Does not re-derive that the window was silent.
#[wasm_bindgen]
pub fn verify_absence(
    expectation_json: &str,
    window_index: u64,
    record_hash: &str,
    now: u64,
) -> Result<String, JsValue> {
    absence_check(expectation_json, window_index, record_hash, now)
        .map_err(|m| JsValue::from_str(&m))
}

/// Authoritative Rust evaluation of raw Solana MessageV0 wire bytes against Arkhe swap policy.
/// Parses the v0 wire bytes, resolves static + ALT accounts, interprets compiled instructions,
/// and returns a JSON verdict (`ELEGÍVEL` | `BLOQUEADO` | `INCONCLUSIVO`) with accounting.
/// Never trusts pre-interpreted summaries from JS/TS and never signs or broadcasts transactions.
#[wasm_bindgen]
pub fn evaluate_solana_swap_message_v0(
    compiled_message_bytes: &[u8],
    context_json: &str,
) -> Result<String, JsValue> {
    if compiled_message_bytes.len() > 4096 || context_json.len() > 262_144 {
        return Err(JsValue::from_str("solana swap evaluation input too large"));
    }
    let ctx: arkhe_verify_core::solana_swap::EvaluationContext =
        serde_json::from_str(context_json)
            .map_err(|e| JsValue::from_str(&format!("invalid evaluation context JSON: {e}")))?;
    let eval = arkhe_verify_core::solana_swap::evaluate_message_v0(compiled_message_bytes, &ctx)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&eval).map_err(|e| JsValue::from_str(&e.to_string()))
}

fn compile_solana_swap_inner(request_json: &str) -> Result<String, String> {
    if request_json.len() > 262_144 {
        return Err("solana swap compile input too large".to_string());
    }
    let val: serde_json::Value = serde_json::from_str(request_json)
        .map_err(|e| format!("invalid compile request JSON: {e}"))?;
    let payer = val
        .get("payer")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "compile request missing 'payer' string".to_string())?;
    let recent_blockhash = val
        .get("recentBlockhash")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "compile request missing 'recentBlockhash' string".to_string())?;
    let raw_payload = val
        .get("swapInstructionsPayload")
        .ok_or_else(|| "compile request missing 'swapInstructionsPayload'".to_string())?;
    let alts: Vec<arkhe_verify_core::solana_swap::AddressLookupTableSnapshot> = match val
        .get("addressLookupTables")
    {
        Some(v) if !v.is_null() => serde_json::from_value(v.clone())
            .map_err(|e| format!("invalid 'addressLookupTables': {e}"))?,
        _ => Vec::new(),
    };
    let normalized = arkhe_verify_core::solana_swap::normalize_raw_0x_payload(raw_payload)?;
    let artifact = arkhe_verify_core::solana_swap::compile_solana_message_v0(
        payer,
        recent_blockhash,
        &normalized,
        &alts,
    )?;
    serde_json::to_string(&artifact).map_err(|e| e.to_string())
}

/// Pure-Rust Solana MessageV0 compiler exposed to JS/WASM (supports both camelCase fixtures
/// and real `api.0x.org` byte-array payloads plus Address Lookup Table compression).
#[wasm_bindgen]
pub fn compile_solana_swap_message_v0(request_json: &str) -> Result<String, JsValue> {
    compile_solana_swap_inner(request_json).map_err(|e| JsValue::from_str(&e))
}

fn reconcile_solana_swap_inner(request_json: &str) -> Result<String, String> {
    if request_json.len() > 262_144 {
        return Err("solana swap reconcile input too large".to_string());
    }
    let val: serde_json::Value = serde_json::from_str(request_json)
        .map_err(|e| format!("invalid reconcile request JSON: {e}"))?;
    let policy_val = val
        .get("policy")
        .ok_or_else(|| "reconcile request missing 'policy'".to_string())?;
    let policy: arkhe_verify_core::solana_swap::SolanaSwapPolicy =
        serde_json::from_value(policy_val.clone())
            .map_err(|e| format!("invalid 'policy': {e}"))?;
    let authorized_sha256 = val
        .get("authorizedSha256")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "reconcile request missing 'authorizedSha256' string".to_string())?;
    let authorized_blake3 = val
        .get("authorizedBlake3")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "reconcile request missing 'authorizedBlake3' string".to_string())?;
    let evidence_val = val
        .get("evidence")
        .ok_or_else(|| "reconcile request missing 'evidence'".to_string())?;
    let evidence: arkhe_verify_core::solana_swap::OnChainConfirmationEvidence =
        serde_json::from_value(evidence_val.clone())
            .map_err(|e| format!("invalid 'evidence': {e}"))?;
    let report = arkhe_verify_core::solana_swap::reconcile_solana_confirmation(
        &policy,
        authorized_sha256,
        authorized_blake3,
        &evidence,
    )?;
    serde_json::to_string(&report).map_err(|e| e.to_string())
}

/// Evidence #3: Post-execution on-chain confirmation verifier and policy reconciler in WASM.
#[wasm_bindgen]
pub fn reconcile_solana_swap_confirmation(request_json: &str) -> Result<String, JsValue> {
    reconcile_solana_swap_inner(request_json).map_err(|e| JsValue::from_str(&e))
}

#[cfg(test)]
mod absence_tests {
    use super::absence_check;
    use arkhe_verify_core::absence::ExpectationSpec;

    const SPEC: &str = r#"{"version":1,"expectation_id":"laravel:billing-cron:hourly",
        "module_id":"billing-cron","anchor_unix":1790000000,"period_secs":3600,"grace_secs":300,
        "policy_digest":"0707070707070707070707070707070707070707070707070707070707070707"}"#;

    /// The digest the auditor commits for a silent `window`.
    fn hash_for(window: u64) -> String {
        use arkhe_core::CanonicalEncode;
        let spec: ExpectationSpec = serde_json::from_str(SPEC).unwrap();
        let e = spec.expectation().unwrap();
        let now = 1_790_000_000 + (window + 1) * 3600 + 300;
        e.audit(window, now, &[]).unwrap()[0]
            .object_digest()
            .to_hex()
    }

    #[test]
    fn binding_matches_the_core_verifier() {
        let json = absence_check(SPEC, 2, &hash_for(2), 1_790_000_000 + 4 * 3600).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["status"], "VERIFIED");
        assert_eq!(v["silence_reverified"], false);
        assert!(absence_check(SPEC, 1, &hash_for(2), 1_790_000_000 + 4 * 3600).is_err());
        assert!(absence_check("{}", 2, &hash_for(2), 1_790_000_000 + 4 * 3600).is_err());
        assert!(absence_check(&" ".repeat(40_000), 2, "", 0).is_err());
    }

    #[test]
    fn wasm_solana_compile_and_reconcile_helpers_roundtrip() {
        use super::{compile_solana_swap_inner, reconcile_solana_swap_inner};
        use arkhe_verify_core::rfc9421::{base64_decode_strict, base64_encode};
        use arkhe_verify_core::solana_swap::base58_encode;

        let key = |s: u8| {
            let mut b = [s; 32];
            b[0] = s.wrapping_add(1);
            base58_encode(&b)
        };
        let taker = key(11);
        let taker_in = key(12);
        let recipient = key(13);
        let dest_ata = key(14);
        let in_mint = key(21);
        let out_mint = key(22);
        let swap_prog = key(31);
        let pool_in = key(41);
        let pool_out = key(42);
        let blockhash = base58_encode(&[77u8; 32]);
        let disc = [0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07, 0x08];
        let mut ix_data = Vec::new();
        ix_data.extend_from_slice(&disc);
        ix_data.extend_from_slice(&80_000_000u64.to_le_bytes());
        ix_data.extend_from_slice(&96_000_000u64.to_le_bytes());

        let compile_req = serde_json::json!({
            "payer": taker,
            "recentBlockhash": blockhash,
            "swapInstructionsPayload": {
                "network": "solana-mainnet-beta",
                "instructions": [{
                    "programId": swap_prog,
                    "accounts": [
                        { "pubkey": taker, "isSigner": true, "isWritable": true },
                        { "pubkey": taker_in, "isSigner": false, "isWritable": true },
                        { "pubkey": dest_ata, "isSigner": false, "isWritable": true },
                        { "pubkey": in_mint, "isSigner": false, "isWritable": false },
                        { "pubkey": out_mint, "isSigner": false, "isWritable": false },
                        { "pubkey": pool_in, "isSigner": false, "isWritable": true },
                        { "pubkey": pool_out, "isSigner": false, "isWritable": true },
                        { "pubkey": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "isSigner": false, "isWritable": false }
                    ],
                    "data": base64_encode(&ix_data)
                }]
            },
            "addressLookupTables": []
        });
        let compiled_json = compile_solana_swap_inner(&compile_req.to_string()).unwrap();
        let compiled: serde_json::Value = serde_json::from_str(&compiled_json).unwrap();
        let msg_b64 = compiled["compiledMessageBase64"].as_str().unwrap();
        assert_eq!(base64_decode_strict(msg_b64).unwrap()[0], 0x80);

        let reconcile_req = serde_json::json!({
            "policy": {
                "policyId": "wasm-reconcile-test",
                "network": "solana-mainnet-beta",
                "taker": taker,
                "takerInputTokenAccount": taker_in,
                "authorizedRecipient": recipient,
                "authorizedDestinationTokenAccount": dest_ata,
                "inputMint": in_mint,
                "outputMint": out_mint,
                "maxInputAssetDebit": "100000000",
                "maxSolAncillaryDebit": "3000000",
                "minOutputNetCredit": "95000000",
                "trustedAltAttesterKeys": {},
                "coveredSwapPrograms": {}
            },
            "authorizedSha256": compiled["sha256"],
            "authorizedBlake3": compiled["blake3"],
            "evidence": {
                "network": "solana-mainnet-beta",
                "signature": "5WasmReconcileTestSig1111111111111111111111111111111111111111111111",
                "slot": 310000050,
                "confirmationStatus": "finalized",
                "err": null,
                "compiledMessageBase64": msg_b64,
                "accountKeys": [taker, taker_in, dest_ata],
                "feeLamports": 5000,
                "preBalances": [1000000000, 2039280, 2039280],
                "postBalances": [999995000, 2039280, 2039280],
                "preTokenBalances": [
                    { "accountIndex": 1, "mint": in_mint, "owner": taker, "amount": "200000000" },
                    { "accountIndex": 2, "mint": out_mint, "owner": recipient, "amount": "0" }
                ],
                "postTokenBalances": [
                    { "accountIndex": 1, "mint": in_mint, "owner": taker, "amount": "120000000" },
                    { "accountIndex": 2, "mint": out_mint, "owner": recipient, "amount": "97000000" }
                ]
            }
        });
        let recon_json = reconcile_solana_swap_inner(&reconcile_req.to_string()).unwrap();
        let recon: serde_json::Value = serde_json::from_str(&recon_json).unwrap();
        assert_eq!(recon["status"], "CONFIRMED_WITHIN_POLICY");
        assert_eq!(recon["exactMessageMatch"], true);
        assert_eq!(recon["actualInputAssetDebit"], "80000000");
        assert_eq!(recon["actualOutputNetCredit"], "97000000");
    }
}
