//! Production read-only upstream HTTP & Solana JSON-RPC clients for the Arkhe x 0x backend.
//!
//! Security invariants:
//! - Strictly **shadow read-only**: exposes ONLY `POST /solana/swap-instructions` on 0x and
//!   read-only Solana JSON-RPC methods (`getGenesisHash`, `getLatestBlockhash`, `getAccountInfo`,
//!   `getTransaction`). Transaction submission (`sendTransaction` / `sendRawTransaction`) does not
//!   exist anywhere in this module.
//! - Zero secret leakage: `0x-api-key` is injected only into the outbound HTTP header and is
//!   NEVER copied into `HttpRequestEvidence`, receipts, SQLite rows, or logs.
//! - Hardened outbound HTTP: server-pinned base URLs (never caller-supplied per request),
//!   explicit connect/request timeouts, and strict response body size cap (2 MiB).
//! - Honest ALT provenance: fetched ALT accounts carry `attestation: None` unless the operator
//!   explicitly configures an `AltObserverSigner` whose public key is also pinned in the policy.

use std::collections::BTreeMap;
use std::time::Duration;

use arkhe_verify_core::rfc9421::{
    base64_decode_strict, base64_encode, format_content_digest, HttpRequestEvidence,
    HttpResponseEvidence,
};
use arkhe_verify_core::solana_swap::{
    base58_encode, canonical_alt_snapshot_bytes, parse_solana_message_v0,
    AddressLookupTableSnapshot, AltSnapshotAttestation, OnChainConfirmationEvidence,
    TokenBalanceSnapshot,
};
use ed25519_dalek::{Signer, SigningKey};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const ADDRESS_LOOKUP_TABLE_PROGRAM_ID: &str = "AddressLookupTab1e1111111111111111111111111";
const MAX_UPSTREAM_BODY_BYTES: usize = 2 * 1024 * 1024; // 2 MiB
const CONNECT_TIMEOUT_SECS: u64 = 5;
const REQUEST_TIMEOUT_SECS: u64 = 15;

fn build_hardened_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("arkhe-solana-swap-gateway/0.1")
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))
}

