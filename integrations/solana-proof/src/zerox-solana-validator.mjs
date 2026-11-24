// Compiles 0x POST /solana/swap-instructions payloads into real Solana MessageV0 wire bytes
// using @solana/web3.js and delegates ALL wire-byte parsing, ALT account resolution,
// instruction decoding, and policy evaluation to the Rust authority (`arkhe-verify-wasm`).
// Zero duplicated policy evaluation in JS/TS.

import { createRequire } from 'node:module';
import { sign } from 'node:crypto';
import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from '@solana/web3.js';
import { hash as blake3Hex } from './proof.mjs';
import { sha256Hex } from './zerox-rfc9421.mjs';

const require = createRequire(import.meta.url);
const wasm = require('../../../verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js');

export const VERDICT_ELIGIBLE = 'ELEGÍVEL';
export const VERDICT_BLOCKED = 'BLOQUEADO';
export const VERDICT_INCONCLUSIVE = 'INCONCLUSIVO';

export function canonicalAltSnapshotBytes({ network, genesisHash, key, slot, deactivationSlot, addresses }) {
  const domain = Buffer.from('ARKHE:SOLANA-ALT-SNAPSHOT:v1\0', 'utf8');
  const netBuf = Buffer.from(network, 'utf8');
  const genBuf = Buffer.from(genesisHash, 'utf8');
  const netLen = Buffer.alloc(4);
  netLen.writeUInt32BE(netBuf.length, 0);
  const genLen = Buffer.alloc(4);
  genLen.writeUInt32BE(genBuf.length, 0);
  const keyBuf = Buffer.from(new PublicKey(key).toBytes());
  const slotBuf = Buffer.alloc(8);
  slotBuf.writeBigUInt64BE(BigInt(slot), 0);
  const deactBuf = Buffer.alloc(8);
  deactBuf.writeBigUInt64BE(BigInt(deactivationSlot), 0);
  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32BE(addresses.length, 0);
  const addrBufs = addresses.map(a => Buffer.from(new PublicKey(a).toBytes()));
  return Buffer.concat([domain, netLen, netBuf, genLen, genBuf, keyBuf, slotBuf, deactBuf, countBuf, ...addrBufs]);
}

export function attestAltSnapshot({ network, genesisHash, key, slot, deactivationSlot = '18446744073709551615', addresses, attesterPrivateKey, attesterKeyId }) {
  const canonical = canonicalAltSnapshotBytes({ network, genesisHash, key, slot, deactivationSlot, addresses });
  const signatureHex = sign(null, canonical, attesterPrivateKey).toString('hex');
  return {
    key,
    network,
    genesisHash,
    slot,
    deactivationSlot: String(deactivationSlot),
    addresses,
    attestation: {
      keyId: attesterKeyId,
      signatureHex,
    },
  };
}

export function encodeCoveredSwapInstructionData(discriminatorHex, amountIn, minAmountOut) {
  const disc = Buffer.from(discriminatorHex, 'hex');
  if (disc.length !== 8) throw new Error('discriminatorHex must be 8 bytes (16 hex chars)');
  const buf = Buffer.alloc(24);
  disc.copy(buf, 0);
  buf.writeBigUInt64LE(BigInt(amountIn), 8);
  buf.writeBigUInt64LE(BigInt(minAmountOut), 16);
  return buf;
}

export function serializeInstructionFor0x(ix) {
  return {
    programId: ix.programId.toBase58(),
    accounts: ix.keys.map(k => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: Boolean(k.isSigner),
      isWritable: Boolean(k.isWritable),
    })),
    data: Buffer.from(ix.data).toString('base64'),
  };
}

function normalizePubkey(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length === 32) return new PublicKey(Uint8Array.from(value)).toBase58();
  throw new Error('Unsupported Solana pubkey encoding in 0x instruction');
}

function normalizeDataBuffer(value) {
  if (typeof value === 'string') return Buffer.from(value, 'base64');
  if (Array.isArray(value)) return Buffer.from(Uint8Array.from(value));
  if (Buffer.isBuffer(value)) return value;
  throw new Error('Unsupported Solana instruction data encoding in 0x instruction');
}

export function normalize0xPayload(rawPayload) {
  const instructions = (rawPayload.instructions ?? []).map(raw => ({
    programId: normalizePubkey(raw.programId ?? raw.program_id),
    accounts: (raw.accounts ?? []).map(a => ({
      pubkey: normalizePubkey(a.pubkey),
      isSigner: Boolean(a.isSigner ?? a.is_signer),
      isWritable: Boolean(a.isWritable ?? a.is_writable),
    })),
    data: normalizeDataBuffer(raw.data).toString('base64'),
  }));
  const addressLookupTableAddresses =
    rawPayload.addressLookupTableAddresses ?? rawPayload.address_lookup_tables ?? [];
  return {
    network: rawPayload.network ?? null,
    genesisHash: rawPayload.genesisHash ?? rawPayload.genesis_hash ?? null,
    addressLookupTableAddresses,
    instructions,
  };
}

