// Offline Arkhe x 0x Solana Swap Authorization Pilot:
// - Verifies 0x RFC 9421 Ed25519 HTTP responses against pinned external keys (never fixture-embedded trust)
// - Delegates MessageV0 wire-byte parsing, ALT account resolution, and policy verdict solely to Rust WASM
// - Issues single-use Ed25519 test authorizations ONLY on verdict === ELEGÍVEL
// - Enforces exact compiled-message hash binding at the signing boundary before calling the test key
// - Produces signed, MMR-anchored, deterministically reproducible decision receipts verified via arkhe-verify-wasm.

import { createPublicKey, sign, verify } from 'node:crypto';
import { canonicalBytes } from './audit-journal.mjs';
import { keyId, signCheckpoint, verifyCheckpoint } from './checkpoint-auth.mjs';
import { buildProof, hash as blake3Hex, verifyLeaf } from './proof.mjs';
import { sha256Hex, verify0xHttpResponse } from './zerox-rfc9421.mjs';
import {
  VERDICT_BLOCKED,
  VERDICT_ELIGIBLE,
  compile0xSwapMessage,
  evaluateCompiledSolanaSwap,
} from './zerox-solana-validator.mjs';

const AUTH_DOMAIN = Buffer.from('ARKHE:SOLANA-SWAP-AUTH:v1\0');
const RECEIPT_DOMAIN = Buffer.from('ARKHE:ZEROX-DECISION-RECEIPT:v1\0');
export const EXPECTED_RUST_AUTHORITY = 'arkhe-verify-core/solana_swap/v1';

// Deterministic canonical JSON for decision receipts (same safety rules as audit-journal.mjs,
// with 64 KiB string / 256 KiB leaf cap to accommodate real 0x Solana responses with 40+ accounts).
export function canonicalReceiptBytes(value) {
  function ordered(v, depth = 0) {
    if (depth > 16) throw new Error('receipt payload too deep');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string' && v.length <= 65_536) return v;
    if (typeof v === 'number' && Number.isSafeInteger(v)) return v;
    if (Array.isArray(v) && v.length <= 1024) return v.map(x => ordered(x, depth + 1));
    if (v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length <= 64) {
      return Object.fromEntries(Object.keys(v).sort().map(k => [k, ordered(v[k], depth + 1)]));
    }
    throw new Error('unsupported receipt payload');
  }
  const bytes = Buffer.from(JSON.stringify(ordered(value)));
  if (bytes.length > 262_144) throw new Error('receipt payload exceeds 256 KiB');
  return bytes;
}

function asPublicKey(key) {
  if (!key) throw new Error('missing public key');
  if (typeof key === 'string' || Buffer.isBuffer(key)) return createPublicKey(key);
  return key.type === 'public' ? key : createPublicKey(key);
}

export function policyDigest(policy) {
  return blake3Hex(Buffer.concat([Buffer.from('ARKHE:SWAP-POLICY:v1\0'), canonicalBytes(policy)]));
}

export function issueTestAuthorization({
  authId,
  network,
  policy,
  requestBodySha256,
  responseBodySha256,
  compiledMessageSha256,
  compiledMessageBlake3,
  issuedAt,
  ttlSeconds = 60,
  arkheAuthPrivateKey,
}) {
  const payload = {
    schema: 'arkhe-solana-swap-auth/v1',
    mode: 'OFFLINE_TEST_AUTHORIZATION_ONLY',
    authority: EXPECTED_RUST_AUTHORITY,
    authId,
    network,
    verdict: VERDICT_ELIGIBLE,
    policyDigest: policyDigest(policy),
    requestBodySha256,
    responseBodySha256,
    compiledMessageSha256,
    compiledMessageBlake3,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
    kid: keyId(arkheAuthPrivateKey),
  };
  const signingBytes = Buffer.concat([AUTH_DOMAIN, canonicalBytes(payload)]);
  const signature = sign(null, signingBytes, arkheAuthPrivateKey).toString('base64');
  return { payload, signature };
}

