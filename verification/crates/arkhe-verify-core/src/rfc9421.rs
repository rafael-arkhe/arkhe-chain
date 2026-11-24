//! Pure-Rust RFC 9421 Ed25519 HTTP Message Signature verifier for 0x API responses.
//!
//! Enforces:
//! - Exact SHA-256 verification of both request body (`"content-digest";req`) and response body (`"content-digest"`).
//! - Pinned external Ed25519 trust store (`keyid` lookup; never trusts keys embedded inside fixtures).
//! - Required covered components (`@status`, `content-type`, `content-digest`, `@method;req`,
//!   `@authority;req`, `@path;req`, `content-digest;req`, and optional `@query;req`).
//! - Injectable clock with 60-second freshness window (`now - created <= max_age_seconds`).
//! - Deterministic `response_signature_digest` (BLAKE3) for durable single-use replay guards.

use std::collections::{BTreeMap, BTreeSet};

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const DEFAULT_MAX_AGE_SECONDS: i64 = 60;
pub const DEFAULT_MAX_FUTURE_SKEW_SECONDS: i64 = 5;
pub const DEFAULT_0X_TAG: &str = "0x-swap-api";

/// Official 0x production Ed25519 signing key published in 0x docs (JWK `x` base64url).
pub const OFFICIAL_0X_PROD_KEY_ID: &str = "0x-signing-key-prod-24092026";
pub const OFFICIAL_0X_PROD_KEY_JWK_X: &str = "19P3C981JsyQsqwVho8Tlabx51rslvdruSH59mGuWn0";

pub const REQUIRED_0X_COMPONENTS: &[&str] = &[
    "\"@status\"",
    "\"content-type\"",
    "\"content-digest\"",
    "\"@method\";req",
    "\"@authority\";req",
    "\"@path\";req",
    "\"content-digest\";req",
];

pub fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = u32::from(chunk[0]);
        let b1 = if chunk.len() > 1 { u32::from(chunk[1]) } else { 0 };
        let b2 = if chunk.len() > 2 { u32::from(chunk[2]) } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3f) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    out
}