async fn read_bounded_bytes(resp: reqwest::Response) -> Result<Vec<u8>, String> {
    if let Some(len) = resp.content_length() {
        if len > MAX_UPSTREAM_BODY_BYTES as u64 {
            return Err(format!(
                "upstream response Content-Length ({len}) exceeds {MAX_UPSTREAM_BODY_BYTES} byte limit"
            ));
        }
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("failed reading upstream response body: {e}"))?;
    if bytes.len() > MAX_UPSTREAM_BODY_BYTES {
        return Err(format!(
            "upstream response body ({} bytes) exceeds {MAX_UPSTREAM_BODY_BYTES} byte limit",
            bytes.len()
        ));
    }
    Ok(bytes.to_vec())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZeroXQuoteRequest {
    pub token_in: String,
    pub token_out: String,
    pub amount_in: u64,
    pub taker: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slippage_bps: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct ZeroXCapturedExchange {
    pub provenance: String,
    pub request: HttpRequestEvidence,
    pub response: HttpResponseEvidence,
}

#[derive(Clone)]
pub struct ZeroXSwapClient {
    client: Client,
    base_url: String,
    authority: String,
    api_key: String,
    provenance: String,
}

impl ZeroXSwapClient {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Result<Self, String> {
        let base_url = base_url.into().trim().trim_end_matches('/').to_string();
        let parsed = reqwest::Url::parse(&base_url)
            .map_err(|e| format!("invalid 0x base URL '{base_url}': {e}"))?;
        let scheme = parsed.scheme();
        if scheme != "https" && scheme != "http" {
            return Err(format!("unsupported 0x URL scheme '{scheme}'"));
        }
        let host = parsed
            .host_str()
            .ok_or_else(|| "0x base URL missing host".to_string())?
            .to_ascii_lowercase();
        let authority = match parsed.port() {
            Some(p) => format!("{host}:{p}"),
            None => host.clone(),
        };
        let provenance = if host == "api.0x.org" {
            "0x-official".to_string()
        } else {
            "test-fixture".to_string()
        };
        let api_key = api_key.into().trim().to_string();
        if api_key.is_empty() {
            return Err("0x API key must be non-empty".to_string());
        }
        Ok(Self {
            client: build_hardened_client()?,
            base_url,
            authority,
            api_key,
            provenance,
        })
    }

    pub fn provenance(&self) -> &str {
        &self.provenance
    }

    /// Calls `POST /solana/swap-instructions` in shadow read-only mode and returns sanitized
    /// RFC 9421 request/response evidence (strictly excluding `0x-api-key`).
    pub async fn fetch_swap_instructions(
        &self,
        quote: &ZeroXQuoteRequest,
    ) -> Result<ZeroXCapturedExchange, String> {
        let path = "/solana/swap-instructions";
        let url = format!("{}{}", self.base_url, path);
        let req_body = serde_json::to_vec(quote)
            .map_err(|e| format!("failed serializing 0x quote request: {e}"))?;
        let req_digest = format_content_digest(&req_body);

        let resp = self
            .client
            .post(&url)
            .header("0x-api-key", &self.api_key)
            .header("0x-version", "v2")
            .header("content-type", "application/json")
            .header("content-digest", &req_digest)
            .body(req_body.clone())
            .send()
            .await
            .map_err(|e| format!("0x upstream request failed: {e}"))?;

        let status = resp.status().as_u16();
        let mut res_headers = BTreeMap::new();
        for (name, val) in resp.headers() {
            if let Ok(s) = val.to_str() {
                res_headers.insert(name.as_str().to_ascii_lowercase(), s.to_string());
            }
        }
        let res_body = read_bounded_bytes(resp).await?;

        // Sanitized request evidence: NEVER includes `0x-api-key`.
        let mut sanitized_req_headers = BTreeMap::new();
        sanitized_req_headers.insert("content-type".to_string(), "application/json".to_string());
        sanitized_req_headers.insert("content-digest".to_string(), req_digest);

        Ok(ZeroXCapturedExchange {
            provenance: self.provenance.clone(),
            request: HttpRequestEvidence {
                method: "POST".to_string(),
                authority: self.authority.clone(),
                path: path.to_string(),
                query: Some("?".to_string()),
                headers: sanitized_req_headers,
                body_base64: base64_encode(&req_body),
            },
            response: HttpResponseEvidence {
                status,
                headers: res_headers,
                body_base64: base64_encode(&res_body),
            },
        })
    }
}

/// Optional server-side Ed25519 observer signer for finalized ALT snapshots fetched via Solana RPC.
/// If absent, fetched ALT snapshots carry `attestation: None` so Rust policy remains fail-closed
/// (`UNATTESTED_ALT_SNAPSHOT` -> `INCONCLUSIVO`).
#[derive(Clone)]
pub struct AltObserverSigner {
    pub key_id: String,
    pub signing_key: SigningKey,
}

#[derive(Clone)]
pub struct SolanaRpcReadOnlyClient {
    client: Client,
    rpc_urls: Vec<String>,
    min_alt_quorum: usize,
    network: String,
    expected_genesis_hash: Option<String>,
    alt_observer: Option<AltObserverSigner>,
}

impl SolanaRpcReadOnlyClient {
    pub fn new(
        rpc_url: impl Into<String>,
        network: impl Into<String>,
        expected_genesis_hash: Option<String>,
        alt_observer: Option<AltObserverSigner>,
    ) -> Result<Self, String> {
        Self::new_with_quorum(
            vec![rpc_url.into()],
            1,
            network,
            expected_genesis_hash,
            alt_observer,
        )
    }

    /// Creates a read-only Solana RPC client backed by one or more independent RPC providers.
    /// When `min_alt_quorum >= 2`, `fetch_alt_snapshot` queries every configured RPC provider
    /// and requires strict agreement on `(genesis_hash, deactivation_slot, addresses)` across
    /// at least `min_alt_quorum` independent providers before attesting an ALT snapshot.
    pub fn new_with_quorum(
        rpc_urls: Vec<String>,
        min_alt_quorum: usize,
        network: impl Into<String>,
        expected_genesis_hash: Option<String>,
        alt_observer: Option<AltObserverSigner>,
    ) -> Result<Self, String> {
        let mut cleaned = Vec::new();
        for u in rpc_urls {
            let trimmed = u.trim().to_string();
            if trimmed.is_empty() {
                continue;
            }
            let parsed = reqwest::Url::parse(&trimmed)
                .map_err(|e| format!("invalid Solana RPC URL '{trimmed}': {e}"))?;
            let scheme = parsed.scheme();
            if scheme != "https" && scheme != "http" {
                return Err(format!("unsupported Solana RPC URL scheme '{scheme}'"));
            }
            cleaned.push(trimmed);
        }
        if cleaned.is_empty() {
            return Err("at least one Solana RPC URL must be provided".to_string());
        }
        if min_alt_quorum == 0 || min_alt_quorum > cleaned.len() {
            return Err(format!(
                "min_alt_quorum ({min_alt_quorum}) must be in 1..={}",
                cleaned.len()
            ));
        }
        Ok(Self {
            client: build_hardened_client()?,
            rpc_urls: cleaned,
            min_alt_quorum,
            network: network.into(),
            expected_genesis_hash,
            alt_observer,
        })
    }

    pub fn has_alt_observer(&self) -> bool {
        self.alt_observer.is_some()
    }

    pub fn rpc_endpoint_count(&self) -> usize {
        self.rpc_urls.len()
    }

    pub fn min_alt_quorum(&self) -> usize {
        self.min_alt_quorum
    }

    async fn rpc_call_at(&self, url: &str, method: &str, params: Value) -> Result<Value, String> {
        // Hard compile-time/runtime guard: ONLY strictly read-only methods are permitted.
        match method {
            "getGenesisHash" | "getLatestBlockhash" | "getAccountInfo" | "getTransaction" => {}
            other => {
                return Err(format!(
                    "Solana RPC method '{other}' is forbidden (read-only client)"
                ));
            }
        }
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });
        let resp = self
            .client
            .post(url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Solana RPC {method} request failed: {e}"))?;
        let status = resp.status();
        let raw = read_bounded_bytes(resp).await?;
        if !status.is_success() {
            return Err(format!(
                "Solana RPC {method} returned HTTP {}",
                status.as_u16()
            ));
        }
        let parsed: Value = serde_json::from_slice(&raw)
            .map_err(|e| format!("Solana RPC {method} returned invalid JSON: {e}"))?;
        if let Some(err) = parsed.get("error").filter(|v| !v.is_null()) {
            return Err(format!("Solana RPC {method} error: {err}"));
        }
        Ok(parsed.get("result").cloned().unwrap_or(Value::Null))
    }

    async fn rpc_call(&self, method: &str, params: Value) -> Result<Value, String> {
        self.rpc_call_at(&self.rpc_urls[0], method, params).await
    }

    pub async fn get_genesis_hash(&self) -> Result<String, String> {
        let res = self.rpc_call("getGenesisHash", json!([])).await?;
        res.as_str()
            .map(ToString::to_string)
            .ok_or_else(|| "getGenesisHash did not return a string".to_string())
    }

    pub async fn get_latest_blockhash(&self) -> Result<String, String> {
        let res = self
            .rpc_call("getLatestBlockhash", json!([{ "commitment": "finalized" }]))
            .await?;
        res.pointer("/value/blockhash")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .ok_or_else(|| "getLatestBlockhash missing value.blockhash".to_string())
    }

    async fn fetch_single_rpc_alt(
        &self,
        url: &str,
        alt_pubkey: &str,
    ) -> Result<(String, u64, u64, Vec<String>), String> {
        let genesis_hash = match &self.expected_genesis_hash {
            Some(g) => g.clone(),
            None => self
                .rpc_call_at(url, "getGenesisHash", json!([]))
                .await?
                .as_str()
                .map(ToString::to_string)
                .ok_or_else(|| "getGenesisHash did not return a string".to_string())?,
        };
        let res = self
            .rpc_call_at(
                url,
                "getAccountInfo",
                json!([
                    alt_pubkey,
                    {
                        "encoding": "base64",
                        "commitment": "finalized"
                    }
                ]),
            )
            .await?;
        let slot = res
            .pointer("/context/slot")
            .and_then(Value::as_u64)
            .ok_or_else(|| format!("getAccountInfo({alt_pubkey}) missing context.slot"))?;
        let value = res
            .get("value")
            .filter(|v| !v.is_null())
            .ok_or_else(|| format!("ALT account '{alt_pubkey}' not found on-chain"))?;
        let owner = value
            .get("owner")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("ALT account '{alt_pubkey}' missing owner"))?;
        let data_b64 = value
            .pointer("/data/0")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("ALT account '{alt_pubkey}' missing base64 data[0]"))?;
        let data = base64_decode_strict(data_b64)
            .map_err(|e| format!("ALT account '{alt_pubkey}' invalid base64 data: {e}"))?;
        let (deactivation_slot, addresses) = decode_solana_alt_account_data(owner, &data)?;
        Ok((genesis_hash, slot, deactivation_slot, addresses))
    }

    /// Fetches a finalized Solana Address Lookup Table account across all configured independent
    /// RPC endpoints, enforces strict quorum agreement on `(genesis_hash, deactivation_slot, addresses)`,
    /// and attests with Ed25519 ONLY if an `AltObserverSigner` is explicitly configured.
    pub async fn fetch_alt_snapshot(
        &self,
        alt_pubkey: &str,
    ) -> Result<AddressLookupTableSnapshot, String> {
        let mut observations: Vec<(String, u64, u64, Vec<String>)> = Vec::new();
        let mut errors: Vec<String> = Vec::new();
        for url in &self.rpc_urls {
            match self.fetch_single_rpc_alt(url, alt_pubkey).await {
                Ok(obs) => observations.push(obs),
                Err(e) => errors.push(e),
            }
        }
        if observations.len() < self.min_alt_quorum {
            return Err(format!(
                "ALT_QUORUM_NOT_MET: only {} of {} required RPC providers returned ALT '{alt_pubkey}' (errors: {})",
                observations.len(),
                self.min_alt_quorum,
                errors.join("; ")
            ));
        }

        let (ref genesis_hash, first_slot, deactivation_slot, ref addresses) = observations[0];
        let mut min_slot = first_slot;
        for (g, s, deact, addrs) in observations.iter().skip(1) {
            if g != genesis_hash || *deact != deactivation_slot || addrs != addresses {
                return Err(format!(
                    "ALT_QUORUM_DIVERGENCE: independent Solana RPC providers disagreed on finalized ALT '{alt_pubkey}' (genesis/deactivation/addresses mismatch)"
                ));
            }
            if *s < min_slot {
                min_slot = *s;
            }
        }
        let slot = min_slot;
        let genesis_hash = genesis_hash.clone();
        let addresses = addresses.clone();

        let attestation = if let Some(observer) = &self.alt_observer {
            let canonical = canonical_alt_snapshot_bytes(
                &self.network,
                &genesis_hash,
                alt_pubkey,
                slot,
                deactivation_slot,
                &addresses,
            )?;
            let sig = observer.signing_key.sign(&canonical);
            Some(AltSnapshotAttestation {
                key_id: observer.key_id.clone(),
                signature_hex: hex::encode(sig.to_bytes()),
            })
        } else {
            None
        };

        Ok(AddressLookupTableSnapshot {
            key: alt_pubkey.to_string(),
            network: Some(self.network.clone()),
            genesis_hash: Some(genesis_hash),
            slot: Some(slot),
            deactivation_slot: Some(deactivation_slot.to_string()),
            addresses,
            attestation,
        })
    }

    /// Fetches a finalized Solana transaction via `getTransaction` (`encoding: "base64"`,
    /// `maxSupportedTransactionVersion: 0`) and extracts exact `OnChainConfirmationEvidence`
    /// (including raw `MessageV0` wire bytes and pre/post SOL + SPL token balances).
    pub async fn fetch_transaction_confirmation(
        &self,
        tx_signature: &str,
    ) -> Result<OnChainConfirmationEvidence, String> {
        let res = self
            .rpc_call(
                "getTransaction",
                json!([
                    tx_signature,
                    {
                        "encoding": "base64",
                        "commitment": "finalized",
                        "maxSupportedTransactionVersion": 0
                    }
                ]),
            )
            .await?;
        if res.is_null() {
            return Err(format!(
                "transaction '{tx_signature}' not found at finalized commitment"
            ));
        }

        let slot = res
            .get("slot")
            .and_then(Value::as_u64)
            .ok_or_else(|| "getTransaction missing slot".to_string())?;
        let block_time = res.get("blockTime").and_then(Value::as_i64);
        let tx_b64 = res
            .pointer("/transaction/0")
            .and_then(Value::as_str)
            .ok_or_else(|| "getTransaction missing transaction[0] base64 bytes".to_string())?;
        let tx_bytes = base64_decode_strict(tx_b64)
            .map_err(|e| format!("getTransaction invalid base64 tx bytes: {e}"))?;
        let message_bytes = extract_message_v0_from_solana_tx_bytes(&tx_bytes)?;
        let parsed_msg = parse_solana_message_v0(&message_bytes)?;

        let meta = res
            .get("meta")
            .filter(|v| v.is_object())
            .ok_or_else(|| "getTransaction missing meta object".to_string())?;
        let err = meta.get("err").filter(|v| !v.is_null()).cloned();
        let fee_lamports = meta
            .get("fee")
            .and_then(Value::as_u64)
            .ok_or_else(|| "getTransaction missing meta.fee".to_string())?;

        let pre_balances = parse_u64_array(meta.get("preBalances"), "meta.preBalances")?;
        let post_balances = parse_u64_array(meta.get("postBalances"), "meta.postBalances")?;
        let pre_token_balances =
            parse_rpc_token_balances(meta.get("preTokenBalances"), "meta.preTokenBalances")?;
        let post_token_balances =
            parse_rpc_token_balances(meta.get("postTokenBalances"), "meta.postTokenBalances")?;

        let mut account_keys: Vec<String> = parsed_msg
            .static_account_keys
            .iter()
            .map(|k| base58_encode(k))
            .collect();
        if let Some(writable) = meta
            .pointer("/loadedAddresses/writable")
            .and_then(Value::as_array)
        {
            for k in writable {
                let s = k
                    .as_str()
                    .ok_or_else(|| "non-string key in meta.loadedAddresses.writable".to_string())?;
                account_keys.push(s.to_string());
            }
        }
        if let Some(readonly) = meta
            .pointer("/loadedAddresses/readonly")
            .and_then(Value::as_array)
        {
            for k in readonly {
                let s = k
                    .as_str()
                    .ok_or_else(|| "non-string key in meta.loadedAddresses.readonly".to_string())?;
                account_keys.push(s.to_string());
            }
        }

        // Because getTransaction was queried with `commitment: "finalized"`, any non-null result
        // returned by a compliant Solana RPC node is finalized (unless explicitly overridden in JSON).
        let confirmation_status = res
            .get("confirmationStatus")
            .and_then(Value::as_str)
            .unwrap_or("finalized")
            .to_string();

        Ok(OnChainConfirmationEvidence {
            network: self.network.clone(),
            signature: tx_signature.to_string(),
            slot,
            block_time,
            confirmation_status,
            err,
            compiled_message_base64: base64_encode(&message_bytes),
            account_keys,
            fee_lamports,
            pre_balances,
            post_balances,
            pre_token_balances,
            post_token_balances,
        })
    }
}

