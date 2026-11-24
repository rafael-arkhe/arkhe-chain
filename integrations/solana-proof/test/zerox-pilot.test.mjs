import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TransactionInstruction } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { SingleUseReplayStore, formatContentDigest } from '../src/zerox-rfc9421.mjs';
import {
  VERDICT_BLOCKED,
  VERDICT_ELIGIBLE,
  VERDICT_INCONCLUSIVE,
  compileSolanaSwapMessageV0Wasm,
  evaluateCompiledSolanaSwap,
  reconcileSolanaSwapConfirmationWasm,
} from '../src/zerox-solana-validator.mjs';
import {
  DryRunSigningBoundary,
  EXPECTED_RUST_AUTHORITY,
  runZeroXAuthorizationCase,
  verifyPilotReceiptBundle,
} from '../src/zerox-pilot.mjs';
import {
  FIXED_0X_CREATED_UNIX,
  FIXED_CLOCK_UNIX,
  createDeterministicPilotFixtures,
  runFullOfflinePilotSuite,
} from '../src/zerox-pilot-cli.mjs';
import {
  DEFAULT_OFFICIAL_CAPTURE_PATH,
  runOfficial0xCaptureSuite,
} from '../src/zerox-evaluate-live-capture.mjs';

test('Caso 1: fixture assinada de teste acima do teto passa na verificação HTTP, bloqueia no núcleo Rust e chama a chave 0 vezes', () => {
  const f = createDeterministicPilotFixtures();
  const boundary = new DryRunSigningBoundary({ trustedAuthPublicKey: f.arkheAuthKey.publicKey });
  const ex = f.makeSigned0xExchange({
    requestObj: { sellToken: f.inputMint.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '250000000', taker: f.taker.toBase58() },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '250000000', minBuyAmount: '240000000' }),
  });

  const receipt = runZeroXAuthorizationCase({
    caseId: 't-above-cap-signed-test-fixture',
    description: 'above cap signed test fixture',
    provenance: 'test-fixture',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  assert.equal(receipt.decisionAuthority, EXPECTED_RUST_AUTHORITY);
  assert.equal(receipt.provenance, 'test-fixture');
  assert.equal(receipt.zeroxResponse.verification.ok, true);
  assert.equal(receipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(receipt.signingBoundaryOutcome, 'NOT_INVOKED');
  assert.equal(receipt.finalOutcome, VERDICT_BLOCKED);
  assert.equal(receipt.reasonCode, 'INPUT_ASSET_CAP_EXCEEDED');
  assert.equal(receipt.authorization, null);
  assert.equal(boundary.testSignerCalls, 0);
  assert.equal(boundary.realSignaturesProduced, 0);
  assert.equal(boundary.broadcastCalls, 0);
});

test('Caso 2: transferência extra inserida antes da autorização (SOL ou SPL) bloqueia no núcleo Rust', () => {
  const f = createDeterministicPilotFixtures();

  for (const [label, extraIx, expectedCode] of [
    ['system-transfer', f.extraUnauthorizedSystemTransfer, 'UNAUTHORIZED_SYSTEM_TRANSFER'],
    ['spl-transfer', f.extraUnauthorizedSplTransfer, 'UNAUTHORIZED_TOKEN_TRANSFER'],
  ]) {
    const boundary = new DryRunSigningBoundary({ trustedAuthPublicKey: f.arkheAuthKey.publicKey });
    const ex = f.makeSigned0xExchange({
      requestObj: { sellToken: f.inputMint.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '80000000', taker: f.taker.toBase58(), label },
      responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96000000' }),
    });

    const receipt = runZeroXAuthorizationCase({
      caseId: `t-extra-${label}`,
      description: `extra ${label}`,
      request: ex.request,
      response: ex.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
      signingBoundary: boundary,
      extraInstructionsBeforeAuth: [extraIx],
    });

    assert.equal(receipt.zeroxResponse.verification.ok, true);
    assert.equal(receipt.policyVerdict, VERDICT_BLOCKED);
    assert.ok(receipt.violations.some(v => v.code === expectedCode), `expected ${expectedCode}`);
    assert.ok(receipt.violations.some(v => v.code === 'LOCAL_ASSEMBLY_DIVERGENCE_FROM_0X_RESPONSE'));
    assert.equal(receipt.authorization, null);
    assert.equal(boundary.testSignerCalls, 0);
  }
});

test('Caso 3: rota com efeitos indetermináveis registra INCONCLUSIVO no núcleo Rust e aponta programa/instrução/contas', () => {
  const f = createDeterministicPilotFixtures();
  const boundary = new DryRunSigningBoundary({ trustedAuthPublicKey: f.arkheAuthKey.publicKey });
  const ex = f.makeSigned0xExchange({
    requestObj: { sellToken: f.inputMint.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '50000000', taker: f.taker.toBase58() },
    responseObj: f.buildOpaqueRouterPayload({ sellAmount: '50000000', minBuyAmount: '96000000' }),
  });

  const receipt = runZeroXAuthorizationCase({
    caseId: 't-inconclusive',
    description: 'opaque router',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  assert.equal(receipt.zeroxResponse.verification.ok, true);
  assert.equal(receipt.policyVerdict, VERDICT_INCONCLUSIVE);
  assert.equal(receipt.finalOutcome, VERDICT_INCONCLUSIVE);
  assert.equal(receipt.authorization, null);
  assert.equal(boundary.testSignerCalls, 0);
  assert.equal(receipt.indeterminateFactors.length, 1);
  assert.equal(receipt.indeterminateFactors[0].programId, f.opaqueRouterProgram.toBase58());
  assert.equal(receipt.indeterminateFactors[0].instructionIndex, 2);
  assert.ok(receipt.indeterminateFactors[0].accounts.includes(f.taker.toBase58()));
});

test('Caso 4: recibo registra ambos os resultados — mensagem original ELEGÍVEL e mensagem alterada REJEITADA na fronteira com 0 chamadas à chave', () => {
  const f = createDeterministicPilotFixtures();
  const boundary = new DryRunSigningBoundary({ trustedAuthPublicKey: f.arkheAuthKey.publicKey });
  const ex = f.makeSigned0xExchange({
    requestObj: { sellToken: f.inputMint.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '75000000', taker: f.taker.toBase58() },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '75000000', minBuyAmount: '96000000' }),
  });

  const receipt = runZeroXAuthorizationCase({
    caseId: 't-tamper-after-auth',
    description: 'tamper after auth',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
    mutateMessageAfterAuth: bytes => {
      const copy = Buffer.from(bytes);
      copy[copy.length - 1] ^= 0xff;
      return copy;
    },
  });

  assert.equal(receipt.policyVerdict, VERDICT_ELIGIBLE);
  assert.equal(receipt.signingBoundaryOutcome, 'REJECTED_AT_BOUNDARY');
  assert.equal(receipt.finalOutcome, 'ELEGÍVEL_MAS_REJEITADO_NA_FRONTEIRA');
  assert.notEqual(receipt.authorization, null);
  assert.equal(receipt.signingBoundary.invoked, true);
  assert.equal(receipt.signingBoundary.accepted, false);
  assert.equal(receipt.signingBoundary.rejectCode, 'MESSAGE_DIGEST_MISMATCH_AFTER_AUTHORIZATION');
  assert.equal(boundary.testSignerCalls, 0);
});

test('Caso 5: rota compreendida com snapshot de ALT atestado entrega mensagem exata ao assinador de teste (uso único, 0 assinaturas reais)', () => {
  const f = createDeterministicPilotFixtures();
  const received = [];
  const boundary = new DryRunSigningBoundary({
    trustedAuthPublicKey: f.arkheAuthKey.publicKey,
    onTestSignerAccepted: item => received.push(item),
  });
  const ex = f.makeSigned0xExchange({
    requestObj: { sellToken: f.inputMint.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '80000000', taker: f.taker.toBase58() },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96500000' }),
  });

  const receipt = runZeroXAuthorizationCase({
    caseId: 't-eligible',
    description: 'covered route',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  assert.equal(receipt.decisionAuthority, EXPECTED_RUST_AUTHORITY);
  assert.equal(receipt.policyVerdict, VERDICT_ELIGIBLE);
  assert.equal(receipt.signingBoundaryOutcome, 'ACCEPTED_DRY_RUN');
  assert.equal(receipt.finalOutcome, 'ELEGÍVEL_E_ACEITO_DRY_RUN');
  assert.equal(receipt.verifiedAltSnapshots.length, 1);
  assert.equal(receipt.verifiedAltSnapshots[0].status, 'VERIFIED');
  assert.ok(receipt.compiledMessage.resolvedAccounts.some(a => a.source === 'alt-writable'));
  assert.ok(receipt.compiledMessage.resolvedAccounts.some(a => a.source === 'alt-readonly'));
  assert.equal(receipt.signingBoundary.accepted, true);
  assert.equal(receipt.signingBoundary.exactMessageMatch, true);
  assert.equal(receipt.signingBoundary.testSignerCalls, 1);
  assert.equal(receipt.signingBoundary.realSignaturesProduced, 0);
  assert.equal(receipt.signingBoundary.broadcastCalls, 0);
  assert.equal(received.length, 1);
  assert.equal(received[0].sha256, receipt.compiledMessage.sha256);

  const replayRes = boundary.submitForTestSigning({
    compiledMessageBytes: Buffer.from(receipt.compiledMessage.base64, 'base64'),
    authorization: receipt.authorization,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
  });
  assert.equal(replayRes.accepted, false);
  assert.equal(replayRes.rejectCode, 'AUTHORIZATION_ALREADY_CONSUMED');
  assert.equal(boundary.testSignerCalls, 1);
});

test('Regressão Rust: resumo/payload dentro dos limites mas bytes reais da MessageV0 com conta de destino diferente bloqueiam com 0 chamadas', () => {
  const f = createDeterministicPilotFixtures();
  const boundary = new DryRunSigningBoundary({ trustedAuthPublicKey: f.arkheAuthKey.publicKey });
  const ex = f.makeSigned0xExchange({
    requestObj: { sellToken: f.inputMint.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '80000000', taker: f.taker.toBase58() },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96500000' }),
  });

  const receipt = runZeroXAuthorizationCase({
    caseId: 't-wire-dest-mismatch',
    description: 'benign summary vs tampered wire destination account',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
    overrideInstructionsBeforeCompile: ixs =>
      ixs.map(ix => {
        if (ix.programId.equals(f.coveredSwapProgram)) {
          const mutatedKeys = ix.keys.map((k, idx) =>
            idx === 2 ? { ...k, pubkey: f.attackerOutputAta } : k
          );
          return new TransactionInstruction({ programId: ix.programId, keys: mutatedKeys, data: ix.data });
        }
        return ix;
      }),
  });

  assert.equal(receipt.zeroxResponse.verification.ok, true);
  assert.equal(receipt.policyVerdict, VERDICT_BLOCKED);
  assert.ok(receipt.violations.some(v => v.code === 'SWAP_PARAMETERS_OUT_OF_POLICY'));
  assert.ok(receipt.violations.some(v => v.code === 'LOCAL_ASSEMBLY_DIVERGENCE_FROM_0X_RESPONSE'));
  assert.equal(receipt.authorization, null);
  assert.equal(boundary.testSignerCalls, 0);
});

test('Auditoria de ALTs: bytes da MessageV0 fixos com índice de ALT trocado -> BLOQUEADO; snapshot sem atestação -> INCONCLUSIVO (0 autorizações)', () => {
  const f = createDeterministicPilotFixtures();
  const boundary = new DryRunSigningBoundary({ trustedAuthPublicKey: f.arkheAuthKey.publicKey });
  const ex = f.makeSigned0xExchange({
    requestObj: { sellToken: f.inputMint.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '80000000', taker: f.taker.toBase58() },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96500000' }),
  });

  // 1. Fixed MessageV0 wire bytes, swapped address at ALT index 3 (outputMint) -> BLOQUEADO
  const swappedAltReceipt = runZeroXAuthorizationCase({
    caseId: 't-alt-index-swapped',
    description: 'fixed wire bytes with swapped address at ALT index',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
    overrideAltSnapshotsForEvaluation: snaps => {
      snaps[0].addresses[3] = f.fakeMint.toBase58();
      return snaps;
    },
  });
  assert.equal(swappedAltReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.ok(swappedAltReceipt.violations.some(v => v.code === 'ALT_SNAPSHOT_ATTESTATION_INVALID'));
  assert.ok(swappedAltReceipt.violations.some(v => v.code === 'SWAP_PARAMETERS_OUT_OF_POLICY'));
  assert.equal(swappedAltReceipt.verifiedAltSnapshots[0].status, VERDICT_BLOCKED);
  assert.equal(swappedAltReceipt.authorization, null);
  assert.equal(boundary.testSignerCalls, 0);

  // 2. Fixed MessageV0 wire bytes, valid addresses, but missing ALT attestation -> INCONCLUSIVO
  const unattestedAltReceipt = runZeroXAuthorizationCase({
    caseId: 't-alt-unattested',
    description: 'fixed wire bytes with unattested ALT snapshot',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
    overrideAltSnapshotsForEvaluation: snaps => {
      snaps[0].attestation = null;
      return snaps;
    },
  });
  assert.equal(unattestedAltReceipt.policyVerdict, VERDICT_INCONCLUSIVE);
  assert.equal(unattestedAltReceipt.reasonCode, 'UNATTESTED_ALT_SNAPSHOT');
  assert.equal(unattestedAltReceipt.verifiedAltSnapshots[0].status, VERDICT_INCONCLUSIVE);
  assert.equal(unattestedAltReceipt.authorization, null);
  assert.equal(boundary.testSignerCalls, 0);

  // Confirm BOTH runs evaluated the exact same fixed compiled MessageV0 wire bytes
  assert.equal(swappedAltReceipt.compiledMessage.sha256, unattestedAltReceipt.compiledMessage.sha256);
});

test('Regressões RFC 9421: corpo da resposta alterado, pedido trocado com digest recalculado, expiração e replay sem envenenamento', () => {
  const f = createDeterministicPilotFixtures();
  const replayStore = new SingleUseReplayStore();
  const boundary = new DryRunSigningBoundary({ trustedAuthPublicKey: f.arkheAuthKey.publicKey });

  const ex = f.makeSigned0xExchange({
    requestObj: { sellToken: f.inputMint.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '80000000', taker: f.taker.toBase58() },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96500000' }),
    created: FIXED_0X_CREATED_UNIX,
  });

  const tamperedResBody = Buffer.from(ex.response.bodyBytes.toString('utf8').replace('96500000', '96500001'), 'utf8');
  const resTamperReceipt = runZeroXAuthorizationCase({
    caseId: 't-res-body-tamper',
    description: 'response body tampered keeping headers and signature',
    request: ex.request,
    response: { ...ex.response, bodyBytes: tamperedResBody },
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_0X_CREATED_UNIX + 10,
    replayStore,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });
  assert.equal(resTamperReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(resTamperReceipt.reasonCode, 'RESPONSE_BODY_DIGEST_MISMATCH');
  assert.equal(boundary.testSignerCalls, 0);

  const swappedReqBody = Buffer.from(
    JSON.stringify({ sellToken: f.inputMint.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '99999999', taker: f.taker.toBase58() }),
    'utf8'
  );
  const reqSwapReceipt = runZeroXAuthorizationCase({
    caseId: 't-req-swapped-digest-recomputed',
    description: 'request swapped and Content-Digest recomputed without matching signature',
    request: {
      ...ex.request,
      headers: { ...ex.request.headers, 'content-digest': formatContentDigest(swappedReqBody) },
      bodyBytes: swappedReqBody,
    },
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_0X_CREATED_UNIX + 12,
    replayStore,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });
  assert.equal(reqSwapReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(reqSwapReceipt.reasonCode, 'INVALID_0X_ED25519_SIGNATURE');
  assert.equal(boundary.testSignerCalls, 0);

  const expiredReceipt = runZeroXAuthorizationCase({
    caseId: 't-expired',
    description: 'expired 61s',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_0X_CREATED_UNIX + 61,
    replayStore,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });
  assert.equal(expiredReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(expiredReceipt.reasonCode, 'RESPONSE_SIGNATURE_EXPIRED');
  assert.equal(boundary.testSignerCalls, 0);

  const firstValid = runZeroXAuthorizationCase({
    caseId: 't-first-valid-after-attacks',
    description: 'first valid use proves replay store only records authenticated responses',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_0X_CREATED_UNIX + 20,
    replayStore,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });
  assert.equal(firstValid.policyVerdict, VERDICT_ELIGIBLE);
  assert.equal(boundary.testSignerCalls, 1);

  const replayUse = runZeroXAuthorizationCase({
    caseId: 't-replay-use',
    description: 'replayed within 60s',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_0X_CREATED_UNIX + 25,
    replayStore,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: f.basePolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });
  assert.equal(replayUse.policyVerdict, VERDICT_BLOCKED);
  assert.equal(replayUse.reasonCode, 'RESPONSE_REPLAY_DETECTED');
  assert.equal(boundary.testSignerCalls, 1);
});

test('Ambiguidade 1 fechada no núcleo Rust: quando o ativo de entrada é SOL, o teto total em SOL cobre principal + taxas/criação de conta', () => {
  const f = createDeterministicPilotFixtures();
  const solPolicy = {
    ...f.basePolicy,
    inputMint: NATIVE_MINT.toBase58(),
    takerInputTokenAccount: f.takerWsolAta.toBase58(),
    maxInputAssetDebit: '100000000',
    maxSolAncillaryDebit: '5000000',
    maxTotalSolDebit: '102000000',
  };

  const ex = f.makeSigned0xExchange({
    requestObj: { sellToken: NATIVE_MINT.toBase58(), buyToken: f.outputMint.toBase58(), sellAmount: '100000000', taker: f.taker.toBase58() },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '100000000', minBuyAmount: '96000000', useSolInput: true }),
  });

  const boundary = new DryRunSigningBoundary({ trustedAuthPublicKey: f.arkheAuthKey.publicKey });
  const blockedReceipt = runZeroXAuthorizationCase({
    caseId: 't-sol-total-cap-exceeded',
    description: 'SOL principal + ancillary exceeds total SOL cap',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: solPolicy,
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  assert.equal(blockedReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(blockedReceipt.reasonCode, 'TOTAL_SOL_CAP_EXCEEDED');
  assert.equal(boundary.testSignerCalls, 0);

  const okReceipt = runZeroXAuthorizationCase({
    caseId: 't-sol-total-cap-ok',
    description: 'SOL principal + ancillary within total SOL cap',
    request: ex.request,
    response: ex.response,
    trusted0xKeys: f.trusted0xKeys,
    nowUnixSeconds: FIXED_CLOCK_UNIX,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    payerKey: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    policy: { ...solPolicy, maxTotalSolDebit: '105000000' },
    arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    signingBoundary: boundary,
  });

  assert.equal(okReceipt.policyVerdict, VERDICT_ELIGIBLE);
  assert.equal(okReceipt.signingBoundary.accepted, true);
  assert.equal(boundary.testSignerCalls, 1);
});

test('Entregável: suíte completa gera 12 recibos assinados em MMR reproduzíveis offline via autoridade Rust WASM (e detecta adulteração)', () => {
  const { bundle, trust } = runFullOfflinePilotSuite();
  const verification = verifyPilotReceiptBundle(bundle, {
    trusted0xKeys: trust.trusted0xKeysPem,
    trustedArkheAuthPublicKey: trust.trustedArkheAuthPublicKeyPem,
    trustedArkheReceiptPublicKey: trust.trustedArkheReceiptPublicKeyPem,
    trustedCheckpointPublicKey: trust.trustedCheckpointPublicKeyPem,
    expectedNetwork: trust.network,
    checkpointVerificationTime: trust.checkpointVerificationTime,
  });

  assert.equal(verification.ok, true, `Unexpected errors: ${verification.errors.join('; ')}`);
  assert.equal(verification.decisionAuthority, EXPECTED_RUST_AUTHORITY);
  assert.equal(verification.checkpointVerified, true);
  assert.equal(verification.leafCount, 12);
  assert.ok(verification.caseResults.every(c => c.reproducedAndVerified && c.provenance === 'test-fixture'));

  const byId = Object.fromEntries(verification.caseResults.map(c => [c.caseId, c]));
  assert.equal(byId['case-1-above-cap-signed-test-fixture'].finalOutcome, VERDICT_BLOCKED);
  assert.equal(byId['case-2-extra-transfer-before-auth'].finalOutcome, VERDICT_BLOCKED);
  assert.equal(byId['case-3-opaque-route-inconclusive'].finalOutcome, VERDICT_INCONCLUSIVE);
  assert.equal(byId['case-4-message-mutated-after-auth'].policyVerdict, VERDICT_ELIGIBLE);
  assert.equal(byId['case-4-message-mutated-after-auth'].signingBoundaryOutcome, 'REJECTED_AT_BOUNDARY');
  assert.equal(byId['case-4-message-mutated-after-auth'].finalOutcome, 'ELEGÍVEL_MAS_REJEITADO_NA_FRONTEIRA');
  assert.equal(byId['case-4-message-mutated-after-auth'].testSignerCallsDelta, 0);
  assert.equal(byId['case-5-covered-route-eligible'].finalOutcome, 'ELEGÍVEL_E_ACEITO_DRY_RUN');
  assert.equal(byId['case-5-covered-route-eligible'].testSignerCallsDelta, 1);
  assert.equal(byId['case-6-wire-destination-mismatch'].finalOutcome, VERDICT_BLOCKED);
  assert.equal(byId['case-7-response-body-tampered'].finalOutcome, VERDICT_BLOCKED);
  assert.equal(byId['case-8-request-swapped-digest-recomputed'].finalOutcome, VERDICT_BLOCKED);
  assert.equal(byId['case-9-signature-expired'].finalOutcome, VERDICT_BLOCKED);
  assert.equal(byId['case-10-response-replay'].finalOutcome, VERDICT_BLOCKED);
  assert.equal(byId['case-11-alt-snapshot-index-swapped-blocked'].finalOutcome, VERDICT_BLOCKED);
  assert.equal(byId['case-11-alt-snapshot-index-swapped-blocked'].testSignerCallsDelta, 0);
  assert.equal(byId['case-12-alt-snapshot-unattested-inconclusive'].finalOutcome, VERDICT_INCONCLUSIVE);
  assert.equal(byId['case-12-alt-snapshot-unattested-inconclusive'].testSignerCallsDelta, 0);

  const tampered = structuredClone(bundle);
  tampered.entries[0].signedReceipt.payload.verdict = VERDICT_ELIGIBLE;
  const badVerification = verifyPilotReceiptBundle(tampered, {
    trusted0xKeys: trust.trusted0xKeysPem,
    trustedArkheAuthPublicKey: trust.trustedArkheAuthPublicKeyPem,
    trustedArkheReceiptPublicKey: trust.trustedArkheReceiptPublicKeyPem,
    trustedCheckpointPublicKey: trust.trustedCheckpointPublicKeyPem,
    expectedNetwork: trust.network,
    checkpointVerificationTime: trust.checkpointVerificationTime,
  });
  assert.equal(badVerification.ok, false);
});

test('Proveniência oficial 0x (fixture sanitizada): assinatura Ed25519 oficial passa, núcleo Rust bloqueia e 4 regressões negativas falham sem chamar chave', () => {
  const rawFixture = readFileSync(DEFAULT_OFFICIAL_CAPTURE_PATH, 'utf8');
  assert.equal(/0x-api-key/i.test(rawFixture), false, 'versioned fixture must never contain 0x-api-key');

  const {
    mainReceipt,
    replayReceipt,
    expiredReceipt,
    swappedReqReceipt,
    alteredResReceipt,
    bundle,
    trust,
    verification,
    boundary,
  } = runOfficial0xCaptureSuite();

  // 1. Official 0x RFC 9421 signature verified against 0x-signing-key-prod-24092026
  assert.equal(mainReceipt.provenance, '0x-official');
  assert.equal(mainReceipt.decisionAuthority, EXPECTED_RUST_AUTHORITY);
  assert.equal(mainReceipt.zeroxResponse.verification.ok, true);
  assert.equal(mainReceipt.zeroxResponse.verification.code, 'VALID_0X_SIGNATURE');
  assert.equal(mainReceipt.zeroxResponse.verification.keyId, '0x-signing-key-prod-24092026');

  // 2. Rust WASM authority blocks real third-party ATA creation and flags Settler + missing ALTs
  assert.equal(mainReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(mainReceipt.finalOutcome, VERDICT_BLOCKED);
  assert.equal(mainReceipt.reasonCode, 'UNAUTHORIZED_ATA_CREATION');
  assert.ok(mainReceipt.violations.some(v => v.code === 'UNAUTHORIZED_ATA_CREATION' && v.instructionIndex === 1));
  assert.ok(mainReceipt.violations.some(v => v.code === 'INPUT_ASSET_CAP_EXCEEDED'));
  assert.equal(mainReceipt.instructionAnalysis[2].kind, 'ZeroXSettler.UnverifiedCpiRoute');
  assert.equal(mainReceipt.instructionAnalysis[2].zidHex, '0x2aa3c060be30ef0ae6d00945');
  assert.equal(mainReceipt.instructionAnalysis[2].declaredAmountIn, '100000000');
  assert.equal(mainReceipt.instructionAnalysis[2].declaredMinAmountOut, '7217315');
  assert.equal(mainReceipt.instructionAnalysis[2].cpiAuditStatus, 'UNVERIFIED_EXTERNAL_CPI');
  assert.ok(
    mainReceipt.indeterminateFactors.some(
      f => f.code === 'UNINTERPRETED_PROGRAM' && f.programId === 'Sett1erwx2eqT5A8uvu8GBxDFT2W5TNnhirL7hLmb8m'
    )
  );
  assert.equal(
    mainReceipt.indeterminateFactors.filter(f => f.code === 'MISSING_ADDRESS_LOOKUP_TABLE').length,
    2
  );
  assert.equal(mainReceipt.authorization, null);

  // 3. All 4 negative RFC 9421 checks pass directly on the official 0x signature
  assert.equal(replayReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(replayReceipt.reasonCode, 'RESPONSE_REPLAY_DETECTED');
  assert.equal(expiredReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(expiredReceipt.reasonCode, 'RESPONSE_SIGNATURE_EXPIRED');
  assert.equal(swappedReqReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(swappedReqReceipt.reasonCode, 'INVALID_0X_ED25519_SIGNATURE');
  assert.equal(alteredResReceipt.policyVerdict, VERDICT_BLOCKED);
  assert.equal(alteredResReceipt.reasonCode, 'RESPONSE_BODY_DIGEST_MISMATCH');

  // 4. Zero calls to signing key, zero real signatures, zero broadcasts
  assert.equal(boundary.testSignerCalls, 0);
  assert.equal(boundary.realSignaturesProduced, 0);
  assert.equal(boundary.broadcastCalls, 0);

  // 5. Full signed MMR bundle of the 5 official-0x receipts verifies offline via Rust WASM and detects tampering
  assert.equal(verification.ok, true, `Unexpected errors: ${verification.errors.join('; ')}`);
  assert.equal(verification.leafCount, 5);
  assert.ok(verification.caseResults.every(c => c.reproducedAndVerified && c.provenance === '0x-official'));

  const tampered = structuredClone(bundle);
  tampered.entries[0].signedReceipt.payload.reasonCode = 'TAMPERED';
  const tamperedCheck = verifyPilotReceiptBundle(tampered, trust);
  assert.equal(tamperedCheck.ok, false);
});

test('WASM exports: compilador MessageV0 puro em Rust + reconciliação on-chain (Evidência #3)', () => {
  const f = createDeterministicPilotFixtures();
  const payload = f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96000000' });

  // 1. Compile MessageV0 natively in Rust WASM (with ALT compression)
  const compiled = compileSolanaSwapMessageV0Wasm({
    payer: f.taker.toBase58(),
    recentBlockhash: f.recentBlockhash,
    swapInstructionsPayload: payload,
    addressLookupTables: f.addressLookupTableSnapshots,
  });
  assert.equal(compiled.altLookupCount, 1);
  const wireBytes = Buffer.from(compiled.compiledMessageBase64, 'base64');
  assert.equal(wireBytes[0], 0x80);

  // 2. Roundtrip into Rust WASM evaluator -> ELEGÍVEL
  const evalResult = evaluateCompiledSolanaSwap({
    compiledMessageBytes: wireBytes,
    addressLookupTableSnapshots: f.addressLookupTableSnapshots,
    swapInstructionsPayload: payload,
    policy: f.basePolicy,
  });
  assert.equal(evalResult.verdict, VERDICT_ELIGIBLE);
  assert.equal(evalResult.compiledMessage.sha256, compiled.sha256);
  assert.equal(evalResult.compiledMessage.blake3, compiled.blake3);

  // 3. Evidence #3 via Rust WASM reconciler: CONFIRMED_WITHIN_POLICY, CONFIRMED_POLICY_BREACH, MESSAGE_MISMATCH
  const baseEvidence = {
    network: f.basePolicy.network,
    signature: '5NodeWasmReconcileTestSig111111111111111111111111111111111111111111',
    slot: 310000077,
    blockTime: FIXED_CLOCK_UNIX + 5,
    confirmationStatus: 'finalized',
    err: null,
    compiledMessageBase64: compiled.compiledMessageBase64,
    accountKeys: [
      f.basePolicy.taker,
      f.basePolicy.takerInputTokenAccount,
      f.basePolicy.authorizedDestinationTokenAccount,
    ],
    feeLamports: 5000,
    preBalances: [1000000000, 2039280, 2039280],
    postBalances: [999995000, 2039280, 2039280],
    preTokenBalances: [
      { accountIndex: 1, mint: f.basePolicy.inputMint, owner: f.basePolicy.taker, amount: '200000000' },
      { accountIndex: 2, mint: f.basePolicy.outputMint, owner: f.basePolicy.authorizedRecipient, amount: '10000000' },
    ],
    postTokenBalances: [
      { accountIndex: 1, mint: f.basePolicy.inputMint, owner: f.basePolicy.taker, amount: '120000000' },
      { accountIndex: 2, mint: f.basePolicy.outputMint, owner: f.basePolicy.authorizedRecipient, amount: '108000000' },
    ],
  };

  const ok = reconcileSolanaSwapConfirmationWasm({
    policy: f.basePolicy,
    authorizedSha256: compiled.sha256,
    authorizedBlake3: compiled.blake3,
    evidence: baseEvidence,
  });
  assert.equal(ok.status, 'CONFIRMED_WITHIN_POLICY');
  assert.equal(ok.exactMessageMatch, true);
  assert.equal(ok.actualInputAssetDebit, '80000000');
  assert.equal(ok.actualOutputNetCredit, '98000000');

  const breachEvidence = structuredClone(baseEvidence);
  breachEvidence.postTokenBalances[1].amount = '50000000'; // only +40M < 95M min
  const breach = reconcileSolanaSwapConfirmationWasm({
    policy: f.basePolicy,
    authorizedSha256: compiled.sha256,
    authorizedBlake3: compiled.blake3,
    evidence: breachEvidence,
  });
  assert.equal(breach.status, 'CONFIRMED_POLICY_BREACH');
  assert.equal(breach.reasonCode, 'ACTUAL_OUTPUT_CREDIT_BELOW_MIN');

  const mismatchEvidence = structuredClone(baseEvidence);
  const badBytes = Buffer.from(wireBytes);
  badBytes[badBytes.length - 1] ^= 0x01;
  mismatchEvidence.compiledMessageBase64 = badBytes.toString('base64');
  const mismatch = reconcileSolanaSwapConfirmationWasm({
    policy: f.basePolicy,
    authorizedSha256: compiled.sha256,
    authorizedBlake3: compiled.blake3,
    evidence: mismatchEvidence,
  });
  assert.equal(mismatch.status, 'MESSAGE_MISMATCH');
  assert.equal(mismatch.exactMessageMatch, false);
});