export function verifyTestAuthorizationEnvelope(envelope, trustedAuthPublicKey, { nowUnixSeconds }) {
  if (!envelope || typeof envelope !== 'object' || !envelope.payload || typeof envelope.signature !== 'string') {
    return { ok: false, code: 'MISSING_OR_MALFORMED_AUTHORIZATION', detail: 'Authorization envelope missing.' };
  }
  const p = envelope.payload;
  if (p.schema !== 'arkhe-solana-swap-auth/v1' || p.verdict !== VERDICT_ELIGIBLE || p.authority !== EXPECTED_RUST_AUTHORITY) {
    return { ok: false, code: 'NON_ELIGIBLE_AUTHORIZATION', detail: 'Authorization verdict or authority is invalid.' };
  }
  const pub = asPublicKey(trustedAuthPublicKey);
  if (p.kid !== keyId(pub)) {
    return { ok: false, code: 'UNTRUSTED_AUTHORIZATION_KEY', detail: 'Authorization key id does not match pinned Arkhe auth key.' };
  }
  const signingBytes = Buffer.concat([AUTH_DOMAIN, canonicalBytes(p)]);
  const sigBytes = Buffer.from(envelope.signature, 'base64');
  if (sigBytes.length !== 64 || !verify(null, signingBytes, pub, sigBytes)) {
    return { ok: false, code: 'INVALID_AUTHORIZATION_SIGNATURE', detail: 'Authorization Ed25519 signature verification failed.' };
  }
  if (!Number.isSafeInteger(nowUnixSeconds) || nowUnixSeconds < p.issuedAt || nowUnixSeconds > p.expiresAt) {
    return { ok: false, code: 'AUTHORIZATION_EXPIRED_OR_NOT_YET_VALID', detail: 'Authorization timestamp outside validity window.' };
  }
  return { ok: true, code: 'VALID_AUTHORIZATION', detail: 'Authorization signature and validity window verified.' };
}

export class DryRunSigningBoundary {
  constructor({ trustedAuthPublicKey, onTestSignerAccepted = null }) {
    this.trustedAuthPublicKey = asPublicKey(trustedAuthPublicKey);
    this.onTestSignerAccepted = onTestSignerAccepted;
    this.consumedAuthIds = new Set();
    this.testSignerCalls = 0;
    this.realSignaturesProduced = 0;
    this.broadcastCalls = 0;
    this.acceptedMessages = [];
  }

  submitForTestSigning({ compiledMessageBytes, authorization, nowUnixSeconds }) {
    const msgBuf = Buffer.isBuffer(compiledMessageBytes)
      ? compiledMessageBytes
      : Buffer.from(compiledMessageBytes);
    const receivedSha256 = sha256Hex(msgBuf);
    const receivedBlake3 = blake3Hex(msgBuf);

    const reject = (rejectCode, rejectDetail) => ({
      invoked: true,
      accepted: false,
      rejectCode,
      rejectDetail,
      receivedMessageSha256: receivedSha256,
      receivedMessageBlake3: receivedBlake3,
      authorizedMessageSha256: authorization?.payload?.compiledMessageSha256 ?? null,
      exactMessageMatch: false,
      testSignerCalls: this.testSignerCalls,
      realSignaturesProduced: this.realSignaturesProduced,
      broadcastCalls: this.broadcastCalls,
    });

    const authCheck = verifyTestAuthorizationEnvelope(authorization, this.trustedAuthPublicKey, { nowUnixSeconds });
    if (!authCheck.ok) {
      return reject(authCheck.code, authCheck.detail);
    }

    const p = authorization.payload;
    if (this.consumedAuthIds.has(p.authId)) {
      return reject('AUTHORIZATION_ALREADY_CONSUMED', `Authorization ${p.authId} was already consumed (single-use enforced).`);
    }

    // Invariant 3: Exact message hash verification BEFORE invoking the key boundary
    if (receivedSha256 !== p.compiledMessageSha256 || receivedBlake3 !== p.compiledMessageBlake3) {
      return reject(
        'MESSAGE_DIGEST_MISMATCH_AFTER_AUTHORIZATION',
        `Delivered message digest (${receivedSha256}) differs from authorized message digest (${p.compiledMessageSha256}). Key was not called.`
      );
    }

    this.consumedAuthIds.add(p.authId);
    this.testSignerCalls += 1;
    const copy = Buffer.from(msgBuf);
    this.acceptedMessages.push({ authId: p.authId, messageBytes: copy, sha256: receivedSha256, blake3: receivedBlake3 });
    if (this.onTestSignerAccepted) {
      this.onTestSignerAccepted({ authId: p.authId, messageBytes: copy, sha256: receivedSha256, blake3: receivedBlake3 });
    }

    return {
      invoked: true,
      accepted: true,
      rejectCode: null,
      rejectDetail: null,
      receivedMessageSha256: receivedSha256,
      receivedMessageBlake3: receivedBlake3,
      authorizedMessageSha256: p.compiledMessageSha256,
      exactMessageMatch: true,
      testSignerCalls: this.testSignerCalls,
      realSignaturesProduced: this.realSignaturesProduced,
      broadcastCalls: this.broadcastCalls,
    };
  }
}