fn parse_u64_array(v: Option<&Value>, label: &str) -> Result<Vec<u64>, String> {
    let arr = v
        .and_then(Value::as_array)
        .ok_or_else(|| format!("missing array {label}"))?;
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        let n = item
            .as_u64()
            .ok_or_else(|| format!("non-u64 entry in {label}"))?;
        out.push(n);
    }
    Ok(out)
}

fn parse_rpc_token_balances(
    v: Option<&Value>,
    label: &str,
) -> Result<Vec<TokenBalanceSnapshot>, String> {
    let Some(val) = v else {
        return Ok(Vec::new());
    };
    let arr = val
        .as_array()
        .ok_or_else(|| format!("{label} must be an array"))?;
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        let account_index = item
            .get("accountIndex")
            .and_then(Value::as_u64)
            .ok_or_else(|| format!("{label} entry missing accountIndex"))?
            as usize;
        let mint = item
            .get("mint")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("{label} entry missing mint"))?
            .to_string();
        let owner = item
            .get("owner")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        let amount = item
            .pointer("/uiTokenAmount/amount")
            .or_else(|| item.get("amount"))
            .and_then(Value::as_str)
            .ok_or_else(|| format!("{label} entry missing uiTokenAmount.amount"))?
            .to_string();
        out.push(TokenBalanceSnapshot {
            account_index,
            mint,
            owner,
            amount,
        });
    }
    Ok(out)
}

