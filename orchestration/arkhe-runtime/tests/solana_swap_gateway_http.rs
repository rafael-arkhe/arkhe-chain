#![cfg(feature = "sqlite-activation")]
//! End-to-end HTTP integration tests for `arkhe_runtime::solana_swap_gateway`.
//!
//! Exercises the complete Rust backend over Axum + SQLite WAL + `arkhe-verify-core`:
//! - Official 0x Mainnet Beta captured response (`provenance: "0x-official"`) verified under
//!   0x's production Ed25519 key (`0x-signing-key-prod-24092026`), blocked by Rust policy,
//!   and protected by durable SQLite WAL anti-replay across process restarts.
//! - Covered route with attested ALT -> `200 OK` (`ELEGÍVEL`) -> signing boundary rejects
//!   1-byte post-auth mutation (`0` key calls), accepts exact authorized bytes once
//!   (`real_signatures_produced == 0`, `broadcast_calls == 0`), and rejects replay across restart.
//! - Above-cap, benign-summary-vs-wire-destination mismatch, ALT index swap (`BLOQUEADO`),
//!   unattested ALT (`INCONCLUSIVO`), and offline `rbb::mmr` receipt bundle verification.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::Arc;

use arkhe_kernel::solana_swap_sqlite::SqliteSolanaSwapStore;
use arkhe_runtime::solana_swap_gateway::{
    build_mounted_router, reconcile_pending_once, router, verify_solana_swap_confirmation_receipt,
    verify_solana_swap_receipt_bundle, EvaluateSwapResponse, IsolatedSigningSink,
    SignedConfirmationReceipt, SigningBoundaryResponse, SigningSinkInvocation, SigningSinkOutcome,
    SolanaSwapGatewayState, SolanaSwapMountConfig, SolanaSwapOfflineBundle,
};
use arkhe_runtime::solana_swap_upstream::{
    AltObserverSigner, SolanaRpcReadOnlyClient, ZeroXSwapClient, ADDRESS_LOOKUP_TABLE_PROGRAM_ID,
};
use arkhe_verify_core::rfc9421::{
    base64_decode_strict, base64_encode, format_content_digest, official_0x_prod_keys,
    sign_0x_http_response, HttpRequestEvidence, HttpResponseEvidence,
};
use arkhe_verify_core::solana_swap::{
    base58_decode_32, base58_encode, canonical_alt_snapshot_bytes, normalize_raw_0x_payload,
    AddressLookupTableSnapshot, AltSnapshotAttestation, CoveredSwapProgramProfile,
    Raw0xAccountMeta, Raw0xInstruction, Raw0xSwapPayload, SolanaSwapPolicy,
};
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};
use tower::ServiceExt;

const TOKEN: &str = "solana-swap-gateway-test-token";
const GENESIS: &str = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TEST_0X_KEY_ID: &str = "0x-test-fixture-key-1";
const TEST_ALT_KEY_ID: &str = "alt-observer-test-1";
const DISC: [u8; 8] = [0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07, 0x08];
const FIXED_CREATED: i64 = 1_760_000_000;
const FIXED_NOW: i64 = 1_760_000_020;

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(prefix: &str) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "arkhe-solana-gw-{prefix}-{}-{n}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        Self { path: dir }
    }

    fn db_path(&self) -> PathBuf {
        self.path.join("solana-swap.sqlite")
    }
}

impl Drop for TestTempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn key_bytes(seed: u8) -> [u8; 32] {
    let mut out = [seed; 32];
    out[0] = seed.wrapping_add(1);
    out
}

fn auth_signer() -> SigningKey {
    SigningKey::from_bytes(&[21; 32])
}
fn receipt_signer() -> SigningKey {
    SigningKey::from_bytes(&[22; 32])
}
fn checkpoint_signer() -> SigningKey {
    SigningKey::from_bytes(&[23; 32])
}
fn test_0x_signer() -> SigningKey {
    SigningKey::from_bytes(&[24; 32])
}
fn alt_attester_signer() -> SigningKey {
    SigningKey::from_bytes(&[25; 32])
}

fn encode_compact_u16(mut v: u16, out: &mut Vec<u8>) {
    loop {
        let mut elem = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            out.push(elem);
            break;
        }
        elem |= 0x80;
        out.push(elem);
    }
}

fn build_wire_v0(
    header: (u8, u8, u8),
    static_keys: &[[u8; 32]],
    instructions: &[(u8, &[u8], &[u8])],
    lookups: &[([u8; 32], &[u8], &[u8])],
) -> Vec<u8> {
    let mut buf = vec![0x80, header.0, header.1, header.2];
    encode_compact_u16(static_keys.len() as u16, &mut buf);
    for k in static_keys {
        buf.extend_from_slice(k);
    }
    buf.extend_from_slice(&[77u8; 32]);
    encode_compact_u16(instructions.len() as u16, &mut buf);
    for (prog, accts, data) in instructions {
        buf.push(*prog);
        encode_compact_u16(accts.len() as u16, &mut buf);
        buf.extend_from_slice(accts);
        encode_compact_u16(data.len() as u16, &mut buf);
        buf.extend_from_slice(data);
    }
    encode_compact_u16(lookups.len() as u16, &mut buf);
    for (alt_key, w, r) in lookups {
        buf.extend_from_slice(alt_key);
        encode_compact_u16(w.len() as u16, &mut buf);
        buf.extend_from_slice(w);
        encode_compact_u16(r.len() as u16, &mut buf);
        buf.extend_from_slice(r);
    }
    buf
}

/// Compiles a normalized 0x instruction list into a valid Solana MessageV0 with static keys (no ALTs).
fn compile_static_wire_v0(payer: &str, payload: &Raw0xSwapPayload) -> Vec<u8> {
    let mut signers_w: Vec<String> = vec![payer.to_string()];
    let mut signers_r: Vec<String> = Vec::new();
    let mut unsign_w: Vec<String> = Vec::new();
    let mut unsign_r: Vec<String> = Vec::new();

    // Determine max privileges for every account
    let mut perms: BTreeMap<String, (bool, bool)> = BTreeMap::new();
    perms.insert(payer.to_string(), (true, true));
    for ix in &payload.instructions {
        perms.entry(ix.program_id.clone()).or_insert((false, false));
        for a in &ix.accounts {
            let entry = perms.entry(a.pubkey.clone()).or_insert((false, false));
            entry.0 |= a.is_signer;
            entry.1 |= a.is_writable;
        }
    }
    for (pk, (s, w)) in perms {
        if pk == payer {
            continue;
        }
        match (s, w) {
            (true, true) => signers_w.push(pk),
            (true, false) => signers_r.push(pk),
            (false, true) => unsign_w.push(pk),
            (false, false) => unsign_r.push(pk),
        }
    }

    let mut ordered_strs = Vec::new();
    ordered_strs.extend(signers_w.iter().cloned());
    ordered_strs.extend(signers_r.iter().cloned());
    ordered_strs.extend(unsign_w.iter().cloned());
    ordered_strs.extend(unsign_r.iter().cloned());

    let idx_of = |pk: &str| -> u8 {
        ordered_strs
            .iter()
            .position(|k| k == pk)
            .expect("key in static table") as u8
    };
    let static_keys: Vec<[u8; 32]> = ordered_strs
        .iter()
        .map(|s| base58_decode_32(s).expect("valid base58"))
        .collect();

    let mut compiled_ixs: Vec<(u8, Vec<u8>, Vec<u8>)> = Vec::new();
    for ix in &payload.instructions {
        let p_idx = idx_of(&ix.program_id);
        let acct_idxs: Vec<u8> = ix.accounts.iter().map(|a| idx_of(&a.pubkey)).collect();
        let data = base64_decode_strict(&ix.data).expect("valid ix base64");
        compiled_ixs.push((p_idx, acct_idxs, data));
    }
    let refs: Vec<(u8, &[u8], &[u8])> = compiled_ixs
        .iter()
        .map(|(p, a, d)| (*p, a.as_slice(), d.as_slice()))
        .collect();

    let num_req_sigs = (signers_w.len() + signers_r.len()) as u8;
    let num_ro_signed = signers_r.len() as u8;
    let num_ro_unsigned = unsign_r.len() as u8;
    build_wire_v0((num_req_sigs, num_ro_signed, num_ro_unsigned), &static_keys, &refs, &[])
}

fn make_attested_alt(alt_key: [u8; 32], addresses: Vec<String>) -> AddressLookupTableSnapshot {
    let attester = alt_attester_signer();
    let key_str = base58_encode(&alt_key);
    let slot = 310_000_000u64;
    let deact = u64::MAX;
    let canonical = canonical_alt_snapshot_bytes(
        "solana-mainnet-beta",
        GENESIS,
        &key_str,
        slot,
        deact,
        &addresses,
    )
    .unwrap();
    let sig = attester.sign(&canonical);
    AddressLookupTableSnapshot {
        key: key_str,
        network: Some("solana-mainnet-beta".to_string()),
        genesis_hash: Some(GENESIS.to_string()),
        slot: Some(slot),
        deactivation_slot: Some(deact.to_string()),
        addresses,
        attestation: Some(AltSnapshotAttestation {
            key_id: TEST_ALT_KEY_ID.to_string(),
            signature_hex: hex::encode(sig.to_bytes()),
        }),
    }
}

struct TestScenario {
    policy: SolanaSwapPolicy,
    alt_snapshot: AddressLookupTableSnapshot,
    taker: [u8; 32],
    taker_in_ata: [u8; 32],
    auth_dest_ata: [u8; 32],
    attacker_dest_ata: [u8; 32],
    input_mint: [u8; 32],
    output_mint: [u8; 32],
    swap_program: [u8; 32],
    pool_in: [u8; 32],
    pool_out: [u8; 32],
    alt_key: [u8; 32],
}

impl TestScenario {
    fn new() -> Self {
        let taker = key_bytes(11);
        let taker_in_ata = key_bytes(12);
        let auth_recipient = key_bytes(13);
        let auth_dest_ata = key_bytes(14);
        let attacker_dest_ata = key_bytes(99);
        let input_mint = key_bytes(21);
        let output_mint = key_bytes(22);
        let swap_program = key_bytes(31);
        let pool_in = key_bytes(41);
        let pool_out = key_bytes(42);
        let alt_key = key_bytes(51);

        let mut covered = BTreeMap::new();
        covered.insert(
            base58_encode(&swap_program),
            CoveredSwapProgramProfile {
                name: "CoveredDirectAmmV1".to_string(),
                discriminator_hex: hex::encode(DISC),
                guarantees: vec!["atomic debit <= amountIn and credit >= minAmountOut".to_string()],
            },
        );
        let mut alt_keys = BTreeMap::new();
        alt_keys.insert(
            TEST_ALT_KEY_ID.to_string(),
            hex::encode(alt_attester_signer().verifying_key().to_bytes()),
        );

        let policy = SolanaSwapPolicy {
            policy_id: "arkhe-http-solana-swap-v1".to_string(),
            network: "solana-mainnet-beta".to_string(),
            genesis_hash: Some(GENESIS.to_string()),
            taker: base58_encode(&taker),
            taker_input_token_account: base58_encode(&taker_in_ata),
            authorized_recipient: base58_encode(&auth_recipient),
            authorized_destination_token_account: base58_encode(&auth_dest_ata),
            input_mint: base58_encode(&input_mint),
            output_mint: base58_encode(&output_mint),
            max_input_asset_debit: "100000000".to_string(),
            max_sol_ancillary_debit: "3000000".to_string(),
            max_total_sol_debit: None,
            min_output_net_credit: "95000000".to_string(),
            trusted_alt_attester_keys: alt_keys,
            covered_swap_programs: covered,
            trusted_swap_guard_program: None,
        };

        let alt_snapshot = make_attested_alt(
            alt_key,
            vec![
                base58_encode(&pool_in),
                base58_encode(&pool_out),
                base58_encode(&input_mint),
                base58_encode(&output_mint),
                TOKEN_PROGRAM_ID.to_string(),
            ],
        );

        Self {
            policy,
            alt_snapshot,
            taker,
            taker_in_ata,
            auth_dest_ata,
            attacker_dest_ata,
            input_mint,
            output_mint,
            swap_program,
            pool_in,
            pool_out,
            alt_key,
        }
    }