fn b64_val(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

/// Strict canonical standard Base64 decoder (rejects whitespace, bad padding, and non-canonical bits).
pub fn base64_decode_strict(input: &str) -> Result<Vec<u8>, String> {
    let raw = input.as_bytes();
    if raw.len() % 4 != 0 {
        return Err("invalid base64 length".to_string());
    }
    let mut out = Vec::with_capacity((raw.len() / 4) * 3);
    for (idx, chunk) in raw.chunks_exact(4).enumerate() {
        let is_last = (idx + 1) * 4 == raw.len();
        let c0 = b64_val(chunk[0]).ok_or_else(|| "invalid base64 char".to_string())?;
        let c1 = b64_val(chunk[1]).ok_or_else(|| "invalid base64 char".to_string())?;
        let pad2 = chunk[2] == b'=';
        let pad3 = chunk[3] == b'=';
        if (pad2 || pad3) && !is_last {
            return Err("padding in middle of base64".to_string());
        }
        if pad2 && !pad3 {
            return Err("invalid base64 padding".to_string());
        }
        let c2 = if pad2 {
            0
        } else {
            b64_val(chunk[2]).ok_or_else(|| "invalid base64 char".to_string())?
        };
        let c3 = if pad3 {
            0
        } else {
            b64_val(chunk[3]).ok_or_else(|| "invalid base64 char".to_string())?
        };
        out.push((c0 << 2) | (c1 >> 4));
        if !pad2 {
            out.push((c1 << 4) | (c2 >> 2));
        } else if (c1 & 0x0f) != 0 {
            return Err("non-canonical base64 trailing bits".to_string());
        }
        if !pad3 {
            out.push((c2 << 6) | c3);
        } else if (c2 & 0x03) != 0 {
            return Err("non-canonical base64 trailing bits".to_string());
        }
    }
    Ok(out)
}

pub fn base64url_decode_nopad(input: &str) -> Result<Vec<u8>, String> {
    let mut std_b64 = input.replace('-', "+").replace('_', "/");
    match std_b64.len() % 4 {
        0 => {}
        2 => std_b64.push_str("=="),
        3 => std_b64.push('='),
        _ => return Err("invalid base64url length".to_string()),
    }
    base64_decode_strict(&std_b64)
}

/// Returns the official 0x production Ed25519 verifying key map.
pub fn official_0x_prod_keys() -> BTreeMap<String, [u8; 32]> {
    let raw = base64url_decode_nopad(OFFICIAL_0X_PROD_KEY_JWK_X)
        .expect("static 0x JWK x must decode");
    let arr: [u8; 32] = raw.try_into().expect("static 0x JWK x must be 32 bytes");
    let mut map = BTreeMap::new();
    map.insert(OFFICIAL_0X_PROD_KEY_ID.to_string(), arr);
    map
}

pub fn sha256_bytes(bytes: &[u8]) -> [u8; 32] {
    let digest = Sha256::digest(bytes);
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(sha256_bytes(bytes))
}

pub fn format_content_digest(bytes: &[u8]) -> String {
    format!("sha-256=:{}:", base64_encode(&sha256_bytes(bytes)))
}

pub fn parse_content_digest(header_value: &str) -> Option<[u8; 32]> {
    let trimmed = header_value.trim();
    let inner = trimmed.strip_prefix("sha-256=:")?.strip_suffix(':')?;
    let bytes = base64_decode_strict(inner).ok()?;
    bytes.try_into().ok()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestEvidence {
    pub method: String,
    pub authority: String,
    pub path: String,
    #[serde(default)]
    pub query: Option<String>,
    pub headers: BTreeMap<String, String>,
    pub body_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponseEvidence {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSignatureInput {
    pub label: String,
    pub params_value: String,
    pub components: Vec<String>,
    pub created: Option<i64>,
    pub key_id: Option<String>,
    pub alg: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Rfc9421VerificationResult {
    pub ok: bool,
    pub code: String,
    pub detail: String,
    pub request_body_sha256: String,
    pub response_body_sha256: String,
    pub now_unix_seconds: i64,
    pub key_id: Option<String>,
    pub created: Option<i64>,
    pub age_seconds: Option<i64>,
    pub covered_components: Vec<String>,
    pub response_signature_digest: Option<String>,
}

fn get_header_ci<'a>(headers: &'a BTreeMap<String, String>, name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

pub fn parse_signature_input(header_value: &str) -> Option<ParsedSignatureInput> {
    let trimmed = header_value.trim();
    let eq = trimmed.find('=')?;
    let label = &trimmed[..eq];
    if label.is_empty()
        || !label
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
    {
        return None;
    }
    let params_value = &trimmed[eq + 1..];
    if !params_value.starts_with('(') {
        return None;
    }
    let close = params_value.find(')')?;
    let inner = params_value[1..close].trim();
    if inner.is_empty() {
        return None;
    }
    let components: Vec<String> = inner.split_whitespace().map(|s| s.to_string()).collect();

    let mut created = None;
    let mut key_id = None;
    let mut alg = None;
    let mut tag = None;

    let rest = &params_value[close + 1..];
    if !rest.is_empty() {
        if !rest.starts_with(';') {
            return None;
        }
        for segment in rest[1..].split(';') {
            let p_eq = segment.find('=')?;
            let k = segment[..p_eq].trim();
            let v = segment[p_eq + 1..].trim();
            match k {
                "created" => {
                    if v.is_empty() || v.len() > 12 || !v.bytes().all(|b| b.is_ascii_digit()) {
                        return None;
                    }
                    created = Some(v.parse::<i64>().ok()?);
                }
                "keyid" | "alg" | "tag" => {
                    let unquoted = v.strip_prefix('"')?.strip_suffix('"')?;
                    if unquoted.is_empty()
                        || unquoted.len() > 128
                        || unquoted.contains('"')
                        || unquoted.contains('\\')
                    {
                        return None;
                    }
                    match k {
                        "keyid" => key_id = Some(unquoted.to_string()),
                        "alg" => alg = Some(unquoted.to_string()),
                        "tag" => tag = Some(unquoted.to_string()),
                        _ => unreachable!(),
                    }
                }
                _ => return None,
            }
        }
    }

    Some(ParsedSignatureInput {
        label: label.to_string(),
        params_value: params_value.to_string(),
        components,
        created,
        key_id,
        alg,
        tag,
    })
}

pub fn parse_signature_header(header_value: &str, expected_label: &str) -> Option<[u8; 64]> {
    let trimmed = header_value.trim();
    let eq = trimmed.find('=')?;
    let label = &trimmed[..eq];
    if label != expected_label {
        return None;
    }
    let inner = trimmed[eq + 1..].strip_prefix(':')?.strip_suffix(':')?;
    let bytes = base64_decode_strict(inner).ok()?;
    bytes.try_into().ok()
}

fn resolve_component_value(
    component_id: &str,
    request: &HttpRequestEvidence,
    response: &HttpResponseEvidence,
) -> Result<String, String> {
    match component_id {
        "\"@status\"" => {
            if !(100..=599).contains(&response.status) {
                return Err("invalid response @status".to_string());
            }
            Ok(response.status.to_string())
        }
        "\"content-type\"" => {
            let v = get_header_ci(&response.headers, "content-type")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "missing response content-type".to_string())?;
            Ok(v.to_string())
        }
        "\"content-digest\"" => {
            let v = get_header_ci(&response.headers, "content-digest")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "missing response content-digest".to_string())?;
            Ok(v.to_string())
        }
        "\"@method\";req" => {
            let m = request.method.trim();
            if m.is_empty() {
                return Err("missing request @method".to_string());
            }
            Ok(m.to_ascii_uppercase())
        }
        "\"@authority\";req" => {
            let a = request.authority.trim();
            if a.is_empty() {
                return Err("missing request @authority".to_string());
            }
            Ok(a.to_ascii_lowercase())
        }
        "\"@path\";req" => {
            if !request.path.starts_with('/') {
                return Err("missing or invalid request @path".to_string());
            }
            Ok(request.path.clone())
        }
        "\"@query\";req" => match request.query.as_deref() {
            Some(q) if q.starts_with('?') => Ok(q.to_string()),
            _ => Ok("?".to_string()),
        },
        "\"content-digest\";req" => {
            let v = get_header_ci(&request.headers, "content-digest")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "missing request content-digest".to_string())?;
            Ok(v.to_string())
        }
        other => Err(format!("unsupported RFC 9421 component: {other}")),
    }
}

pub fn build_signature_base(
    components: &[String],
    params_value: &str,
    request: &HttpRequestEvidence,
    response: &HttpResponseEvidence,
) -> Result<Vec<u8>, String> {
    let mut lines = Vec::with_capacity(components.len() + 1);
    for id in components {
        let val = resolve_component_value(id, request, response)?;
        lines.push(format!("{id}: {val}"));
    }
    lines.push(format!("\"@signature-params\": {params_value}"));
    Ok(lines.join("\n").into_bytes())
}

/// Sign an HTTP request/response exchange in RFC 9421 Ed25519 format (used by deterministic tests).
pub fn sign_0x_http_response(
    mut request: HttpRequestEvidence,
    mut response: HttpResponseEvidence,
    signing_key: &SigningKey,
    key_id: &str,
    created: i64,
) -> Result<(HttpRequestEvidence, HttpResponseEvidence), String> {
    let req_bytes = base64_decode_strict(&request.body_base64)?;
    let res_bytes = base64_decode_strict(&response.body_base64)?;
    request
        .headers
        .insert("accept-signature".to_string(), "sig=()".to_string());
    request
        .headers
        .entry("content-type".to_string())
        .or_insert_with(|| "application/json".to_string());
    request
        .headers
        .insert("content-digest".to_string(), format_content_digest(&req_bytes));

    response
        .headers
        .entry("content-type".to_string())
        .or_insert_with(|| "application/json".to_string());
    response
        .headers
        .insert("content-digest".to_string(), format_content_digest(&res_bytes));

    let components: Vec<String> = vec![
        "\"@status\"".to_string(),
        "\"content-type\"".to_string(),
        "\"content-digest\"".to_string(),
        "\"@method\";req".to_string(),
        "\"@authority\";req".to_string(),
        "\"@path\";req".to_string(),
        "\"@query\";req".to_string(),
        "\"content-digest\";req".to_string(),
    ];
    let params_value = format!(
        "({});created={};keyid=\"{}\";alg=\"ed25519\";tag=\"{}\"",
        components.join(" "),
        created,
        key_id,
        DEFAULT_0X_TAG
    );
    let sig_base = build_signature_base(&components, &params_value, &request, &response)?;
    let sig = signing_key.sign(&sig_base);
    response
        .headers
        .insert("signature-input".to_string(), format!("sig={params_value}"));
    response.headers.insert(
        "signature".to_string(),
        format!("sig=:{}:", base64_encode(&sig.to_bytes())),
    );
    Ok((request, response))
}

/// Verify an HTTP response signed by 0x (or a pinned test key) under RFC 9421 Ed25519.
/// Does NOT perform replay storage I/O itself; returns `response_signature_digest` so the
/// caller's durable store (e.g. SQLite WAL) records single-use ONLY when `result.ok == true`.
pub fn verify_0x_http_response(
    request: &HttpRequestEvidence,
    response: &HttpResponseEvidence,
    trusted_keys: &BTreeMap<String, [u8; 32]>,
    now_unix_seconds: i64,
    max_age_seconds: i64,
    max_future_skew_seconds: i64,
    expected_tag: &str,
) -> Rfc9421VerificationResult {
    let req_bytes = match base64_decode_strict(&request.body_base64) {
        Ok(b) => b,
        Err(e) => {
            return Rfc9421VerificationResult {
                ok: false,
                code: "INVALID_REQUEST_BODY_BASE64".to_string(),
                detail: e,
                request_body_sha256: String::new(),
                response_body_sha256: String::new(),
                now_unix_seconds,
                key_id: None,
                created: None,
                age_seconds: None,
                covered_components: Vec::new(),
                response_signature_digest: None,
            }
        }
    };
    let res_bytes = match base64_decode_strict(&response.body_base64) {
        Ok(b) => b,
        Err(e) => {
            return Rfc9421VerificationResult {
                ok: false,
                code: "INVALID_RESPONSE_BODY_BASE64".to_string(),
                detail: e,
                request_body_sha256: sha256_hex(&req_bytes),
                response_body_sha256: String::new(),
                now_unix_seconds,
                key_id: None,
                created: None,
                age_seconds: None,
                covered_components: Vec::new(),
                response_signature_digest: None,
            }
        }
    };

    let req_sha = sha256_bytes(&req_bytes);
    let res_sha = sha256_bytes(&res_bytes);
    let req_sha_hex = hex::encode(req_sha);
    let res_sha_hex = hex::encode(res_sha);

    let fail = |code: &str,
                detail: String,
                key_id: Option<String>,
                created: Option<i64>,
                age_seconds: Option<i64>| Rfc9421VerificationResult {
        ok: false,
        code: code.to_string(),
        detail,
        request_body_sha256: req_sha_hex.clone(),
        response_body_sha256: res_sha_hex.clone(),
        now_unix_seconds,
        key_id,
        created,
        age_seconds,
        covered_components: Vec::new(),
        response_signature_digest: None,
    };

    // 1. Verify request body SHA-256 against request Content-Digest header
    let Some(req_digest_hdr) = get_header_ci(&request.headers, "content-digest") else {
        return fail(
            "MISSING_OR_INVALID_REQUEST_CONTENT_DIGEST",
            "Request lacks a Content-Digest header.".to_string(),
            None,
            None,
            None,
        );
    };
    let Some(req_digest_parsed) = parse_content_digest(req_digest_hdr) else {
        return fail(
            "MISSING_OR_INVALID_REQUEST_CONTENT_DIGEST",
            "Request Content-Digest header is malformed.".to_string(),
            None,
            None,
            None,
        );
    };
    if req_digest_parsed != req_sha {
        return fail(
            "REQUEST_BODY_DIGEST_MISMATCH",
            "Request body bytes do not match request Content-Digest header.".to_string(),
            None,
            None,
            None,
        );
    }

    // 2. Verify response body SHA-256 against response Content-Digest header
    let Some(res_digest_hdr) = get_header_ci(&response.headers, "content-digest") else {
        return fail(
            "MISSING_OR_INVALID_RESPONSE_CONTENT_DIGEST",
            "Response lacks a Content-Digest header.".to_string(),
            None,
            None,
            None,
        );
    };
    let Some(res_digest_parsed) = parse_content_digest(res_digest_hdr) else {
        return fail(
            "MISSING_OR_INVALID_RESPONSE_CONTENT_DIGEST",
            "Response Content-Digest header is malformed.".to_string(),
            None,
            None,
            None,
        );
    };
    if res_digest_parsed != res_sha {
        return fail(
            "RESPONSE_BODY_DIGEST_MISMATCH",
            "Response body bytes do not match response Content-Digest header.".to_string(),
            None,
            None,
            None,
        );
    }

    // 3. Parse Signature-Input and Signature headers
    let Some(sig_input_hdr) = get_header_ci(&response.headers, "signature-input") else {
        return fail(
            "INVALID_SIGNATURE_INPUT",
            "Missing RFC 9421 Signature-Input header.".to_string(),
            None,
            None,
            None,
        );
    };
    let Some(parsed_input) = parse_signature_input(sig_input_hdr) else {
        return fail(
            "INVALID_SIGNATURE_INPUT",
            "Malformed RFC 9421 Signature-Input header.".to_string(),
            None,
            None,
            None,
        );
    };
    let Some(sig_hdr) = get_header_ci(&response.headers, "signature") else {
        return fail(
            "INVALID_SIGNATURE_HEADER",
            "Missing RFC 9421 Signature header.".to_string(),
            parsed_input.key_id.clone(),
            parsed_input.created,
            None,
        );
    };
    let Some(sig_bytes) = parse_signature_header(sig_hdr, &parsed_input.label) else {
        return fail(
            "INVALID_SIGNATURE_HEADER",
            "Malformed RFC 9421 Signature header.".to_string(),
            parsed_input.key_id.clone(),
            parsed_input.created,
            None,
        );
    };

    // 4. Verify required covered components (especially request body digest binding)
    let mut seen = BTreeSet::new();
    for c in &parsed_input.components {
        if !seen.insert(c.as_str()) {
            return fail(
                "DUPLICATE_SIGNATURE_COMPONENTS",
                "Signature-Input contains duplicate components.".to_string(),
                parsed_input.key_id.clone(),
                parsed_input.created,
                None,
            );
        }
    }
    for req_comp in REQUIRED_0X_COMPONENTS {
        if !seen.contains(*req_comp) {
            return fail(
                "MISSING_REQUIRED_SIGNED_COMPONENT",
                format!("Signature-Input does not cover required component {req_comp}."),
                parsed_input.key_id.clone(),
                parsed_input.created,
                None,
            );
        }
    }

    // 5. Verify algorithm, tag, freshness window, and pinned keyid
    if parsed_input.alg.as_deref() != Some("ed25519") {
        return fail(
            "UNSUPPORTED_SIGNATURE_ALG",
            format!(
                "Expected alg=\"ed25519\", received {:?}.",
                parsed_input.alg
            ),
            parsed_input.key_id.clone(),
            parsed_input.created,
            None,
        );
    }
    if parsed_input.tag.as_deref() != Some(expected_tag) {
        return fail(
            "UNEXPECTED_SIGNATURE_TAG",
            format!(
                "Expected tag=\"{expected_tag}\", received {:?}.",
                parsed_input.tag
            ),
            parsed_input.key_id.clone(),
            parsed_input.created,
            None,
        );
    }
    let Some(created) = parsed_input.created else {
        return fail(
            "MISSING_CREATED_TIMESTAMP",
            "Signature-Input lacks a valid created timestamp.".to_string(),
            parsed_input.key_id.clone(),
            None,
            None,
        );
    };
    let age_seconds = now_unix_seconds.saturating_sub(created);
    if age_seconds > max_age_seconds {
        return fail(
            "RESPONSE_SIGNATURE_EXPIRED",
            format!("Signature age {age_seconds}s exceeds max window of {max_age_seconds}s."),
            parsed_input.key_id.clone(),
            Some(created),
            Some(age_seconds),
        );
    }
    if created.saturating_sub(now_unix_seconds) > max_future_skew_seconds {
        return fail(
            "RESPONSE_SIGNATURE_FROM_FUTURE",
            format!(
                "Signature created {created} is too far ahead of clock {now_unix_seconds}."
            ),
            parsed_input.key_id.clone(),
            Some(created),
            Some(age_seconds),
        );
    }

    let Some(key_id) = parsed_input.key_id.as_deref() else {
        return fail(
            "UNTRUSTED_0X_KEY_ID",
            "Missing keyid parameter in Signature-Input.".to_string(),
            None,
            Some(created),
            Some(age_seconds),
        );
    };
    let Some(pub_bytes) = trusted_keys.get(key_id) else {
        return fail(
            "UNTRUSTED_0X_KEY_ID",
            format!("Key id '{key_id}' is not in the pinned external trust store."),
            Some(key_id.to_string()),
            Some(created),
            Some(age_seconds),
        );
    };
    let Ok(vk) = VerifyingKey::from_bytes(pub_bytes) else {
        return fail(
            "INVALID_PINNED_PUBLIC_KEY",
            format!("Pinned public key for '{key_id}' is not a valid Ed25519 point."),
            Some(key_id.to_string()),
            Some(created),
            Some(age_seconds),
        );
    };

    // 6. Reconstruct canonical RFC 9421 signature base and verify strict Ed25519 signature
    let sig_base = match build_signature_base(
        &parsed_input.components,
        &parsed_input.params_value,
        request,
        response,
    ) {
        Ok(b) => b,
        Err(e) => {
            return fail(
                "SIGNATURE_BASE_ERROR",
                e,
                Some(key_id.to_string()),
                Some(created),
                Some(age_seconds),
            )
        }
    };
    let sig = Signature::from_bytes(&sig_bytes);
    if vk.verify_strict(&sig_base, &sig).is_err() {
        return fail(
            "INVALID_0X_ED25519_SIGNATURE",
            "Ed25519 signature verification failed against canonical RFC 9421 base.".to_string(),
            Some(key_id.to_string()),
            Some(created),
            Some(age_seconds),
        );
    }

    // 7. Compute deterministic BLAKE3 single-use consumption digest
    let mut hasher = blake3::Hasher::new();
    hasher.update(b"ARKHE:0X-RESPONSE-USE:v1\0");
    hasher.update(req_sha_hex.as_bytes());
    hasher.update(b":");
    hasher.update(res_sha_hex.as_bytes());
    hasher.update(b":");
    hasher.update(&sig_bytes);
    let response_signature_digest = hex::encode(hasher.finalize().as_bytes());

    Rfc9421VerificationResult {
        ok: true,
        code: "VALID_0X_SIGNATURE".to_string(),
        detail: "0x Ed25519 RFC 9421 signature, request/response Content-Digest binding, and freshness window passed.".to_string(),
        request_body_sha256: req_sha_hex,
        response_body_sha256: res_sha_hex,
        now_unix_seconds,
        key_id: Some(key_id.to_string()),
        created: Some(created),
        age_seconds: Some(age_seconds),
        covered_components: parsed_input.components,
        response_signature_digest: Some(response_signature_digest),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_versioned_official_0x_capture_and_rejects_mutations() {
        let raw = include_str!("../../../../integrations/solana-proof/fixtures/zerox-official-solana-swap-instructions.json");
        let parsed: serde_json::Value = serde_json::from_str(raw).unwrap();
        let req: HttpRequestEvidence = serde_json::from_value(parsed["request"].clone()).unwrap();
        let res: HttpResponseEvidence = serde_json::from_value(parsed["response"].clone()).unwrap();
        let created = parsed["verification"]["created"].as_i64().unwrap();
        let keys = official_0x_prod_keys();

        // Valid official 0x signature
        let ok = verify_0x_http_response(
            &req,
            &res,
            &keys,
            created + 5,
            DEFAULT_MAX_AGE_SECONDS,
            DEFAULT_MAX_FUTURE_SKEW_SECONDS,
            DEFAULT_0X_TAG,
        );
        assert!(ok.ok, "expected VALID_0X_SIGNATURE, got {:?}", ok);
        assert_eq!(ok.code, "VALID_0X_SIGNATURE");
        assert_eq!(ok.key_id.as_deref(), Some(OFFICIAL_0X_PROD_KEY_ID));
        assert!(ok.response_signature_digest.is_some());

        // Expired (+61s)
        let expired = verify_0x_http_response(
            &req,
            &res,
            &keys,
            created + 61,
            DEFAULT_MAX_AGE_SECONDS,
            DEFAULT_MAX_FUTURE_SKEW_SECONDS,
            DEFAULT_0X_TAG,
        );
        assert!(!expired.ok);
        assert_eq!(expired.code, "RESPONSE_SIGNATURE_EXPIRED");

        // Swapped request body with recomputed request Content-Digest (without 0x re-signing)
        let mut swapped_req = req.clone();
        let new_body = br#"{"token_in":"So11111111111111111111111111111111111111112","amount_in":50000000}"#;
        swapped_req.body_base64 = base64_encode(new_body);
        swapped_req
            .headers
            .insert("content-digest".to_string(), format_content_digest(new_body));
        let swapped = verify_0x_http_response(
            &swapped_req,
            &res,
            &keys,
            created + 5,
            DEFAULT_MAX_AGE_SECONDS,
            DEFAULT_MAX_FUTURE_SKEW_SECONDS,
            DEFAULT_0X_TAG,
        );
        assert!(!swapped.ok);
        assert_eq!(swapped.code, "INVALID_0X_ED25519_SIGNATURE");

        // Altered response body keeping headers & signature
        let mut tampered_res = res.clone();
        let mut res_bytes = base64_decode_strict(&res.body_base64).unwrap();
        let last = res_bytes.len() - 2;
        res_bytes[last] ^= 0x01;
        tampered_res.body_base64 = base64_encode(&res_bytes);
        let tampered = verify_0x_http_response(
            &req,
            &tampered_res,
            &keys,
            created + 5,
            DEFAULT_MAX_AGE_SECONDS,
            DEFAULT_MAX_FUTURE_SKEW_SECONDS,
            DEFAULT_0X_TAG,
        );
        assert!(!tampered.ok);
        assert_eq!(tampered.code, "RESPONSE_BODY_DIGEST_MISMATCH");
    }
}