/// Decodes a Solana `AddressLookupTable` on-chain account payload (56-byte metadata header
/// followed by packed 32-byte pubkeys).
pub fn decode_solana_alt_account_data(
    owner: &str,
    data: &[u8],
) -> Result<(u64, Vec<String>), String> {
    if owner != ADDRESS_LOOKUP_TABLE_PROGRAM_ID {
        return Err(format!(
            "ALT account owner '{owner}' is not AddressLookupTable program '{ADDRESS_LOOKUP_TABLE_PROGRAM_ID}'"
        ));
    }
    if data.len() < 56 || (data.len() - 56) % 32 != 0 {
        return Err(format!(
            "invalid Solana ALT account data length: {} (must be >= 56 and 56 + 32*N)",
            data.len()
        ));
    }
    let state_disc = u32::from_le_bytes(data[0..4].try_into().unwrap());
    if state_disc != 1 {
        return Err(format!(
            "ALT account state discriminant is {state_disc} (expected 1 = LookupTable)"
        ));
    }
    let deactivation_slot = u64::from_le_bytes(data[4..12].try_into().unwrap());
    let mut addresses = Vec::with_capacity((data.len() - 56) / 32);
    for chunk in data[56..].chunks_exact(32) {
        addresses.push(base58_encode(chunk));
    }
    Ok((deactivation_slot, addresses))
}

