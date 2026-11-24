//! Governed Axum HTTP gateway for the Arkhe x 0x Solana Swap Authorization backend.
//!
//! Enforces all three Arkhe x 0x invariants end-to-end in Rust with zero real transaction
//! signatures and zero network broadcasts:
//! 1. **Invariant 1 (`arkhe_verify_core::rfc9421`)**: verifies RFC 9421 Ed25519 signature,
//!    exact request/response `Content-Digest`, 60-second clock window, and durable SQLite WAL
//!    single-use anti-replay (`consumed_0x_responses`, written ONLY after signature passes).
//! 2. **Invariant 2 (`arkhe_verify_core::solana_swap`)**: parses raw serialized Solana `MessageV0`
//!    wire bytes, verifies Ed25519 ALT snapshot attestations & state context, resolves all
//!    static/ALT accounts by index, decodes every instruction, and applies the server-pinned
//!    [`SolanaSwapPolicy`] (`ELEGÍVEL` | `BLOQUEADO` | `INCONCLUSIVO`).
//! 3. **Invariant 3 (Signing Boundary + Durable MMR Receipts)**: only `ELEGÍVEL` emits a
//!    single-use Ed25519 test authorization bound to SHA-256 and BLAKE3 of the compiled
//!    `MessageV0`. `/v1/solana/swap/signing-boundary` verifies signature, digest binding, and
//!    SQLite single-use consumption BEFORE calling the dry-run key sink (`real_signatures_produced == 0`).
//!    Every decision is signed and committed to SQLite WAL + `rbb::mmr` with offline-verifiable bundles.

