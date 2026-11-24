//! Authoritative offline Solana `MessageV0` wire-byte interpreter and Arkhe swap policy evaluator.
//!
//! This module is the single policy decision authority for the Arkhe x 0x Solana pilot:
//! - Parses raw serialized Solana v0 wire bytes directly (`0x80` version prefix, header,
//!   compact-u16 vectors, static keys, compiled instructions, and address table lookups).
//! - Resolves every static and Address Lookup Table (ALT) account index independently.
//! - Decodes every compiled instruction (`ComputeBudget`, `AssociatedTokenProgram`,
//!   `SystemProgram`, `SPL Token`, and pinned `coveredSwapPrograms`) directly from wire bytes
//!   — never trusting pre-interpreted summaries from TypeScript/JS.
//! - Evaluates separated spend caps (`max_input_asset_debit`, `max_sol_ancillary_debit`,
//!   `max_total_sol_debit`, `min_output_net_credit`) and returns `ELEGÍVEL`, `BLOQUEADO`,
//!   or `INCONCLUSIVO`.

use std::collections::BTreeMap;

use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const VERDICT_ELIGIBLE: &str = "ELEGÍVEL";
pub const VERDICT_BLOCKED: &str = "BLOQUEADO";
pub const VERDICT_INCONCLUSIVE: &str = "INCONCLUSIVO";

pub const BASE_FEE_PER_SIGNATURE_LAMPORTS: u64 = 5_000;
pub const ATA_RENT_EXEMPT_LAMPORTS: u64 = 2_039_280;
pub const DEFAULT_CU_PER_INSTRUCTION: u64 = 200_000;
pub const MAX_CU_LIMIT: u64 = 1_400_000;

const SYSTEM_PROGRAM_ID: &str = "11111111111111111111111111111111";
const COMPUTE_BUDGET_PROGRAM_ID: &str = "ComputeBudget111111111111111111111111111111";
const TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const NATIVE_MINT_ID: &str = "So11111111111111111111111111111111111111112";
pub const ZEROX_SETTLER_PROGRAM_ID: &str = "Sett1erwx2eqT5A8uvu8GBxDFT2W5TNnhirL7hLmb8m";