/// Extracts raw `MessageV0` wire bytes from a serialized Solana VersionedTransaction
/// (`compact-u16(num_signatures) + 64 * num_signatures + message_bytes`).
pub fn extract_message_v0_from_solana_tx_bytes(tx_bytes: &[u8]) -> Result<Vec<u8>, String> {
    if tx_bytes.is_empty() {
        return Err("empty Solana transaction bytes".to_string());
    }
    let (num_sigs, offset) = decode_compact_u16_prefix(tx_bytes)?;
    let sig_bytes_len = usize::from(num_sigs)
        .checked_mul(64)
        .ok_or_else(|| "signature length overflow".to_string())?;
    let msg_start = offset
        .checked_add(sig_bytes_len)
        .ok_or_else(|| "transaction offset overflow".to_string())?;
    if msg_start >= tx_bytes.len() {
        return Err("Solana transaction truncated before message bytes".to_string());
    }
    let msg = &tx_bytes[msg_start..];
    if msg[0] != 0x80 {
        return Err(format!(
            "expected VersionedMessage v0 prefix 0x80, got 0x{:02x}",
            msg[0]
        ));
    }
    Ok(msg.to_vec())
}

fn decode_compact_u16_prefix(bytes: &[u8]) -> Result<(u16, usize), String> {
    let b0 = *bytes
        .first()
        .ok_or_else(|| "unexpected EOF reading compact-u16".to_string())?;
    if b0 < 0x80 {
        return Ok((u16::from(b0), 1));
    }
    let b1 = *bytes
        .get(1)
        .ok_or_else(|| "unexpected EOF reading 2-byte compact-u16".to_string())?;
    if b1 == 0 {
        return Err("non-canonical 2-byte compact-u16".to_string());
    }
    if b1 < 0x80 {
        return Ok((u16::from(b0 & 0x7f) | (u16::from(b1) << 7), 2));
    }
    let b2 = *bytes
        .get(2)
        .ok_or_else(|| "unexpected EOF reading 3-byte compact-u16".to_string())?;
    if b2 == 0 || b2 > 0x03 {
        return Err("invalid 3-byte compact-u16".to_string());
    }
    Ok((
        u16::from(b0 & 0x7f) | (u16::from(b1 & 0x7f) << 7) | (u16::from(b2) << 14),
        3,
    ))
}