    fn build_signed_exchange(
        &self,
        amount_in: u64,
        min_out: u64,
        wire_dest: [u8; 32],
        nonce: &str,
    ) -> (HttpRequestEvidence, HttpResponseEvidence, Vec<u8>) {
        let mut swap_data = Vec::new();
        swap_data.extend_from_slice(&DISC);
        swap_data.extend_from_slice(&amount_in.to_le_bytes());
        swap_data.extend_from_slice(&min_out.to_le_bytes());

        let wire = build_wire_v0(
            (1, 0, 1),
            &[self.taker, self.taker_in_ata, wire_dest, self.swap_program],
            &[(3, &[0, 1, 2, 6, 7, 4, 5, 8], &swap_data)],
            &[(self.alt_key, &[0, 1], &[2, 3, 4])],
        );

        let payload = Raw0xSwapPayload {
            network: Some("solana-mainnet-beta".to_string()),
            genesis_hash: Some(GENESIS.to_string()),
            address_lookup_table_addresses: vec![base58_encode(&self.alt_key)],
            instructions: vec![Raw0xInstruction {
                program_id: base58_encode(&self.swap_program),
                accounts: vec![
                    Raw0xAccountMeta { pubkey: base58_encode(&self.taker), is_signer: true, is_writable: true },
                    Raw0xAccountMeta { pubkey: base58_encode(&self.taker_in_ata), is_signer: false, is_writable: true },
                    Raw0xAccountMeta { pubkey: base58_encode(&self.auth_dest_ata), is_signer: false, is_writable: true },
                    Raw0xAccountMeta { pubkey: base58_encode(&self.input_mint), is_signer: false, is_writable: false },
                    Raw0xAccountMeta { pubkey: base58_encode(&self.output_mint), is_signer: false, is_writable: false },
                    Raw0xAccountMeta { pubkey: base58_encode(&self.pool_in), is_signer: false, is_writable: true },
                    Raw0xAccountMeta { pubkey: base58_encode(&self.pool_out), is_signer: false, is_writable: true },
                    Raw0xAccountMeta { pubkey: TOKEN_PROGRAM_ID.to_string(), is_signer: false, is_writable: false },
                ],
                data: base64_encode(&swap_data),
            }],
        };

        let req_body = serde_json::to_vec(&json!({
            "token_in": base58_encode(&self.input_mint),
            "token_out": base58_encode(&self.output_mint),
            "amount_in": amount_in,
            "taker": base58_encode(&self.taker),
            "nonce": nonce,
        }))
        .unwrap();
        let res_body = serde_json::to_vec(&payload).unwrap();

        let (req, res) = sign_0x_http_response(
            HttpRequestEvidence {
                method: "POST".to_string(),
                authority: "api.0x.org".to_string(),
                path: "/solana/swap-instructions".to_string(),
                query: Some("?".to_string()),
                headers: BTreeMap::new(),
                body_base64: base64_encode(&req_body),
            },
            HttpResponseEvidence {
                status: 200,
                headers: BTreeMap::new(),
                body_base64: base64_encode(&res_body),
            },
            &test_0x_signer(),
            TEST_0X_KEY_ID,
            FIXED_CREATED,
        )
        .unwrap();

        (req, res, wire)
    }
}

fn open_gateway(
    db_path: &Path,
    policy: SolanaSwapPolicy,
    trusted_0x_keys: BTreeMap<String, [u8; 32]>,
    clock: Arc<AtomicI64>,
) -> Arc<SolanaSwapGatewayState> {
    let store = SqliteSolanaSwapStore::open(db_path).expect("open sqlite store");
    let clock_fn = Arc::new(move || clock.load(Ordering::SeqCst));
    Arc::new(SolanaSwapGatewayState::new(
        store,
        TOKEN,
        policy,
        trusted_0x_keys,
        "auth-key-1",
        auth_signer(),
        "receipt-key-1",
        receipt_signer(),
        "checkpoint-key-1",
        checkpoint_signer(),
        clock_fn,
    ))
}