export function deserialize0xInstruction(raw) {
  const programId = normalizePubkey(raw.programId ?? raw.program_id);
  const data = normalizeDataBuffer(raw.data);
  return new TransactionInstruction({
    programId: new PublicKey(programId),
    keys: (raw.accounts ?? []).map(a => ({
      pubkey: new PublicKey(normalizePubkey(a.pubkey)),
      isSigner: Boolean(a.isSigner ?? a.is_signer),
      isWritable: Boolean(a.isWritable ?? a.is_writable),
    })),
    data,
  });
}

export function makeAddressLookupTableAccount(keyBase58, addressStrings) {
  return new AddressLookupTableAccount({
    key: new PublicKey(keyBase58),
    state: {
      deactivationSlot: BigInt('18446744073709551615'),
      lastExtendedSlot: 1,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses: addressStrings.map(a => new PublicKey(a)),
    },
  });
}

export function compile0xSwapMessage({
  swapInstructionsPayload,
  addressLookupTableSnapshots = [],
  payerKey,
  recentBlockhash,
  extraInstructionsBeforeAuth = [],
  overrideInstructionsBeforeCompile = null,
}) {
  const altByAddress = new Map();
  for (const snap of addressLookupTableSnapshots) {
    altByAddress.set(snap.key, makeAddressLookupTableAccount(snap.key, snap.addresses));
  }

  const requiredAltAddresses = Array.isArray(swapInstructionsPayload.addressLookupTableAddresses)
    ? swapInstructionsPayload.addressLookupTableAddresses
    : [];
  const altAccounts = [];
  for (const addr of requiredAltAddresses) {
    const found = altByAddress.get(addr);
    if (found) altAccounts.push(found);
  }

  const responseInstructions = (swapInstructionsPayload.instructions ?? []).map(deserialize0xInstruction);
  const extraInstructions = extraInstructionsBeforeAuth.map(ix =>
    ix instanceof TransactionInstruction ? ix : deserialize0xInstruction(ix)
  );
  const baseInstructions = [...responseInstructions, ...extraInstructions];
  const allInstructions = overrideInstructionsBeforeCompile
    ? overrideInstructionsBeforeCompile(baseInstructions)
    : baseInstructions;

  const messageV0 = new TransactionMessage({
    payerKey: new PublicKey(payerKey),
    recentBlockhash,
    instructions: allInstructions,
  }).compileToV0Message(altAccounts);

  const compiledMessageBytes = Buffer.from(messageV0.serialize());
  return {
    messageV0,
    compiledMessageBytes,
    compiledMessageSha256: sha256Hex(compiledMessageBytes),
    compiledMessageBlake3: blake3Hex(compiledMessageBytes),
  };
}

/**
 * Delegates evaluation of the raw compiled Solana MessageV0 wire bytes directly to
 * Rust (`arkhe-verify-core::solana_swap::evaluate_message_v0` via `arkhe-verify-wasm`).
 * No pre-interpreted JS summary is trusted or passed to Rust.
 */
export function evaluateCompiledSolanaSwap({
  compiledMessageBytes,
  addressLookupTableSnapshots = [],
  swapInstructionsPayload,
  policy,
}) {
  const wireBytes = Buffer.isBuffer(compiledMessageBytes)
    ? compiledMessageBytes
    : Buffer.from(compiledMessageBytes);
  const normalized = normalize0xPayload(swapInstructionsPayload);
  const contextJson = JSON.stringify({
    policy,
    addressLookupTables: addressLookupTableSnapshots,
    swapInstructionsPayload: normalized,
  });
  const resultJson = wasm.evaluate_solana_swap_message_v0(wireBytes, contextJson);
  return JSON.parse(resultJson);
}

/**
 * Pure-Rust Solana MessageV0 compiler invoked via `arkhe-verify-wasm` (zero @solana/web3.js).
 */
export function compileSolanaSwapMessageV0Wasm({
  payer,
  recentBlockhash,
  swapInstructionsPayload,
  addressLookupTables = [],
}) {
  const reqJson = JSON.stringify({
    payer: typeof payer === 'string' ? payer : payer.toBase58(),
    recentBlockhash,
    swapInstructionsPayload,
    addressLookupTables,
  });
  return JSON.parse(wasm.compile_solana_swap_message_v0(reqJson));
}

/**
 * Evidence #3: Post-execution on-chain confirmation reconciler invoked via `arkhe-verify-wasm`.
 */
export function reconcileSolanaSwapConfirmationWasm({
  policy,
  authorizedSha256,
  authorizedBlake3,
  evidence,
}) {
  const reqJson = JSON.stringify({
    policy,
    authorizedSha256,
    authorizedBlake3,
    evidence,
  });
  return JSON.parse(wasm.reconcile_solana_swap_confirmation(reqJson));
}