use std::collections::BTreeMap;
use std::path::{Path as FsPath, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use arkhe_kernel::solana_swap_sqlite::{AuthConsumeStatus, SqliteSolanaSwapStore};
use arkhe_verify_core::hash::blake3_256;
use arkhe_verify_core::rbb::mmr::{self, Proof};
use arkhe_verify_core::rfc9421::{
    base64_decode_strict, sha256_hex, verify_0x_http_response, HttpRequestEvidence,
    HttpResponseEvidence, Rfc9421VerificationResult, DEFAULT_0X_TAG, DEFAULT_MAX_AGE_SECONDS,
    DEFAULT_MAX_FUTURE_SKEW_SECONDS,
};
use arkhe_verify_core::solana_swap::{
    base58_decode_32, compile_solana_message_v0, evaluate_message_v0, normalize_raw_0x_payload,
    reconcile_solana_confirmation, AddressLookupTableSnapshot, CompiledMessageV0Artifact,
    EvaluationContext, OnChainConfirmationEvidence, OnChainReconciliationReport,
    SolanaSwapEvaluation, SolanaSwapPolicy, RECON_CONFIRMED_WITHIN_POLICY,
    RECON_INSUFFICIENT_CONFIRMATION, VERDICT_BLOCKED, VERDICT_ELIGIBLE, VERDICT_INCONCLUSIVE,
};
use axum::extract::{DefaultBodyLimit, Path, Query, Request, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::solana_swap_upstream::{
    AltObserverSigner, SolanaRpcReadOnlyClient, ZeroXQuoteRequest, ZeroXSwapClient,
};

const AUTH_DOMAIN: &[u8] = b"ARKHE:SOLANA-SWAP-AUTH:v1\0";
const RECEIPT_DOMAIN: &[u8] = b"ARKHE:ZEROX-DECISION-RECEIPT:v1\0";
const CHECKPOINT_DOMAIN: &[u8] = b"ARKHE:SOLANA-SWAP-CHECKPOINT:v1\0";
const CONFIRMATION_DOMAIN: &[u8] = b"ARKHE:SOLANA-SWAP-CONFIRMATION:v1\0";

pub const SWAP_AUTH_SCHEMA: &str = "arkhe-solana-swap-auth/v1";
pub const SWAP_RECEIPT_SCHEMA: &str = "arkhe-zerox-decision-receipt/v1";
pub const SWAP_CHECKPOINT_SCHEMA: &str = "arkhe-solana-swap-checkpoint/v1";
pub const SWAP_CONFIRMATION_SCHEMA: &str = "arkhe-solana-swap-confirmation/v1";
pub const RUST_SWAP_AUTHORITY: &str = "arkhe-verify-core/solana_swap/v1";

pub type ClockFn = dyn Fn() -> i64 + Send + Sync;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SwapTestAuthorizationPayload {
    pub schema: String,
    pub mode: String,
    pub authority: String,
    pub auth_id: String,
    pub network: String,
    pub verdict: String,
    pub policy_digest: String,
    pub request_body_sha256: String,
    pub response_body_sha256: String,
    pub compiled_message_sha256: String,
    pub compiled_message_blake3: String,
    pub issued_at: i64,
    pub expires_at: i64,
    pub kid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignedSwapTestAuthorization {
    pub payload: SwapTestAuthorizationPayload,
    pub signature_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SwapMmrCheckpointPayload {
    pub schema: String,
    pub profile: String,
    pub network: String,
    pub leaf_count: u64,
    pub root_hex: String,
    pub issued_at: i64,
    pub kid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignedSwapMmrCheckpoint {
    pub payload: SwapMmrCheckpointPayload,
    pub signature_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaSwapDecisionReceipt {
    pub schema: String,
    pub receipt_id: String,
    pub case_id: String,
    pub provenance: String,
    pub decision_authority: String,
    pub clock_unix_seconds: i64,
    pub policy_digest: String,
    pub policy_verdict: String,
    pub signing_boundary_outcome: String,
    pub final_outcome: String,
    pub reason_code: String,
    pub reason_detail: String,
    pub http_verification: Rfc9421VerificationResult,
    pub evaluation: Option<SolanaSwapEvaluation>,
    pub authorization: Option<SignedSwapTestAuthorization>,
    pub receipt_kid: String,
    pub real_signatures_produced: u64,
    pub broadcast_calls: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaSwapOfflineBundle {
    pub schema: String,
    pub receipt_id: String,
    pub leaf_index: u64,
    pub leaf_json_base64: String,
    pub receipt: SolanaSwapDecisionReceipt,
    pub receipt_signature_hex: String,
    pub mmr_proof: Proof,
    pub checkpoint: SignedSwapMmrCheckpoint,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvaluateSwapRequest {
    pub case_id: String,
    pub provenance: String,
    pub request: HttpRequestEvidence,
    pub response: HttpResponseEvidence,
    /// Pre-compiled MessageV0 wire bytes (base64). Optional when `recentBlockhash` is provided,
    /// in which case the backend compiles `MessageV0` natively in Rust.
    #[serde(default)]
    pub compiled_message_base64: Option<String>,
    /// Solana recent blockhash (base58) used for pure-Rust `MessageV0` compilation when
    /// `compiledMessageBase64` is omitted.
    #[serde(default)]
    pub recent_blockhash: Option<String>,
    #[serde(default)]
    pub address_lookup_tables: Vec<AddressLookupTableSnapshot>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompileMessageRequest {
    #[serde(default)]
    pub payer: Option<String>,
    pub recent_blockhash: String,
    #[serde(default)]
    pub response_body_base64: Option<String>,
    #[serde(default)]
    pub swap_instructions_payload: Option<Value>,
    #[serde(default)]
    pub address_lookup_tables: Vec<AddressLookupTableSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaSwapConfirmationReceipt {
    pub schema: String,
    pub receipt_id: String,
    pub auth_id: String,
    pub policy_digest: String,
    pub recorded_at: i64,
    pub receipt_kid: String,
    pub reconciliation: OnChainReconciliationReport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedConfirmationReceipt {
    pub receipt: SolanaSwapConfirmationReceipt,
    pub receipt_json_base64: String,
    pub signature_hex: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateSwapResponse {
    pub receipt_id: String,
    pub provenance: String,
    pub decision_authority: String,
    pub policy_verdict: String,
    pub final_outcome: String,
    pub reason_code: String,
    pub reason_detail: String,
    pub http_signature_valid: bool,
    pub authorization: Option<SignedSwapTestAuthorization>,
    pub receipt: SolanaSwapDecisionReceipt,
    pub receipt_signature_hex: String,
    pub mmr_proof: Proof,
    pub checkpoint: SignedSwapMmrCheckpoint,
    pub test_signer_calls: u64,
    pub real_signatures_produced: u64,
    pub broadcast_calls: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SigningBoundaryRequest {
    pub compiled_message_base64: String,
    pub authorization: SignedSwapTestAuthorization,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublicKeysDocument {
    pub schema: String,
    pub authority: String,
    pub network: String,
    pub policy_digest: String,
    pub auth_key_id: String,
    pub auth_public_key_hex: String,
    pub receipt_key_id: String,
    pub receipt_public_key_hex: String,
    pub checkpoint_key_id: String,
    pub checkpoint_public_key_hex: String,
    pub trusted_0x_key_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListReceiptsQuery {
    pub limit: Option<u64>,
    pub offset: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListBoundaryEventsQuery {
    pub auth_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyBundleResponse {
    pub valid: bool,
    pub error: Option<String>,
    pub receipt_id: String,
    pub policy_verdict: String,
    pub provenance: String,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningBoundaryResponse {
    pub accepted: bool,
    pub signing_boundary_outcome: String,
    pub reject_code: Option<String>,
    pub reject_detail: Option<String>,
    pub received_message_sha256: String,
    pub received_message_blake3: String,
    pub authorized_message_sha256: String,
    pub exact_message_match: bool,
    pub test_signer_calls: u64,
    pub real_signatures_produced: u64,
    pub broadcast_calls: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowQuoteAndEvaluateRequest {
    pub case_id: String,
    pub amount_in: u64,
    #[serde(default)]
    pub token_in: Option<String>,
    #[serde(default)]
    pub token_out: Option<String>,
    #[serde(default)]
    pub taker: Option<String>,
    #[serde(default)]
    pub slippage_bps: Option<u32>,
    #[serde(default)]
    pub recent_blockhash: Option<String>,
    #[serde(default)]
    pub fetch_alts: Option<bool>,
    #[serde(default)]
    pub address_lookup_tables: Vec<AddressLookupTableSnapshot>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReconcileRpcRequest {
    pub tx_signature: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrackTransactionRequest {
    pub tx_signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReconciliationTickSummary {
    pub checked: usize,
    pub completed: usize,
    pub deferred: usize,
}

/// Contract for an isolated downstream signing boundary (HSM / KMS / enclave).
/// Implementations MUST independently verify `authorization` Ed25519 signature and
/// `compiled_message_sha256` / `compiled_message_blake3` inside the enclave before signing.
pub struct SigningSinkInvocation<'a> {
    pub auth_id: &'a str,
    pub compiled_message_bytes: &'a [u8],
    pub compiled_message_sha256: &'a str,
    pub compiled_message_blake3: &'a str,
    pub authorization: &'a SignedSwapTestAuthorization,
}

#[derive(Debug, Clone)]
pub struct SigningSinkOutcome {
    pub mode_label: String,
    pub real_signature_produced: bool,
}

pub trait IsolatedSigningSink: Send + Sync {
    fn name(&self) -> &'static str;
    fn accept_authorized_message(
        &self,
        invocation: &SigningSinkInvocation<'_>,
    ) -> Result<SigningSinkOutcome, String>;
}

/// Default fail-safe dry-run signing sink: NEVER signs a real Solana transaction and NEVER broadcasts.
#[derive(Debug, Default)]
pub struct DryRunSigningSink;

impl IsolatedSigningSink for DryRunSigningSink {
    fn name(&self) -> &'static str {
        "dry-run-sink"
    }

    fn accept_authorized_message(
        &self,
        invocation: &SigningSinkInvocation<'_>,
    ) -> Result<SigningSinkOutcome, String> {
        if invocation.compiled_message_sha256
            != invocation.authorization.payload.compiled_message_sha256
            || invocation.compiled_message_blake3
                != invocation.authorization.payload.compiled_message_blake3
        {
            return Err("sink invariant failed: message digest mismatch".to_string());
        }
        Ok(SigningSinkOutcome {
            mode_label: "ACCEPTED_DRY_RUN".to_string(),
            real_signature_produced: false,
        })
    }
}

pub struct SolanaSwapGatewayState {
    store: Mutex<SqliteSolanaSwapStore>,
    pub token: String,
    /// Server-pinned policy; clients cannot override caps or trust anchors.
    pub policy: SolanaSwapPolicy,
    /// Server-pinned external 0x Ed25519 keys (official or test-fixture).
    pub trusted_0x_keys: BTreeMap<String, [u8; 32]>,
    pub max_0x_age_seconds: i64,
    pub auth_ttl_seconds: i64,
    pub auth_key_id: String,
    pub auth_signer: SigningKey,
    pub receipt_key_id: String,
    pub receipt_signer: SigningKey,
    pub checkpoint_key_id: String,
    pub checkpoint_signer: SigningKey,
    pub clock: Arc<ClockFn>,
    pub zerox_client: Option<ZeroXSwapClient>,
    pub solana_rpc: Option<SolanaRpcReadOnlyClient>,
    pub signing_sink: Arc<dyn IsolatedSigningSink>,
    pub test_signer_calls: AtomicU64,
    pub real_signatures_produced: AtomicU64,
    pub broadcast_calls: AtomicU64,
}

impl SolanaSwapGatewayState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        store: SqliteSolanaSwapStore,
        token: impl Into<String>,
        policy: SolanaSwapPolicy,
        trusted_0x_keys: BTreeMap<String, [u8; 32]>,
        auth_key_id: impl Into<String>,
        auth_signer: SigningKey,
        receipt_key_id: impl Into<String>,
        receipt_signer: SigningKey,
        checkpoint_key_id: impl Into<String>,
        checkpoint_signer: SigningKey,
        clock: Arc<ClockFn>,
    ) -> Self {
        Self {
            store: Mutex::new(store),
            token: token.into(),
            policy,
            trusted_0x_keys,
            max_0x_age_seconds: DEFAULT_MAX_AGE_SECONDS,
            auth_ttl_seconds: 60,
            auth_key_id: auth_key_id.into(),
            auth_signer,
            receipt_key_id: receipt_key_id.into(),
            receipt_signer,
            checkpoint_key_id: checkpoint_key_id.into(),
            checkpoint_signer,
            clock,
            zerox_client: None,
            solana_rpc: None,
            signing_sink: Arc::new(DryRunSigningSink),
            test_signer_calls: AtomicU64::new(0),
            real_signatures_produced: AtomicU64::new(0),
            broadcast_calls: AtomicU64::new(0),
        }
    }

    pub fn with_zerox_client(mut self, client: ZeroXSwapClient) -> Self {
        self.zerox_client = Some(client);
        self
    }

    pub fn with_solana_rpc(mut self, rpc: SolanaRpcReadOnlyClient) -> Self {
        self.solana_rpc = Some(rpc);
        self
    }

    pub fn with_signing_sink(mut self, sink: Arc<dyn IsolatedSigningSink>) -> Self {
        self.signing_sink = sink;
        self
    }

    pub fn public_keys_document(&self) -> PublicKeysDocument {
        PublicKeysDocument {
            schema: "arkhe-solana-swap-public-keys/v1".to_string(),
            authority: RUST_SWAP_AUTHORITY.to_string(),
            network: self.policy.network.clone(),
            policy_digest: self.policy_digest_hex(),
            auth_key_id: self.auth_key_id.clone(),
            auth_public_key_hex: hex::encode(self.auth_signer.verifying_key().to_bytes()),
            receipt_key_id: self.receipt_key_id.clone(),
            receipt_public_key_hex: hex::encode(self.receipt_signer.verifying_key().to_bytes()),
            checkpoint_key_id: self.checkpoint_key_id.clone(),
            checkpoint_public_key_hex: hex::encode(
                self.checkpoint_signer.verifying_key().to_bytes(),
            ),
            trusted_0x_key_ids: self.trusted_0x_keys.keys().cloned().collect(),
        }
    }

    pub fn policy_digest_hex(&self) -> String {
        let raw = serde_json::to_vec(&self.policy).unwrap_or_default();
        let mut buf = Vec::with_capacity(21 + raw.len());
        buf.extend_from_slice(b"ARKHE:SWAP-POLICY:v1\0");
        buf.extend_from_slice(&raw);
        hex::encode(blake3_256(&buf))
    }

    fn sign_checkpoint(&self, leaf_count: u64, root: &[u8; 32], issued_at: i64) -> SignedSwapMmrCheckpoint {
        let payload = SwapMmrCheckpointPayload {
            schema: SWAP_CHECKPOINT_SCHEMA.to_string(),
            profile: "arkhe-rbb-mmr-v3-blake3".to_string(),
            network: self.policy.network.clone(),
            leaf_count,
            root_hex: hex::encode(root),
            issued_at,
            kid: self.checkpoint_key_id.clone(),
        };
        let bytes = serde_json::to_vec(&payload).expect("checkpoint payload serializes");
        let mut preimage = Vec::with_capacity(CHECKPOINT_DOMAIN.len() + bytes.len());
        preimage.extend_from_slice(CHECKPOINT_DOMAIN);
        preimage.extend_from_slice(&bytes);
        let sig = self.checkpoint_signer.sign(&preimage);
        SignedSwapMmrCheckpoint {
            payload,
            signature_hex: hex::encode(sig.to_bytes()),
        }
    }

    fn sign_authorization(&self, payload: SwapTestAuthorizationPayload) -> SignedSwapTestAuthorization {
        let bytes = serde_json::to_vec(&payload).expect("auth payload serializes");
        let mut preimage = Vec::with_capacity(AUTH_DOMAIN.len() + bytes.len());
        preimage.extend_from_slice(AUTH_DOMAIN);
        preimage.extend_from_slice(&bytes);
        let sig = self.auth_signer.sign(&preimage);
        SignedSwapTestAuthorization {
            payload,
            signature_hex: hex::encode(sig.to_bytes()),
        }
    }

    fn sign_receipt(&self, receipt: &SolanaSwapDecisionReceipt) -> Result<(Vec<u8>, String), String> {
        let leaf_json = serde_json::to_vec(receipt).map_err(|e| e.to_string())?;
        let mut preimage = Vec::with_capacity(RECEIPT_DOMAIN.len() + leaf_json.len());
        preimage.extend_from_slice(RECEIPT_DOMAIN);
        preimage.extend_from_slice(&leaf_json);
        let sig = self.receipt_signer.sign(&preimage);
        Ok((leaf_json, hex::encode(sig.to_bytes())))
    }

    fn sign_confirmation_receipt(
        &self,
        receipt: &SolanaSwapConfirmationReceipt,
    ) -> Result<(Vec<u8>, String), String> {
        let raw_json = serde_json::to_vec(receipt).map_err(|e| e.to_string())?;
        let mut preimage = Vec::with_capacity(CONFIRMATION_DOMAIN.len() + raw_json.len());
        preimage.extend_from_slice(CONFIRMATION_DOMAIN);
        preimage.extend_from_slice(&raw_json);
        let sig = self.receipt_signer.sign(&preimage);
        Ok((raw_json, hex::encode(sig.to_bytes())))
    }
}

fn verify_ed25519_hex(domain: &[u8], payload: &[u8], sig_hex: &str, vk: &VerifyingKey) -> bool {
    let Ok(sig_bytes) = hex::decode(sig_hex) else {
        return false;
    };
    let Ok(sig_arr): Result<[u8; 64], _> = sig_bytes.try_into() else {
        return false;
    };
    let sig = Signature::from_bytes(&sig_arr);
    let mut preimage = Vec::with_capacity(domain.len() + payload.len());
    preimage.extend_from_slice(domain);
    preimage.extend_from_slice(payload);
    vk.verify_strict(&preimage, &sig).is_ok()
}

pub fn verify_signed_authorization(
    auth: &SignedSwapTestAuthorization,
    auth_vk: &VerifyingKey,
    now_unix_seconds: i64,
) -> Result<(), (&'static str, String)> {
    if auth.payload.schema != SWAP_AUTH_SCHEMA
        || auth.payload.verdict != VERDICT_ELIGIBLE
        || auth.payload.authority != RUST_SWAP_AUTHORITY
    {
        return Err((
            "NON_ELIGIBLE_AUTHORIZATION",
            "Authorization schema, verdict, or authority is invalid.".to_string(),
        ));
    }
    let payload_bytes = serde_json::to_vec(&auth.payload).map_err(|e| {
        (
            "MALFORMED_AUTHORIZATION",
            format!("serialization failed: {e}"),
        )
    })?;
    if !verify_ed25519_hex(AUTH_DOMAIN, &payload_bytes, &auth.signature_hex, auth_vk) {
        return Err((
            "INVALID_AUTHORIZATION_SIGNATURE",
            "Authorization Ed25519 signature verification failed.".to_string(),
        ));
    }
    if now_unix_seconds < auth.payload.issued_at || now_unix_seconds > auth.payload.expires_at {
        return Err((
            "AUTHORIZATION_EXPIRED_OR_NOT_YET_VALID",
            "Authorization timestamp is outside its validity window.".to_string(),
        ));
    }
    Ok(())
}

/// Offline verification of an exported [`SolanaSwapOfflineBundle`] against pinned verifying keys.
/// Zero database or network access required.
pub fn verify_solana_swap_receipt_bundle(
    bundle: &SolanaSwapOfflineBundle,
    auth_vk: &VerifyingKey,
    receipt_vk: &VerifyingKey,
    checkpoint_vk: &VerifyingKey,
) -> Result<(), String> {
    if bundle.schema != "arkhe-solana-swap-offline-bundle/v1" {
        return Err("unsupported offline bundle schema".to_string());
    }

    // 1. Verify checkpoint Ed25519 signature
    let cp_bytes = serde_json::to_vec(&bundle.checkpoint.payload).map_err(|e| e.to_string())?;
    if !verify_ed25519_hex(
        CHECKPOINT_DOMAIN,
        &cp_bytes,
        &bundle.checkpoint.signature_hex,
        checkpoint_vk,
    ) {
        return Err("checkpoint Ed25519 signature invalid".to_string());
    }

    // 2. Decode raw leaf JSON and verify receipt Ed25519 signature
    let leaf_json = base64_decode_strict(&bundle.leaf_json_base64)?;
    if !verify_ed25519_hex(
        RECEIPT_DOMAIN,
        &leaf_json,
        &bundle.receipt_signature_hex,
        receipt_vk,
    ) {
        return Err("receipt Ed25519 signature invalid".to_string());
    }

    // 3. Verify parsed receipt matches signed leaf_json exactly
    let decoded_receipt: SolanaSwapDecisionReceipt =
        serde_json::from_slice(&leaf_json).map_err(|e| format!("leaf_json parse failed: {e}"))?;
    let provided_receipt_val = serde_json::to_value(&bundle.receipt).map_err(|e| e.to_string())?;
    let decoded_receipt_val = serde_json::to_value(&decoded_receipt).map_err(|e| e.to_string())?;
    if provided_receipt_val != decoded_receipt_val {
        return Err("bundle.receipt diverges from signed leaf_json_base64".to_string());
    }

    // 4. Verify rbb::mmr v3 inclusion proof against signed checkpoint root
    let leaf_digest = blake3_256(&leaf_json);
    let root_bytes = hex::decode(&bundle.checkpoint.payload.root_hex)
        .map_err(|_| "invalid checkpoint root_hex".to_string())?;
    let expected_root: [u8; 32] = root_bytes
        .try_into()
        .map_err(|_| "checkpoint root must be 32 bytes".to_string())?;
    mmr::verify(
        &leaf_digest,
        &bundle.mmr_proof,
        bundle.checkpoint.payload.leaf_count,
        &expected_root,
    )
    .map_err(|e| format!("rbb::mmr inclusion verification failed: {e:?}"))?;

    // 5. Verify zero real signatures / zero broadcasts and authorization eligibility invariants
    if decoded_receipt.real_signatures_produced != 0 || decoded_receipt.broadcast_calls != 0 {
        return Err("pilot invariant violated: real_signatures_produced or broadcast_calls non-zero".to_string());
    }
    if decoded_receipt.policy_verdict == VERDICT_ELIGIBLE {
        let Some(auth) = &decoded_receipt.authorization else {
            return Err("ELEGÍVEL receipt missing authorization".to_string());
        };
        verify_signed_authorization(auth, auth_vk, decoded_receipt.clock_unix_seconds)
            .map_err(|(c, d)| format!("authorization check failed: {c}: {d}"))?;
        let Some(eval) = &decoded_receipt.evaluation else {
            return Err("ELEGÍVEL receipt missing evaluation".to_string());
        };
        if auth.payload.compiled_message_sha256 != eval.compiled_message.sha256
            || auth.payload.compiled_message_blake3 != eval.compiled_message.blake3
        {
            return Err("authorization message digest does not match evaluation".to_string());
        }
    } else if decoded_receipt.authorization.is_some() {
        return Err(format!(
            "non-eligible receipt ({}) illegally contains authorization",
            decoded_receipt.policy_verdict
        ));
    }

    Ok(())
}

/// Offline verification of Evidence #3 (post-execution on-chain confirmation receipt).
pub fn verify_solana_swap_confirmation_receipt(
    signed: &SignedConfirmationReceipt,
    receipt_vk: &VerifyingKey,
) -> Result<(), String> {
    let raw_bytes = base64_decode_strict(&signed.receipt_json_base64)
        .map_err(|e| format!("invalid confirmation receiptJsonBase64: {e}"))?;
    let sig_bytes = hex::decode(&signed.signature_hex)
        .map_err(|e| format!("invalid confirmation signature hex: {e}"))?;
    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| "confirmation signature must be 64 bytes".to_string())?;
    let sig = Signature::from_bytes(&sig_arr);
    let mut msg = Vec::with_capacity(CONFIRMATION_DOMAIN.len() + raw_bytes.len());
    msg.extend_from_slice(CONFIRMATION_DOMAIN);
    msg.extend_from_slice(&raw_bytes);
    receipt_vk
        .verify_strict(&msg, &sig)
        .map_err(|_| "confirmation receipt Ed25519 signature invalid".to_string())?;

    let decoded: SolanaSwapConfirmationReceipt = serde_json::from_slice(&raw_bytes)
        .map_err(|e| format!("invalid confirmation receipt JSON: {e}"))?;
    if decoded.schema != SWAP_CONFIRMATION_SCHEMA {
        return Err(format!("unexpected confirmation schema: {}", decoded.schema));
    }
    let decoded_val = serde_json::to_value(&decoded).map_err(|e| e.to_string())?;
    let provided_val = serde_json::to_value(&signed.receipt).map_err(|e| e.to_string())?;
    if decoded_val != provided_val {
        return Err("confirmation receipt object does not match signed bytes".to_string());
    }
    Ok(())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    let max_len = a.len().max(b.len());
    let mut diff = a.len() ^ b.len();
    for i in 0..max_len {
        let ba = a.get(i).copied().unwrap_or(0);
        let bb = b.get(i).copied().unwrap_or(0);
        diff |= usize::from(ba ^ bb);
    }
    diff == 0
}

fn authenticate(headers: &HeaderMap, state: &SolanaSwapGatewayState) -> Result<(), (StatusCode, Json<Value>)> {
    let expected = format!("Bearer {}", state.token);
    let provided = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !constant_time_eq(provided.as_bytes(), expected.as_bytes()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "authentication required" })),
        ));
    }
    Ok(())
}

async fn health(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    store.health().map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?;
    let stats = store.stats().map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?;
    Ok(Json(json!({
        "status": "ok",
        "authority": RUST_SWAP_AUTHORITY,
        "network": state.policy.network,
        "policyDigest": state.policy_digest_hex(),
        "receiptCount": stats.receipt_count,
        "consumed0xResponses": stats.consumed_0x_count,
        "issuedAuthorizations": stats.issued_auth_count,
        "consumedAuthorizations": stats.consumed_auth_count,
        "signingBoundaryEvents": stats.signing_boundary_event_count,
        "onchainConfirmations": stats.onchain_confirmation_count,
        "pendingReconciliations": stats.pending_reconciliation_count,
        "mmrRootHex": stats.mmr_root_hex,
        "signingSink": state.signing_sink.name(),
        "testSignerCalls": state.test_signer_calls.load(Ordering::SeqCst),
        "realSignaturesProduced": state.real_signatures_produced.load(Ordering::SeqCst),
        "broadcastCalls": state.broadcast_calls.load(Ordering::SeqCst),
        "upstream": {
            "zeroxConfigured": state.zerox_client.is_some(),
            "solanaRpcConfigured": state.solana_rpc.is_some(),
            "solanaRpcEndpointCount": state
                .solana_rpc
                .as_ref()
                .map(|r| r.rpc_endpoint_count())
                .unwrap_or(0),
            "altQuorumMin": state
                .solana_rpc
                .as_ref()
                .map(|r| r.min_alt_quorum())
                .unwrap_or(0),
            "altObserverConfigured": state
                .solana_rpc
                .as_ref()
                .map(|r| r.has_alt_observer())
                .unwrap_or(false),
        },
    })))
}

async fn evaluate_swap(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Json(req): Json<EvaluateSwapRequest>,
) -> Result<(StatusCode, Json<EvaluateSwapResponse>), (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    evaluate_swap_internal(&state, req)
}

fn evaluate_swap_internal(
    state: &SolanaSwapGatewayState,
    req: EvaluateSwapRequest,
) -> Result<(StatusCode, Json<EvaluateSwapResponse>), (StatusCode, Json<Value>)> {

    if req.provenance != "0x-official" && req.provenance != "test-fixture" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "provenance must be '0x-official' or 'test-fixture'" })),
        ));
    }

    let now = (state.clock)();
    let policy_digest = state.policy_digest_hex();
    let receipt_id = format!("rcpt-{}", uuid::Uuid::new_v4());

    // Invariant 1: RFC 9421 Ed25519 verification against server-pinned keys & clock
    let mut http_check = verify_0x_http_response(
        &req.request,
        &req.response,
        &state.trusted_0x_keys,
        now,
        state.max_0x_age_seconds,
        DEFAULT_MAX_FUTURE_SKEW_SECONDS,
        DEFAULT_0X_TAG,
    );

    let mut store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;

    // Durable single-use replay guard: ONLY written AFTER RFC 9421 cryptographic auth passes!
    if http_check.ok {
        let sig_digest = http_check
            .response_signature_digest
            .as_deref()
            .unwrap_or_default();
        let key_id = http_check.key_id.as_deref().unwrap_or_default();
        let created = http_check.created.unwrap_or(now);
        let first_use = store
            .consume_0x_response_once(sig_digest, key_id, created, now)
            .map_err(|e| {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({ "error": format!("replay store error: {e}") })),
                )
            })?;
        if !first_use {
            http_check.ok = false;
            http_check.code = "RESPONSE_REPLAY_DETECTED".to_string();
            http_check.detail = "Authentic 0x response was already consumed in durable SQLite WAL store; single-use enforced even within 60s window.".to_string();
        }
    }

    let (policy_verdict, reason_code, reason_detail, evaluation, authorization, http_status) =
        if !http_check.ok {
            (
                VERDICT_BLOCKED.to_string(),
                http_check.code.clone(),
                http_check.detail.clone(),
                None,
                None,
                StatusCode::FORBIDDEN,
            )
        } else {
            // Invariant 2: Decode (or natively compile in Rust) Solana MessageV0 wire bytes & evaluate
            let raw_res_bytes = base64_decode_strict(&req.response.body_base64).map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": format!("invalid response bodyBase64: {e}") })),
                )
            })?;
            let raw_res_json: Value = serde_json::from_slice(&raw_res_bytes).map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": format!("invalid 0x response JSON: {e}") })),
                )
            })?;
            let normalized_payload = normalize_raw_0x_payload(&raw_res_json).map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": format!("invalid 0x swap instructions payload: {e}") })),
                )
            })?;
            let compiled_bytes = match (&req.compiled_message_base64, &req.recent_blockhash) {
                (Some(b64), _) => base64_decode_strict(b64).map_err(|e| {
                    (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": format!("invalid compiledMessageBase64: {e}") })),
                    )
                })?,
                (None, Some(bh)) => compile_solana_message_v0(
                    &state.policy.taker,
                    bh,
                    &normalized_payload,
                    &req.address_lookup_tables,
                )
                .map_err(|e| {
                    (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": format!("native MessageV0 compile error: {e}") })),
                    )
                })?
                .compiled_message_bytes,
                (None, None) => {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        Json(json!({
                            "error": "either compiledMessageBase64 or recentBlockhash must be provided"
                        })),
                    ));
                }
            };

            let ctx = EvaluationContext {
                policy: state.policy.clone(),
                address_lookup_tables: req.address_lookup_tables,
                swap_instructions_payload: normalized_payload,
            };

            let eval = evaluate_message_v0(&compiled_bytes, &ctx).map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": format!("MessageV0 parse/eval error: {e}") })),
                )
            })?;

            if eval.verdict == VERDICT_ELIGIBLE {
                let auth_id = format!("auth-{}", uuid::Uuid::new_v4());
                let expires_at = now + state.auth_ttl_seconds;
                store
                    .record_issued_authorization(
                        &auth_id,
                        &eval.compiled_message.sha256,
                        &eval.compiled_message.blake3,
                        expires_at,
                    )
                    .map_err(|e| {
                        (
                            StatusCode::SERVICE_UNAVAILABLE,
                            Json(json!({ "error": format!("failed to persist authorization: {e}") })),
                        )
                    })?;

                let auth = state.sign_authorization(SwapTestAuthorizationPayload {
                    schema: SWAP_AUTH_SCHEMA.to_string(),
                    mode: "OFFLINE_TEST_AUTHORIZATION_ONLY".to_string(),
                    authority: RUST_SWAP_AUTHORITY.to_string(),
                    auth_id,
                    network: state.policy.network.clone(),
                    verdict: VERDICT_ELIGIBLE.to_string(),
                    policy_digest: policy_digest.clone(),
                    request_body_sha256: http_check.request_body_sha256.clone(),
                    response_body_sha256: http_check.response_body_sha256.clone(),
                    compiled_message_sha256: eval.compiled_message.sha256.clone(),
                    compiled_message_blake3: eval.compiled_message.blake3.clone(),
                    issued_at: now,
                    expires_at,
                    kid: state.auth_key_id.clone(),
                });

                let rc = eval.reason_code.clone();
                let rd = eval.reason_detail.clone();
                (
                    VERDICT_ELIGIBLE.to_string(),
                    rc,
                    rd,
                    Some(eval),
                    Some(auth),
                    StatusCode::OK,
                )
            } else {
                let status = if eval.verdict == VERDICT_INCONCLUSIVE {
                    StatusCode::UNPROCESSABLE_ENTITY
                } else {
                    StatusCode::FORBIDDEN
                };
                let v = eval.verdict.clone();
                let rc = eval.reason_code.clone();
                let rd = eval.reason_detail.clone();
                (v, rc, rd, Some(eval), None, status)
            }
        };

    let receipt = SolanaSwapDecisionReceipt {
        schema: SWAP_RECEIPT_SCHEMA.to_string(),
        receipt_id: receipt_id.clone(),
        case_id: req.case_id,
        provenance: req.provenance.clone(),
        decision_authority: RUST_SWAP_AUTHORITY.to_string(),
        clock_unix_seconds: now,
        policy_digest,
        policy_verdict: policy_verdict.clone(),
        signing_boundary_outcome: "NOT_INVOKED".to_string(),
        final_outcome: policy_verdict.clone(),
        reason_code: reason_code.clone(),
        reason_detail: reason_detail.clone(),
        http_verification: http_check.clone(),
        evaluation,
        authorization: authorization.clone(),
        receipt_kid: state.receipt_key_id.clone(),
        real_signatures_produced: state.real_signatures_produced.load(Ordering::SeqCst),
        broadcast_calls: state.broadcast_calls.load(Ordering::SeqCst),
    };

    let (leaf_json, receipt_sig_hex) = state.sign_receipt(&receipt).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("receipt signing failed: {e}") })),
        )
    })?;

    let appended = store
        .append_receipt(
            &receipt_id,
            &leaf_json,
            &receipt_sig_hex,
            &policy_verdict,
            &receipt.final_outcome,
        )
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": format!("receipt commit failed: {e}") })),
            )
        })?;

    let checkpoint = state.sign_checkpoint(appended.leaf_count, &appended.mmr_root, now);

    Ok((
        http_status,
        Json(EvaluateSwapResponse {
            receipt_id,
            provenance: req.provenance,
            decision_authority: RUST_SWAP_AUTHORITY.to_string(),
            policy_verdict: policy_verdict.clone(),
            final_outcome: policy_verdict,
            reason_code,
            reason_detail,
            http_signature_valid: http_check.ok,
            authorization,
            receipt,
            receipt_signature_hex: receipt_sig_hex,
            mmr_proof: appended.mmr_proof,
            checkpoint,
            test_signer_calls: state.test_signer_calls.load(Ordering::SeqCst),
            real_signatures_produced: state.real_signatures_produced.load(Ordering::SeqCst),
            broadcast_calls: state.broadcast_calls.load(Ordering::SeqCst),
        }),
    ))
}