export function runZeroXAuthorizationCase({
  caseId,
  description,
  provenance = 'test-fixture',
  request,
  response,
  trusted0xKeys,
  nowUnixSeconds,
  max0xAgeSeconds = 60,
  replayStore = null,
  addressLookupTableSnapshots = [],
  payerKey,
  recentBlockhash,
  policy,
  arkheAuthPrivateKey,
  signingBoundary = null,
  extraInstructionsBeforeAuth = [],
  overrideInstructionsBeforeCompile = null,
  overrideAltSnapshotsForEvaluation = null,
  mutateMessageAfterAuth = null,
}) {
  if (provenance !== 'test-fixture' && provenance !== '0x-official') {
    throw new Error(`Invalid provenance: ${provenance}`);
  }
  const boundary = signingBoundary ?? new DryRunSigningBoundary({ trustedAuthPublicKey: arkheAuthPrivateKey });
  const initialSignerCalls = boundary.testSignerCalls;

  const reqBodyBuf = Buffer.isBuffer(request.bodyBytes) ? request.bodyBytes : Buffer.from(request.bodyBytes, 'utf8');
  const resBodyBuf = Buffer.isBuffer(response.bodyBytes) ? response.bodyBytes : Buffer.from(response.bodyBytes, 'utf8');

  // Step 1 (Invariant 1): Verify 0x RFC 9421 Ed25519 response signature, request+response Content-Digest, 60s window, and single-use replay
  const zeroXCheck = verify0xHttpResponse({
    request: { ...request, bodyBytes: reqBodyBuf },
    response: { ...response, bodyBytes: resBodyBuf },
    trustedKeys: trusted0xKeys,
    nowUnixSeconds,
    maxAgeSeconds: max0xAgeSeconds,
    replayStore,
  });

  const baseReceipt = {
    schema: 'arkhe-zerox-decision-receipt/v1',
    caseId,
    description,
    provenance,
    decisionAuthority: EXPECTED_RUST_AUTHORITY,
    clockUnixSeconds: nowUnixSeconds,
    request: {
      method: request.method,
      authority: request.authority,
      path: request.path,
      headers: request.headers,
      bodyBase64: reqBodyBuf.toString('base64'),
      bodySha256: zeroXCheck.requestBodySha256,
    },
    zeroxResponse: {
      status: response.status,
      headers: response.headers,
      bodyBase64: resBodyBuf.toString('base64'),
      bodySha256: zeroXCheck.responseBodySha256,
      verification: zeroXCheck,
    },
    policy: {
      digest: policyDigest(policy),
      spec: policy,
    },
    addressLookupTables: addressLookupTableSnapshots,
  };

  if (!zeroXCheck.ok) {
    return {
      ...baseReceipt,
      verdict: VERDICT_BLOCKED,
      policyVerdict: VERDICT_BLOCKED,
      signingBoundaryOutcome: 'NOT_INVOKED',
      finalOutcome: VERDICT_BLOCKED,
      reasonCode: zeroXCheck.code,
      reasonDetail: zeroXCheck.detail,
      compiledMessage: null,
      verifiedAltSnapshots: [],
      accounting: null,
      instructionAnalysis: [],
      programGuarantees: [],
      violations: [{ code: zeroXCheck.code, detail: zeroXCheck.detail }],
      indeterminateFactors: [],
      authorization: null,
      signingBoundary: {
        invoked: false,
        accepted: false,
        rejectCode: 'NOT_INVOKED_0X_VERIFICATION_FAILED',
        rejectDetail: 'Signing boundary was never invoked because 0x response verification failed.',
        receivedMessageSha256: null,
        receivedMessageBlake3: null,
        authorizedMessageSha256: null,
        exactMessageMatch: false,
        testSignerCallsDelta: boundary.testSignerCalls - initialSignerCalls,
        testSignerCalls: boundary.testSignerCalls,
        realSignaturesProduced: boundary.realSignaturesProduced,
        broadcastCalls: boundary.broadcastCalls,
      },
    };
  }

  // Step 2 (Invariant 2): Compile Solana MessageV0 with @solana/web3.js, then delegate ALL parsing/policy to Rust WASM
  const swapInstructionsPayload = JSON.parse(resBodyBuf.toString('utf8'));
  const compiled = compile0xSwapMessage({
    swapInstructionsPayload,
    addressLookupTableSnapshots,
    payerKey,
    recentBlockhash,
    extraInstructionsBeforeAuth,
    overrideInstructionsBeforeCompile,
  });

  const altSnapshotsForRust = overrideAltSnapshotsForEvaluation
    ? overrideAltSnapshotsForEvaluation(structuredClone(addressLookupTableSnapshots))
    : addressLookupTableSnapshots;

  const evaluation = evaluateCompiledSolanaSwap({
    compiledMessageBytes: compiled.compiledMessageBytes,
    addressLookupTableSnapshots: altSnapshotsForRust,
    swapInstructionsPayload,
    policy,
  });

  if (evaluation.authority !== EXPECTED_RUST_AUTHORITY) {
    throw new Error(`Unexpected evaluation authority: ${evaluation.authority}`);
  }

  const evaluatedReceiptBase = {
    ...baseReceipt,
    addressLookupTables: altSnapshotsForRust,
    verifiedAltSnapshots: evaluation.verifiedAltSnapshots ?? [],
  };

  if (evaluation.verdict !== VERDICT_ELIGIBLE) {
    return {
      ...evaluatedReceiptBase,
      verdict: evaluation.verdict,
      policyVerdict: evaluation.verdict,
      signingBoundaryOutcome: 'NOT_INVOKED',
      finalOutcome: evaluation.verdict,
      reasonCode: evaluation.reasonCode,
      reasonDetail: evaluation.reasonDetail,
      compiledMessage: evaluation.compiledMessage,
      accounting: evaluation.accounting,
      instructionAnalysis: evaluation.instructionAnalysis,
      programGuarantees: evaluation.programGuarantees,
      violations: evaluation.violations,
      indeterminateFactors: evaluation.indeterminateFactors,
      authorization: null,
      signingBoundary: {
        invoked: false,
        accepted: false,
        rejectCode: `NOT_INVOKED_${evaluation.verdict}`,
        rejectDetail: `Signing boundary was never invoked because Rust policy verdict was ${evaluation.verdict}.`,
        receivedMessageSha256: null,
        receivedMessageBlake3: null,
        authorizedMessageSha256: null,
        exactMessageMatch: false,
        testSignerCallsDelta: boundary.testSignerCalls - initialSignerCalls,
        testSignerCalls: boundary.testSignerCalls,
        realSignaturesProduced: boundary.realSignaturesProduced,
        broadcastCalls: boundary.broadcastCalls,
      },
    };
  }

  // Step 3 (Invariant 3): Only ELEGÍVEL produces a single-use signed test authorization bound to Rust-verified digests
  const authorization = issueTestAuthorization({
    authId: `auth-${caseId}-${evaluation.compiledMessage.sha256.slice(0, 16)}`,
    network: policy.network,
    policy,
    requestBodySha256: zeroXCheck.requestBodySha256,
    responseBodySha256: zeroXCheck.responseBodySha256,
    compiledMessageSha256: evaluation.compiledMessage.sha256,
    compiledMessageBlake3: evaluation.compiledMessage.blake3,
    issuedAt: nowUnixSeconds,
    ttlSeconds: 60,
    arkheAuthPrivateKey,
  });

  const deliveredBytes = mutateMessageAfterAuth
    ? Buffer.from(mutateMessageAfterAuth(Buffer.from(compiled.compiledMessageBytes)))
    : compiled.compiledMessageBytes;

  const boundaryResult = boundary.submitForTestSigning({
    compiledMessageBytes: deliveredBytes,
    authorization,
    nowUnixSeconds,
  });

  const signingBoundaryOutcome = boundaryResult.accepted ? 'ACCEPTED_DRY_RUN' : 'REJECTED_AT_BOUNDARY';
  const finalOutcome = boundaryResult.accepted
    ? 'ELEGÍVEL_E_ACEITO_DRY_RUN'
    : 'ELEGÍVEL_MAS_REJEITADO_NA_FRONTEIRA';

  return {
    ...evaluatedReceiptBase,
    verdict: evaluation.verdict,
    policyVerdict: evaluation.verdict,
    signingBoundaryOutcome,
    finalOutcome,
    reasonCode: evaluation.reasonCode,
    reasonDetail: evaluation.reasonDetail,
    compiledMessage: evaluation.compiledMessage,
    accounting: evaluation.accounting,
    instructionAnalysis: evaluation.instructionAnalysis,
    programGuarantees: evaluation.programGuarantees,
    violations: evaluation.violations,
    indeterminateFactors: evaluation.indeterminateFactors,
    authorization,
    signingBoundary: {
      ...boundaryResult,
      testSignerCallsDelta: boundary.testSignerCalls - initialSignerCalls,
    },
  };
}

