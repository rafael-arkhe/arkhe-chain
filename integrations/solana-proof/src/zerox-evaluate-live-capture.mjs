// Offline evaluator for the versioned, sanitized official 0x POST /solana/swap-instructions capture
// (`fixtures/zerox-official-solana-swap-instructions.json`). Runs 100% offline with zero network calls,
// zero signing, and zero broadcasts, exercising the real official 0x Ed25519 signature, the Rust WASM
// MessageV0 policy authority, and signed MMR receipt bundle verification.

import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { SingleUseReplayStore, formatContentDigest } from './zerox-rfc9421.mjs';
import {
  DryRunSigningBoundary,
  buildPilotReceiptBundle,
  runZeroXAuthorizationCase,
  verifyPilotReceiptBundle,
} from './zerox-pilot.mjs';
import { OFFICIAL_0X_JWKS } from './zerox-shadow-probe.mjs';
import { MAINNET_GENESIS_HASH } from './zerox-pilot-cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OFFICIAL_CAPTURE_PATH = resolve(
  HERE,
  '../fixtures/zerox-official-solana-swap-instructions.json'
);

export function runOfficial0xCaptureSuite(capturePath = DEFAULT_OFFICIAL_CAPTURE_PATH) {
  const capture = JSON.parse(readFileSync(capturePath, 'utf8'));

  const reqBodyBytes = Buffer.from(capture.request.bodyBase64, 'base64');
  const resBodyBytes = Buffer.from(capture.response.bodyBase64, 'base64');
  const reqObj = capture.request.bodyObj;
  const taker = new PublicKey(reqObj.taker);
  const inputMint = new PublicKey(reqObj.token_in);
  const outputMint = new PublicKey(reqObj.token_out);

  const takerInputAta = getAssociatedTokenAddressSync(
    inputMint,
    taker,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const takerOutputAta = getAssociatedTokenAddressSync(
    outputMint,
    taker,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const policy = {
    policyId: 'arkhe-agent-live-0x-shadow-policy-v1',
    network: 'solana-mainnet-beta',
    genesisHash: MAINNET_GENESIS_HASH,
    taker: taker.toBase58(),
    takerInputTokenAccount: takerInputAta.toBase58(),
    authorizedRecipient: taker.toBase58(),
    authorizedDestinationTokenAccount: takerOutputAta.toBase58(),
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    maxInputAssetDebit: '50000000', // 0.05 SOL cap (below live 0.1 SOL request)
    maxSolAncillaryDebit: '3000000',
    maxTotalSolDebit: '53000000',
    minOutputNetCredit: '7000000',
    trustedAltAttesterKeys: {},
    coveredSwapPrograms: {},
  };

  const arkheAuthKey = generateKeyPairSync('ed25519');
  const arkheReceiptKey = generateKeyPairSync('ed25519');
  const checkpointKey = generateKeyPairSync('ed25519');
  const recentBlockhash = bs58.encode(Buffer.alloc(32, 77));
  const replayStore = new SingleUseReplayStore();
  const boundary = new DryRunSigningBoundary({ trustedAuthPublicKey: arkheAuthKey.publicKey });

  const request = { ...capture.request, bodyBytes: reqBodyBytes };
  const response = { ...capture.response, bodyBytes: resBodyBytes };
  const evalClock = capture.verification.created + 5;

  const mainReceipt = runZeroXAuthorizationCase({
    caseId: 'official-0x-route-eval',
    description: 'Resposta real assinada oficialmente pela 0x (0.1 SOL -> USDC) avaliada pelo núcleo Rust WASM',
    provenance: '0x-official',
    request,
    response,
    trusted0xKeys: OFFICIAL_0X_JWKS,
    nowUnixSeconds: evalClock,
    replayStore,
    addressLookupTableSnapshots: [],
    payerKey: taker.toBase58(),
    recentBlockhash,
    policy,
    arkheAuthPrivateKey: arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  const replayReceipt = runZeroXAuthorizationCase({
    caseId: 'official-0x-replay',
    description: 'Reapresentação da resposta real oficial da 0x dentro da janela de 60s',
    provenance: '0x-official',
    request,
    response,
    trusted0xKeys: OFFICIAL_0X_JWKS,
    nowUnixSeconds: evalClock + 5,
    replayStore,
    addressLookupTableSnapshots: [],
    payerKey: taker.toBase58(),
    recentBlockhash,
    policy,
    arkheAuthPrivateKey: arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  const expiredReceipt = runZeroXAuthorizationCase({
    caseId: 'official-0x-expired',
    description: 'Resposta real oficial da 0x com relógio avançado em 61s',
    provenance: '0x-official',
    request,
    response,
    trusted0xKeys: OFFICIAL_0X_JWKS,
    nowUnixSeconds: capture.verification.created + 61,
    replayStore: new SingleUseReplayStore(),
    addressLookupTableSnapshots: [],
    payerKey: taker.toBase58(),
    recentBlockhash,
    policy,
    arkheAuthPrivateKey: arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  const swappedBody = Buffer.from(JSON.stringify({ ...reqObj, amount_in: 50_000_000 }), 'utf8');
  const swappedReqReceipt = runZeroXAuthorizationCase({
    caseId: 'official-0x-request-swapped',
    description: 'Pedido alterado (0.05 SOL) com Content-Digest recalculado contra resposta oficial da 0x (0.1 SOL)',
    provenance: '0x-official',
    request: {
      ...request,
      headers: { ...request.headers, 'content-digest': formatContentDigest(swappedBody) },
      bodyBytes: swappedBody,
    },
    response,
    trusted0xKeys: OFFICIAL_0X_JWKS,
    nowUnixSeconds: evalClock,
    replayStore: new SingleUseReplayStore(),
    addressLookupTableSnapshots: [],
    payerKey: taker.toBase58(),
    recentBlockhash,
    policy,
    arkheAuthPrivateKey: arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  const alteredResBody = Buffer.from(resBodyBytes);
  alteredResBody[alteredResBody.length - 2] ^= 0x01;
  const alteredResReceipt = runZeroXAuthorizationCase({
    caseId: 'official-0x-response-tampered',
    description: 'Corpo da resposta real oficial da 0x alterado em 1 byte mantendo cabeçalhos e assinatura',
    provenance: '0x-official',
    request,
    response: { ...response, bodyBytes: alteredResBody },
    trusted0xKeys: OFFICIAL_0X_JWKS,
    nowUnixSeconds: evalClock,
    replayStore: new SingleUseReplayStore(),
    addressLookupTableSnapshots: [],
    payerKey: taker.toBase58(),
    recentBlockhash,
    policy,
    arkheAuthPrivateKey: arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  const receipts = [
    mainReceipt,
    replayReceipt,
    expiredReceipt,
    swappedReqReceipt,
    alteredResReceipt,
  ];

  const bundle = buildPilotReceiptBundle({
    receipts,
    network: policy.network,
    logId: 'zerox-solana-official-capture-regression',
    issuedAt: evalClock,
    arkheReceiptPrivateKey: arkheReceiptKey.privateKey,
    checkpointPrivateKey: checkpointKey.privateKey,
  });

  const trust = {
    trusted0xKeys: OFFICIAL_0X_JWKS,
    trustedArkheAuthPublicKey: arkheAuthKey.publicKey,
    trustedArkheReceiptPublicKey: arkheReceiptKey.publicKey,
    trustedCheckpointPublicKey: checkpointKey.publicKey,
    expectedNetwork: policy.network,
    checkpointVerificationTime: evalClock,
  };

  const verification = verifyPilotReceiptBundle(bundle, trust);

  return {
    capture,
    receipts,
    mainReceipt,
    replayReceipt,
    expiredReceipt,
    swappedReqReceipt,
    alteredResReceipt,
    bundle,
    trust,
    verification,
    boundary,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const capturePath = process.argv[2] ?? DEFAULT_OFFICIAL_CAPTURE_PATH;
  const { mainReceipt, bundle, verification, boundary } = runOfficial0xCaptureSuite(capturePath);
  console.log(
    JSON.stringify(
      {
        capturePath,
        captureProvenance: '0x-official',
        zeroXKeyId: mainReceipt.zeroxResponse.verification.keyId,
        decisionAuthority: mainReceipt.decisionAuthority,
        mmrRootHex: bundle.rootHex,
        leafCount: bundle.leafCount,
        offlineBundleVerified: verification.ok,
        totalKeyCallsAcrossAllOfficialCases: boundary.testSignerCalls,
        realSignaturesProduced: boundary.realSignaturesProduced,
        broadcastCalls: boundary.broadcastCalls,
        liveEvaluation: {
          httpSignatureValid: mainReceipt.zeroxResponse.verification.ok,
          httpSignatureCode: mainReceipt.zeroxResponse.verification.code,
          policyVerdict: mainReceipt.policyVerdict,
          finalOutcome: mainReceipt.finalOutcome,
          reasonCode: mainReceipt.reasonCode,
          violations: mainReceipt.violations,
          indeterminateFactors: mainReceipt.indeterminateFactors.map(f => ({
            code: f.code,
            instructionIndex: f.instructionIndex,
            programId: f.programId,
            accountCount: f.accounts.length,
          })),
          compiledMessageSha256: mainReceipt.compiledMessage?.sha256,
          authorizationIssued: mainReceipt.authorization !== null,
        },
        cases: verification.caseResults,
      },
      null,
      2
    )
  );
  if (!verification.ok) process.exitCode = 1;
}