#[allow(clippy::too_many_arguments)]
fn reject_boundary_and_log(
    store: &mut SqliteSolanaSwapStore,
    state: &SolanaSwapGatewayState,
    auth_id: &str,
    code: &str,
    detail: String,
    received_sha256: &str,
    received_blake3: &str,
    authorized_sha256: &str,
    now: i64,
) -> Result<(StatusCode, Json<SigningBoundaryResponse>), (StatusCode, Json<Value>)> {
    store
        .record_signing_boundary_event(
            auth_id,
            false,
            Some(code),
            received_sha256,
            received_blake3,
            now,
        )
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": format!("boundary audit log error: {e}") })),
            )
        })?;
    Ok((
        StatusCode::FORBIDDEN,
        Json(SigningBoundaryResponse {
            accepted: false,
            signing_boundary_outcome: "REJECTED_AT_BOUNDARY".to_string(),
            reject_code: Some(code.to_string()),
            reject_detail: Some(detail),
            received_message_sha256: received_sha256.to_string(),
            received_message_blake3: received_blake3.to_string(),
            authorized_message_sha256: authorized_sha256.to_string(),
            exact_message_match: false,
            test_signer_calls: state.test_signer_calls.load(Ordering::SeqCst),
            real_signatures_produced: state.real_signatures_produced.load(Ordering::SeqCst),
            broadcast_calls: state.broadcast_calls.load(Ordering::SeqCst),
        }),
    ))
}