const KNOWN_SOLANA_DEX_OR_SYS_PROGRAMS: &[(&str, &str)] = &[
    (SYSTEM_PROGRAM_ID, "SystemProgram"),
    (TOKEN_PROGRAM_ID, "SplToken"),
    ("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "SplToken2022"),
    (ASSOCIATED_TOKEN_PROGRAM_ID, "AssociatedTokenProgram"),
    ("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo", "MeteoraDlmm"),
    ("DRVSpZ2YUYYKgZP8XtLhAGtT1zYSCKzeHfb4DgRnrgqD", "Deriverse"),
    ("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", "OrcaWhirlpool"),
    ("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", "RaydiumClmm"),
    ("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", "RaydiumAmmV4"),
];

const BASE58_ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

pub fn base58_encode(input: &[u8]) -> String {
    if input.is_empty() {
        return String::new();
    }
    let zeros = input.iter().take_while(|&&b| b == 0).count();
    let mut digits = Vec::new();
    for &byte in input {
        let mut carry = u32::from(byte);
        for d in &mut digits {
            carry += u32::from(*d) << 8;
            *d = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let mut out = String::with_capacity(zeros + digits.len());
    for _ in 0..zeros {
        out.push('1');
    }
    for &d in digits.iter().rev() {
        out.push(BASE58_ALPHABET[usize::from(d)] as char);
    }
    out
}

pub fn base58_decode_32(input: &str) -> Result<[u8; 32], String> {
    if input.is_empty() || input.len() > 44 {
        return Err(format!("invalid base58 pubkey length: {}", input.len()));
    }
    let zeros = input.bytes().take_while(|&b| b == b'1').count();
    let mut bytes = Vec::new();
    for ch in input.bytes() {
        let val = BASE58_ALPHABET
            .iter()
            .position(|&c| c == ch)
            .ok_or_else(|| format!("invalid base58 character in '{input}'"))? as u32;
        let mut carry = val;
        for b in &mut bytes {
            carry += u32::from(*b) * 58;
            *b = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            bytes.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    let total = zeros + bytes.len();
    if total != 32 {
        return Err(format!("decoded pubkey must be 32 bytes, got {total}"));
    }
    let mut out = [0u8; 32];
    for (idx, &b) in bytes.iter().rev().enumerate() {
        out[zeros + idx] = b;
    }
    Ok(out)
}

fn base64_encode(bytes: &[u8]) -> String {
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageHeader {
    pub num_required_signatures: u8,
    pub num_readonly_signed_accounts: u8,
    pub num_readonly_unsigned_accounts: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompiledInstruction {
    pub program_id_index: u8,
    pub account_key_indexes: Vec<u8>,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageAddressTableLookup {
    pub account_key: [u8; 32],
    pub writable_indexes: Vec<u8>,
    pub readonly_indexes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedMessageV0 {
    pub header: MessageHeader,
    pub static_account_keys: Vec<[u8; 32]>,
    pub recent_blockhash: [u8; 32],
    pub instructions: Vec<CompiledInstruction>,
    pub address_table_lookups: Vec<MessageAddressTableLookup>,
}

struct WireReader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> WireReader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, pos: 0 }
    }

    fn read_u8(&mut self) -> Result<u8, String> {
        let b = *self
            .bytes
            .get(self.pos)
            .ok_or_else(|| "unexpected EOF in Solana MessageV0".to_string())?;
        self.pos += 1;
        Ok(b)
    }

    fn read_exact(&mut self, len: usize) -> Result<&'a [u8], String> {
        let end = self
            .pos
            .checked_add(len)
            .ok_or_else(|| "length overflow in Solana MessageV0".to_string())?;
        if end > self.bytes.len() {
            return Err("unexpected EOF reading slice in Solana MessageV0".to_string());
        }
        let slice = &self.bytes[self.pos..end];
        self.pos = end;
        Ok(slice)
    }

    fn read_32(&mut self) -> Result<[u8; 32], String> {
        let slice = self.read_exact(32)?;
        let mut out = [0u8; 32];
        out.copy_from_slice(slice);
        Ok(out)
    }

    /// Strict canonical Solana compact-u16 decoder.
    fn read_compact_u16(&mut self) -> Result<u16, String> {
        let b0 = self.read_u8()?;
        if b0 < 0x80 {
            return Ok(u16::from(b0));
        }
        let b1 = self.read_u8()?;
        if b1 == 0 {
            return Err("non-canonical 2-byte compact-u16".to_string());
        }
        if b1 < 0x80 {
            return Ok(u16::from(b0 & 0x7f) | (u16::from(b1) << 7));
        }
        let b2 = self.read_u8()?;
        if b2 == 0 || b2 > 0x03 {
            return Err("invalid or non-canonical 3-byte compact-u16".to_string());
        }
        Ok(u16::from(b0 & 0x7f) | (u16::from(b1 & 0x7f) << 7) | (u16::from(b2) << 14))
    }

    fn finish(&self) -> Result<(), String> {
        if self.pos != self.bytes.len() {
            return Err(format!(
                "trailing bytes after Solana MessageV0: {} remaining",
                self.bytes.len() - self.pos
            ));
        }
        Ok(())
    }
}

/// Deserialize a raw Solana v0 wire message (`VersionedMessage::V0` serialized bytes).
pub fn parse_solana_message_v0(bytes: &[u8]) -> Result<ParsedMessageV0, String> {
    if bytes.is_empty() || bytes.len() > 4096 {
        return Err(format!("invalid Solana MessageV0 length: {}", bytes.len()));
    }
    let mut r = WireReader::new(bytes);
    let prefix = r.read_u8()?;
    if prefix != 0x80 {
        return Err(format!(
            "unsupported Solana message version prefix: 0x{prefix:02x} (expected 0x80 for v0)"
        ));
    }

    let header = MessageHeader {
        num_required_signatures: r.read_u8()?,
        num_readonly_signed_accounts: r.read_u8()?,
        num_readonly_unsigned_accounts: r.read_u8()?,
    };

    let static_count = usize::from(r.read_compact_u16()?);
    if static_count > 256 {
        return Err("too many static account keys".to_string());
    }
    if usize::from(header.num_required_signatures) > static_count {
        return Err("num_required_signatures exceeds static account count".to_string());
    }
    if header.num_readonly_signed_accounts > header.num_required_signatures {
        return Err("num_readonly_signed_accounts exceeds num_required_signatures".to_string());
    }
    let unsigned_count = static_count - usize::from(header.num_required_signatures);
    if usize::from(header.num_readonly_unsigned_accounts) > unsigned_count {
        return Err("num_readonly_unsigned_accounts exceeds unsigned account count".to_string());
    }

    let mut static_account_keys = Vec::with_capacity(static_count);
    for _ in 0..static_count {
        static_account_keys.push(r.read_32()?);
    }

    let recent_blockhash = r.read_32()?;

    let ix_count = usize::from(r.read_compact_u16()?);
    if ix_count > 64 {
        return Err("too many compiled instructions".to_string());
    }
    let mut instructions = Vec::with_capacity(ix_count);
    for _ in 0..ix_count {
        let program_id_index = r.read_u8()?;
        let acct_len = usize::from(r.read_compact_u16()?);
        let account_key_indexes = r.read_exact(acct_len)?.to_vec();
        let data_len = usize::from(r.read_compact_u16()?);
        let data = r.read_exact(data_len)?.to_vec();
        instructions.push(CompiledInstruction {
            program_id_index,
            account_key_indexes,
            data,
        });
    }

    let alt_count = usize::from(r.read_compact_u16()?);
    if alt_count > 64 {
        return Err("too many address table lookups".to_string());
    }
    let mut address_table_lookups = Vec::with_capacity(alt_count);
    for _ in 0..alt_count {
        let account_key = r.read_32()?;
        let w_len = usize::from(r.read_compact_u16()?);
        let writable_indexes = r.read_exact(w_len)?.to_vec();
        let r_len = usize::from(r.read_compact_u16()?);
        let readonly_indexes = r.read_exact(r_len)?.to_vec();
        address_table_lookups.push(MessageAddressTableLookup {
            account_key,
            writable_indexes,
            readonly_indexes,
        });
    }

    r.finish()?;
    Ok(ParsedMessageV0 {
        header,
        static_account_keys,
        recent_blockhash,
        instructions,
        address_table_lookups,
    })
}

const ALT_SNAPSHOT_DOMAIN: &[u8] = b"ARKHE:SOLANA-ALT-SNAPSHOT:v1\0";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AltSnapshotAttestation {
    pub key_id: String,
    pub signature_hex: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressLookupTableSnapshot {
    pub key: String,
    #[serde(default)]
    pub network: Option<String>,
    #[serde(default)]
    pub genesis_hash: Option<String>,
    #[serde(default)]
    pub slot: Option<u64>,
    #[serde(default)]
    pub deactivation_slot: Option<String>,
    pub addresses: Vec<String>,
    #[serde(default)]
    pub attestation: Option<AltSnapshotAttestation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AltSnapshotVerificationReport {
    pub key: String,
    pub network: Option<String>,
    pub genesis_hash: Option<String>,
    pub slot: Option<u64>,
    pub deactivation_slot: Option<String>,
    pub snapshot_digest_blake3: String,
    pub attested_by_key_id: Option<String>,
    pub status: String,
    pub detail: String,
}

pub fn canonical_alt_snapshot_bytes(
    network: &str,
    genesis_hash: &str,
    key: &str,
    slot: u64,
    deactivation_slot: u64,
    addresses: &[String],
) -> Result<Vec<u8>, String> {
    let key_bytes = base58_decode_32(key)?;
    let mut out = Vec::with_capacity(
        ALT_SNAPSHOT_DOMAIN.len() + 8 + network.len() + genesis_hash.len() + 32 + 16 + 4 + addresses.len() * 32,
    );
    out.extend_from_slice(ALT_SNAPSHOT_DOMAIN);
    out.extend_from_slice(&(network.len() as u32).to_be_bytes());
    out.extend_from_slice(network.as_bytes());
    out.extend_from_slice(&(genesis_hash.len() as u32).to_be_bytes());
    out.extend_from_slice(genesis_hash.as_bytes());
    out.extend_from_slice(&key_bytes);
    out.extend_from_slice(&slot.to_be_bytes());
    out.extend_from_slice(&deactivation_slot.to_be_bytes());
    out.extend_from_slice(&(addresses.len() as u32).to_be_bytes());
    for addr in addresses {
        out.extend_from_slice(&base58_decode_32(addr)?);
    }
    Ok(out)
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoveredSwapProgramProfile {
    pub name: String,
    pub discriminator_hex: String,
    pub guarantees: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaSwapPolicy {
    pub policy_id: String,
    pub network: String,
    pub genesis_hash: Option<String>,
    pub taker: String,
    pub taker_input_token_account: String,
    pub authorized_recipient: String,
    pub authorized_destination_token_account: String,
    pub input_mint: String,
    pub output_mint: String,
    pub max_input_asset_debit: String,
    pub max_sol_ancillary_debit: String,
    pub max_total_sol_debit: Option<String>,
    pub min_output_net_credit: String,
    #[serde(default)]
    pub trusted_alt_attester_keys: BTreeMap<String, String>,
    pub covered_swap_programs: BTreeMap<String, CoveredSwapProgramProfile>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Raw0xAccountMeta {
    pub pubkey: String,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Raw0xInstruction {
    pub program_id: String,
    pub accounts: Vec<Raw0xAccountMeta>,
    pub data: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Raw0xSwapPayload {
    pub network: Option<String>,
    pub genesis_hash: Option<String>,
    #[serde(default)]
    pub address_lookup_table_addresses: Vec<String>,
    #[serde(default)]
    pub instructions: Vec<Raw0xInstruction>,
}

/// Normalize either camelCase test-fixture 0x JSON OR live `api.0x.org` Solana byte-array JSON
/// (`program_id: [u8; 32]`, `accounts[].pubkey: [u8; 32]`, `is_signer`, `is_writable`,
/// `data: Vec<u8>`, `address_lookup_tables: Vec<String>`) into [`Raw0xSwapPayload`].
pub fn normalize_raw_0x_payload(raw: &serde_json::Value) -> Result<Raw0xSwapPayload, String> {
    fn parse_pubkey_val(v: &serde_json::Value) -> Result<String, String> {
        if let Some(s) = v.as_str() {
            base58_decode_32(s)?;
            return Ok(s.to_string());
        }
        if let Some(arr) = v.as_array() {
            if arr.len() != 32 {
                return Err(format!("expected 32-byte pubkey array, got {}", arr.len()));
            }
            let mut bytes = [0u8; 32];
            for (i, elem) in arr.iter().enumerate() {
                let n = elem
                    .as_u64()
                    .and_then(|x| u8::try_from(x).ok())
                    .ok_or_else(|| "invalid byte in pubkey array".to_string())?;
                bytes[i] = n;
            }
            return Ok(base58_encode(&bytes));
        }
        Err("unsupported pubkey JSON representation".to_string())
    }

    fn parse_data_b64(v: &serde_json::Value) -> Result<String, String> {
        if let Some(s) = v.as_str() {
            return Ok(s.to_string());
        }
        if let Some(arr) = v.as_array() {
            let mut bytes = Vec::with_capacity(arr.len());
            for elem in arr {
                let n = elem
                    .as_u64()
                    .and_then(|x| u8::try_from(x).ok())
                    .ok_or_else(|| "invalid byte in instruction data array".to_string())?;
                bytes.push(n);
            }
            return Ok(base64_encode(&bytes));
        }
        Err("unsupported instruction data JSON representation".to_string())
    }

    let network = raw
        .get("network")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let genesis_hash = raw
        .get("genesisHash")
        .or_else(|| raw.get("genesis_hash"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let alts_val = raw
        .get("addressLookupTableAddresses")
        .or_else(|| raw.get("address_lookup_tables"));
    let mut address_lookup_table_addresses = Vec::new();
    if let Some(arr) = alts_val.and_then(|v| v.as_array()) {
        for item in arr {
            address_lookup_table_addresses.push(parse_pubkey_val(item)?);
        }
    }

    let mut instructions = Vec::new();
    if let Some(ix_arr) = raw.get("instructions").and_then(|v| v.as_array()) {
        for ix in ix_arr {
            let prog_val = ix
                .get("programId")
                .or_else(|| ix.get("program_id"))
                .ok_or_else(|| "instruction missing programId/program_id".to_string())?;
            let program_id = parse_pubkey_val(prog_val)?;
            let data_val = ix
                .get("data")
                .ok_or_else(|| "instruction missing data".to_string())?;
            let data = parse_data_b64(data_val)?;
            let mut accounts = Vec::new();
            if let Some(accts) = ix.get("accounts").and_then(|v| v.as_array()) {
                for a in accts {
                    let pk_val = a
                        .get("pubkey")
                        .ok_or_else(|| "account meta missing pubkey".to_string())?;
                    let pubkey = parse_pubkey_val(pk_val)?;
                    let is_signer = a
                        .get("isSigner")
                        .or_else(|| a.get("is_signer"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let is_writable = a
                        .get("isWritable")
                        .or_else(|| a.get("is_writable"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    accounts.push(Raw0xAccountMeta {
                        pubkey,
                        is_signer,
                        is_writable,
                    });
                }
            }
            instructions.push(Raw0xInstruction {
                program_id,
                accounts,
                data,
            });
        }
    }

    Ok(Raw0xSwapPayload {
        network,
        genesis_hash,
        address_lookup_table_addresses,
        instructions,
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationContext {
    pub policy: SolanaSwapPolicy,
    #[serde(default)]
    pub address_lookup_tables: Vec<AddressLookupTableSnapshot>,
    pub swap_instructions_payload: Raw0xSwapPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAccount {
    pub index: usize,
    pub pubkey: String,
    pub source: String,
    pub alt_address: Option<String>,
    pub alt_index: Option<u8>,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PolicyViolation {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instruction_index: Option<usize>,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IndeterminateFactor {
    pub code: String,
    pub instruction_index: Option<usize>,
    pub program_id: Option<String>,
    pub accounts: Vec<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramGuaranteeRecord {
    pub instruction_index: usize,
    pub program_id: String,
    pub program_name: String,
    pub guarantees: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompiledMessageReport {
    pub base64: String,
    pub sha256: String,
    pub blake3: String,
    pub byte_length: usize,
    pub required_signers: Vec<String>,
    pub resolved_accounts: Vec<ResolvedAccount>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SpendAccounting {
    pub input_is_native_sol: bool,
    pub input_asset_debit: String,
    pub max_input_asset_debit: String,
    pub base_fee_lamports: String,
    pub priority_fee_lamports: String,
    pub ata_creation_rent_lamports: String,
    pub sol_ancillary_debit: String,
    pub max_sol_ancillary_debit: String,
    pub total_sol_debit: String,
    pub max_total_sol_debit: Option<String>,
    pub enforced_min_output_net_credit: String,
    pub min_output_net_credit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResponseMatchReport {
    pub matches: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaSwapEvaluation {
    pub authority: String,
    pub verdict: String,
    pub reason_code: String,
    pub reason_detail: String,
    pub violations: Vec<PolicyViolation>,
    pub indeterminate_factors: Vec<IndeterminateFactor>,
    pub program_guarantees: Vec<ProgramGuaranteeRecord>,
    pub instruction_analysis: Vec<serde_json::Value>,
    pub response_match: ResponseMatchReport,
    pub verified_alt_snapshots: Vec<AltSnapshotVerificationReport>,
    pub compiled_message: CompiledMessageReport,
    pub accounting: SpendAccounting,
}

fn parse_u64_strict(value: &str, field: &str) -> Result<u64, String> {
    if value.is_empty()
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(format!("invalid u64 string for {field}: '{value}'"));
    }
    value
        .parse::<u64>()
        .map_err(|_| format!("u64 overflow for {field}: '{value}'"))
}

fn compare_compiled_against_0x(
    msg: &ParsedMessageV0,
    resolved: &[ResolvedAccount],
    payload: &Raw0xSwapPayload,
) -> ResponseMatchReport {
    if msg.instructions.len() != payload.instructions.len() {
        return ResponseMatchReport {
            matches: false,
            detail: format!(
                "Compiled message has {} instruction(s), while 0x response declared {}.",
                msg.instructions.len(),
                payload.instructions.len()
            ),
        };
    }
    for (i, (ci, raw)) in msg
        .instructions
        .iter()
        .zip(payload.instructions.iter())
        .enumerate()
    {
        let compiled_program = resolved
            .get(usize::from(ci.program_id_index))
            .map(|a| a.pubkey.as_str());
        let compiled_data_b64 = base64_encode(&ci.data);
        if compiled_program != Some(raw.program_id.as_str()) || compiled_data_b64 != raw.data {
            return ResponseMatchReport {
                matches: false,
                detail: format!(
                    "Compiled instruction #{i} program or data differs from authenticated 0x response."
                ),
            };
        }
        if ci.account_key_indexes.len() != raw.accounts.len() {
            return ResponseMatchReport {
                matches: false,
                detail: format!(
                    "Compiled instruction #{i} account count differs from authenticated 0x response."
                ),
            };
        }
        for (j, (&acc_idx, raw_acc)) in ci
            .account_key_indexes
            .iter()
            .zip(raw.accounts.iter())
            .enumerate()
        {
            let resolved_pubkey = resolved
                .get(usize::from(acc_idx))
                .map(|a| a.pubkey.as_str());
            if resolved_pubkey != Some(raw_acc.pubkey.as_str()) {
                return ResponseMatchReport {
                    matches: false,
                    detail: format!(
                        "Compiled instruction #{i} account #{j} differs from authenticated 0x response."
                    ),
                };
            }
        }
    }
    ResponseMatchReport {
        matches: true,
        detail: "Compiled instructions match authenticated 0x response instructions.".to_string(),
    }
}

/// Authoritative Rust evaluation of raw Solana `MessageV0` bytes against Arkhe swap policy.
pub fn evaluate_message_v0(
    compiled_message_bytes: &[u8],
    ctx: &EvaluationContext,
) -> Result<SolanaSwapEvaluation, String> {
    let policy = &ctx.policy;
    let payload = &ctx.swap_instructions_payload;

    // Validate policy pubkeys upfront
    base58_decode_32(&policy.taker)?;
    base58_decode_32(&policy.taker_input_token_account)?;
    base58_decode_32(&policy.authorized_recipient)?;
    base58_decode_32(&policy.authorized_destination_token_account)?;
    base58_decode_32(&policy.input_mint)?;
    base58_decode_32(&policy.output_mint)?;

    let max_input_asset_debit = parse_u64_strict(&policy.max_input_asset_debit, "maxInputAssetDebit")?;
    let max_sol_ancillary_debit =
        parse_u64_strict(&policy.max_sol_ancillary_debit, "maxSolAncillaryDebit")?;
    let min_output_net_credit = parse_u64_strict(&policy.min_output_net_credit, "minOutputNetCredit")?;
    let input_is_native_sol = policy.input_mint == NATIVE_MINT_ID;
    let max_total_sol_debit = match &policy.max_total_sol_debit {
        Some(v) => Some(parse_u64_strict(v, "maxTotalSolDebit")?),
        None if input_is_native_sol => {
            return Err("maxTotalSolDebit is required when inputMint is native SOL/wSOL".to_string())
        }
        None => None,
    };

    let sha256_hex = hex::encode(Sha256::digest(compiled_message_bytes));
    let blake3_hex = hex::encode(crate::hash::blake3_256(compiled_message_bytes));

    let msg = parse_solana_message_v0(compiled_message_bytes)?;

    let mut alt_map: BTreeMap<String, &AddressLookupTableSnapshot> = BTreeMap::new();
    for snap in &ctx.address_lookup_tables {
        base58_decode_32(&snap.key)?;
        for addr in &snap.addresses {
            base58_decode_32(addr)?;
        }
        alt_map.insert(snap.key.clone(), snap);
    }

    let mut violations: Vec<PolicyViolation> = Vec::new();
    let mut indeterminate_factors: Vec<IndeterminateFactor> = Vec::new();
    let mut instruction_analysis: Vec<serde_json::Value> = Vec::new();
    let mut program_guarantees: Vec<ProgramGuaranteeRecord> = Vec::new();
    let mut verified_alt_snapshots: Vec<AltSnapshotVerificationReport> = Vec::new();

    if let Some(net) = &payload.network {
        if net != &policy.network {
            violations.push(PolicyViolation {
                code: "NETWORK_MISMATCH".to_string(),
                instruction_index: None,
                detail: format!("Payload network '{net}' does not match policy network '{}'.", policy.network),
            });
        }
    }
    if let (Some(pg), Some(pol_g)) = (&payload.genesis_hash, &policy.genesis_hash) {
        if pg != pol_g {
            violations.push(PolicyViolation {
                code: "GENESIS_HASH_MISMATCH".to_string(),
                instruction_index: None,
                detail: "Payload genesisHash does not match policy genesisHash.".to_string(),
            });
        }
    }

    // Verify provenance, network/genesis context, and Ed25519 attestation of every ALT referenced by MessageV0 or payload
    let mut referenced_alts: Vec<String> = msg
        .address_table_lookups
        .iter()
        .map(|l| base58_encode(&l.account_key))
        .collect();
    for req_alt in &payload.address_lookup_table_addresses {
        if !referenced_alts.contains(req_alt) {
            referenced_alts.push(req_alt.clone());
        }
    }

    for alt_key in &referenced_alts {
        let Some(snap) = alt_map.get(alt_key).copied() else {
            indeterminate_factors.push(IndeterminateFactor {
                code: "MISSING_ADDRESS_LOOKUP_TABLE".to_string(),
                instruction_index: None,
                program_id: None,
                accounts: vec![alt_key.clone()],
                reason: format!("Address Lookup Table {alt_key} referenced by transaction is unavailable."),
            });
            continue;
        };

        let expected_genesis = policy.genesis_hash.as_deref().unwrap_or("");
        let snap_net = snap.network.as_deref();
        let snap_gen = snap.genesis_hash.as_deref();

        // Check declared context against policy
        let mut context_mismatch = false;
        if let Some(n) = snap_net {
            if n != policy.network {
                context_mismatch = true;
            }
        }
        if let (Some(g), Some(pg)) = (snap_gen, policy.genesis_hash.as_deref()) {
            if g != pg {
                context_mismatch = true;
            }
        }

        let deact_u64 = snap
            .deactivation_slot
            .as_deref()
            .and_then(|s| parse_u64_strict(s, "deactivationSlot").ok());

        let canonical_opt = match (snap_net, snap_gen, snap.slot, deact_u64) {
            (Some(n), Some(g), Some(slot), Some(deact)) => {
                canonical_alt_snapshot_bytes(n, g, &snap.key, slot, deact, &snap.addresses).ok()
            }
            _ => None,
        };
        let digest_hex = match &canonical_opt {
            Some(bytes) => hex::encode(crate::hash::blake3_256(bytes)),
            None => hex::encode(crate::hash::blake3_256(
                serde_json::to_vec(&snap.addresses).unwrap_or_default().as_slice(),
            )),
        };

        if context_mismatch {
            let detail = format!(
                "ALT snapshot {alt_key} declares network={:?}/genesis={:?}, diverging from policy ({}/{}).",
                snap_net, snap_gen, policy.network, expected_genesis
            );
            violations.push(PolicyViolation {
                code: "ALT_SNAPSHOT_CONTEXT_MISMATCH".to_string(),
                instruction_index: None,
                detail: detail.clone(),
            });
            verified_alt_snapshots.push(AltSnapshotVerificationReport {
                key: alt_key.clone(),
                network: snap.network.clone(),
                genesis_hash: snap.genesis_hash.clone(),
                slot: snap.slot,
                deactivation_slot: snap.deactivation_slot.clone(),
                snapshot_digest_blake3: digest_hex,
                attested_by_key_id: snap.attestation.as_ref().map(|a| a.key_id.clone()),
                status: VERDICT_BLOCKED.to_string(),
                detail,
            });
            continue;
        }

        let Some(canonical_bytes) = canonical_opt else {
            let detail = format!(
                "ALT snapshot {alt_key} lacks complete state context (network, genesisHash, slot, deactivationSlot); origin cannot be verified."
            );
            indeterminate_factors.push(IndeterminateFactor {
                code: "UNATTESTED_ALT_SNAPSHOT".to_string(),
                instruction_index: None,
                program_id: None,
                accounts: vec![alt_key.clone()],
                reason: detail.clone(),
            });
            verified_alt_snapshots.push(AltSnapshotVerificationReport {
                key: alt_key.clone(),
                network: snap.network.clone(),
                genesis_hash: snap.genesis_hash.clone(),
                slot: snap.slot,
                deactivation_slot: snap.deactivation_slot.clone(),
                snapshot_digest_blake3: digest_hex,
                attested_by_key_id: snap.attestation.as_ref().map(|a| a.key_id.clone()),
                status: VERDICT_INCONCLUSIVE.to_string(),
                detail,
            });
            continue;
        };

        let Some(att) = &snap.attestation else {
            let detail = format!(
                "ALT snapshot {alt_key} at slot {:?} has no cryptographic attestation; cannot prove table matches on-chain state.",
                snap.slot
            );
            indeterminate_factors.push(IndeterminateFactor {
                code: "UNATTESTED_ALT_SNAPSHOT".to_string(),
                instruction_index: None,
                program_id: None,
                accounts: vec![alt_key.clone()],
                reason: detail.clone(),
            });
            verified_alt_snapshots.push(AltSnapshotVerificationReport {
                key: alt_key.clone(),
                network: snap.network.clone(),
                genesis_hash: snap.genesis_hash.clone(),
                slot: snap.slot,
                deactivation_slot: snap.deactivation_slot.clone(),
                snapshot_digest_blake3: digest_hex,
                attested_by_key_id: None,
                status: VERDICT_INCONCLUSIVE.to_string(),
                detail,
            });
            continue;
        };

        let Some(pub_hex) = policy.trusted_alt_attester_keys.get(&att.key_id) else {
            let detail = format!(
                "ALT snapshot {alt_key} attester key '{}' is not pinned in policy.trustedAltAttesterKeys.",
                att.key_id
            );
            indeterminate_factors.push(IndeterminateFactor {
                code: "UNTRUSTED_ALT_ATTESTER_KEY".to_string(),
                instruction_index: None,
                program_id: None,
                accounts: vec![alt_key.clone()],
                reason: detail.clone(),
            });
            verified_alt_snapshots.push(AltSnapshotVerificationReport {
                key: alt_key.clone(),
                network: snap.network.clone(),
                genesis_hash: snap.genesis_hash.clone(),
                slot: snap.slot,
                deactivation_slot: snap.deactivation_slot.clone(),
                snapshot_digest_blake3: digest_hex,
                attested_by_key_id: Some(att.key_id.clone()),
                status: VERDICT_INCONCLUSIVE.to_string(),
                detail,
            });
            continue;
        };

        let sig_ok = (|| -> bool {
            let Ok(pub_raw) = hex::decode(pub_hex) else { return false };
            let Ok(pub_arr): Result<[u8; 32], _> = pub_raw.try_into() else { return false };
            let Ok(vk) = VerifyingKey::from_bytes(&pub_arr) else { return false };
            let Ok(sig_raw) = hex::decode(&att.signature_hex) else { return false };
            let Ok(sig_arr): Result<[u8; 64], _> = sig_raw.try_into() else { return false };
            let sig = Signature::from_bytes(&sig_arr);
            vk.verify_strict(&canonical_bytes, &sig).is_ok()
        })();

        if !sig_ok {
            let detail = format!(
                "ALT snapshot {alt_key} failed Ed25519 attestation under pinned key '{}'; table entries or state context were altered.",
                att.key_id
            );
            violations.push(PolicyViolation {
                code: "ALT_SNAPSHOT_ATTESTATION_INVALID".to_string(),
                instruction_index: None,
                detail: detail.clone(),
            });
            verified_alt_snapshots.push(AltSnapshotVerificationReport {
                key: alt_key.clone(),
                network: snap.network.clone(),
                genesis_hash: snap.genesis_hash.clone(),
                slot: snap.slot,
                deactivation_slot: snap.deactivation_slot.clone(),
                snapshot_digest_blake3: digest_hex,
                attested_by_key_id: Some(att.key_id.clone()),
                status: VERDICT_BLOCKED.to_string(),
                detail,
            });
        } else {
            verified_alt_snapshots.push(AltSnapshotVerificationReport {
                key: alt_key.clone(),
                network: snap.network.clone(),
                genesis_hash: snap.genesis_hash.clone(),
                slot: snap.slot,
                deactivation_slot: snap.deactivation_slot.clone(),
                snapshot_digest_blake3: digest_hex,
                attested_by_key_id: Some(att.key_id.clone()),
                status: "VERIFIED".to_string(),
                detail: format!(
                    "ALT snapshot {alt_key} verified via Ed25519 attestation ({}) for {} at slot {:?}.",
                    att.key_id, policy.network, snap.slot
                ),
            });
        }
    }

    // Resolve all static and ALT accounts directly from the compiled MessageV0 wire format
    let static_count = msg.static_account_keys.len();
    let num_req_sigs = usize::from(msg.header.num_required_signatures);
    let writable_signed_end = num_req_sigs - usize::from(msg.header.num_readonly_signed_accounts);
    let writable_unsigned_end = static_count - usize::from(msg.header.num_readonly_unsigned_accounts);

    let mut resolved_accounts: Vec<ResolvedAccount> = Vec::new();
    for (i, key_bytes) in msg.static_account_keys.iter().enumerate() {
        let is_signer = i < num_req_sigs;
        let is_writable = if is_signer {
            i < writable_signed_end
        } else {
            i < writable_unsigned_end
        };
        resolved_accounts.push(ResolvedAccount {
            index: i,
            pubkey: base58_encode(key_bytes),
            source: "static".to_string(),
            alt_address: None,
            alt_index: None,
            is_signer,
            is_writable,
        });
    }

    let mut alt_writable: Vec<ResolvedAccount> = Vec::new();
    let mut alt_readonly: Vec<ResolvedAccount> = Vec::new();
    for lookup in &msg.address_table_lookups {
        let alt_key = base58_encode(&lookup.account_key);
        let Some(snap) = alt_map.get(&alt_key) else {
            continue;
        };
        let addresses = &snap.addresses;
        for &idx in &lookup.writable_indexes {
            match addresses.get(usize::from(idx)) {
                Some(addr) => alt_writable.push(ResolvedAccount {
                    index: 0,
                    pubkey: addr.clone(),
                    source: "alt-writable".to_string(),
                    alt_address: Some(alt_key.clone()),
                    alt_index: Some(idx),
                    is_signer: false,
                    is_writable: true,
                }),
                None => indeterminate_factors.push(IndeterminateFactor {
                    code: "ALT_INDEX_OUT_OF_RANGE".to_string(),
                    instruction_index: None,
                    program_id: None,
                    accounts: vec![alt_key.clone()],
                    reason: format!("Writable ALT index {idx} out of bounds for table {alt_key}."),
                }),
            }
        }
        for &idx in &lookup.readonly_indexes {
            match addresses.get(usize::from(idx)) {
                Some(addr) => alt_readonly.push(ResolvedAccount {
                    index: 0,
                    pubkey: addr.clone(),
                    source: "alt-readonly".to_string(),
                    alt_address: Some(alt_key.clone()),
                    alt_index: Some(idx),
                    is_signer: false,
                    is_writable: false,
                }),
                None => indeterminate_factors.push(IndeterminateFactor {
                    code: "ALT_INDEX_OUT_OF_RANGE".to_string(),
                    instruction_index: None,
                    program_id: None,
                    accounts: vec![alt_key.clone()],
                    reason: format!("Readonly ALT index {idx} out of bounds for table {alt_key}."),
                }),
            }
        }
    }
    for mut entry in alt_writable.into_iter().chain(alt_readonly.into_iter()) {
        entry.index = resolved_accounts.len();
        resolved_accounts.push(entry);
    }

    // Fee payer & required signer checks directly on compiled MessageV0
    let fee_payer = resolved_accounts.first().map(|a| a.pubkey.as_str());
    if fee_payer != Some(policy.taker.as_str()) {
        violations.push(PolicyViolation {
            code: "UNAUTHORIZED_FEE_PAYER".to_string(),
            instruction_index: None,
            detail: format!(
                "Compiled fee payer ({}) differs from policy taker ({}).",
                fee_payer.unwrap_or("none"),
                policy.taker
            ),
        });
    }
    let required_signers: Vec<String> = resolved_accounts
        .iter()
        .filter(|a| a.is_signer)
        .map(|a| a.pubkey.clone())
        .collect();
    for signer in &required_signers {
        if signer != &policy.taker {
            violations.push(PolicyViolation {
                code: "UNEXPECTED_REQUIRED_SIGNER".to_string(),
                instruction_index: None,
                detail: format!("Compiled message requires unexpected signer {signer}."),
            });
        }
    }

    let response_match = compare_compiled_against_0x(&msg, &resolved_accounts, payload);
    if !response_match.matches {
        violations.push(PolicyViolation {
            code: "LOCAL_ASSEMBLY_DIVERGENCE_FROM_0X_RESPONSE".to_string(),
            instruction_index: None,
            detail: response_match.detail.clone(),
        });
    }

    // Interpret every instruction directly from compiled MessageV0 wire bytes
    let mut compute_unit_limit: Option<u64> = None;
    let mut compute_unit_price_micro_lamports: u64 = 0;
    let mut non_compute_budget_count: u64 = 0;
    let mut ata_creation_rent_lamports: u128 = 0;
    let mut wsol_funded_lamports: u128 = 0;
    let mut swap_input_debit: u128 = 0;
    let mut enforced_min_output_net_credit: u128 = 0;
    let mut covered_swap_count: u64 = 0;

    for (ix_index, ci) in msg.instructions.iter().enumerate() {
        let Some(prog_acc) = resolved_accounts.get(usize::from(ci.program_id_index)) else {
            indeterminate_factors.push(IndeterminateFactor {
                code: "UNRESOLVED_PROGRAM_INDEX".to_string(),
                instruction_index: Some(ix_index),
                program_id: None,
                accounts: Vec::new(),
                reason: format!("Program index {} could not be resolved.", ci.program_id_index),
            });
            continue;
        };
        let program_id = prog_acc.pubkey.as_str();

        let mut ix_accounts: Vec<&ResolvedAccount> = Vec::with_capacity(ci.account_key_indexes.len());
        let mut unresolved = false;
        for &acc_idx in &ci.account_key_indexes {
            match resolved_accounts.get(usize::from(acc_idx)) {
                Some(a) => ix_accounts.push(a),
                None => {
                    unresolved = true;
                    indeterminate_factors.push(IndeterminateFactor {
                        code: "UNRESOLVED_ACCOUNT_INDEX".to_string(),
                        instruction_index: Some(ix_index),
                        program_id: Some(program_id.to_string()),
                        accounts: vec![format!("index:{acc_idx}")],
                        reason: format!(
                            "Account index {acc_idx} in instruction #{ix_index} could not be resolved."
                        ),
                    });
                }
            }
        }
        if unresolved {
            continue;
        }

        let data = ci.data.as_slice();

        if program_id == COMPUTE_BUDGET_PROGRAM_ID {
            if data.len() == 5 && data[0] == 2 {
                let units = u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
                compute_unit_limit = Some(u64::from(units));
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "ComputeBudget.SetComputeUnitLimit",
                    "status": "INTERPRETED",
                    "computeUnits": units.to_string(),
                }));
            } else if data.len() == 9 && data[0] == 3 {
                let price = u64::from_le_bytes(data[1..9].try_into().unwrap());
                compute_unit_price_micro_lamports = price;
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "ComputeBudget.SetComputeUnitPrice",
                    "status": "INTERPRETED",
                    "microLamportsPerCu": price.to_string(),
                }));
            } else {
                indeterminate_factors.push(IndeterminateFactor {
                    code: "UNSUPPORTED_COMPUTE_BUDGET_INSTRUCTION".to_string(),
                    instruction_index: Some(ix_index),
                    program_id: Some(program_id.to_string()),
                    accounts: ix_accounts.iter().map(|a| a.pubkey.clone()).collect(),
                    reason: format!("Unrecognized ComputeBudget opcode at instruction #{ix_index}."),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "ComputeBudget.Unknown",
                    "status": VERDICT_INCONCLUSIVE,
                }));
            }
            continue;
        }

        non_compute_budget_count += 1;

        if program_id == ASSOCIATED_TOKEN_PROGRAM_ID {
            let valid_op = data.is_empty() || (data.len() == 1 && (data[0] == 0 || data[0] == 1));
            if !valid_op || ix_accounts.len() < 6 {
                indeterminate_factors.push(IndeterminateFactor {
                    code: "UNINTERPRETED_ATA_INSTRUCTION".to_string(),
                    instruction_index: Some(ix_index),
                    program_id: Some(program_id.to_string()),
                    accounts: ix_accounts.iter().map(|a| a.pubkey.clone()).collect(),
                    reason: format!("Malformed or unsupported ATA instruction at index {ix_index}."),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "ATA.Unknown",
                    "status": VERDICT_INCONCLUSIVE,
                }));
                continue;
            }
            let payer = ix_accounts[0].pubkey.as_str();
            let ata = ix_accounts[1].pubkey.as_str();
            let wallet = ix_accounts[2].pubkey.as_str();
            let mint = ix_accounts[3].pubkey.as_str();
            let sys_prog = ix_accounts[4].pubkey.as_str();
            let tok_prog = ix_accounts[5].pubkey.as_str();

            let allowed_target = (wallet == policy.authorized_recipient
                && mint == policy.output_mint
                && ata == policy.authorized_destination_token_account)
                || (wallet == policy.taker
                    && mint == policy.input_mint
                    && ata == policy.taker_input_token_account);

            if payer != policy.taker
                || !allowed_target
                || sys_prog != SYSTEM_PROGRAM_ID
                || tok_prog != TOKEN_PROGRAM_ID
            {
                violations.push(PolicyViolation {
                    code: "UNAUTHORIZED_ATA_CREATION".to_string(),
                    instruction_index: Some(ix_index),
                    detail: format!(
                        "ATA creation at index {ix_index} targets unauthorized wallet/mint/account ({wallet} / {mint} / {ata})."
                    ),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "ATA.Create",
                    "status": VERDICT_BLOCKED,
                    "wallet": wallet,
                    "mint": mint,
                    "ata": ata,
                }));
            } else {
                ata_creation_rent_lamports += u128::from(ATA_RENT_EXEMPT_LAMPORTS);
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": if data.first() == Some(&1) { "ATA.CreateIdempotent" } else { "ATA.Create" },
                    "status": "INTERPRETED",
                    "wallet": wallet,
                    "mint": mint,
                    "ata": ata,
                    "maxRentLamports": ATA_RENT_EXEMPT_LAMPORTS.to_string(),
                }));
            }
            continue;
        }

        if program_id == SYSTEM_PROGRAM_ID {
            if data.len() == 12
                && u32::from_le_bytes(data[0..4].try_into().unwrap()) == 2
                && ix_accounts.len() >= 2
            {
                let lamports = u64::from_le_bytes(data[4..12].try_into().unwrap());
                let from = ix_accounts[0].pubkey.as_str();
                let to = ix_accounts[1].pubkey.as_str();
                if input_is_native_sol
                    && from == policy.taker
                    && to == policy.taker_input_token_account
                {
                    wsol_funded_lamports += u128::from(lamports);
                    instruction_analysis.push(serde_json::json!({
                        "instructionIndex": ix_index,
                        "programId": program_id,
                        "kind": "System.TransferToTakerWsolAta",
                        "status": "INTERPRETED",
                        "from": from,
                        "to": to,
                        "lamports": lamports.to_string(),
                    }));
                } else {
                    violations.push(PolicyViolation {
                        code: "UNAUTHORIZED_SYSTEM_TRANSFER".to_string(),
                        instruction_index: Some(ix_index),
                        detail: format!(
                            "Unauthorized SystemProgram.transfer at index {ix_index}: {lamports} lamports from {from} to {to}."
                        ),
                    });
                    instruction_analysis.push(serde_json::json!({
                        "instructionIndex": ix_index,
                        "programId": program_id,
                        "kind": "System.Transfer",
                        "status": VERDICT_BLOCKED,
                        "from": from,
                        "to": to,
                        "lamports": lamports.to_string(),
                    }));
                }
            } else {
                indeterminate_factors.push(IndeterminateFactor {
                    code: "UNINTERPRETED_SYSTEM_INSTRUCTION".to_string(),
                    instruction_index: Some(ix_index),
                    program_id: Some(program_id.to_string()),
                    accounts: ix_accounts.iter().map(|a| a.pubkey.clone()).collect(),
                    reason: format!("SystemProgram instruction at index {ix_index} is not a supported transfer layout."),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "System.Unknown",
                    "status": VERDICT_INCONCLUSIVE,
                }));
            }
            continue;
        }

        if program_id == TOKEN_PROGRAM_ID {
            let opcode = data.first().copied();
            if opcode == Some(17) && data.len() == 1 && !ix_accounts.is_empty() {
                let account = ix_accounts[0].pubkey.as_str();
                if input_is_native_sol && account == policy.taker_input_token_account {
                    instruction_analysis.push(serde_json::json!({
                        "instructionIndex": ix_index,
                        "programId": program_id,
                        "kind": "SplToken.SyncNative",
                        "status": "INTERPRETED",
                        "account": account,
                    }));
                } else {
                    violations.push(PolicyViolation {
                        code: "UNAUTHORIZED_SYNC_NATIVE".to_string(),
                        instruction_index: Some(ix_index),
                        detail: format!("SyncNative at index {ix_index} targets unexpected account {account}."),
                    });
                    instruction_analysis.push(serde_json::json!({
                        "instructionIndex": ix_index,
                        "programId": program_id,
                        "kind": "SplToken.SyncNative",
                        "status": VERDICT_BLOCKED,
                        "account": account,
                    }));
                }
            } else if opcode == Some(9) && data.len() == 1 && ix_accounts.len() >= 3 {
                let account = ix_accounts[0].pubkey.as_str();
                let dest = ix_accounts[1].pubkey.as_str();
                let authority = ix_accounts[2].pubkey.as_str();
                if input_is_native_sol
                    && account == policy.taker_input_token_account
                    && dest == policy.taker
                    && authority == policy.taker
                {
                    instruction_analysis.push(serde_json::json!({
                        "instructionIndex": ix_index,
                        "programId": program_id,
                        "kind": "SplToken.CloseAccount",
                        "status": "INTERPRETED",
                        "account": account,
                        "destination": dest,
                    }));
                } else {
                    violations.push(PolicyViolation {
                        code: "UNAUTHORIZED_CLOSE_ACCOUNT".to_string(),
                        instruction_index: Some(ix_index),
                        detail: format!(
                            "CloseAccount at index {ix_index} targets unauthorized account/destination ({account} -> {dest})."
                        ),
                    });
                    instruction_analysis.push(serde_json::json!({
                        "instructionIndex": ix_index,
                        "programId": program_id,
                        "kind": "SplToken.CloseAccount",
                        "status": VERDICT_BLOCKED,
                        "account": account,
                        "destination": dest,
                    }));
                }
            } else if (opcode == Some(3) && data.len() == 9 && ix_accounts.len() >= 3)
                || (opcode == Some(12) && data.len() == 10 && ix_accounts.len() >= 4)
            {
                let amount = u64::from_le_bytes(data[1..9].try_into().unwrap());
                let source = ix_accounts[0].pubkey.as_str();
                let destination = if opcode == Some(3) {
                    ix_accounts[1].pubkey.as_str()
                } else {
                    ix_accounts[2].pubkey.as_str()
                };
                violations.push(PolicyViolation {
                    code: "UNAUTHORIZED_TOKEN_TRANSFER".to_string(),
                    instruction_index: Some(ix_index),
                    detail: format!(
                        "Unauthorized SPL Token transfer at index {ix_index}: {amount} units from {source} to {destination}."
                    ),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": if opcode == Some(3) { "SplToken.Transfer" } else { "SplToken.TransferChecked" },
                    "status": VERDICT_BLOCKED,
                    "source": source,
                    "destination": destination,
                    "amount": amount.to_string(),
                }));
            } else if matches!(opcode, Some(4) | Some(6) | Some(13)) {
                violations.push(PolicyViolation {
                    code: "DISALLOWED_TOKEN_AUTHORITY_MUTATION".to_string(),
                    instruction_index: Some(ix_index),
                    detail: format!(
                        "Disallowed SPL Token approve/setAuthority opcode {:?} at index {ix_index}.",
                        opcode
                    ),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "SplToken.AuthorityMutation",
                    "status": VERDICT_BLOCKED,
                }));
            } else {
                indeterminate_factors.push(IndeterminateFactor {
                    code: "UNINTERPRETED_TOKEN_INSTRUCTION".to_string(),
                    instruction_index: Some(ix_index),
                    program_id: Some(program_id.to_string()),
                    accounts: ix_accounts.iter().map(|a| a.pubkey.clone()).collect(),
                    reason: format!("SPL Token opcode {:?} at index {ix_index} is not covered.", opcode),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "SplToken.Unknown",
                    "status": VERDICT_INCONCLUSIVE,
                }));
            }
            continue;
        }

        if let Some(profile) = policy.covered_swap_programs.get(program_id) {
            let disc_ok = data.len() == 24
                && hex::encode(&data[0..8]).eq_ignore_ascii_case(&profile.discriminator_hex);
            if !disc_ok || ix_accounts.len() < 8 {
                indeterminate_factors.push(IndeterminateFactor {
                    code: "UNRECOGNIZED_COVERED_SWAP_LAYOUT".to_string(),
                    instruction_index: Some(ix_index),
                    program_id: Some(program_id.to_string()),
                    accounts: ix_accounts.iter().map(|a| a.pubkey.clone()).collect(),
                    reason: format!(
                        "Instruction #{ix_index} on {} ({program_id}) does not match expected 24-byte swap layout/discriminator.",
                        profile.name
                    ),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": format!("{}.UnknownLayout", profile.name),
                    "status": VERDICT_INCONCLUSIVE,
                }));
                continue;
            }

            let amount_in = u64::from_le_bytes(data[8..16].try_into().unwrap());
            let min_amount_out = u64::from_le_bytes(data[16..24].try_into().unwrap());
            let taker_acc = ix_accounts[0];
            let source_ata = ix_accounts[1];
            let dest_ata = ix_accounts[2];
            let in_mint = ix_accounts[3];
            let out_mint = ix_accounts[4];
            let pool_vault_in = ix_accounts[5];
            let pool_vault_out = ix_accounts[6];
            let tok_prog = ix_accounts[7];

            let mut swap_errors = Vec::new();
            if taker_acc.pubkey != policy.taker || !taker_acc.is_signer {
                swap_errors.push(format!("taker mismatch or unsigned ({})", taker_acc.pubkey));
            }
            if source_ata.pubkey != policy.taker_input_token_account {
                swap_errors.push(format!(
                    "source token account {} !== {}",
                    source_ata.pubkey, policy.taker_input_token_account
                ));
            }
            if dest_ata.pubkey != policy.authorized_destination_token_account {
                swap_errors.push(format!(
                    "destination token account {} !== {}",
                    dest_ata.pubkey, policy.authorized_destination_token_account
                ));
            }
            if in_mint.pubkey != policy.input_mint {
                swap_errors.push(format!("input mint {} !== {}", in_mint.pubkey, policy.input_mint));
            }
            if out_mint.pubkey != policy.output_mint {
                swap_errors.push(format!("output mint {} !== {}", out_mint.pubkey, policy.output_mint));
            }
            if tok_prog.pubkey != TOKEN_PROGRAM_ID {
                swap_errors.push(format!("token program {} !== {TOKEN_PROGRAM_ID}", tok_prog.pubkey));
            }

            if !swap_errors.is_empty() {
                violations.push(PolicyViolation {
                    code: "SWAP_PARAMETERS_OUT_OF_POLICY".to_string(),
                    instruction_index: Some(ix_index),
                    detail: format!(
                        "Covered swap instruction #{ix_index} violates scope: {}.",
                        swap_errors.join("; ")
                    ),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": format!("{}.Swap", profile.name),
                    "status": VERDICT_BLOCKED,
                    "amountIn": amount_in.to_string(),
                    "minAmountOut": min_amount_out.to_string(),
                    "sourceTokenAccount": source_ata.pubkey,
                    "destinationTokenAccount": dest_ata.pubkey,
                }));
            } else {
                covered_swap_count += 1;
                swap_input_debit += u128::from(amount_in);
                enforced_min_output_net_credit += u128::from(min_amount_out);
                program_guarantees.push(ProgramGuaranteeRecord {
                    instruction_index: ix_index,
                    program_id: program_id.to_string(),
                    program_name: profile.name.clone(),
                    guarantees: profile.guarantees.clone(),
                });
                let via_alt: Vec<&str> = ix_accounts
                    .iter()
                    .filter(|a| a.source != "static")
                    .map(|a| a.pubkey.as_str())
                    .collect();
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": format!("{}.Swap", profile.name),
                    "status": "INTERPRETED",
                    "amountIn": amount_in.to_string(),
                    "minAmountOut": min_amount_out.to_string(),
                    "sourceTokenAccount": source_ata.pubkey,
                    "destinationTokenAccount": dest_ata.pubkey,
                    "poolVaultIn": pool_vault_in.pubkey,
                    "poolVaultOut": pool_vault_out.pubkey,
                    "resolvedViaAlt": via_alt,
                }));
            }
            continue;
        }

        if program_id == ZEROX_SETTLER_PROGRAM_ID {
            let mut signer_accounts: Vec<String> = Vec::new();
            for a in &ix_accounts {
                if a.is_signer && !signer_accounts.contains(&a.pubkey) {
                    signer_accounts.push(a.pubkey.clone());
                }
            }
            let writable_account_count = ix_accounts.iter().filter(|a| a.is_writable).count();
            let taker_is_signer = ix_accounts
                .iter()
                .any(|a| a.pubkey == policy.taker && a.is_signer);
            let source_ata = ix_accounts.first().map(|a| a.pubkey.as_str());
            let dest_ata = ix_accounts.get(1).map(|a| a.pubkey.as_str());

            let mut referenced_known_programs: Vec<serde_json::Value> = Vec::new();
            let mut seen_known: Vec<&str> = Vec::new();
            for a in &ix_accounts {
                for &(known_id, label) in KNOWN_SOLANA_DEX_OR_SYS_PROGRAMS {
                    if a.pubkey == known_id && !seen_known.contains(&known_id) {
                        seen_known.push(known_id);
                        referenced_known_programs.push(serde_json::json!({
                            "programId": known_id,
                            "label": label,
                        }));
                    }
                }
            }

            let header_parsed = if data.len() >= 29 && data[0] == 0x00 {
                let zid_hex = format!("0x{}", hex::encode(&data[1..13]));
                let declared_amount_in = u64::from_le_bytes(data[13..21].try_into().unwrap());
                let declared_min_amount_out = u64::from_le_bytes(data[21..29].try_into().unwrap());
                let action_payload_len = data.len() - 29;
                Some((
                    zid_hex,
                    declared_amount_in,
                    declared_min_amount_out,
                    action_payload_len,
                ))
            } else {
                None
            };

            let mut settler_scope_errors = Vec::new();
            if !taker_is_signer {
                settler_scope_errors.push(format!("policy taker {} is not a signer", policy.taker));
            }
            if source_ata != Some(policy.taker_input_token_account.as_str()) {
                settler_scope_errors.push(format!(
                    "accounts[0] ({:?}) !== takerInputTokenAccount ({})",
                    source_ata, policy.taker_input_token_account
                ));
            }
            if dest_ata != Some(policy.authorized_destination_token_account.as_str()) {
                settler_scope_errors.push(format!(
                    "accounts[1] ({:?}) !== authorizedDestinationTokenAccount ({})",
                    dest_ata, policy.authorized_destination_token_account
                ));
            }
            if !settler_scope_errors.is_empty() {
                violations.push(PolicyViolation {
                    code: "SETTLER_ACCOUNT_SCOPE_MISMATCH".to_string(),
                    instruction_index: Some(ix_index),
                    detail: format!(
                        "0x Settler instruction #{ix_index} violates account scope: {}.",
                        settler_scope_errors.join("; ")
                    ),
                });
            }

            if let Some((ref zid_hex, declared_in, declared_min_out, action_len)) = header_parsed {
                swap_input_debit += u128::from(declared_in);
                if u128::from(declared_min_out) < u128::from(min_output_net_credit) {
                    violations.push(PolicyViolation {
                        code: "SETTLER_MIN_OUTPUT_BELOW_POLICY".to_string(),
                        instruction_index: Some(ix_index),
                        detail: format!(
                            "0x Settler header declaredMinAmountOut ({declared_min_out}) is below policy minOutputNetCredit ({min_output_net_credit})."
                        ),
                    });
                }
                indeterminate_factors.push(IndeterminateFactor {
                    code: "UNINTERPRETED_PROGRAM".to_string(),
                    instruction_index: Some(ix_index),
                    program_id: Some(program_id.to_string()),
                    accounts: ix_accounts.iter().map(|a| a.pubkey.clone()).collect(),
                    reason: format!(
                        "0x Settler ({program_id}) header structurally inspected at instruction #{ix_index} (zid={zid_hex}, declaredAmountIn={declared_in}, declaredMinAmountOut={declared_min_out}), but downstream CPI action bytecode ({action_len} bytes across {} accounts) is unverified; fail-closed.",
                        ix_accounts.len()
                    ),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "ZeroXSettler.UnverifiedCpiRoute",
                    "status": VERDICT_INCONCLUSIVE,
                    "cpiAuditStatus": "UNVERIFIED_EXTERNAL_CPI",
                    "accountCount": ix_accounts.len(),
                    "dataByteLength": data.len(),
                    "headerVersion": 0,
                    "zidHex": zid_hex,
                    "declaredAmountIn": declared_in.to_string(),
                    "declaredMinAmountOut": declared_min_out.to_string(),
                    "actionPayloadByteLength": action_len,
                    "sourceTokenAccount": source_ata,
                    "destinationTokenAccount": dest_ata,
                    "takerIsSigner": taker_is_signer,
                    "writableAccountCount": writable_account_count,
                    "signerAccounts": signer_accounts,
                    "referencedKnownPrograms": referenced_known_programs,
                }));
            } else {
                indeterminate_factors.push(IndeterminateFactor {
                    code: "UNINTERPRETED_PROGRAM".to_string(),
                    instruction_index: Some(ix_index),
                    program_id: Some(program_id.to_string()),
                    accounts: ix_accounts.iter().map(|a| a.pubkey.clone()).collect(),
                    reason: format!(
                        "0x Settler ({program_id}) at instruction #{ix_index} has unrecognized header layout (len={}); fail-closed.",
                        data.len()
                    ),
                });
                instruction_analysis.push(serde_json::json!({
                    "instructionIndex": ix_index,
                    "programId": program_id,
                    "kind": "ZeroXSettler.UnknownHeader",
                    "status": VERDICT_INCONCLUSIVE,
                    "cpiAuditStatus": "UNVERIFIED_EXTERNAL_CPI",
                    "accountCount": ix_accounts.len(),
                    "dataByteLength": data.len(),
                    "takerIsSigner": taker_is_signer,
                    "writableAccountCount": writable_account_count,
                    "signerAccounts": signer_accounts,
                    "referencedKnownPrograms": referenced_known_programs,
                }));
            }
            continue;
        }

        // Uninterpreted program -> INCONCLUSIVO (never authorize)
        indeterminate_factors.push(IndeterminateFactor {
            code: "UNINTERPRETED_PROGRAM".to_string(),
            instruction_index: Some(ix_index),
            program_id: Some(program_id.to_string()),
            accounts: ix_accounts.iter().map(|a| a.pubkey.clone()).collect(),
            reason: format!(
                "Program {program_id} at instruction #{ix_index} is outside Arkhe's interpreted program set; its CPI and balance effects cannot be proven."
            ),
        });
        instruction_analysis.push(serde_json::json!({
            "instructionIndex": ix_index,
            "programId": program_id,
            "kind": "OpaqueExternalProgram",
            "status": VERDICT_INCONCLUSIVE,
            "accountCount": ix_accounts.len(),
        }));
    }

    // Spend-cap accounting
    let base_fee_lamports =
        u128::from(msg.header.num_required_signatures) * u128::from(BASE_FEE_PER_SIGNATURE_LAMPORTS);
    let effective_cu_limit: u128 = match compute_unit_limit {
        Some(limit) => u128::from(limit),
        None => {
            let default_cu = u128::from(DEFAULT_CU_PER_INSTRUCTION)
                * u128::from(non_compute_budget_count.max(1));
            default_cu.min(u128::from(MAX_CU_LIMIT))
        }
    };
    let priority_fee_lamports = if compute_unit_price_micro_lamports > 0 {
        (effective_cu_limit * u128::from(compute_unit_price_micro_lamports) + 999_999) / 1_000_000
    } else {
        0
    };

    let sol_ancillary_debit = base_fee_lamports + priority_fee_lamports + ata_creation_rent_lamports;
    let input_asset_debit = if input_is_native_sol {
        wsol_funded_lamports.max(swap_input_debit)
    } else {
        swap_input_debit
    };
    let total_sol_debit = if input_is_native_sol {
        input_asset_debit + sol_ancillary_debit
    } else {
        sol_ancillary_debit
    };

    if input_asset_debit > u128::from(max_input_asset_debit) {
        violations.push(PolicyViolation {
            code: "INPUT_ASSET_CAP_EXCEEDED".to_string(),
            instruction_index: None,
            detail: format!(
                "Input asset debit {input_asset_debit} exceeds policy maxInputAssetDebit {max_input_asset_debit}."
            ),
        });
    }
    if sol_ancillary_debit > u128::from(max_sol_ancillary_debit) {
        violations.push(PolicyViolation {
            code: "SOL_ANCILLARY_CAP_EXCEEDED".to_string(),
            instruction_index: None,
            detail: format!(
                "SOL ancillary debit {sol_ancillary_debit} lamports exceeds policy maxSolAncillaryDebit {max_sol_ancillary_debit}."
            ),
        });
    }
    if input_is_native_sol {
        if let Some(max_total) = max_total_sol_debit {
            if total_sol_debit > u128::from(max_total) {
                violations.push(PolicyViolation {
                    code: "TOTAL_SOL_CAP_EXCEEDED".to_string(),
                    instruction_index: None,
                    detail: format!(
                        "Total SOL debit (principal + fees/rent) {total_sol_debit} lamports exceeds policy maxTotalSolDebit {max_total}."
                    ),
                });
            }
        }
    }

    if indeterminate_factors.is_empty() {
        if covered_swap_count == 0 {
            violations.push(PolicyViolation {
                code: "NO_COVERED_SWAP_INSTRUCTION".to_string(),
                instruction_index: None,
                detail: "Compiled message contains no covered swap instruction enforcing minOutputNetCredit.".to_string(),
            });
        } else if enforced_min_output_net_credit < u128::from(min_output_net_credit) {
            violations.push(PolicyViolation {
                code: "MIN_OUTPUT_NET_CREDIT_NOT_MET".to_string(),
                instruction_index: None,
                detail: format!(
                    "Enforced min output {enforced_min_output_net_credit} is below policy minOutputNetCredit {min_output_net_credit}."
                ),
            });
        }
    }

    let (verdict, reason_code, reason_detail) = if !violations.is_empty() {
        let code = violations[0].code.clone();
        let detail = violations
            .iter()
            .map(|v| format!("{}: {}", v.code, v.detail))
            .collect::<Vec<_>>()
            .join(" | ");
        (VERDICT_BLOCKED.to_string(), code, detail)
    } else if !indeterminate_factors.is_empty() {
        let code = indeterminate_factors[0].code.clone();
        let detail = indeterminate_factors
            .iter()
            .map(|f| {
                format!(
                    "{} (ix={:?}, program={:?}): {}",
                    f.code, f.instruction_index, f.program_id, f.reason
                )
            })
            .collect::<Vec<_>>()
            .join(" | ");
        (VERDICT_INCONCLUSIVE.to_string(), code, detail)
    } else {
        (
            VERDICT_ELIGIBLE.to_string(),
            "ROUTE_FULLY_INTERPRETED_AND_WITHIN_POLICY".to_string(),
            "Rust authority parsed raw Solana MessageV0 wire bytes, resolved all static/ALT accounts, and verified every spend cap and destination bound.".to_string(),
        )
    };

    Ok(SolanaSwapEvaluation {
        authority: "arkhe-verify-core/solana_swap/v1".to_string(),
        verdict,
        reason_code,
        reason_detail,
        violations,
        indeterminate_factors,
        program_guarantees,
        instruction_analysis,
        response_match,
        verified_alt_snapshots,
        compiled_message: CompiledMessageReport {
            base64: base64_encode(compiled_message_bytes),
            sha256: sha256_hex,
            blake3: blake3_hex,
            byte_length: compiled_message_bytes.len(),
            required_signers,
            resolved_accounts,
        },
        accounting: SpendAccounting {
            input_is_native_sol,
            input_asset_debit: input_asset_debit.to_string(),
            max_input_asset_debit: max_input_asset_debit.to_string(),
            base_fee_lamports: base_fee_lamports.to_string(),
            priority_fee_lamports: priority_fee_lamports.to_string(),
            ata_creation_rent_lamports: ata_creation_rent_lamports.to_string(),
            sol_ancillary_debit: sol_ancillary_debit.to_string(),
            max_sol_ancillary_debit: max_sol_ancillary_debit.to_string(),
            total_sol_debit: total_sol_debit.to_string(),
            max_total_sol_debit: max_total_sol_debit.map(|v| v.to_string()),
            enforced_min_output_net_credit: enforced_min_output_net_credit.to_string(),
            min_output_net_credit: min_output_net_credit.to_string(),
        },
    })
}

fn encode_compact_u16_wire(mut v: u16, out: &mut Vec<u8>) {
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompiledMessageV0Artifact {
    #[serde(skip)]
    pub compiled_message_bytes: Vec<u8>,
    pub compiled_message_base64: String,
    pub sha256: String,
    pub blake3: String,
    pub byte_length: usize,
    pub static_account_count: usize,
    pub alt_lookup_count: usize,
}

/// Pure-Rust Solana v0 message compiler (`VersionedMessage::V0`).
///
/// Compiles a normalized 0x instruction list + optional Address Lookup Table snapshots
/// deterministically into wire-format `MessageV0` bytes without requiring `@solana/web3.js`.
/// Preserves the Solana protocol rule that the payer, all signers, and all invoked program IDs
/// stay in static account keys while eligible non-signer accounts are compressed into ALTs.
pub fn compile_solana_message_v0(
    payer: &str,
    recent_blockhash: &str,
    payload: &Raw0xSwapPayload,
    lookup_tables: &[AddressLookupTableSnapshot],
) -> Result<CompiledMessageV0Artifact, String> {
    let _ = base58_decode_32(payer).map_err(|e| format!("invalid payer pubkey: {e}"))?;
    let blockhash_bytes =
        base58_decode_32(recent_blockhash).map_err(|e| format!("invalid recentBlockhash: {e}"))?;

    // Collect merged permissions and preserve first-seen deterministic ordering
    let mut order: Vec<String> = Vec::new();
    let mut roles: BTreeMap<String, (bool, bool, bool)> = BTreeMap::new(); // (is_signer, is_writable, is_invoked)

    let mut register = |pk: &str, is_signer: bool, is_writable: bool, is_invoked: bool| {
        if !roles.contains_key(pk) {
            order.push(pk.to_string());
        }
        let entry = roles.entry(pk.to_string()).or_insert((false, false, false));
        entry.0 |= is_signer;
        entry.1 |= is_writable;
        entry.2 |= is_invoked;
    };

    register(payer, true, true, false);
    for ix in &payload.instructions {
        base58_decode_32(&ix.program_id)
            .map_err(|e| format!("invalid instruction program_id '{}': {e}", ix.program_id))?;
        register(&ix.program_id, false, false, true);
        for a in &ix.accounts {
            base58_decode_32(&a.pubkey)
                .map_err(|e| format!("invalid account pubkey '{}': {e}", a.pubkey))?;
            register(&a.pubkey, a.is_signer, a.is_writable, false);
        }
    }

    // Build ALT lookup index map (pubkey -> (alt_idx, address_idx_in_alt))
    let mut alt_lookup_map: BTreeMap<String, (usize, u8)> = BTreeMap::new();
    for (alt_idx, alt) in lookup_tables.iter().enumerate() {
        base58_decode_32(&alt.key)
            .map_err(|e| format!("invalid ALT key '{}': {e}", alt.key))?;
        for (addr_idx, addr) in alt.addresses.iter().enumerate() {
            if addr_idx > 255 {
                return Err(format!("ALT '{}' exceeds 256 addresses", alt.key));
            }
            alt_lookup_map
                .entry(addr.clone())
                .or_insert((alt_idx, addr_idx as u8));
        }
    }

    let mut signers_w: Vec<String> = vec![payer.to_string()];
    let mut signers_r: Vec<String> = Vec::new();
    let mut static_unsign_w: Vec<String> = Vec::new();
    let mut static_unsign_r: Vec<String> = Vec::new();

    // Per-ALT (writable_indexes, readonly_indexes, writable_pubkeys, readonly_pubkeys)
    let mut per_alt_w: Vec<Vec<(u8, String)>> = vec![Vec::new(); lookup_tables.len()];
    let mut per_alt_r: Vec<Vec<(u8, String)>> = vec![Vec::new(); lookup_tables.len()];

    for pk in &order {
        if pk == payer {
            continue;
        }
        let (is_signer, is_writable, is_invoked) = roles[pk];
        if is_signer {
            if is_writable {
                signers_w.push(pk.clone());
            } else {
                signers_r.push(pk.clone());
            }
            continue;
        }
        if !is_invoked {
            if let Some(&(alt_idx, addr_idx)) = alt_lookup_map.get(pk) {
                if is_writable {
                    per_alt_w[alt_idx].push((addr_idx, pk.clone()));
                } else {
                    per_alt_r[alt_idx].push((addr_idx, pk.clone()));
                }
                continue;
            }
        }
        if is_writable {
            static_unsign_w.push(pk.clone());
        } else {
            static_unsign_r.push(pk.clone());
        }
    }

    let mut static_strs: Vec<String> = Vec::new();
    static_strs.extend(signers_w.iter().cloned());
    static_strs.extend(signers_r.iter().cloned());
    static_strs.extend(static_unsign_w.iter().cloned());
    static_strs.extend(static_unsign_r.iter().cloned());

    let mut alt_w_strs: Vec<String> = Vec::new();
    let mut alt_r_strs: Vec<String> = Vec::new();
    let mut wire_lookups: Vec<([u8; 32], Vec<u8>, Vec<u8>)> = Vec::new();

    for (alt_idx, alt) in lookup_tables.iter().enumerate() {
        if per_alt_w[alt_idx].is_empty() && per_alt_r[alt_idx].is_empty() {
            continue;
        }
        let alt_key_bytes = base58_decode_32(&alt.key)?;
        let w_idxs: Vec<u8> = per_alt_w[alt_idx].iter().map(|(i, _)| *i).collect();
        let r_idxs: Vec<u8> = per_alt_r[alt_idx].iter().map(|(i, _)| *i).collect();
        for (_, pk) in &per_alt_w[alt_idx] {
            alt_w_strs.push(pk.clone());
        }
        for (_, pk) in &per_alt_r[alt_idx] {
            alt_r_strs.push(pk.clone());
        }
        wire_lookups.push((alt_key_bytes, w_idxs, r_idxs));
    }

    let mut all_resolved: Vec<String> =
        Vec::with_capacity(static_strs.len() + alt_w_strs.len() + alt_r_strs.len());
    all_resolved.extend(static_strs.iter().cloned());
    all_resolved.extend(alt_w_strs.iter().cloned());
    all_resolved.extend(alt_r_strs.iter().cloned());

    if all_resolved.len() > 256 {
        return Err(format!(
            "total resolved account count ({}) exceeds Solana v0 256-account limit",
            all_resolved.len()
        ));
    }

    let mut index_map: BTreeMap<&str, u8> = BTreeMap::new();
    for (idx, pk) in all_resolved.iter().enumerate() {
        index_map.insert(pk.as_str(), idx as u8);
    }

    let num_req_sigs = (signers_w.len() + signers_r.len()) as u8;
    let num_ro_signed = signers_r.len() as u8;
    let num_ro_unsigned = static_unsign_r.len() as u8;

    let mut buf = Vec::new();
    buf.push(0x80);
    buf.push(num_req_sigs);
    buf.push(num_ro_signed);
    buf.push(num_ro_unsigned);
    encode_compact_u16_wire(static_strs.len() as u16, &mut buf);
    for pk in &static_strs {
        buf.extend_from_slice(&base58_decode_32(pk)?);
    }
    buf.extend_from_slice(&blockhash_bytes);

    encode_compact_u16_wire(payload.instructions.len() as u16, &mut buf);
    for (ix_idx, ix) in payload.instructions.iter().enumerate() {
        let prog_idx = *index_map
            .get(ix.program_id.as_str())
            .ok_or_else(|| format!("program_id missing from account table at ix #{ix_idx}"))?;
        buf.push(prog_idx);
        encode_compact_u16_wire(ix.accounts.len() as u16, &mut buf);
        for a in &ix.accounts {
            let a_idx = *index_map
                .get(a.pubkey.as_str())
                .ok_or_else(|| format!("account '{}' missing from account table", a.pubkey))?;
            buf.push(a_idx);
        }
        let data = crate::rfc9421::base64_decode_strict(&ix.data)
            .map_err(|e| format!("invalid base64 instruction data at ix #{ix_idx}: {e}"))?;
        encode_compact_u16_wire(data.len() as u16, &mut buf);
        buf.extend_from_slice(&data);
    }

    encode_compact_u16_wire(wire_lookups.len() as u16, &mut buf);
    for (alt_key, w_idxs, r_idxs) in &wire_lookups {
        buf.extend_from_slice(alt_key);
        encode_compact_u16_wire(w_idxs.len() as u16, &mut buf);
        buf.extend_from_slice(w_idxs);
        encode_compact_u16_wire(r_idxs.len() as u16, &mut buf);
        buf.extend_from_slice(r_idxs);
    }

    let sha256 = hex::encode(Sha256::digest(&buf));
    let blake3 = hex::encode(crate::hash::blake3_256(&buf));
    let compiled_message_base64 = base64_encode(&buf);
    let byte_length = buf.len();

    Ok(CompiledMessageV0Artifact {
        compiled_message_bytes: buf,
        compiled_message_base64,
        sha256,
        blake3,
        byte_length,
        static_account_count: static_strs.len(),
        alt_lookup_count: wire_lookups.len(),
    })
}

pub const RECON_CONFIRMED_WITHIN_POLICY: &str = "CONFIRMED_WITHIN_POLICY";
pub const RECON_CONFIRMED_POLICY_BREACH: &str = "CONFIRMED_POLICY_BREACH";
pub const RECON_FAILED_ON_CHAIN: &str = "FAILED_ON_CHAIN";
pub const RECON_MESSAGE_MISMATCH: &str = "MESSAGE_MISMATCH";
pub const RECON_INSUFFICIENT_CONFIRMATION: &str = "INSUFFICIENT_CONFIRMATION";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TokenBalanceSnapshot {
    pub account_index: usize,
    pub mint: String,
    #[serde(default)]
    pub owner: Option<String>,
    /// Raw integer token amount (e.g. Solana RPC `uiTokenAmount.amount`).
    pub amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnChainConfirmationEvidence {
    pub network: String,
    pub signature: String,
    pub slot: u64,
    #[serde(default)]
    pub block_time: Option<i64>,
    /// Solana commitment level (e.g. "finalized", "confirmed", "processed").
    pub confirmation_status: String,
    #[serde(default)]
    pub err: Option<serde_json::Value>,
    /// Exact serialized Solana MessageV0 bytes observed in the confirmed transaction.
    pub compiled_message_base64: String,
    /// Full resolved account keys in transaction order (static + loaded writable + loaded readonly).
    pub account_keys: Vec<String>,
    pub fee_lamports: u64,
    pub pre_balances: Vec<u64>,
    pub post_balances: Vec<u64>,
    #[serde(default)]
    pub pre_token_balances: Vec<TokenBalanceSnapshot>,
    #[serde(default)]
    pub post_token_balances: Vec<TokenBalanceSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OnChainReconciliationReport {
    pub authority: String,
    pub status: String,
    pub reason_code: String,
    pub reason_detail: String,
    pub tx_signature: String,
    pub slot: u64,
    pub block_time: Option<i64>,
    pub confirmation_status: String,
    pub confirmed_message_sha256: String,
    pub confirmed_message_blake3: String,
    pub exact_message_match: bool,
    pub actual_fee_lamports: String,
    pub actual_taker_sol_debit_lamports: String,
    pub actual_input_asset_debit: String,
    pub actual_output_net_credit: String,
    pub policy_breaches: Vec<PolicyViolation>,
}

fn find_token_balance(
    balances: &[TokenBalanceSnapshot],
    account_index: usize,
    expected_mint: &str,
) -> Result<Option<(u128, Option<String>)>, String> {
    for b in balances {
        if b.account_index == account_index && b.mint == expected_mint {
            let amt = parse_u64_strict(&b.amount, "tokenBalance.amount")?;
            return Ok(Some((u128::from(amt), b.owner.clone())));
        }
    }
    Ok(None)
}

/// Evidence #3: Post-execution on-chain confirmation verifier and policy reconciler.
///
/// Verifies that the confirmed Solana transaction matches the exact authorized `MessageV0`
/// digests (SHA-256 and BLAKE3), reached `finalized` commitment without on-chain error, and
/// that the actual balance deltas on-chain respect every policy spend cap and minimum output bound.
pub fn reconcile_solana_confirmation(
    policy: &SolanaSwapPolicy,
    authorized_sha256: &str,
    authorized_blake3: &str,
    evidence: &OnChainConfirmationEvidence,
) -> Result<OnChainReconciliationReport, String> {
    let msg_bytes = crate::rfc9421::base64_decode_strict(&evidence.compiled_message_base64)
        .map_err(|e| format!("invalid confirmed compiledMessageBase64: {e}"))?;
    let confirmed_sha256 = hex::encode(Sha256::digest(&msg_bytes));
    let confirmed_blake3 = hex::encode(crate::hash::blake3_256(&msg_bytes));
    let exact_message_match =
        confirmed_sha256 == authorized_sha256 && confirmed_blake3 == authorized_blake3;

    let make_early = |status: &str, code: &str, detail: String| OnChainReconciliationReport {
        authority: "arkhe-verify-core/solana_swap/v1".to_string(),
        status: status.to_string(),
        reason_code: code.to_string(),
        reason_detail: detail,
        tx_signature: evidence.signature.clone(),
        slot: evidence.slot,
        block_time: evidence.block_time,
        confirmation_status: evidence.confirmation_status.clone(),
        confirmed_message_sha256: confirmed_sha256.clone(),
        confirmed_message_blake3: confirmed_blake3.clone(),
        exact_message_match,
        actual_fee_lamports: evidence.fee_lamports.to_string(),
        actual_taker_sol_debit_lamports: "0".to_string(),
        actual_input_asset_debit: "0".to_string(),
        actual_output_net_credit: "0".to_string(),
        policy_breaches: Vec::new(),
    };

    if evidence.network != policy.network {
        return Ok(make_early(
            RECON_MESSAGE_MISMATCH,
            "CONFIRMATION_NETWORK_MISMATCH",
            format!(
                "Confirmed transaction network '{}' does not match policy network '{}'.",
                evidence.network, policy.network
            ),
        ));
    }

    if !exact_message_match {
        return Ok(make_early(
            RECON_MESSAGE_MISMATCH,
            "CONFIRMED_MESSAGE_DIGEST_MISMATCH",
            format!(
                "Confirmed MessageV0 digest ({confirmed_sha256}) does not match authorized digest ({authorized_sha256})."
            ),
        ));
    }

    if evidence.confirmation_status != "finalized" {
        return Ok(make_early(
            RECON_INSUFFICIENT_CONFIRMATION,
            "CONFIRMATION_NOT_FINALIZED",
            format!(
                "Transaction confirmationStatus is '{}' (required 'finalized' before settlement reconciliation).",
                evidence.confirmation_status
            ),
        ));
    }

    if let Some(err_val) = &evidence.err {
        return Ok(make_early(
            RECON_FAILED_ON_CHAIN,
            "TRANSACTION_FAILED_ON_CHAIN",
            format!("Transaction failed on-chain with err={err_val}."),
        ));
    }

    if evidence.pre_balances.len() != evidence.account_keys.len()
        || evidence.post_balances.len() != evidence.account_keys.len()
    {
        return Err(
            "preBalances and postBalances lengths must equal accountKeys length".to_string(),
        );
    }

    let max_input_asset_debit =
        parse_u64_strict(&policy.max_input_asset_debit, "maxInputAssetDebit")?;
    let max_sol_ancillary_debit =
        parse_u64_strict(&policy.max_sol_ancillary_debit, "maxSolAncillaryDebit")?;
    let min_output_net_credit =
        parse_u64_strict(&policy.min_output_net_credit, "minOutputNetCredit")?;
    let max_total_sol_debit = match &policy.max_total_sol_debit {
        Some(v) => Some(parse_u64_strict(v, "maxTotalSolDebit")?),
        None => None,
    };
    let input_is_native_sol = policy.input_mint == NATIVE_MINT_ID;

    let taker_idx = evidence
        .account_keys
        .iter()
        .position(|k| k == &policy.taker)
        .ok_or_else(|| format!("policy taker '{}' missing from accountKeys", policy.taker))?;
    let actual_taker_sol_debit = u128::from(
        evidence.pre_balances[taker_idx].saturating_sub(evidence.post_balances[taker_idx]),
    );

    let input_tok_debit = if let Some(in_idx) = evidence
        .account_keys
        .iter()
        .position(|k| k == &policy.taker_input_token_account)
    {
        let pre_amt = find_token_balance(&evidence.pre_token_balances, in_idx, &policy.input_mint)?
            .map(|(a, _)| a)
            .unwrap_or(0);
        let post_amt =
            find_token_balance(&evidence.post_token_balances, in_idx, &policy.input_mint)?
                .map(|(a, _)| a)
                .unwrap_or(0);
        pre_amt.saturating_sub(post_amt)
    } else {
        0
    };

    let actual_input_asset_debit = if input_is_native_sol {
        input_tok_debit.max(actual_taker_sol_debit.saturating_sub(u128::from(evidence.fee_lamports)))
    } else {
        input_tok_debit
    };

    let mut policy_breaches = Vec::new();
    let actual_output_net_credit = if let Some(out_idx) = evidence
        .account_keys
        .iter()
        .position(|k| k == &policy.authorized_destination_token_account)
    {
        let pre_out =
            find_token_balance(&evidence.pre_token_balances, out_idx, &policy.output_mint)?;
        let post_out =
            find_token_balance(&evidence.post_token_balances, out_idx, &policy.output_mint)?;
        if let Some((_, Some(owner))) = &post_out {
            if owner != &policy.authorized_recipient {
                policy_breaches.push(PolicyViolation {
                    code: "ACTUAL_DESTINATION_OWNER_MISMATCH".to_string(),
                    instruction_index: None,
                    detail: format!(
                        "Post-execution destination token account owner '{owner}' differs from authorizedRecipient '{}'.",
                        policy.authorized_recipient
                    ),
                });
            }
        }
        let pre_amt = pre_out.map(|(a, _)| a).unwrap_or(0);
        let post_amt = post_out.map(|(a, _)| a).unwrap_or(0);
        post_amt.saturating_sub(pre_amt)
    } else {
        policy_breaches.push(PolicyViolation {
            code: "AUTHORIZED_DESTINATION_MISSING_IN_CONFIRMED_TX".to_string(),
            instruction_index: None,
            detail: format!(
                "Authorized destination token account '{}' not present in confirmed accountKeys.",
                policy.authorized_destination_token_account
            ),
        });
        0
    };

    if actual_input_asset_debit > u128::from(max_input_asset_debit) {
        policy_breaches.push(PolicyViolation {
            code: "ACTUAL_INPUT_DEBIT_EXCEEDED_CAP".to_string(),
            instruction_index: None,
            detail: format!(
                "Confirmed input asset debit {actual_input_asset_debit} exceeded policy maxInputAssetDebit {max_input_asset_debit}."
            ),
        });
    }
    if actual_output_net_credit < u128::from(min_output_net_credit) {
        policy_breaches.push(PolicyViolation {
            code: "ACTUAL_OUTPUT_CREDIT_BELOW_MIN".to_string(),
            instruction_index: None,
            detail: format!(
                "Confirmed output net credit {actual_output_net_credit} was below policy minOutputNetCredit {min_output_net_credit}."
            ),
        });
    }
    if input_is_native_sol {
        if let Some(max_total) = max_total_sol_debit {
            if actual_taker_sol_debit > u128::from(max_total) {
                policy_breaches.push(PolicyViolation {
                    code: "ACTUAL_TOTAL_SOL_DEBIT_EXCEEDED_CAP".to_string(),
                    instruction_index: None,
                    detail: format!(
                        "Confirmed taker SOL debit {actual_taker_sol_debit} lamports exceeded policy maxTotalSolDebit {max_total}."
                    ),
                });
            }
        }
    } else if actual_taker_sol_debit > u128::from(max_sol_ancillary_debit) {
        policy_breaches.push(PolicyViolation {
            code: "ACTUAL_SOL_ANCILLARY_DEBIT_EXCEEDED_CAP".to_string(),
            instruction_index: None,
            detail: format!(
                "Confirmed taker SOL ancillary debit {actual_taker_sol_debit} lamports exceeded policy maxSolAncillaryDebit {max_sol_ancillary_debit}."
            ),
        });
    }

    let (status, reason_code, reason_detail) = if policy_breaches.is_empty() {
        (
            RECON_CONFIRMED_WITHIN_POLICY.to_string(),
            "ONCHAIN_SETTLEMENT_VERIFIED_WITHIN_POLICY".to_string(),
            format!(
                "Finalized transaction '{}' matched authorized MessageV0 digests and settled within all policy bounds (inputDebit={actual_input_asset_debit}, outputCredit={actual_output_net_credit}, takerSolDebit={actual_taker_sol_debit}).",
                evidence.signature
            ),
        )
    } else {
        let code = policy_breaches[0].code.clone();
        let detail = policy_breaches
            .iter()
            .map(|b| format!("{}: {}", b.code, b.detail))
            .collect::<Vec<_>>()
            .join(" | ");
        (RECON_CONFIRMED_POLICY_BREACH.to_string(), code, detail)
    };

    Ok(OnChainReconciliationReport {
        authority: "arkhe-verify-core/solana_swap/v1".to_string(),
        status,
        reason_code,
        reason_detail,
        tx_signature: evidence.signature.clone(),
        slot: evidence.slot,
        block_time: evidence.block_time,
        confirmation_status: evidence.confirmation_status.clone(),
        confirmed_message_sha256: confirmed_sha256,
        confirmed_message_blake3: confirmed_blake3,
        exact_message_match,
        actual_fee_lamports: evidence.fee_lamports.to_string(),
        actual_taker_sol_debit_lamports: actual_taker_sol_debit.to_string(),
        actual_input_asset_debit: actual_input_asset_debit.to_string(),
        actual_output_net_credit: actual_output_net_credit.to_string(),
        policy_breaches,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    const TEST_GENESIS: &str = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    const TEST_ALT_KEY_ID: &str = "alt-observer-test-1";

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
        buf.extend_from_slice(&[77u8; 32]); // blockhash
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

    fn key_bytes(seed: u8) -> [u8; 32] {
        let mut out = [seed; 32];
        out[0] = seed.wrapping_add(1);
        out
    }

    fn make_attested_alt_snapshot(
        alt_key: [u8; 32],
        addresses: Vec<String>,
        attester: &SigningKey,
    ) -> AddressLookupTableSnapshot {
        let key_str = base58_encode(&alt_key);
        let slot = 310_000_000u64;
        let deact = u64::MAX;
        let canonical = canonical_alt_snapshot_bytes(
            "solana-mainnet-beta",
            TEST_GENESIS,
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
            genesis_hash: Some(TEST_GENESIS.to_string()),
            slot: Some(slot),
            deactivation_slot: Some(deact.to_string()),
            addresses,
            attestation: Some(AltSnapshotAttestation {
                key_id: TEST_ALT_KEY_ID.to_string(),
                signature_hex: hex::encode(sig.to_bytes()),
            }),
        }
    }

    fn base_fixture(dest_in_wire: [u8; 32]) -> (Vec<u8>, EvaluationContext, SigningKey) {
        let taker = key_bytes(11);
        let taker_in_ata = key_bytes(12);
        let auth_recipient = key_bytes(13);
        let auth_dest_ata = key_bytes(14);
        let input_mint = key_bytes(21);
        let output_mint = key_bytes(22);
        let swap_program = key_bytes(31);
        let pool_in = key_bytes(41);
        let pool_out = key_bytes(42);
        let alt_key = key_bytes(51);
        let token_prog = base58_decode_32(TOKEN_PROGRAM_ID).unwrap();
        let attester = SigningKey::from_bytes(&[42u8; 32]);

        let disc = [0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07, 0x08];
        let mut swap_data = Vec::new();
        swap_data.extend_from_slice(&disc);
        swap_data.extend_from_slice(&80_000_000u64.to_le_bytes());
        swap_data.extend_from_slice(&96_000_000u64.to_le_bytes());

        let wire = build_wire_v0(
            (1, 0, 1),
            &[taker, taker_in_ata, dest_in_wire, swap_program],
            &[(3, &[0, 1, 2, 6, 7, 4, 5, 8], &swap_data)],
            &[(alt_key, &[0, 1], &[2, 3, 4])],
        );

        let mut covered = BTreeMap::new();
        covered.insert(
            base58_encode(&swap_program),
            CoveredSwapProgramProfile {
                name: "CoveredDirectAmmV1".to_string(),
                discriminator_hex: hex::encode(disc),
                guarantees: vec!["atomic min_out".to_string()],
            },
        );
        let mut alt_keys = BTreeMap::new();
        alt_keys.insert(
            TEST_ALT_KEY_ID.to_string(),
            hex::encode(attester.verifying_key().to_bytes()),
        );

        let alt_snap = make_attested_alt_snapshot(
            alt_key,
            vec![
                base58_encode(&pool_in),
                base58_encode(&pool_out),
                base58_encode(&input_mint),
                base58_encode(&output_mint),
                base58_encode(&token_prog),
            ],
            &attester,
        );

        let ctx = EvaluationContext {
            policy: SolanaSwapPolicy {
                policy_id: "p1".to_string(),
                network: "solana-mainnet-beta".to_string(),
                genesis_hash: Some(TEST_GENESIS.to_string()),
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
            },
            address_lookup_tables: vec![alt_snap],
            swap_instructions_payload: Raw0xSwapPayload {
                network: Some("solana-mainnet-beta".to_string()),
                genesis_hash: Some(TEST_GENESIS.to_string()),
                address_lookup_table_addresses: vec![base58_encode(&alt_key)],
                instructions: vec![Raw0xInstruction {
                    program_id: base58_encode(&swap_program),
                    accounts: vec![
                        Raw0xAccountMeta { pubkey: base58_encode(&taker), is_signer: true, is_writable: true },
                        Raw0xAccountMeta { pubkey: base58_encode(&taker_in_ata), is_signer: false, is_writable: true },
                        Raw0xAccountMeta { pubkey: base58_encode(&auth_dest_ata), is_signer: false, is_writable: true },
                        Raw0xAccountMeta { pubkey: base58_encode(&input_mint), is_signer: false, is_writable: false },
                        Raw0xAccountMeta { pubkey: base58_encode(&output_mint), is_signer: false, is_writable: false },
                        Raw0xAccountMeta { pubkey: base58_encode(&pool_in), is_signer: false, is_writable: true },
                        Raw0xAccountMeta { pubkey: base58_encode(&pool_out), is_signer: false, is_writable: true },
                        Raw0xAccountMeta { pubkey: TOKEN_PROGRAM_ID.to_string(), is_signer: false, is_writable: false },
                    ],
                    data: base64_encode(&swap_data),
                }],
            },
        };
        (wire, ctx, attester)
    }

    #[test]
    fn base58_roundtrips_system_and_token_program_ids() {
        for id in [
            SYSTEM_PROGRAM_ID,
            COMPUTE_BUDGET_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
            NATIVE_MINT_ID,
        ] {
            let decoded = base58_decode_32(id).unwrap();
            assert_eq!(base58_encode(&decoded), id);
        }
    }

    #[test]
    fn rust_authority_blocks_when_wire_destination_differs_from_benign_0x_summary() {
        let attacker_dest_ata = key_bytes(99);
        let (wire, ctx, _) = base_fixture(attacker_dest_ata);
        let eval = evaluate_message_v0(&wire, &ctx).unwrap();
        assert_eq!(eval.verdict, VERDICT_BLOCKED);
        assert!(eval.violations.iter().any(|v| v.code == "SWAP_PARAMETERS_OUT_OF_POLICY"));
        assert!(eval.violations.iter().any(|v| v.code == "LOCAL_ASSEMBLY_DIVERGENCE_FROM_0X_RESPONSE"));
    }

    #[test]
    fn rust_authority_accepts_covered_attested_alt_resolved_wire_message() {
        let auth_dest_ata = key_bytes(14);
        let (wire, ctx, _) = base_fixture(auth_dest_ata);
        let eval = evaluate_message_v0(&wire, &ctx).unwrap();
        assert_eq!(eval.verdict, VERDICT_ELIGIBLE);
        assert_eq!(eval.verified_alt_snapshots.len(), 1);
        assert_eq!(eval.verified_alt_snapshots[0].status, "VERIFIED");
        assert!(eval.compiled_message.resolved_accounts.iter().any(|a| a.source == "alt-writable"));
        assert!(eval.compiled_message.resolved_accounts.iter().any(|a| a.source == "alt-readonly"));
    }

    #[test]
    fn rust_authority_blocks_when_alt_index_address_swapped_with_fixed_wire_message() {
        let auth_dest_ata = key_bytes(14);
        let (wire, mut ctx, _) = base_fixture(auth_dest_ata);
        // Keep MessageV0 wire bytes FIXED, but swap the address at ALT index 3 (outputMint) to an attacker mint
        ctx.address_lookup_tables[0].addresses[3] = base58_encode(&key_bytes(88));
        let eval = evaluate_message_v0(&wire, &ctx).unwrap();
        assert_eq!(eval.verdict, VERDICT_BLOCKED);
        assert!(eval.violations.iter().any(|v| v.code == "ALT_SNAPSHOT_ATTESTATION_INVALID"));
        assert!(eval.violations.iter().any(|v| v.code == "SWAP_PARAMETERS_OUT_OF_POLICY"));
        assert_eq!(eval.verified_alt_snapshots[0].status, VERDICT_BLOCKED);
    }

    #[test]
    fn rust_authority_marks_inconclusive_when_alt_snapshot_lacks_attestation() {
        let auth_dest_ata = key_bytes(14);
        let (wire, mut ctx, _) = base_fixture(auth_dest_ata);
        // Keep MessageV0 wire bytes FIXED and addresses valid, but remove ALT attestation evidence
        ctx.address_lookup_tables[0].attestation = None;
        let eval = evaluate_message_v0(&wire, &ctx).unwrap();
        assert_eq!(eval.verdict, VERDICT_INCONCLUSIVE);
        assert_eq!(eval.reason_code, "UNATTESTED_ALT_SNAPSHOT");
        assert_eq!(eval.verified_alt_snapshots[0].status, VERDICT_INCONCLUSIVE);
    }

    #[test]
    fn pure_rust_message_v0_compiler_roundtrips_with_alt_compression_and_passes_policy() {
        let auth_dest_ata = key_bytes(14);
        let (_, ctx, _) = base_fixture(auth_dest_ata);
        let blockhash = base58_encode(&[77u8; 32]);
        let artifact = compile_solana_message_v0(
            &ctx.policy.taker,
            &blockhash,
            &ctx.swap_instructions_payload,
            &ctx.address_lookup_tables,
        )
        .expect("compile MessageV0 with ALT");
        assert_eq!(artifact.alt_lookup_count, 1);

        let eval = evaluate_message_v0(&artifact.compiled_message_bytes, &ctx)
            .expect("evaluate Rust-compiled MessageV0");
        assert_eq!(eval.verdict, VERDICT_ELIGIBLE);
        assert!(eval.response_match.matches);
        assert_eq!(eval.compiled_message.sha256, artifact.sha256);
        assert_eq!(eval.compiled_message.blake3, artifact.blake3);
        assert!(eval
            .compiled_message
            .resolved_accounts
            .iter()
            .any(|a| a.source == "alt-writable"));
        assert!(eval
            .compiled_message
            .resolved_accounts
            .iter()
            .any(|a| a.source == "alt-readonly"));
    }

    #[test]
    fn reconcile_solana_confirmation_verifies_settled_deltas_and_catches_breaches_and_mismatches() {
        let auth_dest_ata = key_bytes(14);
        let (wire, ctx, _) = base_fixture(auth_dest_ata);
        let eval = evaluate_message_v0(&wire, &ctx).unwrap();
        assert_eq!(eval.verdict, VERDICT_ELIGIBLE);

        let account_keys = vec![
            ctx.policy.taker.clone(),
            ctx.policy.taker_input_token_account.clone(),
            ctx.policy.authorized_destination_token_account.clone(),
        ];
        let base_ev = OnChainConfirmationEvidence {
            network: ctx.policy.network.clone(),
            signature: "5FakeSigForOfflineReconciliationTest111111111111111111111111111111111".to_string(),
            slot: 310_000_050,
            block_time: Some(1_760_000_025),
            confirmation_status: "finalized".to_string(),
            err: None,
            compiled_message_base64: eval.compiled_message.base64.clone(),
            account_keys,
            fee_lamports: 5_000,
            pre_balances: vec![1_000_000_000, 2_039_280, 2_039_280],
            post_balances: vec![999_995_000, 2_039_280, 2_039_280],
            pre_token_balances: vec![
                TokenBalanceSnapshot {
                    account_index: 1,
                    mint: ctx.policy.input_mint.clone(),
                    owner: Some(ctx.policy.taker.clone()),
                    amount: "200000000".to_string(),
                },
                TokenBalanceSnapshot {
                    account_index: 2,
                    mint: ctx.policy.output_mint.clone(),
                    owner: Some(ctx.policy.authorized_recipient.clone()),
                    amount: "10000000".to_string(),
                },
            ],
            post_token_balances: vec![
                TokenBalanceSnapshot {
                    account_index: 1,
                    mint: ctx.policy.input_mint.clone(),
                    owner: Some(ctx.policy.taker.clone()),
                    amount: "120000000".to_string(), // debited 80_000_000 (<= 100_000_000)
                },
                TokenBalanceSnapshot {
                    account_index: 2,
                    mint: ctx.policy.output_mint.clone(),
                    owner: Some(ctx.policy.authorized_recipient.clone()),
                    amount: "107500000".to_string(), // credited 97_500_000 (>= 95_000_000)
                },
            ],
        };

        // 1. Settled within policy
        let ok = reconcile_solana_confirmation(
            &ctx.policy,
            &eval.compiled_message.sha256,
            &eval.compiled_message.blake3,
            &base_ev,
        )
        .unwrap();
        assert_eq!(ok.status, RECON_CONFIRMED_WITHIN_POLICY);
        assert!(ok.exact_message_match);
        assert_eq!(ok.actual_input_asset_debit, "80000000");
        assert_eq!(ok.actual_output_net_credit, "97500000");
        assert_eq!(ok.actual_taker_sol_debit_lamports, "5000");

        // 2. Policy breach (actual output below minOutputNetCredit)
        let mut short_out = base_ev.clone();
        short_out.post_token_balances[1].amount = "90000000".to_string(); // net credit 80_000_000 < 95_000_000
        let breach = reconcile_solana_confirmation(
            &ctx.policy,
            &eval.compiled_message.sha256,
            &eval.compiled_message.blake3,
            &short_out,
        )
        .unwrap();
        assert_eq!(breach.status, RECON_CONFIRMED_POLICY_BREACH);
        assert_eq!(breach.reason_code, "ACTUAL_OUTPUT_CREDIT_BELOW_MIN");

        // 3. 1-byte mutated confirmed message -> MESSAGE_MISMATCH
        let mut bad_msg = base_ev.clone();
        let mut mutated = wire.clone();
        mutated[0] ^= 0x01;
        bad_msg.compiled_message_base64 = base64_encode(&mutated);
        let mismatch = reconcile_solana_confirmation(
            &ctx.policy,
            &eval.compiled_message.sha256,
            &eval.compiled_message.blake3,
            &bad_msg,
        )
        .unwrap();
        assert_eq!(mismatch.status, RECON_MESSAGE_MISMATCH);
        assert!(!mismatch.exact_message_match);

        // 4. Unfinalized commitment -> INSUFFICIENT_CONFIRMATION
        let mut processed = base_ev.clone();
        processed.confirmation_status = "processed".to_string();
        let unfinal = reconcile_solana_confirmation(
            &ctx.policy,
            &eval.compiled_message.sha256,
            &eval.compiled_message.blake3,
            &processed,
        )
        .unwrap();
        assert_eq!(unfinal.status, RECON_INSUFFICIENT_CONFIRMATION);

        // 5. On-chain error -> FAILED_ON_CHAIN
        let mut failed = base_ev;
        failed.err = Some(serde_json::json!({"InstructionError": [0, {"Custom": 6001}]}));
        let err_rep = reconcile_solana_confirmation(
            &ctx.policy,
            &eval.compiled_message.sha256,
            &eval.compiled_message.blake3,
            &failed,
        )
        .unwrap();
        assert_eq!(err_rep.status, RECON_FAILED_ON_CHAIN);
    }

    #[test]
    fn zerox_settler_structural_inspector_decodes_header_blocks_above_cap_and_stays_fail_closed() {
        // Real 49-byte 0x Settler instruction payload observed on Mainnet Beta (zid=0x2aa3c060be30ef0ae6d00945,
        // amountIn=100_000_000, minAmountOut=7_217_315).
        let settler_data = hex::decode(
            "002aa3c060be30ef0ae6d0094500e1f50500000000a3206e00000000000310221795fb0900ca9a3b024fae6e0000000000"
        )
        .unwrap();
        let taker = key_bytes(11);
        let taker_in_ata = key_bytes(12);
        let auth_dest_ata = key_bytes(14);
        let out_mint = key_bytes(22);
        let meteora_dlmm = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
        let deriverse = "DRVSpZ2YUYYKgZP8XtLhAGtT1zYSCKzeHfb4DgRnrgqD";

        let payload = Raw0xSwapPayload {
            network: Some("solana-mainnet-beta".to_string()),
            genesis_hash: Some(TEST_GENESIS.to_string()),
            address_lookup_table_addresses: vec![],
            instructions: vec![Raw0xInstruction {
                program_id: ZEROX_SETTLER_PROGRAM_ID.to_string(),
                accounts: vec![
                    Raw0xAccountMeta { pubkey: base58_encode(&taker_in_ata), is_signer: false, is_writable: true },
                    Raw0xAccountMeta { pubkey: base58_encode(&auth_dest_ata), is_signer: false, is_writable: true },
                    Raw0xAccountMeta { pubkey: meteora_dlmm.to_string(), is_signer: false, is_writable: false },
                    Raw0xAccountMeta { pubkey: deriverse.to_string(), is_signer: false, is_writable: false },
                    Raw0xAccountMeta { pubkey: base58_encode(&taker), is_signer: true, is_writable: true },
                    Raw0xAccountMeta { pubkey: TOKEN_PROGRAM_ID.to_string(), is_signer: false, is_writable: false },
                ],
                data: base64_encode(&settler_data),
            }],
        };

        let compiled = compile_solana_message_v0(
            &base58_encode(&taker),
            &base58_encode(&[77u8; 32]),
            &payload,
            &[],
        )
        .unwrap();

        let make_policy = |max_in: &str, max_total: &str| SolanaSwapPolicy {
            policy_id: "settler-inspect-test".to_string(),
            network: "solana-mainnet-beta".to_string(),
            genesis_hash: Some(TEST_GENESIS.to_string()),
            taker: base58_encode(&taker),
            taker_input_token_account: base58_encode(&taker_in_ata),
            authorized_recipient: base58_encode(&taker),
            authorized_destination_token_account: base58_encode(&auth_dest_ata),
            input_mint: NATIVE_MINT_ID.to_string(),
            output_mint: base58_encode(&out_mint),
            max_input_asset_debit: max_in.to_string(),
            max_sol_ancillary_debit: "3000000".to_string(),
            max_total_sol_debit: Some(max_total.to_string()),
            min_output_net_credit: "7000000".to_string(),
            trusted_alt_attester_keys: BTreeMap::new(),
            covered_swap_programs: BTreeMap::new(),
        };

        // 1. Above policy cap (100M > 50M) -> BLOQUEADO with INPUT_ASSET_CAP_EXCEEDED + rich Settler telemetry
        let eval_cap = evaluate_message_v0(
            &compiled.compiled_message_bytes,
            &EvaluationContext {
                policy: make_policy("50000000", "53000000"),
                address_lookup_tables: vec![],
                swap_instructions_payload: payload.clone(),
            },
        )
        .unwrap();
        assert_eq!(eval_cap.verdict, VERDICT_BLOCKED);
        assert!(eval_cap.violations.iter().any(|v| v.code == "INPUT_ASSET_CAP_EXCEEDED"));
        assert!(eval_cap.violations.iter().any(|v| v.code == "TOTAL_SOL_CAP_EXCEEDED"));
        assert!(eval_cap.indeterminate_factors.iter().any(|f| f.code == "UNINTERPRETED_PROGRAM"));
        assert_eq!(eval_cap.instruction_analysis[0]["kind"], "ZeroXSettler.UnverifiedCpiRoute");
        assert_eq!(eval_cap.instruction_analysis[0]["zidHex"], "0x2aa3c060be30ef0ae6d00945");
        assert_eq!(eval_cap.instruction_analysis[0]["declaredAmountIn"], "100000000");
        assert_eq!(eval_cap.instruction_analysis[0]["declaredMinAmountOut"], "7217315");
        assert_eq!(eval_cap.instruction_analysis[0]["cpiAuditStatus"], "UNVERIFIED_EXTERNAL_CPI");

        // 2. Even when all caps & accounts pass -> MUST STAY INCONCLUSIVO (NEVER ELEGÍVEL!)
        let eval_within = evaluate_message_v0(
            &compiled.compiled_message_bytes,
            &EvaluationContext {
                policy: make_policy("200000000", "205000000"),
                address_lookup_tables: vec![],
                swap_instructions_payload: payload,
            },
        )
        .unwrap();
        assert_eq!(eval_within.verdict, VERDICT_INCONCLUSIVE);
        assert_eq!(eval_within.reason_code, "UNINTERPRETED_PROGRAM");
        assert!(eval_within.violations.is_empty());
    }
}