export function signDecisionReceipt(receipt, arkheReceiptPrivateKey) {
  const payload = { ...receipt, receiptKid: keyId(arkheReceiptPrivateKey) };
  const leafBytes = canonicalReceiptBytes(payload);
  const signingBytes = Buffer.concat([RECEIPT_DOMAIN, leafBytes]);
  const signature = sign(null, signingBytes, arkheReceiptPrivateKey).toString('base64');
  return {
    payload,
    leafDigestBlake3: blake3Hex(leafBytes),
    signature,
  };
}

export function buildPilotReceiptBundle({
  receipts,
  network,
  logId = 'zerox-solana-offline-pilot',
  issuedAt,
  arkheReceiptPrivateKey,
  checkpointPrivateKey,
}) {
  const signedReceipts = receipts.map(r => signDecisionReceipt(r, arkheReceiptPrivateKey));
  const leaves = signedReceipts.map(sr => canonicalReceiptBytes(sr.payload));

  const entries = signedReceipts.map((sr, index) => {
    const mmr = buildProof(leaves, index);
    return {
      index,
      signedReceipt: sr,
      mmrProof: mmr.proof,
    };
  });

  const rootInfo = buildProof(leaves, 0);
  const checkpoint = signCheckpoint(
    {
      network,
      mint: 'zerox-pilot',
      logId,
      sequence: 0,
      leafCount: leaves.length,
      rootHex: rootInfo.rootHex,
      previousDigest: null,
      issuedAt,
      expiresAt: issuedAt + 3600,
    },
    checkpointPrivateKey
  );

  return {
    schema: 'arkhe-zerox-pilot-bundle/v1',
    mode: 'OFFLINE_AUTHORIZATION_PILOT_NO_REAL_SIGNATURES',
    decisionAuthority: EXPECTED_RUST_AUTHORITY,
    network,
    logId,
    leafCount: leaves.length,
    rootHex: rootInfo.rootHex,
    checkpoint,
    entries,
  };
}