async fn signing_boundary(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Json(req): Json<SigningBoundaryRequest>,
) -> Result<(StatusCode, Json<SigningBoundaryResponse>), (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;

    let msg_bytes = base64_decode_strict(&req.compiled_message_base64).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("invalid compiledMessageBase64: {e}") })),
        )
    })?;
    let received_sha256 = sha256_hex(&msg_bytes);
    let received_blake3 = hex::encode(blake3_256(&msg_bytes));
    let authorized_sha256 = req.authorization.payload.compiled_message_sha256.clone();
    let auth_id = req.authorization.payload.auth_id.clone();
    let now = (state.clock)();

    let mut store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;

    // 1. Verify Ed25519 signature & validity window on authorization envelope
    let auth_vk = state.auth_signer.verifying_key();
    if let Err((code, detail)) = verify_signed_authorization(&req.authorization, &auth_vk, now) {
        return reject_boundary_and_log(
            &mut store,
            &state,
            &auth_id,
            code,
            detail,
            &received_sha256,
            &received_blake3,
            &authorized_sha256,
            now,
        );
    }

    // 2. Verify exact message digest binding BEFORE consuming authorization or touching key sink
    if received_sha256 != req.authorization.payload.compiled_message_sha256
        || received_blake3 != req.authorization.payload.compiled_message_blake3
    {
        return reject_boundary_and_log(
            &mut store,
            &state,
            &auth_id,
            "MESSAGE_DIGEST_MISMATCH_AFTER_AUTHORIZATION",
            format!(
                "Delivered message digest ({received_sha256}) differs from authorized digest ({}). Key was not called.",
                req.authorization.payload.compiled_message_sha256
            ),
            &received_sha256,
            &received_blake3,
            &authorized_sha256,
            now,
        );
    }

    // 3. Atomically consume single-use authorization in SQLite WAL
    let consume = store
        .consume_authorization_once(&auth_id, &received_sha256, &received_blake3, now)
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": format!("authorization store error: {e}") })),
            )
        })?;

    match consume {
        AuthConsumeStatus::NotFound => {
            return reject_boundary_and_log(
                &mut store,
                &state,
                &auth_id,
                "AUTHORIZATION_NOT_ISSUED_BY_GATEWAY",
                "Authorization id was not issued by this gateway.".to_string(),
                &received_sha256,
                &received_blake3,
                &authorized_sha256,
                now,
            );
        }
        AuthConsumeStatus::AlreadyConsumed => {
            return reject_boundary_and_log(
                &mut store,
                &state,
                &auth_id,
                "AUTHORIZATION_ALREADY_CONSUMED",
                "Single-use authorization was already consumed.".to_string(),
                &received_sha256,
                &received_blake3,
                &authorized_sha256,
                now,
            );
        }
        AuthConsumeStatus::Expired => {
            return reject_boundary_and_log(
                &mut store,
                &state,
                &auth_id,
                "AUTHORIZATION_EXPIRED",
                "Authorization expired before signing boundary submission.".to_string(),
                &received_sha256,
                &received_blake3,
                &authorized_sha256,
                now,
            );
        }
        AuthConsumeStatus::DigestMismatch { .. } => {
            return reject_boundary_and_log(
                &mut store,
                &state,
                &auth_id,
                "MESSAGE_DIGEST_MISMATCH_AFTER_AUTHORIZATION",
                "Delivered message digest does not match durable authorization record.".to_string(),
                &received_sha256,
                &received_blake3,
                &authorized_sha256,
                now,
            );
        }
        AuthConsumeStatus::Consumed => {}
    }

    store
        .record_signing_boundary_event(
            &auth_id,
            true,
            None,
            &received_sha256,
            &received_blake3,
            now,
        )
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": format!("boundary audit log error: {e}") })),
            )
        })?;

    // 4. Isolated signing sink (defaults to DryRunSigningSink: 0 real signatures, 0 broadcasts)
    let sink_outcome = state
        .signing_sink
        .accept_authorized_message(&SigningSinkInvocation {
            auth_id: &auth_id,
            compiled_message_bytes: &msg_bytes,
            compiled_message_sha256: &received_sha256,
            compiled_message_blake3: &received_blake3,
            authorization: &req.authorization,
        })
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("signing sink error: {e}") })),
            )
        })?;
    let calls = state.test_signer_calls.fetch_add(1, Ordering::SeqCst) + 1;
    if sink_outcome.real_signature_produced {
        state.real_signatures_produced.fetch_add(1, Ordering::SeqCst);
    }
    Ok((
        StatusCode::OK,
        Json(SigningBoundaryResponse {
            accepted: true,
            signing_boundary_outcome: sink_outcome.mode_label,
            reject_code: None,
            reject_detail: None,
            received_message_sha256: received_sha256,
            received_message_blake3: received_blake3,
            authorized_message_sha256: authorized_sha256,
            exact_message_match: true,
            test_signer_calls: calls,
            real_signatures_produced: state.real_signatures_produced.load(Ordering::SeqCst),
            broadcast_calls: state.broadcast_calls.load(Ordering::SeqCst),
        }),
    ))
}