async fn post_json(app: &axum::Router, uri: &str, body: &Value, token: Option<&str>) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json");
    if let Some(t) = token {
        builder = builder.header("authorization", format!("Bearer {t}"));
    }
    let req = builder
        .body(Body::from(serde_json::to_vec(body).unwrap()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    (status, json)
}

async fn get_json(app: &axum::Router, uri: &str, token: Option<&str>) -> (StatusCode, Value) {
    let mut builder = Request::builder().method("GET").uri(uri);
    if let Some(t) = token {
        builder = builder.header("authorization", format!("Bearer {t}"));
    }
    let req = builder.body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    (status, json)
}

#[tokio::test]
async fn test_official_0x_capture_http_and_durable_replay_across_restart() {
    let raw = include_str!(
        "../../../integrations/solana-proof/fixtures/zerox-official-solana-swap-instructions.json"
    );
    let parsed: Value = serde_json::from_str(raw).unwrap();
    let req_ev: HttpRequestEvidence = serde_json::from_value(parsed["request"].clone()).unwrap();
    let res_ev: HttpResponseEvidence = serde_json::from_value(parsed["response"].clone()).unwrap();
    let created = parsed["verification"]["created"].as_i64().unwrap();
    let taker = parsed["request"]["bodyObj"]["taker"].as_str().unwrap().to_string();
    let input_mint = parsed["request"]["bodyObj"]["token_in"].as_str().unwrap().to_string();
    let output_mint = parsed["request"]["bodyObj"]["token_out"].as_str().unwrap().to_string();

    let raw_res_bytes = base64_decode_strict(&res_ev.body_base64).unwrap();
    let raw_res_json: Value = serde_json::from_slice(&raw_res_bytes).unwrap();
    let normalized = normalize_raw_0x_payload(&raw_res_json).unwrap();
    let compiled_wire = compile_static_wire_v0(&taker, &normalized);

    // Derive taker USDC ATA from instruction #0 (accounts[1]) and taker wSOL ATA from instruction #2 (accounts[0])
    let taker_output_ata = normalized.instructions[0].accounts[1].pubkey.clone();
    let taker_input_ata = normalized.instructions[2].accounts[0].pubkey.clone();

    let policy = SolanaSwapPolicy {
        policy_id: "arkhe-official-0x-gateway-policy".to_string(),
        network: "solana-mainnet-beta".to_string(),
        genesis_hash: Some(GENESIS.to_string()),
        taker: taker.clone(),
        taker_input_token_account: taker_input_ata,
        authorized_recipient: taker,
        authorized_destination_token_account: taker_output_ata,
        input_mint,
        output_mint,
        max_input_asset_debit: "50000000".to_string(),
        max_sol_ancillary_debit: "3000000".to_string(),
        max_total_sol_debit: Some("53000000".to_string()),
        min_output_net_credit: "7000000".to_string(),
        trusted_alt_attester_keys: BTreeMap::new(),
        covered_swap_programs: BTreeMap::new(),
        trusted_swap_guard_program: None,
    };

    let tmp = TestTempDir::new("official-0x");
    let clock = Arc::new(AtomicI64::new(created + 5));
    let state = open_gateway(&tmp.db_path(), policy.clone(), official_0x_prod_keys(), clock.clone());
    let app = router(state.clone());

    // 1. Official 0x response verified under official prod key, blocked by Rust policy (0 key calls)
    let eval_body = json!({
        "caseId": "official-0x-http-eval",
        "provenance": "0x-official",
        "request": req_ev,
        "response": res_ev,
        "compiledMessageBase64": base64_encode(&compiled_wire),
        "addressLookupTables": [],
    });
    let (status, body) = post_json(&app, "/v1/solana/swap/evaluate", &eval_body, Some(TOKEN)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let resp: EvaluateSwapResponse = serde_json::from_value(body).unwrap();
    assert_eq!(resp.provenance, "0x-official");
    assert!(resp.http_signature_valid);
    assert_eq!(resp.policy_verdict, "BLOQUEADO");
    assert_eq!(resp.reason_code, "UNAUTHORIZED_ATA_CREATION");
    let eval = resp.receipt.evaluation.as_ref().expect("evaluation present");
    assert!(eval.violations.iter().any(|v| v.code == "INPUT_ASSET_CAP_EXCEEDED"));
    assert_eq!(eval.instruction_analysis[2]["kind"], "ZeroXSettler.UnverifiedCpiRoute");
    assert_eq!(eval.instruction_analysis[2]["zidHex"], "0x2aa3c060be30ef0ae6d00945");
    assert_eq!(eval.instruction_analysis[2]["declaredAmountIn"], "100000000");
    assert_eq!(eval.instruction_analysis[2]["declaredMinAmountOut"], "7217315");
    assert_eq!(eval.instruction_analysis[2]["cpiAuditStatus"], "UNVERIFIED_EXTERNAL_CPI");
    assert!(resp.authorization.is_none());
    assert_eq!(resp.test_signer_calls, 0);
    assert_eq!(resp.real_signatures_produced, 0);
    assert_eq!(resp.broadcast_calls, 0);

    // 2. Fetch offline bundle via GET and verify Ed25519 + rbb::mmr inclusion offline
    let (b_status, b_json) = get_json(
        &app,
        &format!("/v1/solana/swap/receipts/{}/bundle", resp.receipt_id),
        Some(TOKEN),
    )
    .await;
    assert_eq!(b_status, StatusCode::OK);
    let bundle: SolanaSwapOfflineBundle = serde_json::from_value(b_json).unwrap();
    verify_solana_swap_receipt_bundle(
        &bundle,
        &auth_signer().verifying_key(),
        &receipt_signer().verifying_key(),
        &checkpoint_signer().verifying_key(),
    )
    .expect("official 0x receipt bundle must verify offline");

    // 1-bit tamper on bundle must fail offline verification
    let mut tampered = bundle.clone();
    tampered.receipt.reason_code = "TAMPERED".to_string();
    assert!(verify_solana_swap_receipt_bundle(
        &tampered,
        &auth_signer().verifying_key(),
        &receipt_signer().verifying_key(),
        &checkpoint_signer().verifying_key(),
    )
    .is_err());

    // 3. Reopen SQLite WAL database (simulating process restart) and prove replay is STILL blocked!
    drop(app);
    drop(state);
    clock.store(created + 10, Ordering::SeqCst);
    let reopened_state = open_gateway(&tmp.db_path(), policy, official_0x_prod_keys(), clock.clone());
    let reopened_app = router(reopened_state);

    let (r_status, r_body) =
        post_json(&reopened_app, "/v1/solana/swap/evaluate", &eval_body, Some(TOKEN)).await;
    assert_eq!(r_status, StatusCode::FORBIDDEN);
    let replay_resp: EvaluateSwapResponse = serde_json::from_value(r_body).unwrap();
    assert!(!replay_resp.http_signature_valid);
    assert_eq!(replay_resp.reason_code, "RESPONSE_REPLAY_DETECTED");
    assert!(replay_resp.authorization.is_none());

    // 4. Swapped request with recomputed Content-Digest -> INVALID_0X_ED25519_SIGNATURE
    let mut swapped_req = req_ev.clone();
    let new_req_body = br#"{"token_in":"So11111111111111111111111111111111111111112","amount_in":50000000}"#;
    swapped_req.body_base64 = base64_encode(new_req_body);
    swapped_req
        .headers
        .insert("content-digest".to_string(), format_content_digest(new_req_body));
    let (sw_status, sw_body) = post_json(
        &reopened_app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "official-0x-swapped-req",
            "provenance": "0x-official",
            "request": swapped_req,
            "response": res_ev,
            "compiledMessageBase64": base64_encode(&compiled_wire),
            "addressLookupTables": [],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(sw_status, StatusCode::FORBIDDEN);
    assert_eq!(sw_body["reasonCode"], "INVALID_0X_ED25519_SIGNATURE");

    // 5. Altered official response body keeping headers & signature -> RESPONSE_BODY_DIGEST_MISMATCH
    let mut tampered_res = res_ev.clone();
    let mut altered = base64_decode_strict(&res_ev.body_base64).unwrap();
    let last = altered.len() - 2;
    altered[last] ^= 0x01;
    tampered_res.body_base64 = base64_encode(&altered);
    let (tr_status, tr_body) = post_json(
        &reopened_app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "official-0x-tampered-res",
            "provenance": "0x-official",
            "request": req_ev,
            "response": tampered_res,
            "compiledMessageBase64": base64_encode(&compiled_wire),
            "addressLookupTables": [],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(tr_status, StatusCode::FORBIDDEN);
    assert_eq!(tr_body["reasonCode"], "RESPONSE_BODY_DIGEST_MISMATCH");
}

#[tokio::test]
async fn test_eligible_route_signing_boundary_tamper_and_single_use_across_restart() {
    let sc = TestScenario::new();
    let tmp = TestTempDir::new("eligible-boundary");
    let clock = Arc::new(AtomicI64::new(FIXED_NOW));
    let mut keys = BTreeMap::new();
    keys.insert(
        TEST_0X_KEY_ID.to_string(),
        test_0x_signer().verifying_key().to_bytes(),
    );

    let state = open_gateway(&tmp.db_path(), sc.policy.clone(), keys.clone(), clock.clone());
    let app = router(state.clone());

    let (req_ev, res_ev, wire) = sc.build_signed_exchange(80_000_000, 96_000_000, sc.auth_dest_ata, "e1");
    let (status, body) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "case-5-http-eligible",
            "provenance": "test-fixture",
            "request": req_ev,
            "response": res_ev,
            "compiledMessageBase64": base64_encode(&wire),
            "addressLookupTables": [sc.alt_snapshot],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let eval_resp: EvaluateSwapResponse = serde_json::from_value(body).unwrap();
    assert_eq!(eval_resp.policy_verdict, "ELEGÍVEL");
    let auth = eval_resp.authorization.expect("ELEGÍVEL must issue authorization");

    // 1. Mutate 1 byte of MessageV0 AFTER authorization -> signing boundary rejects BEFORE key (0 calls)
    let mut tampered_wire = wire.clone();
    let last = tampered_wire.len() - 1;
    tampered_wire[last] ^= 0x01;
    let (m_status, m_body) = post_json(
        &app,
        "/v1/solana/swap/signing-boundary",
        &json!({
            "compiledMessageBase64": base64_encode(&tampered_wire),
            "authorization": auth,
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(m_status, StatusCode::FORBIDDEN);
    let m_resp: SigningBoundaryResponse = serde_json::from_value(m_body).unwrap();
    assert!(!m_resp.accepted);
    assert_eq!(
        m_resp.reject_code.as_deref(),
        Some("MESSAGE_DIGEST_MISMATCH_AFTER_AUTHORIZATION")
    );
    assert_eq!(m_resp.test_signer_calls, 0);

    // 2. Submit EXACT authorized MessageV0 -> accepted once in dry-run (0 real sigs, 0 broadcasts)
    let (ok_status, ok_body) = post_json(
        &app,
        "/v1/solana/swap/signing-boundary",
        &json!({
            "compiledMessageBase64": base64_encode(&wire),
            "authorization": auth,
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(ok_status, StatusCode::OK);
    let ok_resp: SigningBoundaryResponse = serde_json::from_value(ok_body).unwrap();
    assert!(ok_resp.accepted);
    assert!(ok_resp.exact_message_match);
    assert_eq!(ok_resp.test_signer_calls, 1);
    assert_eq!(ok_resp.real_signatures_produced, 0);
    assert_eq!(ok_resp.broadcast_calls, 0);

    // 3. Reopen SQLite WAL database and prove single-use authorization cannot be replayed across restarts!
    drop(app);
    drop(state);
    let reopened = open_gateway(&tmp.db_path(), sc.policy.clone(), keys, clock);
    let reopened_app = router(reopened);

    let (dup_status, dup_body) = post_json(
        &reopened_app,
        "/v1/solana/swap/signing-boundary",
        &json!({
            "compiledMessageBase64": base64_encode(&wire),
            "authorization": auth,
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(dup_status, StatusCode::FORBIDDEN);
    let dup_resp: SigningBoundaryResponse = serde_json::from_value(dup_body).unwrap();
    assert!(!dup_resp.accepted);
    assert_eq!(dup_resp.reject_code.as_deref(), Some("AUTHORIZATION_ALREADY_CONSUMED"));
    assert_eq!(dup_resp.test_signer_calls, 0);

    // 4. Fetch offline bundle after restart and verify rbb::mmr + Ed25519 offline
    let (b_status, b_json) = get_json(
        &reopened_app,
        &format!("/v1/solana/swap/receipts/{}/bundle", eval_resp.receipt_id),
        Some(TOKEN),
    )
    .await;
    assert_eq!(b_status, StatusCode::OK);
    let bundle: SolanaSwapOfflineBundle = serde_json::from_value(b_json).unwrap();
    verify_solana_swap_receipt_bundle(
        &bundle,
        &auth_signer().verifying_key(),
        &receipt_signer().verifying_key(),
        &checkpoint_signer().verifying_key(),
    )
    .expect("eligible receipt bundle must verify offline after restart");
}

#[tokio::test]
async fn test_http_policy_blocks_above_cap_wire_mismatch_alt_swap_and_marks_unattested_inconclusive() {
    let sc = TestScenario::new();
    let tmp = TestTempDir::new("matrix");
    let clock = Arc::new(AtomicI64::new(FIXED_NOW));
    let mut keys = BTreeMap::new();
    keys.insert(
        TEST_0X_KEY_ID.to_string(),
        test_0x_signer().verifying_key().to_bytes(),
    );

    let state = open_gateway(&tmp.db_path(), sc.policy.clone(), keys, clock);
    let app = router(state.clone());

    // 0. Unauthenticated request rejected with 401
    let (unauth_status, _) = get_json(&app, "/v1/solana/swap/health", None).await;
    assert_eq!(unauth_status, StatusCode::UNAUTHORIZED);

    // 1. Above spend cap -> 403 BLOQUEADO (INPUT_ASSET_CAP_EXCEEDED)
    let (r1, s1, w1) = sc.build_signed_exchange(250_000_000, 240_000_000, sc.auth_dest_ata, "c1");
    let (st1, b1) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "case-1-above-cap-signed-test-fixture",
            "provenance": "test-fixture",
            "request": r1,
            "response": s1,
            "compiledMessageBase64": base64_encode(&w1),
            "addressLookupTables": [sc.alt_snapshot],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(st1, StatusCode::FORBIDDEN);
    assert_eq!(b1["httpSignatureValid"], true);
    assert_eq!(b1["reasonCode"], "INPUT_ASSET_CAP_EXCEEDED");
    assert!(b1["authorization"].is_null());

    // 2. Benign 0x payload, tampered wire destination -> 403 BLOQUEADO
    let (r2, s2, w2) = sc.build_signed_exchange(80_000_000, 96_000_000, sc.attacker_dest_ata, "c2");
    let (st2, b2) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "case-6-wire-destination-mismatch",
            "provenance": "test-fixture",
            "request": r2,
            "response": s2,
            "compiledMessageBase64": base64_encode(&w2),
            "addressLookupTables": [sc.alt_snapshot],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(st2, StatusCode::FORBIDDEN);
    assert_eq!(b2["policyVerdict"], "BLOQUEADO");
    assert!(b2["authorization"].is_null());

    // 3. Fixed wire bytes, swapped ALT index address -> 403 BLOQUEADO (ALT_SNAPSHOT_ATTESTATION_INVALID)
    let (r3, s3, w3) = sc.build_signed_exchange(80_000_000, 96_000_000, sc.auth_dest_ata, "c3");
    let mut bad_alt = sc.alt_snapshot.clone();
    bad_alt.addresses[3] = base58_encode(&key_bytes(88));
    let (st3, b3) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "case-11-alt-snapshot-index-swapped-blocked",
            "provenance": "test-fixture",
            "request": r3,
            "response": s3,
            "compiledMessageBase64": base64_encode(&w3),
            "addressLookupTables": [bad_alt],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(st3, StatusCode::FORBIDDEN);
    assert_eq!(b3["reasonCode"], "ALT_SNAPSHOT_ATTESTATION_INVALID");
    assert!(b3["authorization"].is_null());

    // 4. Fixed wire bytes, unattested ALT snapshot -> 422 INCONCLUSIVO (UNATTESTED_ALT_SNAPSHOT)
    let (r4, s4, w4) = sc.build_signed_exchange(80_000_000, 96_000_000, sc.auth_dest_ata, "c4");
    let mut unattested_alt = sc.alt_snapshot.clone();
    unattested_alt.attestation = None;
    let (st4, b4) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "case-12-alt-snapshot-unattested-inconclusive",
            "provenance": "test-fixture",
            "request": r4,
            "response": s4,
            "compiledMessageBase64": base64_encode(&w4),
            "addressLookupTables": [unattested_alt],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(st4, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(b4["policyVerdict"], "INCONCLUSIVO");
    assert_eq!(b4["reasonCode"], "UNATTESTED_ALT_SNAPSHOT");
    assert!(b4["authorization"].is_null());

    // 5. Health endpoint reports exact durable counts and 0 key calls
    let (h_status, health) = get_json(&app, "/v1/solana/swap/health", Some(TOKEN)).await;
    assert_eq!(h_status, StatusCode::OK);
    assert_eq!(health["receiptCount"], 4);
    assert_eq!(health["consumed0xResponses"], 4);
    assert_eq!(health["issuedAuthorizations"], 0);
    assert_eq!(health["signingBoundaryEvents"], 0);
    assert_eq!(health["testSignerCalls"], 0);
    assert_eq!(health["realSignaturesProduced"], 0);
    assert_eq!(health["broadcastCalls"], 0);
    assert!(health["mmrRootHex"].as_str().is_some());
}

#[tokio::test]
async fn test_public_keys_receipts_boundary_events_verify_bundle_body_limit_and_cli() {
    let sc = TestScenario::new();
    let tmp = TestTempDir::new("full-backend");
    let clock = Arc::new(AtomicI64::new(FIXED_NOW));
    let mut keys = BTreeMap::new();
    keys.insert(
        TEST_0X_KEY_ID.to_string(),
        test_0x_signer().verifying_key().to_bytes(),
    );

    let state = open_gateway(&tmp.db_path(), sc.policy.clone(), keys.clone(), clock.clone());
    let app = router(state.clone());

    // 1. GET /v1/solana/swap/public-keys (requires auth)
    let (unauth_pk, _) = get_json(&app, "/v1/solana/swap/public-keys", None).await;
    assert_eq!(unauth_pk, StatusCode::UNAUTHORIZED);

    let (pk_status, pk_json) = get_json(&app, "/v1/solana/swap/public-keys", Some(TOKEN)).await;
    assert_eq!(pk_status, StatusCode::OK);
    assert_eq!(
        pk_json["authPublicKeyHex"],
        hex::encode(auth_signer().verifying_key().to_bytes())
    );
    assert_eq!(
        pk_json["receiptPublicKeyHex"],
        hex::encode(receipt_signer().verifying_key().to_bytes())
    );
    assert_eq!(
        pk_json["checkpointPublicKeyHex"],
        hex::encode(checkpoint_signer().verifying_key().to_bytes())
    );
    assert_eq!(pk_json["trusted0xKeyIds"], json!([TEST_0X_KEY_ID]));

    // 2. Produce two receipts (1 blocked above-cap, 1 eligible)
    let (r1, s1, w1) = sc.build_signed_exchange(250_000_000, 240_000_000, sc.auth_dest_ata, "fb1");
    let (st1, b1) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "full-backend-blocked",
            "provenance": "test-fixture",
            "request": r1,
            "response": s1,
            "compiledMessageBase64": base64_encode(&w1),
            "addressLookupTables": [sc.alt_snapshot],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(st1, StatusCode::FORBIDDEN);
    let blocked_receipt_id = b1["receiptId"].as_str().unwrap().to_string();

    let (r2, s2, w2) = sc.build_signed_exchange(80_000_000, 96_000_000, sc.auth_dest_ata, "fb2");
    let (st2, b2) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "full-backend-eligible",
            "provenance": "test-fixture",
            "request": r2,
            "response": s2,
            "compiledMessageBase64": base64_encode(&w2),
            "addressLookupTables": [sc.alt_snapshot],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(st2, StatusCode::OK);
    let eval_resp: EvaluateSwapResponse = serde_json::from_value(b2).unwrap();
    let auth = eval_resp.authorization.clone().unwrap();
    let auth_id = auth.payload.auth_id.clone();

    // 3. Exercise signing boundary: 1-byte tamper (rejected) -> exact bytes (accepted) -> replay after restart (rejected)
    let mut bad_wire = w2.clone();
    bad_wire[0] ^= 0x01;
    let (tb_st, _) = post_json(
        &app,
        "/v1/solana/swap/signing-boundary",
        &json!({
            "compiledMessageBase64": base64_encode(&bad_wire),
            "authorization": auth,
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(tb_st, StatusCode::FORBIDDEN);

    let (ok_st, _) = post_json(
        &app,
        "/v1/solana/swap/signing-boundary",
        &json!({
            "compiledMessageBase64": base64_encode(&w2),
            "authorization": auth,
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(ok_st, StatusCode::OK);

    // Reopen SQLite WAL to verify durability of receipts + signing boundary audit log
    drop(app);
    drop(state);
    let reopened = open_gateway(&tmp.db_path(), sc.policy.clone(), keys, clock);
    let reopened_app = router(reopened);

    let (rep_st, _) = post_json(
        &reopened_app,
        "/v1/solana/swap/signing-boundary",
        &json!({
            "compiledMessageBase64": base64_encode(&w2),
            "authorization": auth,
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(rep_st, StatusCode::FORBIDDEN);

    // 4. GET /v1/solana/swap/signing-boundary/events?authId=... survives SQLite reopen with all 3 events
    let (ev_st, ev_json) = get_json(
        &reopened_app,
        &format!("/v1/solana/swap/signing-boundary/events?authId={auth_id}"),
        Some(TOKEN),
    )
    .await;
    assert_eq!(ev_st, StatusCode::OK);
    assert_eq!(ev_json["count"], 3);
    let events = ev_json["events"].as_array().unwrap();
    assert_eq!(events[0]["accepted"], false);
    assert_eq!(
        events[0]["rejectCode"],
        "MESSAGE_DIGEST_MISMATCH_AFTER_AUTHORIZATION"
    );
    assert_eq!(events[1]["accepted"], true);
    assert!(events[1]["rejectCode"].is_null());
    assert_eq!(events[2]["accepted"], false);
    assert_eq!(events[2]["rejectCode"], "AUTHORIZATION_ALREADY_CONSUMED");

    // 5. GET /v1/solana/swap/receipts pagination
    let (p1_st, p1_json) = get_json(
        &reopened_app,
        "/v1/solana/swap/receipts?limit=1&offset=0",
        Some(TOKEN),
    )
    .await;
    assert_eq!(p1_st, StatusCode::OK);
    assert_eq!(p1_json["total"], 2);
    assert_eq!(p1_json["receipts"].as_array().unwrap().len(), 1);
    assert_eq!(p1_json["receipts"][0]["receiptId"], blocked_receipt_id);

    let (p2_st, p2_json) = get_json(
        &reopened_app,
        "/v1/solana/swap/receipts?limit=1&offset=1",
        Some(TOKEN),
    )
    .await;
    assert_eq!(p2_st, StatusCode::OK);
    assert_eq!(p2_json["total"], 2);
    assert_eq!(p2_json["receipts"].as_array().unwrap().len(), 1);
    assert_eq!(p2_json["receipts"][0]["receiptId"], eval_resp.receipt_id);

    // 6. POST /v1/solana/swap/verify-bundle (valid -> 200, tampered -> 422)
    let (b_st, bundle_json) = get_json(
        &reopened_app,
        &format!("/v1/solana/swap/receipts/{}/bundle", eval_resp.receipt_id),
        Some(TOKEN),
    )
    .await;
    assert_eq!(b_st, StatusCode::OK);

    let (vb_ok_st, vb_ok_json) = post_json(
        &reopened_app,
        "/v1/solana/swap/verify-bundle",
        &bundle_json,
        Some(TOKEN),
    )
    .await;
    assert_eq!(vb_ok_st, StatusCode::OK);
    assert_eq!(vb_ok_json["valid"], true);
    assert!(vb_ok_json["error"].is_null());

    let mut tampered_bundle = bundle_json.clone();
    tampered_bundle["receipt"]["reasonCode"] = json!("TAMPERED");
    let (vb_bad_st, vb_bad_json) = post_json(
        &reopened_app,
        "/v1/solana/swap/verify-bundle",
        &tampered_bundle,
        Some(TOKEN),
    )
    .await;
    assert_eq!(vb_bad_st, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(vb_bad_json["valid"], false);
    assert!(vb_bad_json["error"].as_str().is_some());

    // 7. DefaultBodyLimit rejects > 1 MiB payloads with 413 PAYLOAD_TOO_LARGE
    let oversized = vec![b'a'; 1024 * 1024 + 128];
    let big_req = Request::builder()
        .method("POST")
        .uri("/v1/solana/swap/evaluate")
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {TOKEN}"))
        .body(Body::from(oversized))
        .unwrap();
    let big_resp = reopened_app.clone().oneshot(big_req).await.unwrap();
    assert_eq!(big_resp.status(), StatusCode::PAYLOAD_TOO_LARGE);

    // 8. Standalone CLI binary: verify-bundle (valid + tampered) & fail-closed serve without token
    let bin = env!("CARGO_BIN_EXE_arkhe-solana-swap-gateway");
    let pk_path = tmp.path.join("public-keys.json");
    let bundle_path = tmp.path.join("bundle.json");
    let bad_bundle_path = tmp.path.join("bundle-tampered.json");
    let policy_path = tmp.path.join("policy.json");
    std::fs::write(&pk_path, serde_json::to_vec_pretty(&pk_json).unwrap()).unwrap();
    std::fs::write(&bundle_path, serde_json::to_vec_pretty(&bundle_json).unwrap()).unwrap();
    std::fs::write(
        &bad_bundle_path,
        serde_json::to_vec_pretty(&tampered_bundle).unwrap(),
    )
    .unwrap();
    std::fs::write(&policy_path, serde_json::to_vec_pretty(&sc.policy).unwrap()).unwrap();

    let cli_ok = std::process::Command::new(bin)
        .args([
            "verify-bundle",
            "--bundle",
            bundle_path.to_str().unwrap(),
            "--public-keys",
            pk_path.to_str().unwrap(),
        ])
        .output()
        .expect("run arkhe-solana-swap-gateway verify-bundle");
    assert!(
        cli_ok.status.success(),
        "verify-bundle CLI failed: {}",
        String::from_utf8_lossy(&cli_ok.stderr)
    );
    let cli_out: Value = serde_json::from_slice(&cli_ok.stdout).unwrap();
    assert_eq!(cli_out["verified"], true);
    assert_eq!(cli_out["realSignaturesProduced"], 0);
    assert_eq!(cli_out["broadcastCalls"], 0);

    let cli_bad = std::process::Command::new(bin)
        .args([
            "verify-bundle",
            "--bundle",
            bad_bundle_path.to_str().unwrap(),
            "--public-keys",
            pk_path.to_str().unwrap(),
        ])
        .output()
        .expect("run arkhe-solana-swap-gateway verify-bundle tampered");
    assert!(!cli_bad.status.success());

    let cli_no_token = std::process::Command::new(bin)
        .env_remove("ARKHE_SOLANA_SWAP_TOKEN")
        .args([
            "serve",
            "--db",
            tmp.path.join("failclosed.sqlite").to_str().unwrap(),
            "--policy",
            policy_path.to_str().unwrap(),
        ])
        .output()
        .expect("run arkhe-solana-swap-gateway serve without token");
    assert!(!cli_no_token.status.success());
    assert!(
        String::from_utf8_lossy(&cli_no_token.stderr).contains("ARKHE_SOLANA_SWAP_TOKEN"),
        "expected fail-closed token error, got: {}",
        String::from_utf8_lossy(&cli_no_token.stderr)
    );
}

#[tokio::test]
async fn test_rust_native_compile_policy_checkpoint_and_onchain_reconciliation_end_to_end() {
    let sc = TestScenario::new();
    let tmp = TestTempDir::new("native-compile-confirm");
    let clock = Arc::new(AtomicI64::new(FIXED_NOW));
    let mut keys = BTreeMap::new();
    keys.insert(
        TEST_0X_KEY_ID.to_string(),
        test_0x_signer().verifying_key().to_bytes(),
    );

    let state = open_gateway(&tmp.db_path(), sc.policy.clone(), keys.clone(), clock.clone());
    let app = router(state.clone());

    // 1. GET /v1/solana/swap/policy returns pinned policy + digest
    let (pol_st, pol_json) = get_json(&app, "/v1/solana/swap/policy", Some(TOKEN)).await;
    assert_eq!(pol_st, StatusCode::OK);
    assert_eq!(pol_json["policy"]["policyId"], sc.policy.policy_id);
    assert!(pol_json["policyDigest"].as_str().is_some());

    // 2. GET /v1/solana/swap/checkpoint before any receipt -> 404
    let (cp0_st, _) = get_json(&app, "/v1/solana/swap/checkpoint", Some(TOKEN)).await;
    assert_eq!(cp0_st, StatusCode::NOT_FOUND);

    // 3. POST /v1/solana/swap/compile compiles MessageV0 purely in Rust with ALT compression
    let (req_ev, res_ev, _) =
        sc.build_signed_exchange(80_000_000, 96_000_000, sc.auth_dest_ata, "nc1");
    let blockhash = base58_encode(&[77u8; 32]);
    let (comp_st, comp_json) = post_json(
        &app,
        "/v1/solana/swap/compile",
        &json!({
            "recentBlockhash": blockhash,
            "responseBodyBase64": res_ev.body_base64,
            "addressLookupTables": [sc.alt_snapshot],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(comp_st, StatusCode::OK);
    assert_eq!(comp_json["altLookupCount"], 1);
    let compiled_b64 = comp_json["compiledMessageBase64"]
        .as_str()
        .unwrap()
        .to_string();

    // 4. POST /v1/solana/swap/evaluate WITHOUT compiledMessageBase64 (backend compiles natively in Rust)
    let (eval_st, eval_json) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "native-rust-compile-eligible",
            "provenance": "test-fixture",
            "request": req_ev,
            "response": res_ev,
            "recentBlockhash": blockhash,
            "addressLookupTables": [sc.alt_snapshot],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(eval_st, StatusCode::OK);
    let eval_resp: EvaluateSwapResponse = serde_json::from_value(eval_json).unwrap();
    assert_eq!(eval_resp.policy_verdict, "ELEGÍVEL");
    let auth = eval_resp.authorization.expect("authorized");
    assert_eq!(
        auth.payload.compiled_message_sha256,
        comp_json["sha256"].as_str().unwrap()
    );

    // 5. GET /v1/solana/swap/checkpoint now returns signed MMR checkpoint for leafCount=1
    let (cp1_st, cp1_json) = get_json(&app, "/v1/solana/swap/checkpoint", Some(TOKEN)).await;
    assert_eq!(cp1_st, StatusCode::OK);
    assert_eq!(cp1_json["payload"]["leafCount"], 1);

    // 6. Evidence #3: Submit "processed" confirmation -> 422 INSUFFICIENT_CONFIRMATION (does NOT lock receipt)
    let base_confirm = json!({
        "network": "solana-mainnet-beta",
        "signature": "4OfflineReconcileTestSig1111111111111111111111111111111111111111111",
        "slot": 310000100u64,
        "blockTime": FIXED_NOW + 5,
        "confirmationStatus": "processed",
        "err": null,
        "compiledMessageBase64": compiled_b64,
        "accountKeys": [
            sc.policy.taker,
            sc.policy.taker_input_token_account,
            sc.policy.authorized_destination_token_account,
        ],
        "feeLamports": 5000u64,
        "preBalances": [1000000000u64, 2039280u64, 2039280u64],
        "postBalances": [999995000u64, 2039280u64, 2039280u64],
        "preTokenBalances": [
            { "accountIndex": 1, "mint": sc.policy.input_mint, "owner": sc.policy.taker, "amount": "200000000" },
            { "accountIndex": 2, "mint": sc.policy.output_mint, "owner": sc.policy.authorized_recipient, "amount": "10000000" }
        ],
        "postTokenBalances": [
            { "accountIndex": 1, "mint": sc.policy.input_mint, "owner": sc.policy.taker, "amount": "120000000" },
            { "accountIndex": 2, "mint": sc.policy.output_mint, "owner": sc.policy.authorized_recipient, "amount": "108000000" }
        ]
    });
    let (proc_st, proc_json) = post_json(
        &app,
        &format!("/v1/solana/swap/receipts/{}/confirm", eval_resp.receipt_id),
        &base_confirm,
        Some(TOKEN),
    )
    .await;
    assert_eq!(proc_st, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        proc_json["receipt"]["reconciliation"]["status"],
        "INSUFFICIENT_CONFIRMATION"
    );

    // 7. Submit "finalized" confirmation -> 200 OK CONFIRMED_WITHIN_POLICY + Ed25519 signature verifies offline
    let mut finalized_confirm = base_confirm.clone();
    finalized_confirm["confirmationStatus"] = json!("finalized");
    let (fin_st, fin_json) = post_json(
        &app,
        &format!("/v1/solana/swap/receipts/{}/confirm", eval_resp.receipt_id),
        &finalized_confirm,
        Some(TOKEN),
    )
    .await;
    assert_eq!(fin_st, StatusCode::OK);
    let signed_conf: SignedConfirmationReceipt = serde_json::from_value(fin_json.clone()).unwrap();
    assert_eq!(
        signed_conf.receipt.reconciliation.status,
        "CONFIRMED_WITHIN_POLICY"
    );
    assert_eq!(
        signed_conf.receipt.reconciliation.actual_input_asset_debit,
        "80000000"
    );
    assert_eq!(
        signed_conf.receipt.reconciliation.actual_output_net_credit,
        "98000000"
    );
    verify_solana_swap_confirmation_receipt(&signed_conf, &receipt_signer().verifying_key())
        .expect("signed confirmation receipt must verify offline");

    // 8. Re-submitting confirmation for already-reconciled receipt -> 409 CONFLICT
    let (dup_conf_st, _) = post_json(
        &app,
        &format!("/v1/solana/swap/receipts/{}/confirm", eval_resp.receipt_id),
        &finalized_confirm,
        Some(TOKEN),
    )
    .await;
    assert_eq!(dup_conf_st, StatusCode::CONFLICT);

    // 9. Blocked receipt cannot be confirmed -> 409 CONFLICT
    let (rb, sb, wb) = sc.build_signed_exchange(250_000_000, 240_000_000, sc.auth_dest_ata, "nc2");
    let (blk_st, blk_json) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "blocked-no-confirm",
            "provenance": "test-fixture",
            "request": rb,
            "response": sb,
            "compiledMessageBase64": base64_encode(&wb),
            "addressLookupTables": [sc.alt_snapshot],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(blk_st, StatusCode::FORBIDDEN);
    let blocked_id = blk_json["receiptId"].as_str().unwrap();
    let (blk_conf_st, _) = post_json(
        &app,
        &format!("/v1/solana/swap/receipts/{blocked_id}/confirm"),
        &finalized_confirm,
        Some(TOKEN),
    )
    .await;
    assert_eq!(blk_conf_st, StatusCode::CONFLICT);

    // 10. Reopen SQLite WAL and verify confirmation + health count survive process restart
    let (_, pk_json) = get_json(&app, "/v1/solana/swap/public-keys", Some(TOKEN)).await;
    drop(app);
    drop(state);
    let reopened = open_gateway(&tmp.db_path(), sc.policy.clone(), keys, clock);
    let reopened_app = router(reopened);

    let (get_c_st, get_c_json) = get_json(
        &reopened_app,
        &format!(
            "/v1/solana/swap/receipts/{}/confirmation",
            eval_resp.receipt_id
        ),
        Some(TOKEN),
    )
    .await;
    assert_eq!(get_c_st, StatusCode::OK);
    let persisted_conf: SignedConfirmationReceipt = serde_json::from_value(get_c_json).unwrap();
    verify_solana_swap_confirmation_receipt(&persisted_conf, &receipt_signer().verifying_key())
        .expect("persisted confirmation receipt must verify offline after restart");

    let (h_st, health) = get_json(&reopened_app, "/v1/solana/swap/health", Some(TOKEN)).await;
    assert_eq!(h_st, StatusCode::OK);
    assert_eq!(health["onchainConfirmations"], 1);
    assert_eq!(health["realSignaturesProduced"], 0);
    assert_eq!(health["broadcastCalls"], 0);

    // 11. Standalone CLI verify-confirmation passes on valid and fails on tampered confirmation
    let bin = env!("CARGO_BIN_EXE_arkhe-solana-swap-gateway");
    let pk_path = tmp.path.join("pk.json");
    let conf_path = tmp.path.join("confirmation.json");
    let bad_conf_path = tmp.path.join("confirmation-tampered.json");
    std::fs::write(&pk_path, serde_json::to_vec_pretty(&pk_json).unwrap()).unwrap();
    std::fs::write(&conf_path, serde_json::to_vec_pretty(&fin_json).unwrap()).unwrap();
    let mut bad_conf = fin_json.clone();
    bad_conf["receipt"]["reconciliation"]["actualOutputNetCredit"] = json!("999999999");
    std::fs::write(&bad_conf_path, serde_json::to_vec_pretty(&bad_conf).unwrap()).unwrap();

    let cli_ok = std::process::Command::new(bin)
        .args([
            "verify-confirmation",
            "--confirmation",
            conf_path.to_str().unwrap(),
            "--public-keys",
            pk_path.to_str().unwrap(),
        ])
        .output()
        .expect("run verify-confirmation CLI");
    assert!(
        cli_ok.status.success(),
        "verify-confirmation failed: {}",
        String::from_utf8_lossy(&cli_ok.stderr)
    );
    let cli_json: Value = serde_json::from_slice(&cli_ok.stdout).unwrap();
    assert_eq!(cli_json["verified"], true);
    assert_eq!(cli_json["status"], "CONFIRMED_WITHIN_POLICY");

    let cli_bad = std::process::Command::new(bin)
        .args([
            "verify-confirmation",
            "--confirmation",
            bad_conf_path.to_str().unwrap(),
            "--public-keys",
            pk_path.to_str().unwrap(),
        ])
        .output()
        .expect("run verify-confirmation tampered CLI");
    assert!(!cli_bad.status.success());
}

#[tokio::test]
async fn test_real_loopback_tcp_server_roundtrip() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let sc = TestScenario::new();
    let tmp = TestTempDir::new("tcp-loopback");
    let clock = Arc::new(AtomicI64::new(FIXED_NOW));
    let state = open_gateway(&tmp.db_path(), sc.policy.clone(), official_0x_prod_keys(), clock);
    let app = router(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind loopback");
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    // 1. Unauthenticated TCP request -> HTTP/1.1 401
    let mut s1 = tokio::net::TcpStream::connect(addr).await.unwrap();
    s1.write_all(
        b"GET /v1/solana/swap/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
    )
    .await
    .unwrap();
    let mut buf1 = String::new();
    s1.read_to_string(&mut buf1).await.unwrap();
    assert!(
        buf1.starts_with("HTTP/1.1 401"),
        "expected 401 over TCP, got: {buf1}"
    );

    // 2. Authenticated TCP request -> HTTP/1.1 200 OK with JSON body
    let mut s2 = tokio::net::TcpStream::connect(addr).await.unwrap();
    let req2 = format!(
        "GET /v1/solana/swap/health HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {TOKEN}\r\nConnection: close\r\n\r\n"
    );
    s2.write_all(req2.as_bytes()).await.unwrap();
    let mut buf2 = String::new();
    s2.read_to_string(&mut buf2).await.unwrap();
    assert!(
        buf2.starts_with("HTTP/1.1 200"),
        "expected 200 over TCP, got: {buf2}"
    );
    assert!(buf2.contains("\"realSignaturesProduced\":0"));
    assert!(buf2.contains("\"broadcastCalls\":0"));

    server.abort();
}

fn encode_solana_alt_account_bytes(deactivation_slot: u64, addresses: &[[u8; 32]]) -> Vec<u8> {
    let mut data = vec![0u8; 56 + addresses.len() * 32];
    data[0..4].copy_from_slice(&1u32.to_le_bytes()); // LookupTableState::LookupTable
    data[4..12].copy_from_slice(&deactivation_slot.to_le_bytes());
    data[12..20].copy_from_slice(&309_000_000u64.to_le_bytes());
    data[20] = 0;
    data[21] = 0; // no authority
    for (i, addr) in addresses.iter().enumerate() {
        let start = 56 + i * 32;
        data[start..start + 32].copy_from_slice(addr);
    }
    data
}

#[tokio::test]
async fn test_upstream_shadow_quote_alt_fetch_and_rpc_reconcile_end_to_end() {
    use axum::http::HeaderMap;
    use axum::routing::post;
    use axum::{Json, Router};
    use std::sync::Mutex;

    const SECRET_API_KEY: &str = "super-secret-0x-key-never-leak";
    let sc = TestScenario::new();
    let blockhash = base58_encode(&[88u8; 32]);
    let alt_key_str = base58_encode(&sc.alt_key);
    let token_prog_bytes = base58_decode_32(TOKEN_PROGRAM_ID).unwrap();
    let alt_raw_bytes = encode_solana_alt_account_bytes(
        u64::MAX,
        &[
            sc.pool_in,
            sc.pool_out,
            sc.input_mint,
            sc.output_mint,
            token_prog_bytes,
        ],
    );

    // 1. Start mock 0x API server on 127.0.0.1:0 that verifies 0x-api-key and signs real RFC 9421 headers
    let mock_0x_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mock_0x_addr = mock_0x_listener.local_addr().unwrap();
    let mock_0x_authority = format!("127.0.0.1:{}", mock_0x_addr.port());
    let mock_0x_sc_taker = base58_encode(&sc.taker);
    let mock_0x_sc_in_ata = base58_encode(&sc.taker_in_ata);
    let mock_0x_sc_dest_ata = base58_encode(&sc.auth_dest_ata);
    let mock_0x_sc_in_mint = base58_encode(&sc.input_mint);
    let mock_0x_sc_out_mint = base58_encode(&sc.output_mint);
    let mock_0x_sc_prog = base58_encode(&sc.swap_program);
    let mock_0x_sc_pool_in = base58_encode(&sc.pool_in);
    let mock_0x_sc_pool_out = base58_encode(&sc.pool_out);
    let mock_0x_sc_alt = alt_key_str.clone();
    let mock_0x_seen_key = Arc::new(AtomicU64::new(0));
    let mock_0x_seen_key_clone = mock_0x_seen_key.clone();

    let mock_0x_app = Router::new().route(
        "/solana/swap-instructions",
        post(move |headers: HeaderMap, body: axum::body::Bytes| {
            let authority = mock_0x_authority.clone();
            let taker = mock_0x_sc_taker.clone();
            let in_ata = mock_0x_sc_in_ata.clone();
            let dest_ata = mock_0x_sc_dest_ata.clone();
            let in_mint = mock_0x_sc_in_mint.clone();
            let out_mint = mock_0x_sc_out_mint.clone();
            let swap_prog = mock_0x_sc_prog.clone();
            let pool_in = mock_0x_sc_pool_in.clone();
            let pool_out = mock_0x_sc_pool_out.clone();
            let alt_k = mock_0x_sc_alt.clone();
            let seen_key = mock_0x_seen_key_clone.clone();
            async move {
                assert_eq!(
                    headers.get("0x-api-key").and_then(|v| v.to_str().ok()),
                    Some(SECRET_API_KEY)
                );
                seen_key.fetch_add(1, Ordering::SeqCst);
                let req_json: Value = serde_json::from_slice(&body).unwrap();
                let amount_in = req_json["amount_in"].as_u64().unwrap();
                let min_out = if amount_in > 100_000_000 {
                    240_000_000u64
                } else {
                    96_000_000u64
                };
                let mut swap_data = Vec::new();
                swap_data.extend_from_slice(&DISC);
                swap_data.extend_from_slice(&amount_in.to_le_bytes());
                swap_data.extend_from_slice(&min_out.to_le_bytes());

                let payload = Raw0xSwapPayload {
                    network: Some("solana-mainnet-beta".to_string()),
                    genesis_hash: Some(GENESIS.to_string()),
                    address_lookup_table_addresses: vec![alt_k],
                    instructions: vec![Raw0xInstruction {
                        program_id: swap_prog,
                        accounts: vec![
                            Raw0xAccountMeta { pubkey: taker, is_signer: true, is_writable: true },
                            Raw0xAccountMeta { pubkey: in_ata, is_signer: false, is_writable: true },
                            Raw0xAccountMeta { pubkey: dest_ata, is_signer: false, is_writable: true },
                            Raw0xAccountMeta { pubkey: in_mint, is_signer: false, is_writable: false },
                            Raw0xAccountMeta { pubkey: out_mint, is_signer: false, is_writable: false },
                            Raw0xAccountMeta { pubkey: pool_in, is_signer: false, is_writable: true },
                            Raw0xAccountMeta { pubkey: pool_out, is_signer: false, is_writable: true },
                            Raw0xAccountMeta { pubkey: TOKEN_PROGRAM_ID.to_string(), is_signer: false, is_writable: false },
                        ],
                        data: base64_encode(&swap_data),
                    }],
                };
                let res_bytes = serde_json::to_vec(&payload).unwrap();
                let (_, signed_res) = sign_0x_http_response(
                    HttpRequestEvidence {
                        method: "POST".to_string(),
                        authority,
                        path: "/solana/swap-instructions".to_string(),
                        query: Some("?".to_string()),
                        headers: BTreeMap::new(),
                        body_base64: base64_encode(&body),
                    },
                    HttpResponseEvidence {
                        status: 200,
                        headers: BTreeMap::new(),
                        body_base64: base64_encode(&res_bytes),
                    },
                    &test_0x_signer(),
                    TEST_0X_KEY_ID,
                    FIXED_CREATED,
                )
                .unwrap();

                let mut resp_builder = axum::response::Response::builder().status(StatusCode::OK);
                for (k, v) in signed_res.headers {
                    resp_builder = resp_builder.header(k, v);
                }
                resp_builder.body(Body::from(res_bytes)).unwrap()
            }
        }),
    );
    let mock_0x_task = tokio::spawn(async move {
        let _ = axum::serve(mock_0x_listener, mock_0x_app).await;
    });

    // 2. Start mock read-only Solana JSON-RPC server on 127.0.0.1:0
    let stored_confirmed_msg_b64: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let stored_msg_for_rpc = stored_confirmed_msg_b64.clone();
    let rpc_blockhash = blockhash.clone();
    let rpc_alt_b64 = base64_encode(&alt_raw_bytes);
    let rpc_policy = sc.policy.clone();
    let rpc_pool_in = base58_encode(&sc.pool_in);
    let rpc_pool_out = base58_encode(&sc.pool_out);

    let mock_rpc_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mock_rpc_addr = mock_rpc_listener.local_addr().unwrap();
    let mock_rpc_app = Router::new().route(
        "/",
        post(move |Json(req): Json<Value>| {
            let bh = rpc_blockhash.clone();
            let alt_b64 = rpc_alt_b64.clone();
            let stored_msg = stored_msg_for_rpc.clone();
            let pol = rpc_policy.clone();
            let p_in = rpc_pool_in.clone();
            let p_out = rpc_pool_out.clone();
            async move {
                let method = req["method"].as_str().unwrap_or("");
                let result = match method {
                    "getGenesisHash" => json!(GENESIS),
                    "getLatestBlockhash" => json!({
                        "context": { "slot": 310_000_000u64 },
                        "value": { "blockhash": bh, "lastValidBlockHeight": 290_000_000u64 }
                    }),
                    "getAccountInfo" => json!({
                        "context": { "slot": 310_000_000u64 },
                        "value": {
                            "owner": ADDRESS_LOOKUP_TABLE_PROGRAM_ID,
                            "data": [alt_b64, "base64"],
                            "executable": false,
                            "lamports": 2_000_000u64
                        }
                    }),
                    "getTransaction" => {
                        let msg_b64 = stored_msg
                            .lock()
                            .unwrap()
                            .clone()
                            .expect("authorized message stored for mock getTransaction");
                        let msg_bytes = base64_decode_strict(&msg_b64).unwrap();
                        // Wrap MessageV0 into a real serialized Solana VersionedTransaction (1 dummy sig + message)
                        let mut tx_bytes = Vec::with_capacity(1 + 64 + msg_bytes.len());
                        tx_bytes.push(1u8); // compact-u16: 1 signature
                        tx_bytes.extend_from_slice(&[0xab; 64]);
                        tx_bytes.extend_from_slice(&msg_bytes);
                        // Static keys from native compile are [taker, taker_in_ata, auth_dest_ata, swap_program] (4 keys)
                        // Loaded writable: [pool_in, pool_out] (2), loaded readonly: [input_mint, output_mint, TOKEN_PROGRAM_ID] (3) -> total 9 accounts
                        json!({
                            "slot": 310_000_042u64,
                            "blockTime": FIXED_NOW + 4,
                            "transaction": [base64_encode(&tx_bytes), "base64"],
                            "meta": {
                                "err": null,
                                "fee": 5000u64,
                                "preBalances":  [1_000_000_000u64, 2_039_280, 2_039_280, 1, 2_039_280, 2_039_280, 1, 1, 1],
                                "postBalances": [  999_995_000u64, 2_039_280, 2_039_280, 1, 2_039_280, 2_039_280, 1, 1, 1],
                                "preTokenBalances": [
                                    { "accountIndex": 1, "mint": pol.input_mint, "owner": pol.taker, "uiTokenAmount": { "amount": "200000000" } },
                                    { "accountIndex": 2, "mint": pol.output_mint, "owner": pol.authorized_recipient, "uiTokenAmount": { "amount": "10000000" } }
                                ],
                                "postTokenBalances": [
                                    { "accountIndex": 1, "mint": pol.input_mint, "owner": pol.taker, "uiTokenAmount": { "amount": "120000000" } },
                                    { "accountIndex": 2, "mint": pol.output_mint, "owner": pol.authorized_recipient, "uiTokenAmount": { "amount": "108500000" } }
                                ],
                                "loadedAddresses": {
                                    "writable": [p_in, p_out],
                                    "readonly": [pol.input_mint, pol.output_mint, TOKEN_PROGRAM_ID]
                                }
                            }
                        })
                    }
                    other => panic!("unexpected Solana RPC method called: {other}"),
                };
                Json(json!({ "jsonrpc": "2.0", "id": 1, "result": result }))
            }
        }),
    );
    let mock_rpc_task = tokio::spawn(async move {
        let _ = axum::serve(mock_rpc_listener, mock_rpc_app).await;
    });

    let mut keys = BTreeMap::new();
    keys.insert(
        TEST_0X_KEY_ID.to_string(),
        test_0x_signer().verifying_key().to_bytes(),
    );

    // 3. Fail-closed check when upstream clients are NOT configured -> 503
    let tmp_unconf = TestTempDir::new("upstream-unconf");
    let clock = Arc::new(AtomicI64::new(FIXED_NOW));
    let unconf_app = router(open_gateway(
        &tmp_unconf.db_path(),
        sc.policy.clone(),
        keys.clone(),
        clock.clone(),
    ));
    let (st_503, _) = post_json(
        &unconf_app,
        "/v1/solana/swap/shadow-quote-and-evaluate",
        &json!({ "caseId": "unconf", "amountIn": 80_000_000 }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(st_503, StatusCode::SERVICE_UNAVAILABLE);

    let (st_503_rpc, _) = post_json(
        &unconf_app,
        "/v1/solana/swap/receipts/rcpt-none/reconcile-rpc",
        &json!({ "txSignature": "sig1" }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(st_503_rpc, StatusCode::SERVICE_UNAVAILABLE);

    // 4. Configured WITHOUT AltObserverSigner -> fetched binary ALT is unattested -> 422 INCONCLUSIVO, zero API key leakage
    let tmp_unatt = TestTempDir::new("upstream-unatt");
    let store_unatt = SqliteSolanaSwapStore::open(tmp_unatt.db_path()).unwrap();
    let clock_c = clock.clone();
    let state_unatt = Arc::new(
        SolanaSwapGatewayState::new(
            store_unatt,
            TOKEN,
            sc.policy.clone(),
            keys.clone(),
            "auth-key-1",
            auth_signer(),
            "receipt-key-1",
            receipt_signer(),
            "checkpoint-key-1",
            checkpoint_signer(),
            Arc::new(move || clock_c.load(Ordering::SeqCst)),
        )
        .with_zerox_client(
            ZeroXSwapClient::new(format!("http://{mock_0x_addr}"), SECRET_API_KEY).unwrap(),
        )
        .with_solana_rpc(
            SolanaRpcReadOnlyClient::new(
                format!("http://{mock_rpc_addr}"),
                "solana-mainnet-beta",
                Some(GENESIS.to_string()),
                None,
            )
            .unwrap(),
        ),
    );
    let app_unatt = router(state_unatt);
    let (unatt_st, unatt_json) = post_json(
        &app_unatt,
        "/v1/solana/swap/shadow-quote-and-evaluate",
        &json!({ "caseId": "shadow-unattested-alt", "amountIn": 80_000_000 }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(unatt_st, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unatt_json["policyVerdict"], "INCONCLUSIVO");
    assert_eq!(unatt_json["reasonCode"], "UNATTESTED_ALT_SNAPSHOT");
    assert!(unatt_json["authorization"].is_null());
    // Ensure 0x-api-key NEVER leaks into receipt or HTTP evidence
    let unatt_serialized = serde_json::to_string(&unatt_json).unwrap();
    assert!(
        !unatt_serialized.contains(SECRET_API_KEY),
        "0x-api-key leaked into evaluate response!"
    );

    // 5. Configured WITH AltObserverSigner -> above-cap blocked, eligible authorized, then reconciled via mock Solana RPC
    let tmp_full = TestTempDir::new("upstream-full");
    let store_full = SqliteSolanaSwapStore::open(tmp_full.db_path()).unwrap();
    let clock_f = clock.clone();
    let state_full = Arc::new(
        SolanaSwapGatewayState::new(
            store_full,
            TOKEN,
            sc.policy.clone(),
            keys,
            "auth-key-1",
            auth_signer(),
            "receipt-key-1",
            receipt_signer(),
            "checkpoint-key-1",
            checkpoint_signer(),
            Arc::new(move || clock_f.load(Ordering::SeqCst)),
        )
        .with_zerox_client(
            ZeroXSwapClient::new(format!("http://{mock_0x_addr}"), SECRET_API_KEY).unwrap(),
        )
        .with_solana_rpc(
            SolanaRpcReadOnlyClient::new(
                format!("http://{mock_rpc_addr}"),
                "solana-mainnet-beta",
                Some(GENESIS.to_string()),
                Some(AltObserverSigner {
                    key_id: TEST_ALT_KEY_ID.to_string(),
                    signing_key: alt_attester_signer(),
                }),
            )
            .unwrap(),
        ),
    );
    let app_full = router(state_full);

    // 5a. Above-cap live shadow quote -> 0x sig valid, Arkhe blocks (403), 0 key calls
    let (cap_st, cap_json) = post_json(
        &app_full,
        "/v1/solana/swap/shadow-quote-and-evaluate",
        &json!({ "caseId": "shadow-above-cap", "amountIn": 250_000_000 }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(cap_st, StatusCode::FORBIDDEN);
    assert_eq!(cap_json["httpSignatureValid"], true);
    assert_eq!(cap_json["policyVerdict"], "BLOQUEADO");
    assert_eq!(cap_json["reasonCode"], "INPUT_ASSET_CAP_EXCEEDED");
    assert!(cap_json["authorization"].is_null());

    // 5b. Within-cap live shadow quote -> 200 OK ELEGÍVEL (ALT fetched & attested, MessageV0 compiled in Rust)
    let (ok_st, ok_json) = post_json(
        &app_full,
        "/v1/solana/swap/shadow-quote-and-evaluate",
        &json!({ "caseId": "shadow-eligible", "amountIn": 80_000_000, "slippageBps": 50 }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(ok_st, StatusCode::OK);
    let ok_resp: EvaluateSwapResponse = serde_json::from_value(ok_json).unwrap();
    assert_eq!(ok_resp.policy_verdict, "ELEGÍVEL");
    assert_eq!(ok_resp.real_signatures_produced, 0);
    assert_eq!(ok_resp.broadcast_calls, 0);
    let eval_msg_b64 = ok_resp
        .receipt
        .evaluation
        .as_ref()
        .unwrap()
        .compiled_message
        .base64
        .clone();
    *stored_confirmed_msg_b64.lock().unwrap() = Some(eval_msg_b64);

    // 5c. Evidence #3 via live Solana RPC getTransaction reconciliation
    let (rec_st, rec_json) = post_json(
        &app_full,
        &format!(
            "/v1/solana/swap/receipts/{}/reconcile-rpc",
            ok_resp.receipt_id
        ),
        &json!({
            "txSignature": "5MockFinalizedTxSig111111111111111111111111111111111111111111111111"
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(rec_st, StatusCode::OK);
    let signed_conf: SignedConfirmationReceipt = serde_json::from_value(rec_json).unwrap();
    assert_eq!(
        signed_conf.receipt.reconciliation.status,
        "CONFIRMED_WITHIN_POLICY"
    );
    assert!(signed_conf.receipt.reconciliation.exact_message_match);
    assert_eq!(
        signed_conf.receipt.reconciliation.actual_input_asset_debit,
        "80000000"
    );
    assert_eq!(
        signed_conf.receipt.reconciliation.actual_output_net_credit,
        "98500000"
    );
    verify_solana_swap_confirmation_receipt(&signed_conf, &receipt_signer().verifying_key())
        .expect("RPC-reconciled confirmation receipt must verify offline");

    // 5d. Health reports upstream flags (booleans only) and zero real signatures/broadcasts
    let (h_st, health) = get_json(&app_full, "/v1/solana/swap/health", Some(TOKEN)).await;
    assert_eq!(h_st, StatusCode::OK);
    assert_eq!(health["upstream"]["zeroxConfigured"], true);
    assert_eq!(health["upstream"]["solanaRpcConfigured"], true);
    assert_eq!(health["upstream"]["altObserverConfigured"], true);
    assert_eq!(health["onchainConfirmations"], 1);
    assert_eq!(health["realSignaturesProduced"], 0);
    assert_eq!(health["broadcastCalls"], 0);
    assert_eq!(mock_0x_seen_key.load(Ordering::SeqCst), 3);

    mock_0x_task.abort();
    mock_rpc_task.abort();
}

#[tokio::test]
async fn test_parallel_replay_races_sqlite_wal_atomicity_and_operational_hardening() {
    let sc = TestScenario::new();
    let tmp = TestTempDir::new("parallel-hardening");
    let clock = Arc::new(AtomicI64::new(FIXED_NOW));
    let mut keys = BTreeMap::new();
    keys.insert(
        TEST_0X_KEY_ID.to_string(),
        test_0x_signer().verifying_key().to_bytes(),
    );

    let state = open_gateway(&tmp.db_path(), sc.policy.clone(), keys, clock);
    let app = router(state);

    // 1. 16-way parallel 0x replay race: exactly 1 succeeds (200 ELEGÍVEL), 15 blocked (RESPONSE_REPLAY_DETECTED)
    let (req_ev, res_ev, wire) =
        sc.build_signed_exchange(80_000_000, 96_000_000, sc.auth_dest_ata, "race1");
    let eval_payload = json!({
        "caseId": "parallel-0x-replay-race",
        "provenance": "test-fixture",
        "request": req_ev,
        "response": res_ev,
        "compiledMessageBase64": base64_encode(&wire),
        "addressLookupTables": [sc.alt_snapshot],
    });

    let mut eval_handles = Vec::new();
    for _ in 0..16 {
        let app_c = app.clone();
        let body_c = eval_payload.clone();
        eval_handles.push(tokio::spawn(async move {
            post_json(&app_c, "/v1/solana/swap/evaluate", &body_c, Some(TOKEN)).await
        }));
    }

    let mut eval_ok = 0usize;
    let mut eval_replay = 0usize;
    let mut winning_resp: Option<EvaluateSwapResponse> = None;
    for h in eval_handles {
        let (st, body) = h.await.unwrap();
        if st == StatusCode::OK {
            eval_ok += 1;
            winning_resp = Some(serde_json::from_value(body).unwrap());
        } else {
            assert_eq!(st, StatusCode::FORBIDDEN);
            assert_eq!(body["reasonCode"], "RESPONSE_REPLAY_DETECTED");
            assert!(body["authorization"].is_null());
            eval_replay += 1;
        }
    }
    assert_eq!(eval_ok, 1, "exactly 1 parallel 0x evaluate must succeed");
    assert_eq!(eval_replay, 15, "exactly 15 parallel 0x evaluates must be blocked as replay");
    let win = winning_resp.expect("winning eligible response");
    let auth = win.authorization.expect("winning authorization");

    // 2. 16-way parallel signing-boundary single-use race: exactly 1 accepted, 15 rejected
    let boundary_payload = json!({
        "compiledMessageBase64": base64_encode(&wire),
        "authorization": auth,
    });
    let mut bound_handles = Vec::new();
    for _ in 0..16 {
        let app_c = app.clone();
        let body_c = boundary_payload.clone();
        bound_handles.push(tokio::spawn(async move {
            post_json(
                &app_c,
                "/v1/solana/swap/signing-boundary",
                &body_c,
                Some(TOKEN),
            )
            .await
        }));
    }

    let mut bound_ok = 0usize;
    let mut bound_dup = 0usize;
    for h in bound_handles {
        let (st, body) = h.await.unwrap();
        let resp: SigningBoundaryResponse = serde_json::from_value(body).unwrap();
        assert_eq!(resp.real_signatures_produced, 0);
        assert_eq!(resp.broadcast_calls, 0);
        if st == StatusCode::OK {
            assert!(resp.accepted);
            bound_ok += 1;
        } else {
            assert_eq!(st, StatusCode::FORBIDDEN);
            assert!(!resp.accepted);
            assert_eq!(
                resp.reject_code.as_deref(),
                Some("AUTHORIZATION_ALREADY_CONSUMED")
            );
            bound_dup += 1;
        }
    }
    assert_eq!(bound_ok, 1, "exactly 1 parallel signing-boundary call must be accepted");
    assert_eq!(bound_dup, 15, "exactly 15 parallel signing-boundary calls must be rejected");

    // 3. 8-way parallel on-chain confirmation race: exactly 1 succeeds (200), 7 return 409 CONFLICT
    let confirm_payload = json!({
        "network": "solana-mainnet-beta",
        "signature": "6ParallelConfirmRaceSig11111111111111111111111111111111111111111111",
        "slot": 310000200u64,
        "blockTime": FIXED_NOW + 6,
        "confirmationStatus": "finalized",
        "err": null,
        "compiledMessageBase64": base64_encode(&wire),
        "accountKeys": [
            sc.policy.taker,
            sc.policy.taker_input_token_account,
            sc.policy.authorized_destination_token_account,
        ],
        "feeLamports": 5000u64,
        "preBalances": [1000000000u64, 2039280u64, 2039280u64],
        "postBalances": [999995000u64, 2039280u64, 2039280u64],
        "preTokenBalances": [
            { "accountIndex": 1, "mint": sc.policy.input_mint, "owner": sc.policy.taker, "amount": "200000000" },
            { "accountIndex": 2, "mint": sc.policy.output_mint, "owner": sc.policy.authorized_recipient, "amount": "10000000" }
        ],
        "postTokenBalances": [
            { "accountIndex": 1, "mint": sc.policy.input_mint, "owner": sc.policy.taker, "amount": "120000000" },
            { "accountIndex": 2, "mint": sc.policy.output_mint, "owner": sc.policy.authorized_recipient, "amount": "107000000" }
        ]
    });
    let mut conf_handles = Vec::new();
    for _ in 0..8 {
        let app_c = app.clone();
        let body_c = confirm_payload.clone();
        let uri = format!("/v1/solana/swap/receipts/{}/confirm", win.receipt_id);
        conf_handles.push(tokio::spawn(async move {
            post_json(&app_c, &uri, &body_c, Some(TOKEN)).await
        }));
    }
    let mut conf_ok = 0usize;
    let mut conf_conflict = 0usize;
    for h in conf_handles {
        let (st, _) = h.await.unwrap();
        if st == StatusCode::OK {
            conf_ok += 1;
        } else {
            assert_eq!(st, StatusCode::CONFLICT);
            conf_conflict += 1;
        }
    }
    assert_eq!(conf_ok, 1, "exactly 1 parallel confirmation must commit");
    assert_eq!(conf_conflict, 7, "exactly 7 parallel confirmations must hit 409 CONFLICT");

    // 4. Security headers & x-request-id on responses + Prometheus /metrics + OpenAPI 3.1 /openapi.json
    let req_with_id = Request::builder()
        .method("GET")
        .uri("/v1/solana/swap/metrics")
        .header("authorization", format!("Bearer {TOKEN}"))
        .header("x-request-id", "req-audit-12345")
        .body(Body::empty())
        .unwrap();
    let metrics_resp = app.clone().oneshot(req_with_id).await.unwrap();
    assert_eq!(metrics_resp.status(), StatusCode::OK);
    assert_eq!(
        metrics_resp.headers().get("x-request-id").and_then(|v| v.to_str().ok()),
        Some("req-audit-12345")
    );
    assert_eq!(
        metrics_resp.headers().get("x-content-type-options").and_then(|v| v.to_str().ok()),
        Some("nosniff")
    );
    assert_eq!(
        metrics_resp.headers().get("cache-control").and_then(|v| v.to_str().ok()),
        Some("no-store")
    );
    assert_eq!(
        metrics_resp.headers().get("x-frame-options").and_then(|v| v.to_str().ok()),
        Some("DENY")
    );
    let metrics_text = String::from_utf8(
        to_bytes(metrics_resp.into_body(), 1024 * 1024)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    assert!(metrics_text.contains("arkhe_solana_swap_receipts_total 16\n"));
    assert!(metrics_text.contains("arkhe_solana_swap_consumed_0x_responses_total 1\n"));
    assert!(metrics_text.contains("arkhe_solana_swap_issued_authorizations_total 1\n"));
    assert!(metrics_text.contains("arkhe_solana_swap_consumed_authorizations_total 1\n"));
    assert!(metrics_text.contains("arkhe_solana_swap_signing_boundary_events_total 16\n"));
    assert!(metrics_text.contains("arkhe_solana_swap_onchain_confirmations_total 1\n"));
    assert!(metrics_text.contains("arkhe_solana_swap_test_signer_calls_total 1\n"));
    assert!(metrics_text.contains("arkhe_solana_swap_real_signatures_produced_total 0\n"));
    assert!(metrics_text.contains("arkhe_solana_swap_broadcast_calls_total 0\n"));

    let (oa_st, oa_json) = get_json(&app, "/v1/solana/swap/openapi.json", Some(TOKEN)).await;
    assert_eq!(oa_st, StatusCode::OK);
    assert_eq!(oa_json["openapi"], "3.1.0");
    assert!(oa_json["paths"]["/v1/solana/swap/shadow-quote-and-evaluate"].is_object());
    assert!(oa_json["paths"]["/v1/solana/swap/receipts/{receipt_id}/reconcile-rpc"].is_object());

    // 5. CLI validate-policy (example policy passes; wSOL policy missing maxTotalSolDebit fails) & print-openapi
    let bin = env!("CARGO_BIN_EXE_arkhe-solana-swap-gateway");
    let example_policy = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("config")
        .join("solana-swap-policy.example.json");
    let vp_ok = std::process::Command::new(bin)
        .args(["validate-policy", "--policy", example_policy.to_str().unwrap()])
        .output()
        .expect("run validate-policy on example");
    assert!(
        vp_ok.status.success(),
        "validate-policy example failed: {}",
        String::from_utf8_lossy(&vp_ok.stderr)
    );
    let vp_json: Value = serde_json::from_slice(&vp_ok.stdout).unwrap();
    assert_eq!(vp_json["valid"], true);
    assert!(vp_json["policyDigest"].as_str().is_some());

    let bad_policy_path = tmp.path.join("bad-wsol-policy.json");
    let mut bad_pol: Value = serde_json::from_str(&std::fs::read_to_string(&example_policy).unwrap()).unwrap();
    bad_pol.as_object_mut().unwrap().remove("maxTotalSolDebit");
    std::fs::write(&bad_policy_path, serde_json::to_vec_pretty(&bad_pol).unwrap()).unwrap();
    let vp_bad = std::process::Command::new(bin)
        .args(["validate-policy", "--policy", bad_policy_path.to_str().unwrap()])
        .output()
        .expect("run validate-policy on invalid wSOL policy");
    assert!(!vp_bad.status.success());
    assert!(String::from_utf8_lossy(&vp_bad.stderr).contains("maxTotalSolDebit"));

    let po_out = std::process::Command::new(bin)
        .arg("print-openapi")
        .output()
        .expect("run print-openapi");
    assert!(po_out.status.success());
    let po_json: Value = serde_json::from_slice(&po_out.stdout).unwrap();
    assert_eq!(po_json["openapi"], "3.1.0");
}

#[tokio::test]
async fn test_main_arkhe_runtime_router_merge_mount_preserves_isolation() {
    use axum::extract::DefaultBodyLimit;
    use axum::routing::get;
    use axum::{Json, Router};

    let tmp = TestTempDir::new("main-runtime-mount");
    let example_policy = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("config")
        .join("solana-swap-policy.example.json");
    let cfg = SolanaSwapMountConfig {
        db_path: tmp.db_path(),
        policy_path: example_policy,
        token: TOKEN.to_string(),
        keys_dir: Some(tmp.path.join("keys")),
        extra_0x_keys_path: None,
        zerox_base_url: "https://api.0x.org".to_string(),
        zerox_api_key: None,
        solana_rpc_url: None,
        alt_observer_key_id: None,
        alt_observer_key_hex: None,
    };

    let (swap_state, swap_router) =
        build_mounted_router(&cfg).expect("build mounted solana swap router");

    // Simulate orchestration/arkhe-runtime/src/main.rs router composition:
    // core routes carry 256 KiB limit, merged with /v1/solana/swap/* (1 MiB limit + security headers).
    let core_app = Router::new()
        .route("/v1/health", get(|| async { Json(json!({ "status": "core-ok" })) }))
        .layer(DefaultBodyLimit::max(262_144))
        .merge(swap_router);

    // 1. Core runtime route responds normally
    let (core_st, core_json) = get_json(&core_app, "/v1/health", None).await;
    assert_eq!(core_st, StatusCode::OK);
    assert_eq!(core_json["status"], "core-ok");

    // 2. Mounted /v1/solana/swap/health enforces Bearer auth and returns mounted policyDigest
    let (unauth_st, _) = get_json(&core_app, "/v1/solana/swap/health", None).await;
    assert_eq!(unauth_st, StatusCode::UNAUTHORIZED);

    let (swap_st, swap_json) = get_json(&core_app, "/v1/solana/swap/health", Some(TOKEN)).await;
    assert_eq!(swap_st, StatusCode::OK);
    assert_eq!(swap_json["policyDigest"], swap_state.policy_digest_hex());
    assert_eq!(swap_json["realSignaturesProduced"], 0);
    assert_eq!(swap_json["broadcastCalls"], 0);

    // 3. Keys persisted to keys_dir survive second mount with identical public keys
    let (swap_state2, _) = build_mounted_router(&cfg).expect("second mount reuses keys");
    assert_eq!(
        swap_state.public_keys_document().receipt_public_key_hex,
        swap_state2.public_keys_document().receipt_public_key_hex
    );
    assert_eq!(
        swap_state.public_keys_document().auth_public_key_hex,
        swap_state2.public_keys_document().auth_public_key_hex
    );
}

struct MockEnclaveDryRunSink {
    invocations: AtomicU64,
}

impl IsolatedSigningSink for MockEnclaveDryRunSink {
    fn name(&self) -> &'static str {
        "mock-enclave-dry-run-sink"
    }

    fn accept_authorized_message(
        &self,
        invocation: &SigningSinkInvocation<'_>,
    ) -> Result<SigningSinkOutcome, String> {
        // Independent enclave-side digest check
        if invocation.compiled_message_sha256
            != invocation.authorization.payload.compiled_message_sha256
        {
            return Err("enclave sha256 mismatch".to_string());
        }
        self.invocations.fetch_add(1, Ordering::SeqCst);
        Ok(SigningSinkOutcome {
            mode_label: "ACCEPTED_ENCLAVE_DRY_RUN".to_string(),
            real_signature_produced: false,
        })
    }
}

#[tokio::test]
async fn test_alt_multi_rpc_quorum_divergence_and_automatic_reconciliation_worker_and_isolated_sink() {
    use axum::routing::post;
    use axum::{Json, Router};
    use std::sync::atomic::AtomicBool;
    use std::sync::Mutex;

    let sc = TestScenario::new();
    let alt_key_str = base58_encode(&sc.alt_key);
    let token_prog_bytes = base58_decode_32(TOKEN_PROGRAM_ID).unwrap();
    let good_alt_bytes = encode_solana_alt_account_bytes(
        u64::MAX,
        &[sc.pool_in, sc.pool_out, sc.input_mint, sc.output_mint, token_prog_bytes],
    );
    let divergent_alt_bytes = encode_solana_alt_account_bytes(
        u64::MAX,
        &[sc.pool_in, sc.pool_out, sc.input_mint, key_bytes(99), token_prog_bytes],
    );

    let rpc2_diverge = Arc::new(AtomicBool::new(false));
    let tx_ready = Arc::new(AtomicBool::new(false));
    let stored_msg_b64: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    // Spawn Mock Solana RPC #1 (honest, slot 310_000_010, also serves getTransaction when tx_ready=true)
    let l1 = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr1 = l1.local_addr().unwrap();
    let good_b64_1 = base64_encode(&good_alt_bytes);
    let tx_ready_c = tx_ready.clone();
    let stored_msg_c = stored_msg_b64.clone();
    let pol_c = sc.policy.clone();
    let p_in_c = base58_encode(&sc.pool_in);
    let p_out_c = base58_encode(&sc.pool_out);
    let rpc1_task = tokio::spawn(async move {
        let app = Router::new().route(
            "/",
            post(move |Json(req): Json<Value>| {
                let b64 = good_b64_1.clone();
                let ready = tx_ready_c.clone();
                let msg_lock = stored_msg_c.clone();
                let pol = pol_c.clone();
                let pin = p_in_c.clone();
                let pout = p_out_c.clone();
                async move {
                    let method = req["method"].as_str().unwrap_or("");
                    let result = match method {
                        "getGenesisHash" => json!(GENESIS),
                        "getAccountInfo" => json!({
                            "context": { "slot": 310_000_010u64 },
                            "value": {
                                "owner": ADDRESS_LOOKUP_TABLE_PROGRAM_ID,
                                "data": [b64, "base64"],
                                "executable": false,
                                "lamports": 2_000_000u64
                            }
                        }),
                        "getTransaction" => {
                            if !ready.load(Ordering::SeqCst) {
                                Value::Null
                            } else {
                                let mb64 = msg_lock.lock().unwrap().clone().unwrap();
                                let mbytes = base64_decode_strict(&mb64).unwrap();
                                let mut tx_bytes = Vec::with_capacity(1 + 64 + mbytes.len());
                                tx_bytes.push(1u8);
                                tx_bytes.extend_from_slice(&[0xcd; 64]);
                                tx_bytes.extend_from_slice(&mbytes);
                                json!({
                                    "slot": 310_000_099u64,
                                    "blockTime": FIXED_NOW + 10,
                                    "transaction": [base64_encode(&tx_bytes), "base64"],
                                    "meta": {
                                        "err": null,
                                        "fee": 5000u64,
                                        "preBalances":  [1_000_000_000u64, 2_039_280, 2_039_280, 1, 2_039_280, 2_039_280, 1, 1, 1],
                                        "postBalances": [  999_995_000u64, 2_039_280, 2_039_280, 1, 2_039_280, 2_039_280, 1, 1, 1],
                                        "preTokenBalances": [
                                            { "accountIndex": 1, "mint": pol.input_mint, "owner": pol.taker, "uiTokenAmount": { "amount": "200000000" } },
                                            { "accountIndex": 2, "mint": pol.output_mint, "owner": pol.authorized_recipient, "uiTokenAmount": { "amount": "10000000" } }
                                        ],
                                        "postTokenBalances": [
                                            { "accountIndex": 1, "mint": pol.input_mint, "owner": pol.taker, "uiTokenAmount": { "amount": "120000000" } },
                                            { "accountIndex": 2, "mint": pol.output_mint, "owner": pol.authorized_recipient, "uiTokenAmount": { "amount": "109000000" } }
                                        ],
                                        "loadedAddresses": {
                                            "writable": [pin, pout],
                                            "readonly": [pol.input_mint, pol.output_mint, TOKEN_PROGRAM_ID]
                                        }
                                    }
                                })
                            }
                        }
                        other => panic!("unexpected rpc1 method {other}"),
                    };
                    Json(json!({ "jsonrpc": "2.0", "id": 1, "result": result }))
                }
            }),
        );
        let _ = axum::serve(l1, app).await;
    });

    // Spawn Mock Solana RPC #2 (independent observer; slot 310_000_005; toggles divergence)
    let l2 = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr2 = l2.local_addr().unwrap();
    let good_b64_2 = base64_encode(&good_alt_bytes);
    let bad_b64_2 = base64_encode(&divergent_alt_bytes);
    let div_flag = rpc2_diverge.clone();
    let rpc2_task = tokio::spawn(async move {
        let app = Router::new().route(
            "/",
            post(move |Json(req): Json<Value>| {
                let gb64 = good_b64_2.clone();
                let bb64 = bad_b64_2.clone();
                let df = div_flag.clone();
                async move {
                    let method = req["method"].as_str().unwrap_or("");
                    let result = match method {
                        "getGenesisHash" => json!(GENESIS),
                        "getAccountInfo" => {
                            let data = if df.load(Ordering::SeqCst) { bb64 } else { gb64 };
                            json!({
                                "context": { "slot": 310_000_005u64 },
                                "value": {
                                    "owner": ADDRESS_LOOKUP_TABLE_PROGRAM_ID,
                                    "data": [data, "base64"],
                                    "executable": false,
                                    "lamports": 2_000_000u64
                                }
                            })
                        }
                        other => panic!("unexpected rpc2 method {other}"),
                    };
                    Json(json!({ "jsonrpc": "2.0", "id": 1, "result": result }))
                }
            }),
        );
        let _ = axum::serve(l2, app).await;
    });

    let quorum_rpc = SolanaRpcReadOnlyClient::new_with_quorum(
        vec![format!("http://{addr1}"), format!("http://{addr2}")],
        2,
        "solana-mainnet-beta",
        Some(GENESIS.to_string()),
        Some(AltObserverSigner {
            key_id: TEST_ALT_KEY_ID.to_string(),
            signing_key: alt_attester_signer(),
        }),
    )
    .expect("2-of-2 quorum RPC client");

    // 1a. Both independent RPCs agree -> attested snapshot anchored at conservative min slot (310_000_005)
    let agreed = quorum_rpc
        .fetch_alt_snapshot(&alt_key_str)
        .await
        .expect("2-of-2 agreement must succeed");
    assert_eq!(agreed.slot, Some(310_000_005));
    assert!(agreed.attestation.is_some());

    // 1b. RPC #2 diverges on 1 address -> FAIL CLOSED with ALT_QUORUM_DIVERGENCE
    rpc2_diverge.store(true, Ordering::SeqCst);
    let div_err = quorum_rpc
        .fetch_alt_snapshot(&alt_key_str)
        .await
        .expect_err("divergent RPC must fail closed");
    assert!(
        div_err.contains("ALT_QUORUM_DIVERGENCE"),
        "expected ALT_QUORUM_DIVERGENCE, got: {div_err}"
    );
    rpc2_diverge.store(false, Ordering::SeqCst);

    // 2. Wire gateway with MockEnclaveDryRunSink + 2-of-2 quorum RPC + automatic reconciliation worker
    let tmp = TestTempDir::new("quorum-worker-sink");
    let clock = Arc::new(AtomicI64::new(FIXED_NOW));
    let mut keys = BTreeMap::new();
    keys.insert(
        TEST_0X_KEY_ID.to_string(),
        test_0x_signer().verifying_key().to_bytes(),
    );
    let sink = Arc::new(MockEnclaveDryRunSink {
        invocations: AtomicU64::new(0),
    });
    let store = SqliteSolanaSwapStore::open(tmp.db_path()).unwrap();
    let clock_c = clock.clone();
    let state = Arc::new(
        SolanaSwapGatewayState::new(
            store,
            TOKEN,
            sc.policy.clone(),
            keys,
            "auth-key-1",
            auth_signer(),
            "receipt-key-1",
            receipt_signer(),
            "checkpoint-key-1",
            checkpoint_signer(),
            Arc::new(move || clock_c.load(Ordering::SeqCst)),
        )
        .with_solana_rpc(quorum_rpc)
        .with_signing_sink(sink.clone()),
    );
    let app = router(state.clone());

    let (req_ev, res_ev, wire) =
        sc.build_signed_exchange(80_000_000, 96_000_000, sc.auth_dest_ata, "qw1");
    let (ev_st, ev_json) = post_json(
        &app,
        "/v1/solana/swap/evaluate",
        &json!({
            "caseId": "quorum-worker-eligible",
            "provenance": "test-fixture",
            "request": req_ev,
            "response": res_ev,
            "compiledMessageBase64": base64_encode(&wire),
            "addressLookupTables": [agreed],
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(ev_st, StatusCode::OK);
    let eval_resp: EvaluateSwapResponse = serde_json::from_value(ev_json).unwrap();
    let auth = eval_resp.authorization.unwrap();
    *stored_msg_b64.lock().unwrap() = Some(base64_encode(&wire));

    // 2a. Signing boundary routes through IsolatedSigningSink
    let (sb_st, sb_json) = post_json(
        &app,
        "/v1/solana/swap/signing-boundary",
        &json!({
            "compiledMessageBase64": base64_encode(&wire),
            "authorization": auth,
        }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(sb_st, StatusCode::OK);
    assert_eq!(sb_json["signingBoundaryOutcome"], "ACCEPTED_ENCLAVE_DRY_RUN");
    assert_eq!(sink.invocations.load(Ordering::SeqCst), 1);
    assert_eq!(sb_json["realSignaturesProduced"], 0);

    // 3. Track tx for automatic Evidence #3 reconciliation worker
    let (tr_st, tr_json) = post_json(
        &app,
        &format!("/v1/solana/swap/receipts/{}/track-tx", eval_resp.receipt_id),
        &json!({ "txSignature": "5AutoWorkerSig111111111111111111111111111111111111111111111111111" }),
        Some(TOKEN),
    )
    .await;
    assert_eq!(tr_st, StatusCode::ACCEPTED);
    assert_eq!(tr_json["tracked"], true);

    // Tick 1 while tx is not yet finalized -> deferred
    let tick1 = reconcile_pending_once(&state).await.unwrap();
    assert_eq!(tick1.checked, 1);
    assert_eq!(tick1.completed, 0);
    assert_eq!(tick1.deferred, 1);

    let (pend_st, pend_json) =
        get_json(&app, "/v1/solana/swap/reconciliations/pending", Some(TOKEN)).await;
    assert_eq!(pend_st, StatusCode::OK);
    assert_eq!(pend_json["count"], 1);
    assert_eq!(pend_json["pending"][0]["attempts"], 1);

    // Tick 2 once tx is finalized on RPC -> completed & signed confirmation persisted
    tx_ready.store(true, Ordering::SeqCst);
    let tick2 = reconcile_pending_once(&state).await.unwrap();
    assert_eq!(tick2.checked, 1);
    assert_eq!(tick2.completed, 1);
    assert_eq!(tick2.deferred, 0);

    let (pend2_st, pend2_json) =
        get_json(&app, "/v1/solana/swap/reconciliations/pending", Some(TOKEN)).await;
    assert_eq!(pend2_st, StatusCode::OK);
    assert_eq!(pend2_json["count"], 0);

    let (conf_st, conf_json) = get_json(
        &app,
        &format!(
            "/v1/solana/swap/receipts/{}/confirmation",
            eval_resp.receipt_id
        ),
        Some(TOKEN),
    )
    .await;
    assert_eq!(conf_st, StatusCode::OK);
    let conf: SignedConfirmationReceipt = serde_json::from_value(conf_json).unwrap();
    assert_eq!(conf.receipt.reconciliation.status, "CONFIRMED_WITHIN_POLICY");
    assert_eq!(conf.receipt.reconciliation.actual_output_net_credit, "99000000");
    verify_solana_swap_confirmation_receipt(&conf, &receipt_signer().verifying_key())
        .expect("worker-reconciled confirmation must verify offline");

    let (h_st, health) = get_json(&app, "/v1/solana/swap/health", Some(TOKEN)).await;
    assert_eq!(h_st, StatusCode::OK);
    assert_eq!(health["signingSink"], "mock-enclave-dry-run-sink");
    assert_eq!(health["upstream"]["solanaRpcEndpointCount"], 2);
    assert_eq!(health["upstream"]["altQuorumMin"], 2);
    assert_eq!(health["pendingReconciliations"], 0);
    assert_eq!(health["onchainConfirmations"], 1);
    assert_eq!(health["realSignaturesProduced"], 0);
    assert_eq!(health["broadcastCalls"], 0);

    rpc1_task.abort();
    rpc2_task.abort();
}