export function verifyPilotReceiptBundle(
  bundle,
  {
    trusted0xKeys,
    trustedArkheAuthPublicKey,
    trustedArkheReceiptPublicKey,
    trustedCheckpointPublicKey,
    expectedNetwork,
    checkpointVerificationTime,
  }
) {
  const errors = [];
  if (!bundle || bundle.schema !== 'arkhe-zerox-pilot-bundle/v1') {
    return { ok: false, errors: ['Invalid bundle schema'], caseResults: [] };
  }

  const checkpointOk = verifyCheckpoint(bundle.checkpoint, [asPublicKey(trustedCheckpointPublicKey)], {
    network: expectedNetwork,
    mint: 'zerox-pilot',
    logId: bundle.logId,
    now: checkpointVerificationTime,
    nextSequence: 0,
    minimumLeafCount: bundle.entries.length,
    previousDigest: null,
  });
  if (!checkpointOk) errors.push('Signed MMR checkpoint verification failed.');

  const receiptPub = asPublicKey(trustedArkheReceiptPublicKey);
  const authPub = asPublicKey(trustedArkheAuthPublicKey);
  const expectedReceiptKid = keyId(receiptPub);
  const caseResults = [];

  for (const entry of bundle.entries) {
    const caseErrors = [];
    const sr = entry.signedReceipt;
    const r = sr.payload;
    const leafBytes = canonicalReceiptBytes(r);

    // 1. Verify Arkhe receipt Ed25519 signature
    if (r.receiptKid !== expectedReceiptKid) {
      caseErrors.push(`Receipt key id mismatch for ${r.caseId}.`);
    } else {
      const sigOk = verify(null, Buffer.concat([RECEIPT_DOMAIN, leafBytes]), receiptPub, Buffer.from(sr.signature, 'base64'));
      if (!sigOk) caseErrors.push(`Receipt Ed25519 signature invalid for ${r.caseId}.`);
    }

    // 2. Verify Rust WASM MMR inclusion proof against signed checkpoint root
    const mmrOk = verifyLeaf(leafBytes, entry.mmrProof, bundle.checkpoint.payload.rootHex, bundle.checkpoint.payload.leafCount);
    if (!mmrOk) caseErrors.push(`WASM MMR inclusion proof failed for ${r.caseId}.`);

    // 3. Enforce zero real signatures, zero broadcasts, and explicit provenance
    if (r.signingBoundary.realSignaturesProduced !== 0 || r.signingBoundary.broadcastCalls !== 0) {
      caseErrors.push(`Pilot invariant violated for ${r.caseId}: realSignaturesProduced or broadcastCalls non-zero.`);
    }
    if (r.provenance !== 'test-fixture' && r.provenance !== '0x-official') {
      caseErrors.push(`Receipt ${r.caseId} missing explicit provenance marker.`);
    }

    // 4. Reproduce decision deterministically using RFC 9421 verifier + Rust WASM MessageV0 evaluator
    const reqBodyBuf = Buffer.from(r.request.bodyBase64, 'base64');
    const resBodyBuf = Buffer.from(r.zeroxResponse.bodyBase64, 'base64');
    const repro0x = verify0xHttpResponse({
      request: {
        method: r.request.method,
        authority: r.request.authority,
        path: r.request.path,
        headers: r.request.headers,
        bodyBytes: reqBodyBuf,
      },
      response: {
        status: r.zeroxResponse.status,
        headers: r.zeroxResponse.headers,
        bodyBytes: resBodyBuf,
      },
      trustedKeys: trusted0xKeys,
      nowUnixSeconds: r.clockUnixSeconds,
      replayStore: null,
    });

    if (r.zeroxResponse.verification.code === 'RESPONSE_REPLAY_DETECTED') {
      if (!repro0x.ok) caseErrors.push(`Replay receipt ${r.caseId} did not reproduce valid underlying 0x signature.`);
      if (r.verdict !== VERDICT_BLOCKED || r.authorization !== null) {
        caseErrors.push(`Replay receipt ${r.caseId} must be BLOQUEADO without authorization.`);
      }
    } else if (!repro0x.ok) {
      if (r.verdict !== VERDICT_BLOCKED || r.reasonCode !== repro0x.code || r.authorization !== null) {
        caseErrors.push(`Failed 0x verification receipt ${r.caseId} did not reproduce expected BLOQUEADO verdict.`);
      }
    } else {
      if (!r.compiledMessage || typeof r.compiledMessage.base64 !== 'string') {
        caseErrors.push(`Receipt ${r.caseId} missing compiledMessage.base64.`);
      } else {
        const wireBytes = Buffer.from(r.compiledMessage.base64, 'base64');
        const swapPayload = JSON.parse(resBodyBuf.toString('utf8'));
        const reproEval = evaluateCompiledSolanaSwap({
          compiledMessageBytes: wireBytes,
          addressLookupTableSnapshots: r.addressLookupTables ?? [],
          swapInstructionsPayload: swapPayload,
          policy: r.policy.spec,
        });

        if (reproEval.authority !== EXPECTED_RUST_AUTHORITY) {
          caseErrors.push(`Reproduced authority mismatch for ${r.caseId}.`);
        }
        if (reproEval.compiledMessage.sha256 !== r.compiledMessage.sha256 || reproEval.compiledMessage.blake3 !== r.compiledMessage.blake3) {
          caseErrors.push(`Receipt ${r.caseId} compiledMessage digest mismatch.`);
        }
        if (reproEval.verdict !== r.verdict || reproEval.reasonCode !== r.reasonCode) {
          caseErrors.push(
            `Reproduced verdict (${reproEval.verdict}/${reproEval.reasonCode}) differs from receipt (${r.verdict}/${r.reasonCode}) for ${r.caseId}.`
          );
        }
        if (JSON.stringify(reproEval.accounting) !== JSON.stringify(r.accounting)) {
          caseErrors.push(`Reproduced spend-cap accounting differs from receipt for ${r.caseId}.`);
        }

        if (r.verdict === VERDICT_ELIGIBLE) {
          const authCheck = verifyTestAuthorizationEnvelope(r.authorization, authPub, { nowUnixSeconds: r.clockUnixSeconds });
          if (!authCheck.ok) {
            caseErrors.push(`Eligible receipt ${r.caseId} has invalid authorization envelope: ${authCheck.code}`);
          } else if (r.authorization.payload.compiledMessageSha256 !== r.compiledMessage.sha256) {
            caseErrors.push(`Eligible receipt ${r.caseId} authorization hash does not match compiledMessage.`);
          }
        } else if (r.authorization !== null) {
          caseErrors.push(`Non-eligible receipt ${r.caseId} (${r.verdict}) illegally contains an authorization envelope!`);
        }
      }
    }

    if (caseErrors.length > 0) errors.push(...caseErrors);
    caseResults.push({
      caseId: r.caseId,
      provenance: r.provenance,
      decisionAuthority: r.decisionAuthority,
      policyVerdict: r.policyVerdict ?? r.verdict,
      signingBoundaryOutcome: r.signingBoundaryOutcome,
      signingBoundaryRejectCode: r.signingBoundary.rejectCode,
      finalOutcome: r.finalOutcome,
      verdict: r.verdict,
      reasonCode: r.reasonCode,
      signingBoundaryAccepted: r.signingBoundary.accepted,
      testSignerCallsDelta: r.signingBoundary.testSignerCallsDelta,
      reproducedAndVerified: caseErrors.length === 0,
      errors: caseErrors,
    });
  }

  return {
    ok: errors.length === 0,
    decisionAuthority: bundle.decisionAuthority,
    checkpointVerified: checkpointOk,
    rootHex: bundle.checkpoint.payload.rootHex,
    leafCount: bundle.entries.length,
    errors,
    caseResults,
  };
}