async fn get_public_keys(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
) -> Result<Json<PublicKeysDocument>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    Ok(Json(state.public_keys_document()))
}

async fn list_receipts(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Query(q): Query<ListReceiptsQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    let limit = q.limit.unwrap_or(50);
    let offset = q.offset.unwrap_or(0);
    let rows = store.list_receipts(limit, offset).map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?;
    let stats = store.stats().map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?;
    let items: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "seq": r.seq,
                "receiptId": r.receipt_id,
                "leafDigest": r.leaf_digest,
                "verdict": r.verdict,
                "finalOutcome": r.final_outcome,
            })
        })
        .collect();
    Ok(Json(json!({
        "total": stats.receipt_count,
        "mmrRootHex": stats.mmr_root_hex,
        "limit": limit.clamp(1, 200),
        "offset": offset,
        "receipts": items,
    })))
}

async fn list_signing_boundary_events(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Query(q): Query<ListBoundaryEventsQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    let rows = store
        .list_signing_boundary_events(q.auth_id.as_deref())
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": e })),
            )
        })?;
    let events: Vec<Value> = rows
        .into_iter()
        .map(|e| {
            json!({
                "seq": e.seq,
                "authId": e.auth_id,
                "accepted": e.accepted,
                "rejectCode": e.reject_code,
                "receivedSha256": e.received_sha256,
                "receivedBlake3": e.received_blake3,
                "recordedAt": e.recorded_at,
            })
        })
        .collect();
    Ok(Json(json!({
        "count": events.len(),
        "events": events,
    })))
}

async fn verify_bundle_http(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Json(bundle): Json<SolanaSwapOfflineBundle>,
) -> Result<(StatusCode, Json<VerifyBundleResponse>), (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let res = verify_solana_swap_receipt_bundle(
        &bundle,
        &state.auth_signer.verifying_key(),
        &state.receipt_signer.verifying_key(),
        &state.checkpoint_signer.verifying_key(),
    );
    match res {
        Ok(()) => Ok((
            StatusCode::OK,
            Json(VerifyBundleResponse {
                valid: true,
                error: None,
                receipt_id: bundle.receipt_id,
                policy_verdict: bundle.receipt.policy_verdict,
                provenance: bundle.receipt.provenance,
            }),
        )),
        Err(err) => Ok((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(VerifyBundleResponse {
                valid: false,
                error: Some(err),
                receipt_id: bundle.receipt_id,
                policy_verdict: bundle.receipt.policy_verdict,
                provenance: bundle.receipt.provenance,
            }),
        )),
    }
}

async fn get_receipt_bundle(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Path(receipt_id): Path<String>,
) -> Result<Json<SolanaSwapOfflineBundle>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    let Some(stored) = store.get_receipt_bundle(&receipt_id).map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "receipt not found" })),
        ));
    };

    let receipt: SolanaSwapDecisionReceipt = serde_json::from_slice(&stored.leaf_json)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("corrupted stored receipt JSON: {e}") })),
            )
        })?;
    let now = (state.clock)();
    let checkpoint = state.sign_checkpoint(stored.leaf_count, &stored.mmr_root, now);

    Ok(Json(SolanaSwapOfflineBundle {
        schema: "arkhe-solana-swap-offline-bundle/v1".to_string(),
        receipt_id: stored.receipt_id,
        leaf_index: stored.seq,
        leaf_json_base64: arkhe_verify_core::rfc9421::base64_encode(&stored.leaf_json),
        receipt,
        receipt_signature_hex: stored.signature_hex,
        mmr_proof: stored.mmr_proof,
        checkpoint,
    }))
}

async fn get_policy(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    Ok(Json(json!({
        "authority": RUST_SWAP_AUTHORITY,
        "policyDigest": state.policy_digest_hex(),
        "policy": state.policy,
    })))
}

async fn get_checkpoint(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
) -> Result<Json<SignedSwapMmrCheckpoint>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    let Some((leaf_count, root)) = store.latest_mmr_state().map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "no receipts committed yet" })),
        ));
    };
    let now = (state.clock)();
    Ok(Json(state.sign_checkpoint(leaf_count, &root, now)))
}

async fn compile_message_http(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Json(req): Json<CompileMessageRequest>,
) -> Result<Json<CompiledMessageV0Artifact>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let raw_json: Value = match (&req.response_body_base64, req.swap_instructions_payload) {
        (Some(b64), _) => {
            let bytes = base64_decode_strict(b64).map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": format!("invalid responseBodyBase64: {e}") })),
                )
            })?;
            serde_json::from_slice(&bytes).map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": format!("invalid 0x response JSON: {e}") })),
                )
            })?
        }
        (None, Some(v)) => v,
        (None, None) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "either responseBodyBase64 or swapInstructionsPayload must be provided"
                })),
            ));
        }
    };
    let normalized = normalize_raw_0x_payload(&raw_json).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("invalid 0x swap payload: {e}") })),
        )
    })?;
    let payer = req.payer.as_deref().unwrap_or(&state.policy.taker);
    let artifact = compile_solana_message_v0(
        payer,
        &req.recent_blockhash,
        &normalized,
        &req.address_lookup_tables,
    )
    .map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("MessageV0 compilation failed: {e}") })),
        )
    })?;
    Ok(Json(artifact))
}

async fn confirm_receipt_onchain(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Path(receipt_id): Path<String>,
    Json(evidence): Json<OnChainConfirmationEvidence>,
) -> Result<(StatusCode, Json<SignedConfirmationReceipt>), (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    confirm_receipt_internal(&state, receipt_id, evidence)
}

fn confirm_receipt_internal(
    state: &SolanaSwapGatewayState,
    receipt_id: String,
    evidence: OnChainConfirmationEvidence,
) -> Result<(StatusCode, Json<SignedConfirmationReceipt>), (StatusCode, Json<Value>)> {
    let mut store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    let Some(stored) = store.get_receipt_bundle(&receipt_id).map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "receipt not found" })),
        ));
    };
    let decision: SolanaSwapDecisionReceipt = serde_json::from_slice(&stored.leaf_json)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("corrupted stored receipt JSON: {e}") })),
            )
        })?;
    let Some(auth) = decision.authorization else {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({
                "error": format!(
                    "receipt '{}' has verdict '{}' and was never authorized for execution",
                    receipt_id, decision.policy_verdict
                )
            })),
        ));
    };

    let reconciliation = reconcile_solana_confirmation(
        &state.policy,
        &auth.payload.compiled_message_sha256,
        &auth.payload.compiled_message_blake3,
        &evidence,
    )
    .map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("invalid confirmation evidence: {e}") })),
        )
    })?;

    let now = (state.clock)();
    let receipt = SolanaSwapConfirmationReceipt {
        schema: SWAP_CONFIRMATION_SCHEMA.to_string(),
        receipt_id: receipt_id.clone(),
        auth_id: auth.payload.auth_id,
        policy_digest: state.policy_digest_hex(),
        recorded_at: now,
        receipt_kid: state.receipt_key_id.clone(),
        reconciliation: reconciliation.clone(),
    };
    let (raw_json, sig_hex) = state.sign_confirmation_receipt(&receipt).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("confirmation signing failed: {e}") })),
        )
    })?;

    if reconciliation.status == RECON_INSUFFICIENT_CONFIRMATION {
        return Ok((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(SignedConfirmationReceipt {
                receipt,
                receipt_json_base64: arkhe_verify_core::rfc9421::base64_encode(&raw_json),
                signature_hex: sig_hex,
            }),
        ));
    }

    let inserted = store
        .record_onchain_confirmation(
            &receipt_id,
            &reconciliation.tx_signature,
            reconciliation.slot,
            &reconciliation.confirmation_status,
            &reconciliation.status,
            &raw_json,
            &sig_hex,
            now,
        )
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": format!("confirmation store error: {e}") })),
            )
        })?;
    if !inserted {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({
                "error": format!("receipt '{receipt_id}' already has a recorded on-chain confirmation")
            })),
        ));
    }

    let status = if reconciliation.status == RECON_CONFIRMED_WITHIN_POLICY {
        StatusCode::OK
    } else {
        StatusCode::CONFLICT
    };

    Ok((
        status,
        Json(SignedConfirmationReceipt {
            receipt,
            receipt_json_base64: arkhe_verify_core::rfc9421::base64_encode(&raw_json),
            signature_hex: sig_hex,
        }),
    ))
}

async fn get_receipt_confirmation(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Path(receipt_id): Path<String>,
) -> Result<Json<SignedConfirmationReceipt>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    let Some(row) = store.get_onchain_confirmation(&receipt_id).map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "on-chain confirmation not found for receipt" })),
        ));
    };
    let receipt: SolanaSwapConfirmationReceipt = serde_json::from_slice(&row.report_json)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("corrupted stored confirmation JSON: {e}") })),
            )
        })?;
    Ok(Json(SignedConfirmationReceipt {
        receipt,
        receipt_json_base64: arkhe_verify_core::rfc9421::base64_encode(&row.report_json),
        signature_hex: row.signature_hex,
    }))
}

async fn shadow_quote_and_evaluate(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Json(req): Json<ShadowQuoteAndEvaluateRequest>,
) -> Result<(StatusCode, Json<EvaluateSwapResponse>), (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let Some(zerox) = &state.zerox_client else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "0x upstream client is not configured on this gateway (set ZEROX_API_KEY)"
            })),
        ));
    };

    let quote_req = ZeroXQuoteRequest {
        token_in: req.token_in.unwrap_or_else(|| state.policy.input_mint.clone()),
        token_out: req
            .token_out
            .unwrap_or_else(|| state.policy.output_mint.clone()),
        amount_in: req.amount_in,
        taker: req.taker.unwrap_or_else(|| state.policy.taker.clone()),
        slippage_bps: req.slippage_bps,
    };

    let exchange = zerox
        .fetch_swap_instructions(&quote_req)
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": format!("0x upstream error: {e}") })),
            )
        })?;

    // Collect caller-supplied ALTs and optionally fetch referenced ALTs from read-only Solana RPC.
    let mut alts = req.address_lookup_tables;
    let fetch_alts = req.fetch_alts.unwrap_or(state.solana_rpc.is_some());
    if fetch_alts {
        if let Some(rpc) = &state.solana_rpc {
            if let Ok(raw_bytes) = base64_decode_strict(&exchange.response.body_base64) {
                if let Ok(raw_json) = serde_json::from_slice::<Value>(&raw_bytes) {
                    if let Ok(normalized) = normalize_raw_0x_payload(&raw_json) {
                        for alt_key in normalized.address_lookup_table_addresses {
                            if alts.iter().any(|a| a.key == alt_key) {
                                continue;
                            }
                            let snap = rpc.fetch_alt_snapshot(&alt_key).await.map_err(|e| {
                                (
                                    StatusCode::BAD_GATEWAY,
                                    Json(json!({
                                        "error": format!("Solana RPC ALT fetch failed for {alt_key}: {e}")
                                    })),
                                )
                            })?;
                            alts.push(snap);
                        }
                    }
                }
            }
        }
    }

    let recent_blockhash = match req.recent_blockhash {
        Some(bh) => Some(bh),
        None => match &state.solana_rpc {
            Some(rpc) => Some(rpc.get_latest_blockhash().await.map_err(|e| {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({
                        "error": format!("Solana RPC getLatestBlockhash failed: {e}")
                    })),
                )
            })?),
            None => None,
        },
    };

    evaluate_swap_internal(
        &state,
        EvaluateSwapRequest {
            case_id: req.case_id,
            provenance: exchange.provenance,
            request: exchange.request,
            response: exchange.response,
            compiled_message_base64: None,
            recent_blockhash,
            address_lookup_tables: alts,
        },
    )
}

async fn reconcile_rpc_http(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Path(receipt_id): Path<String>,
    Json(req): Json<ReconcileRpcRequest>,
) -> Result<(StatusCode, Json<SignedConfirmationReceipt>), (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let Some(rpc) = &state.solana_rpc else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "Solana read-only RPC client is not configured on this gateway (--solana-rpc-url)"
            })),
        ));
    };

    let evidence = rpc
        .fetch_transaction_confirmation(&req.tx_signature)
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": format!("Solana RPC getTransaction failed: {e}") })),
            )
        })?;

    confirm_receipt_internal(&state, receipt_id, evidence)
}

/// Strict structural validation of a server-pinned `SolanaSwapPolicy`, returning its BLAKE3 `policyDigest`.
pub fn validate_solana_swap_policy(policy: &SolanaSwapPolicy) -> Result<String, String> {
    if policy.policy_id.trim().is_empty() {
        return Err("policyId must be non-empty".to_string());
    }
    if policy.network.trim().is_empty() {
        return Err("network must be non-empty".to_string());
    }
    if let Some(g) = &policy.genesis_hash {
        base58_decode_32(g).map_err(|e| format!("invalid genesisHash: {e}"))?;
    }
    for (field, val) in [
        ("taker", &policy.taker),
        ("takerInputTokenAccount", &policy.taker_input_token_account),
        ("authorizedRecipient", &policy.authorized_recipient),
        (
            "authorizedDestinationTokenAccount",
            &policy.authorized_destination_token_account,
        ),
        ("inputMint", &policy.input_mint),
        ("outputMint", &policy.output_mint),
    ] {
        base58_decode_32(val).map_err(|e| format!("invalid {field}: {e}"))?;
    }

    let parse_cap = |s: &str, name: &str| -> Result<u64, String> {
        if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
            return Err(format!("{name} must be a non-negative integer string"));
        }
        s.parse::<u64>()
            .map_err(|_| format!("{name} overflows u64"))
    };
    let max_in = parse_cap(&policy.max_input_asset_debit, "maxInputAssetDebit")?;
    let _max_anc = parse_cap(&policy.max_sol_ancillary_debit, "maxSolAncillaryDebit")?;
    let _min_out = parse_cap(&policy.min_output_net_credit, "minOutputNetCredit")?;
    let max_total = match &policy.max_total_sol_debit {
        Some(v) => Some(parse_cap(v, "maxTotalSolDebit")?),
        None => None,
    };

    const NATIVE_WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
    if policy.input_mint == NATIVE_WSOL_MINT {
        let Some(total) = max_total else {
            return Err(
                "maxTotalSolDebit is mandatory when inputMint is native SOL/wSOL".to_string(),
            );
        };
        if total < max_in {
            return Err(format!(
                "maxTotalSolDebit ({total}) must be >= maxInputAssetDebit ({max_in})"
            ));
        }
    }

    for (kid, hex_pk) in &policy.trusted_alt_attester_keys {
        if kid.trim().is_empty() {
            return Err("trustedAltAttesterKeys contains an empty key id".to_string());
        }
        let raw = hex::decode(hex_pk.trim())
            .map_err(|e| format!("trustedAltAttesterKeys[{kid}] invalid hex: {e}"))?;
        let arr: [u8; 32] = raw
            .try_into()
            .map_err(|_| format!("trustedAltAttesterKeys[{kid}] must be 32 bytes"))?;
        VerifyingKey::from_bytes(&arr)
            .map_err(|_| format!("trustedAltAttesterKeys[{kid}] invalid Ed25519 public key"))?;
    }

    for (prog_id, profile) in &policy.covered_swap_programs {
        base58_decode_32(prog_id)
            .map_err(|e| format!("coveredSwapPrograms key '{prog_id}' invalid base58: {e}"))?;
        if profile.name.trim().is_empty() {
            return Err(format!("coveredSwapPrograms[{prog_id}].name must be non-empty"));
        }
        let disc = hex::decode(profile.discriminator_hex.trim()).map_err(|e| {
            format!("coveredSwapPrograms[{prog_id}].discriminatorHex invalid hex: {e}")
        })?;
        if disc.len() != 8 {
            return Err(format!(
                "coveredSwapPrograms[{prog_id}].discriminatorHex must be 8 bytes (16 hex chars)"
            ));
        }
    }

    if let Some(guard) = &policy.trusted_swap_guard_program {
        base58_decode_32(&guard.program_id)
            .map_err(|e| format!("trustedSwapGuardProgram.programId invalid base58: {e}"))?;
        let pre = hex::decode(guard.pre_check_discriminator_hex.trim()).map_err(|e| {
            format!("trustedSwapGuardProgram.preCheckDiscriminatorHex invalid hex: {e}")
        })?;
        let post = hex::decode(guard.post_check_discriminator_hex.trim()).map_err(|e| {
            format!("trustedSwapGuardProgram.postCheckDiscriminatorHex invalid hex: {e}")
        })?;
        if pre.len() != 8 || post.len() != 8 {
            return Err(
                "trustedSwapGuardProgram preCheck/postCheck discriminators must each be 8 bytes (16 hex chars)"
                    .to_string(),
            );
        }
        if pre == post {
            return Err(
                "trustedSwapGuardProgram preCheck and postCheck discriminators must be distinct"
                    .to_string(),
            );
        }
    }

    let raw = serde_json::to_vec(policy).map_err(|e| e.to_string())?;
    let mut buf = Vec::with_capacity(21 + raw.len());
    buf.extend_from_slice(b"ARKHE:SWAP-POLICY:v1\0");
    buf.extend_from_slice(&raw);
    Ok(hex::encode(blake3_256(&buf)))
}

/// Complete OpenAPI 3.1.0 specification for the Arkhe x 0x Solana Swap HTTP gateway.
pub fn openapi_spec() -> Value {
    let bearer_sec = json!([{ "BearerAuth": [] }]);
    json!({
        "openapi": "3.1.0",
        "info": {
            "title": "Arkhe x 0x Solana Swap Governed HTTP Gateway",
            "version": "1.0.0",
            "description": "Governed Rust HTTP gateway enforcing RFC 9421 Ed25519 0x verification, Rust MessageV0 + ALT policy evaluation, single-use signing boundary, MMR decision receipts, and on-chain confirmation reconciliation (dry-run only: zero real signatures, zero network broadcasts)."
        },
        "components": {
            "securitySchemes": {
                "BearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "description": "Server-configured ARKHE_SOLANA_SWAP_TOKEN verified in constant time."
                }
            }
        },
        "security": bearer_sec,
        "paths": {
            "/v1/solana/swap/health": {
                "get": { "summary": "Gateway health, SQLite WAL stats, MMR root, upstream flags, and safety counters" }
            },
            "/v1/solana/swap/metrics": {
                "get": { "summary": "Prometheus text exposition metrics (text/plain; version=0.0.4)" }
            },
            "/v1/solana/swap/openapi.json": {
                "get": { "summary": "OpenAPI 3.1.0 specification document" }
            },
            "/v1/solana/swap/public-keys": {
                "get": { "summary": "Pinned Ed25519 public keys (auth, receipt, checkpoint) and trusted 0x key IDs" }
            },
            "/v1/solana/swap/policy": {
                "get": { "summary": "Active server-pinned SolanaSwapPolicy and its BLAKE3 policyDigest" }
            },
            "/v1/solana/swap/checkpoint": {
                "get": { "summary": "Latest Ed25519-signed BLAKE3 MMR checkpoint" }
            },
            "/v1/solana/swap/compile": {
                "post": { "summary": "Pure-Rust Solana MessageV0 compiler with ALT compression" }
            },
            "/v1/solana/swap/evaluate": {
                "post": { "summary": "Evaluate RFC 9421 0x response + MessageV0/ALTs against policy and emit signed MMR receipt" }
            },
            "/v1/solana/swap/shadow-quote-and-evaluate": {
                "post": { "summary": "Shadow read-only 0x quote fetch + optional Solana RPC finalized ALT/blockhash fetch + evaluate" }
            },
            "/v1/solana/swap/signing-boundary": {
                "post": { "summary": "Verify Ed25519 authorization, exact SHA-256/BLAKE3 MessageV0 match, and consume single-use in SQLite WAL (dry-run sink)" }
            },
            "/v1/solana/swap/signing-boundary/events": {
                "get": { "summary": "Query durable signing boundary audit log (optional ?authId=...)" }
            },
            "/v1/solana/swap/receipts": {
                "get": { "summary": "Paginated list of signed decision receipts (?limit=&offset=)" }
            },
            "/v1/solana/swap/receipts/{receipt_id}/bundle": {
                "get": { "summary": "Export self-contained offline verification bundle (receipt + Ed25519 + rbb::mmr proof + checkpoint)" }
            },
            "/v1/solana/swap/receipts/{receipt_id}/confirm": {
                "post": { "summary": "Evidence #3: Reconcile finalized on-chain confirmation evidence against authorized MessageV0 and policy bounds" }
            },
            "/v1/solana/swap/receipts/{receipt_id}/reconcile-rpc": {
                "post": { "summary": "Evidence #3 via read-only Solana RPC getTransaction + reconcile against policy bounds" }
            },
            "/v1/solana/swap/receipts/{receipt_id}/track-tx": {
                "post": { "summary": "Enqueue a Solana txSignature for automatic background finalized reconciliation (Evidence #3)" }
            },
            "/v1/solana/swap/reconciliations/pending": {
                "get": { "summary": "List incomplete transactions awaiting automatic finalized reconciliation" }
            },
            "/v1/solana/swap/receipts/{receipt_id}/confirmation": {
                "get": { "summary": "Retrieve persisted Ed25519-signed on-chain confirmation reconciliation receipt" }
            },
            "/v1/solana/swap/verify-bundle": {
                "post": { "summary": "Verify an exported SolanaSwapOfflineBundle against server public keys" }
            }
        }
    })
}

async fn security_headers_middleware(req: Request, next: Next) -> Response {
    let request_id = req
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_graphic()))
        .map(ToString::to_string)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let mut resp = next.run(req).await;
    let headers = resp.headers_mut();
    if let Ok(val) = HeaderValue::from_str(&request_id) {
        headers.insert(HeaderName::from_static("x-request-id"), val);
    }
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    resp
}

async fn get_openapi_spec(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    Ok(Json(openapi_spec()))
}

async fn get_metrics_prometheus(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    let stats = store.stats().map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?;
    let body = format!(
        concat!(
            "# HELP arkhe_solana_swap_receipts_total Total signed decision receipts committed in SQLite WAL + MMR\n",
            "# TYPE arkhe_solana_swap_receipts_total counter\n",
            "arkhe_solana_swap_receipts_total {}\n",
            "# HELP arkhe_solana_swap_consumed_0x_responses_total Total authenticated 0x HTTP responses consumed once\n",
            "# TYPE arkhe_solana_swap_consumed_0x_responses_total counter\n",
            "arkhe_solana_swap_consumed_0x_responses_total {}\n",
            "# HELP arkhe_solana_swap_issued_authorizations_total Total single-use test authorizations issued\n",
            "# TYPE arkhe_solana_swap_issued_authorizations_total counter\n",
            "arkhe_solana_swap_issued_authorizations_total {}\n",
            "# HELP arkhe_solana_swap_consumed_authorizations_total Total single-use test authorizations consumed at signing boundary\n",
            "# TYPE arkhe_solana_swap_consumed_authorizations_total counter\n",
            "arkhe_solana_swap_consumed_authorizations_total {}\n",
            "# HELP arkhe_solana_swap_signing_boundary_events_total Total signing boundary audit events recorded\n",
            "# TYPE arkhe_solana_swap_signing_boundary_events_total counter\n",
            "arkhe_solana_swap_signing_boundary_events_total {}\n",
            "# HELP arkhe_solana_swap_onchain_confirmations_total Total finalized on-chain confirmation reconciliations recorded\n",
            "# TYPE arkhe_solana_swap_onchain_confirmations_total counter\n",
            "arkhe_solana_swap_onchain_confirmations_total {}\n",
            "# HELP arkhe_solana_swap_pending_reconciliations Pending transactions awaiting automatic finalized reconciliation\n",
            "# TYPE arkhe_solana_swap_pending_reconciliations gauge\n",
            "arkhe_solana_swap_pending_reconciliations {}\n",
            "# HELP arkhe_solana_swap_test_signer_calls_total Dry-run test signer sink invocations\n",
            "# TYPE arkhe_solana_swap_test_signer_calls_total counter\n",
            "arkhe_solana_swap_test_signer_calls_total {}\n",
            "# HELP arkhe_solana_swap_real_signatures_produced_total Must always remain 0 in dry-run gateway\n",
            "# TYPE arkhe_solana_swap_real_signatures_produced_total counter\n",
            "arkhe_solana_swap_real_signatures_produced_total {}\n",
            "# HELP arkhe_solana_swap_broadcast_calls_total Must always remain 0 in dry-run gateway\n",
            "# TYPE arkhe_solana_swap_broadcast_calls_total counter\n",
            "arkhe_solana_swap_broadcast_calls_total {}\n",
        ),
        stats.receipt_count,
        stats.consumed_0x_count,
        stats.issued_auth_count,
        stats.consumed_auth_count,
        stats.signing_boundary_event_count,
        stats.onchain_confirmation_count,
        stats.pending_reconciliation_count,
        state.test_signer_calls.load(Ordering::SeqCst),
        state.real_signatures_produced.load(Ordering::SeqCst),
        state.broadcast_calls.load(Ordering::SeqCst),
    );
    Ok((
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/plain; version=0.0.4; charset=utf-8"),
        )],
        body,
    )
        .into_response())
}

/// Configuration for mounting `/v1/solana/swap/*` into the main `arkhe-runtime` server
/// or standalone gateway binaries.
#[derive(Debug, Clone)]
pub struct SolanaSwapMountConfig {
    pub db_path: PathBuf,
    pub policy_path: PathBuf,
    pub token: String,
    pub keys_dir: Option<PathBuf>,
    pub extra_0x_keys_path: Option<PathBuf>,
    pub zerox_base_url: String,
    pub zerox_api_key: Option<String>,
    pub solana_rpc_url: Option<String>,
    pub alt_observer_key_id: Option<String>,
    pub alt_observer_key_hex: Option<String>,
}

fn decode_hex_32_key(hex_str: &str, label: &str) -> Result<[u8; 32], String> {
    let raw = hex::decode(hex_str.trim()).map_err(|e| format!("invalid hex for {label}: {e}"))?;
    raw.try_into()
        .map_err(|_| format!("{label} must be exactly 32 bytes (64 hex chars)"))
}

fn load_or_create_key_for_mount(
    env_var: &str,
    keys_dir: Option<&FsPath>,
    file_name: &str,
) -> Result<SigningKey, String> {
    if let Ok(val) = std::env::var(env_var) {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            return Ok(SigningKey::from_bytes(&decode_hex_32_key(trimmed, env_var)?));
        }
    }
    if let Some(dir) = keys_dir {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("failed creating keys_dir {}: {e}", dir.display()))?;
        let path = dir.join(file_name);
        if path.exists() {
            let text = std::fs::read_to_string(&path)
                .map_err(|e| format!("failed reading {}: {e}", path.display()))?;
            return Ok(SigningKey::from_bytes(&decode_hex_32_key(&text, file_name)?));
        }
        let mut seed = [0u8; 32];
        seed[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
        seed[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
        std::fs::write(&path, hex::encode(seed))
            .map_err(|e| format!("failed writing {}: {e}", path.display()))?;
        return Ok(SigningKey::from_bytes(&seed));
    }
    let mut seed = [0u8; 32];
    seed[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    seed[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    Ok(SigningKey::from_bytes(&seed))
}

/// Builds a validated `SolanaSwapGatewayState` and Axum `Router` ready to merge into `arkhe-runtime`.
pub fn build_mounted_router(
    cfg: &SolanaSwapMountConfig,
) -> Result<(Arc<SolanaSwapGatewayState>, Router), String> {
    if cfg.token.trim().is_empty() {
        return Err("Solana swap gateway token must be non-empty".to_string());
    }
    let policy_raw = std::fs::read_to_string(&cfg.policy_path)
        .map_err(|e| format!("failed reading policy {}: {e}", cfg.policy_path.display()))?;
    let policy: SolanaSwapPolicy = serde_json::from_str(&policy_raw)
        .map_err(|e| format!("invalid SolanaSwapPolicy JSON: {e}"))?;
    let _ = validate_solana_swap_policy(&policy)
        .map_err(|e| format!("policy validation failed: {e}"))?;

    let mut trusted_0x_keys = arkhe_verify_core::rfc9421::official_0x_prod_keys();
    if let Some(extra_path) = &cfg.extra_0x_keys_path {
        let raw = std::fs::read_to_string(extra_path)
            .map_err(|e| format!("failed reading extra 0x keys {}: {e}", extra_path.display()))?;
        let parsed: BTreeMap<String, String> = serde_json::from_str(&raw)
            .map_err(|e| format!("invalid extra 0x keys JSON: {e}"))?;
        for (kid, pub_hex) in parsed {
            let bytes = decode_hex_32_key(&pub_hex, &kid)?;
            VerifyingKey::from_bytes(&bytes)
                .map_err(|_| format!("invalid Ed25519 public key for {kid}"))?;
            trusted_0x_keys.insert(kid, bytes);
        }
    }

    if let Some(parent) = cfg.db_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("failed creating db dir {}: {e}", parent.display()))?;
        }
    }
    let store = SqliteSolanaSwapStore::open(&cfg.db_path)?;

    let auth_signer = load_or_create_key_for_mount(
        "ARKHE_AUTH_KEY_HEX",
        cfg.keys_dir.as_deref(),
        "auth.key.hex",
    )?;
    let receipt_signer = load_or_create_key_for_mount(
        "ARKHE_RECEIPT_KEY_HEX",
        cfg.keys_dir.as_deref(),
        "receipt.key.hex",
    )?;
    let checkpoint_signer = load_or_create_key_for_mount(
        "ARKHE_CHECKPOINT_KEY_HEX",
        cfg.keys_dir.as_deref(),
        "checkpoint.key.hex",
    )?;

    let clock = Arc::new(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    });
    let net = policy.network.clone();
    let gen = policy.genesis_hash.clone();

    let mut state = SolanaSwapGatewayState::new(
        store,
        cfg.token.clone(),
        policy,
        trusted_0x_keys,
        "arkhe-solana-auth-key-1",
        auth_signer,
        "arkhe-solana-receipt-key-1",
        receipt_signer,
        "arkhe-solana-checkpoint-key-1",
        checkpoint_signer,
        clock,
    );

    if let Some(api_key) = cfg.zerox_api_key.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        state = state.with_zerox_client(ZeroXSwapClient::new(&cfg.zerox_base_url, api_key)?);
    }

    if let Some(rpc_url) = cfg.solana_rpc_url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let mut urls: Vec<String> = rpc_url
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if urls.is_empty() {
            urls.push(rpc_url.to_string());
        }
        let quorum = std::env::var("ARKHE_SOLANA_SWAP_ALT_QUORUM_MIN")
            .ok()
            .and_then(|v| v.trim().parse::<usize>().ok())
            .unwrap_or(1);
        let observer = match (
            cfg.alt_observer_key_id.as_deref().map(str::trim).filter(|s| !s.is_empty()),
            cfg.alt_observer_key_hex.as_deref().map(str::trim).filter(|s| !s.is_empty()),
        ) {
            (Some(kid), Some(hex_seed)) => Some(AltObserverSigner {
                key_id: kid.to_string(),
                signing_key: SigningKey::from_bytes(&decode_hex_32_key(
                    hex_seed,
                    "ARKHE_ALT_OBSERVER_KEY_HEX",
                )?),
            }),
            _ => None,
        };
        state = state.with_solana_rpc(SolanaRpcReadOnlyClient::new_with_quorum(
            urls, quorum, net, gen, observer,
        )?);
    }

    let state = Arc::new(state);
    let r = router(state.clone());
    Ok((state, r))
}

/// Optional env-driven mount helper for `arkhe-runtime`:
/// returns `Ok(None)` when neither `ARKHE_SOLANA_SWAP_POLICY` nor `ARKHE_SOLANA_SWAP_DB` is set,
/// and fails closed if only one of them is set or validation fails.
pub fn build_router_from_env(
    fallback_token: &str,
) -> Result<Option<(Arc<SolanaSwapGatewayState>, Router)>, String> {
    let policy_env = std::env::var("ARKHE_SOLANA_SWAP_POLICY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let db_env = std::env::var("ARKHE_SOLANA_SWAP_DB")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    match (policy_env, db_env) {
        (None, None) => Ok(None),
        (Some(_), None) | (None, Some(_)) => Err(
            "both ARKHE_SOLANA_SWAP_POLICY and ARKHE_SOLANA_SWAP_DB must be set together to mount /v1/solana/swap/*"
                .to_string(),
        ),
        (Some(policy_path), Some(db_path)) => {
            let token = std::env::var("ARKHE_SOLANA_SWAP_TOKEN")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| fallback_token.to_string());
            let cfg = SolanaSwapMountConfig {
                db_path: PathBuf::from(db_path),
                policy_path: PathBuf::from(policy_path),
                token,
                keys_dir: std::env::var("ARKHE_SOLANA_SWAP_KEYS_DIR")
                    .ok()
                    .filter(|s| !s.trim().is_empty())
                    .map(PathBuf::from),
                extra_0x_keys_path: std::env::var("ARKHE_SOLANA_SWAP_EXTRA_0X_KEYS")
                    .ok()
                    .filter(|s| !s.trim().is_empty())
                    .map(PathBuf::from),
                zerox_base_url: std::env::var("ARKHE_SOLANA_SWAP_ZEROX_BASE_URL")
                    .ok()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| "https://api.0x.org".to_string()),
                zerox_api_key: std::env::var("ZEROX_API_KEY").ok(),
                solana_rpc_url: std::env::var("ARKHE_SOLANA_SWAP_RPC_URL").ok(),
                alt_observer_key_id: std::env::var("ARKHE_ALT_OBSERVER_KEY_ID").ok(),
                alt_observer_key_hex: std::env::var("ARKHE_ALT_OBSERVER_KEY_HEX").ok(),
            };
            build_mounted_router(&cfg).map(Some)
        }
    }
}

/// Runs one pass of the automatic Evidence #3 reconciliation worker across all pending tracked
/// transactions in SQLite WAL. Finalized transactions are reconciled via `confirm_receipt_internal`
/// and marked completed; unfinalized or not-yet-indexed transactions remain queued for retry.
pub async fn reconcile_pending_once(
    state: &SolanaSwapGatewayState,
) -> Result<ReconciliationTickSummary, String> {
    let Some(rpc) = &state.solana_rpc else {
        return Ok(ReconciliationTickSummary {
            checked: 0,
            completed: 0,
            deferred: 0,
        });
    };

    let pending = {
        let store = state
            .store
            .lock()
            .map_err(|_| "store lock poisoned".to_string())?;
        store.list_pending_reconciliations(50)?
    };

    let mut summary = ReconciliationTickSummary {
        checked: pending.len(),
        completed: 0,
        deferred: 0,
    };

    for row in pending {
        let now = (state.clock)();
        match rpc.fetch_transaction_confirmation(&row.tx_signature).await {
            Ok(evidence) => {
                match confirm_receipt_internal(state, row.receipt_id.clone(), evidence) {
                    Ok((status, _)) if status == StatusCode::UNPROCESSABLE_ENTITY => {
                        let mut store = state
                            .store
                            .lock()
                            .map_err(|_| "store lock poisoned".to_string())?;
                        store.record_reconciliation_attempt(
                            &row.receipt_id,
                            Some("CONFIRMATION_NOT_FINALIZED"),
                            false,
                            now,
                        )?;
                        summary.deferred += 1;
                    }
                    Ok(_) => {
                        let mut store = state
                            .store
                            .lock()
                            .map_err(|_| "store lock poisoned".to_string())?;
                        store.record_reconciliation_attempt(&row.receipt_id, None, true, now)?;
                        summary.completed += 1;
                    }
                    Err((StatusCode::CONFLICT, _)) => {
                        // Already confirmed or receipt not eligible -> terminal
                        let mut store = state
                            .store
                            .lock()
                            .map_err(|_| "store lock poisoned".to_string())?;
                        store.record_reconciliation_attempt(
                            &row.receipt_id,
                            Some("TERMINAL_CONFLICT"),
                            true,
                            now,
                        )?;
                        summary.completed += 1;
                    }
                    Err((_, Json(val))) => {
                        let msg = val
                            .get("error")
                            .and_then(Value::as_str)
                            .unwrap_or("reconciliation error");
                        let mut store = state
                            .store
                            .lock()
                            .map_err(|_| "store lock poisoned".to_string())?;
                        store.record_reconciliation_attempt(
                            &row.receipt_id,
                            Some(msg),
                            false,
                            now,
                        )?;
                        summary.deferred += 1;
                    }
                }
            }
            Err(err) => {
                let mut store = state
                    .store
                    .lock()
                    .map_err(|_| "store lock poisoned".to_string())?;
                store.record_reconciliation_attempt(&row.receipt_id, Some(&err), false, now)?;
                summary.deferred += 1;
            }
        }
    }

    Ok(summary)
}

/// Spawns a background Tokio worker polling `reconcile_pending_once` on a fixed interval.
pub fn spawn_reconciliation_worker(
    state: Arc<SolanaSwapGatewayState>,
    interval: std::time::Duration,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let _ = reconcile_pending_once(&state).await;
        }
    })
}

async fn track_tx_for_reconciliation(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
    Path(receipt_id): Path<String>,
    Json(req): Json<TrackTransactionRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let sig = req.tx_signature.trim();
    if sig.is_empty() || sig.len() > 128 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "txSignature must be 1..=128 characters" })),
        ));
    }

    let mut store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    let Some(stored) = store.get_receipt_bundle(&receipt_id).map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "receipt not found" })),
        ));
    };
    let decision: SolanaSwapDecisionReceipt = serde_json::from_slice(&stored.leaf_json)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("corrupted stored receipt JSON: {e}") })),
            )
        })?;
    if decision.authorization.is_none() {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({
                "error": format!(
                    "receipt '{}' has verdict '{}' and cannot be tracked for on-chain reconciliation",
                    receipt_id, decision.policy_verdict
                )
            })),
        ));
    }

    let now = (state.clock)();
    let inserted = store
        .enqueue_pending_reconciliation(&receipt_id, sig, now)
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": e })),
            )
        })?;
    if !inserted {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({ "error": format!("receipt '{receipt_id}' is already tracked") })),
        ));
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "tracked": true,
            "receiptId": receipt_id,
            "txSignature": sig,
            "enqueuedAt": now,
        })),
    ))
}

async fn list_pending_reconciliations_http(
    State(state): State<Arc<SolanaSwapGatewayState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let store = state.store.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "store lock poisoned" })),
        )
    })?;
    let rows = store.list_pending_reconciliations(200).map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": e })),
        )
    })?;
    let items: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "receiptId": r.receipt_id,
                "txSignature": r.tx_signature,
                "enqueuedAt": r.enqueued_at,
                "attempts": r.attempts,
                "lastError": r.last_error,
                "completed": r.completed,
            })
        })
        .collect();
    Ok(Json(json!({
        "count": items.len(),
        "pending": items,
    })))
}

pub fn router(state: Arc<SolanaSwapGatewayState>) -> Router {
    Router::new()
        .route("/v1/solana/swap/health", get(health))
        .route("/v1/solana/swap/metrics", get(get_metrics_prometheus))
        .route("/v1/solana/swap/openapi.json", get(get_openapi_spec))
        .route("/v1/solana/swap/public-keys", get(get_public_keys))
        .route("/v1/solana/swap/policy", get(get_policy))
        .route("/v1/solana/swap/checkpoint", get(get_checkpoint))
        .route("/v1/solana/swap/compile", post(compile_message_http))
        .route("/v1/solana/swap/evaluate", post(evaluate_swap))
        .route(
            "/v1/solana/swap/shadow-quote-and-evaluate",
            post(shadow_quote_and_evaluate),
        )
        .route("/v1/solana/swap/signing-boundary", post(signing_boundary))
        .route(
            "/v1/solana/swap/signing-boundary/events",
            get(list_signing_boundary_events),
        )
        .route("/v1/solana/swap/receipts", get(list_receipts))
        .route(
            "/v1/solana/swap/receipts/{receipt_id}/bundle",
            get(get_receipt_bundle),
        )
        .route(
            "/v1/solana/swap/receipts/{receipt_id}/confirm",
            post(confirm_receipt_onchain),
        )
        .route(
            "/v1/solana/swap/receipts/{receipt_id}/reconcile-rpc",
            post(reconcile_rpc_http),
        )
        .route(
            "/v1/solana/swap/receipts/{receipt_id}/track-tx",
            post(track_tx_for_reconciliation),
        )
        .route(
            "/v1/solana/swap/reconciliations/pending",
            get(list_pending_reconciliations_http),
        )
        .route(
            "/v1/solana/swap/receipts/{receipt_id}/confirmation",
            get(get_receipt_confirmation),
        )
        .route("/v1/solana/swap/verify-bundle", post(verify_bundle_http))
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .layer(middleware::from_fn(security_headers_middleware))
        .with_state(state)
}
