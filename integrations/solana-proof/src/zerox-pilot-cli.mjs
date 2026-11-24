// CLI runner and shared deterministic offline scenario builder for the Arkhe x 0x Solana Swap Pilot.
// Node/JS (@solana/web3.js) compiles MessageV0 bytes; Rust (`arkhe-verify-wasm`) is the SOLE
// authority that verifies ALT snapshot attestations, parses MessageV0 wire bytes, resolves ALTs,
// evaluates policy, and verifies MMR receipts. Zero real transaction signatures and zero broadcasts.

import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ComputeBudgetProgram,
  Keypair,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import {
  SingleUseReplayStore,
  formatContentDigest,
  sign0xHttpResponse,
} from './zerox-rfc9421.mjs';
import {
  attestAltSnapshot,
  encodeCoveredSwapInstructionData,
  serializeInstructionFor0x,
} from './zerox-solana-validator.mjs';
import {
  DryRunSigningBoundary,
  buildPilotReceiptBundle,
  runZeroXAuthorizationCase,
  verifyPilotReceiptBundle,
} from './zerox-pilot.mjs';

export const FIXED_CLOCK_UNIX = 1_760_000_030;
export const FIXED_0X_CREATED_UNIX = 1_760_000_000;
export const FIXED_ALT_SNAPSHOT_SLOT = 310_000_000;
export const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const COVERED_SWAP_DISCRIMINATOR_HEX = 'a1b2c3d4e5f60708';

function deterministicKeypair(seedByte) {
  return Keypair.fromSeed(Buffer.alloc(32, seedByte));
}

export function createDeterministicPilotFixtures() {
  const taker = deterministicKeypair(11).publicKey;
  const authorizedRecipient = deterministicKeypair(12).publicKey;
  const attacker = deterministicKeypair(13).publicKey;
  const inputMint = deterministicKeypair(21).publicKey;
  const outputMint = deterministicKeypair(22).publicKey;
  const fakeMint = deterministicKeypair(29).publicKey;
  const coveredSwapProgram = deterministicKeypair(31).publicKey;
  const opaqueRouterProgram = deterministicKeypair(32).publicKey;
  const poolVaultIn = deterministicKeypair(41).publicKey;
  const poolVaultOut = deterministicKeypair(42).publicKey;
  const altAddress = deterministicKeypair(51).publicKey;
  const recentBlockhash = bs58.encode(Buffer.alloc(32, 77));

  const takerInputAta = getAssociatedTokenAddressSync(inputMint, taker, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const recipientOutputAta = getAssociatedTokenAddressSync(outputMint, authorizedRecipient, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const attackerInputAta = getAssociatedTokenAddressSync(inputMint, attacker, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const attackerOutputAta = getAssociatedTokenAddressSync(outputMint, attacker, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const takerWsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, taker, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const zeroXKey = generateKeyPairSync('ed25519');
  const altAttesterKey = generateKeyPairSync('ed25519');
  const arkheAuthKey = generateKeyPairSync('ed25519');
  const arkheReceiptKey = generateKeyPairSync('ed25519');
  const checkpointKey = generateKeyPairSync('ed25519');
  const zeroXKeyId = '0x-solana-ed25519-test-fixture-key-1';
  const altAttesterKeyId = 'arkhe-alt-observer-test-fixture-key-1';
  const altAttesterPubHex = altAttesterKey.publicKey
    .export({ type: 'spki', format: 'der' })
    .subarray(-32)
    .toString('hex');

  const addressLookupTableSnapshots = [
    attestAltSnapshot({
      network: 'solana-mainnet-beta',
      genesisHash: MAINNET_GENESIS_HASH,
      key: altAddress.toBase58(),
      slot: FIXED_ALT_SNAPSHOT_SLOT,
      addresses: [
        poolVaultIn.toBase58(),
        poolVaultOut.toBase58(),
        inputMint.toBase58(),
        outputMint.toBase58(),
        TOKEN_PROGRAM_ID.toBase58(),
      ],
      attesterPrivateKey: altAttesterKey.privateKey,
      attesterKeyId: altAttesterKeyId,
    }),
  ];

  const basePolicy = {
    policyId: 'arkhe-agent-solana-swap-pilot-v1',
    network: 'solana-mainnet-beta',
    genesisHash: MAINNET_GENESIS_HASH,
    taker: taker.toBase58(),
    takerInputTokenAccount: takerInputAta.toBase58(),
    authorizedRecipient: authorizedRecipient.toBase58(),
    authorizedDestinationTokenAccount: recipientOutputAta.toBase58(),
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    maxInputAssetDebit: '100000000',
    maxSolAncillaryDebit: '3000000',
    maxTotalSolDebit: null,
    minOutputNetCredit: '95000000',
    trustedAltAttesterKeys: {
      [altAttesterKeyId]: altAttesterPubHex,
    },
    coveredSwapPrograms: {
      [coveredSwapProgram.toBase58()]: {
        name: 'CoveredDirectAmmV1',
        discriminatorHex: COVERED_SWAP_DISCRIMINATOR_HEX,
        guarantees: [
          'Programa on-chain debita no máximo amountIn da conta sourceTokenAccount do taker.',
          'Programa on-chain impõe crédito líquido mínimo >= minAmountOut na destinationTokenAccount antes de concluir.',
          'Instrução não executa CPI para programas arbitrários fora do SPL Token Program fixado.',
        ],
      },
    },
  };

  function buildCoveredSwapPayload({
    sellAmount,
    minBuyAmount,
    useSolInput = false,
    cuLimit = 200_000,
    cuPriceMicroLamports = 100_000,
    includeAtaCreate = true,
  }) {
    const activeInputMint = useSolInput ? NATIVE_MINT : inputMint;
    const activeSourceAta = useSolInput ? takerWsolAta : takerInputAta;

    const ixs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPriceMicroLamports }),
    ];

    if (useSolInput) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(taker, takerWsolAta, taker, NATIVE_MINT),
        SystemProgram.transfer({ fromPubkey: taker, toPubkey: takerWsolAta, lamports: BigInt(sellAmount) }),
        createSyncNativeInstruction(takerWsolAta)
      );
    }

    if (includeAtaCreate) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          taker,
          recipientOutputAta,
          authorizedRecipient,
          outputMint
        )
      );
    }

    ixs.push(
      new TransactionInstruction({
        programId: coveredSwapProgram,
        keys: [
          { pubkey: taker, isSigner: true, isWritable: true },
          { pubkey: activeSourceAta, isSigner: false, isWritable: true },
          { pubkey: recipientOutputAta, isSigner: false, isWritable: true },
          { pubkey: activeInputMint, isSigner: false, isWritable: false },
          { pubkey: outputMint, isSigner: false, isWritable: false },
          { pubkey: poolVaultIn, isSigner: false, isWritable: true },
          { pubkey: poolVaultOut, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: encodeCoveredSwapInstructionData(COVERED_SWAP_DISCRIMINATOR_HEX, sellAmount, minBuyAmount),
      })
    );

    if (useSolInput) {
      ixs.push(createCloseAccountInstruction(takerWsolAta, taker, taker));
    }

    return {
      network: 'solana-mainnet-beta',
      genesisHash: MAINNET_GENESIS_HASH,
      sellToken: activeInputMint.toBase58(),
      buyToken: outputMint.toBase58(),
      sellAmount: String(sellAmount),
      minBuyAmount: String(minBuyAmount),
      taker: taker.toBase58(),
      addressLookupTableAddresses: [altAddress.toBase58()],
      instructions: ixs.map(serializeInstructionFor0x),
    };
  }

  function buildOpaqueRouterPayload({ sellAmount, minBuyAmount }) {
    const ixs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      new TransactionInstruction({
        programId: opaqueRouterProgram,
        keys: [
          { pubkey: taker, isSigner: true, isWritable: true },
          { pubkey: takerInputAta, isSigner: false, isWritable: true },
          { pubkey: recipientOutputAta, isSigner: false, isWritable: true },
          { pubkey: poolVaultIn, isSigner: false, isWritable: true },
          { pubkey: poolVaultOut, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from('deadbeef0102030405060708', 'hex'),
      }),
    ];

    return {
      network: 'solana-mainnet-beta',
      genesisHash: MAINNET_GENESIS_HASH,
      sellToken: inputMint.toBase58(),
      buyToken: outputMint.toBase58(),
      sellAmount: String(sellAmount),
      minBuyAmount: String(minBuyAmount),
      taker: taker.toBase58(),
      addressLookupTableAddresses: [altAddress.toBase58()],
      instructions: ixs.map(serializeInstructionFor0x),
    };
  }

  function makeSigned0xExchange({ requestObj, responseObj, created = FIXED_0X_CREATED_UNIX }) {
    return sign0xHttpResponse({
      request: {
        method: 'POST',
        authority: 'api.0x.org',
        path: '/solana/swap-instructions',
        headers: { '0x-version': 'v2' },
        bodyBytes: Buffer.from(JSON.stringify(requestObj), 'utf8'),
      },
      response: {
        status: 200,
        headers: {},
        bodyBytes: Buffer.from(JSON.stringify(responseObj), 'utf8'),
      },
      privateKey: zeroXKey.privateKey,
      keyId: zeroXKeyId,
      created,
    });
  }

  const extraUnauthorizedSystemTransfer = SystemProgram.transfer({
    fromPubkey: taker,
    toPubkey: attacker,
    lamports: 100_000,
  });

  const extraUnauthorizedSplTransfer = createTransferInstruction(
    takerInputAta,
    attackerInputAta,
    taker,
    5_000_000n
  );

  return {
    taker,
    authorizedRecipient,
    attacker,
    inputMint,
    outputMint,
    fakeMint,
    coveredSwapProgram,
    opaqueRouterProgram,
    takerInputAta,
    recipientOutputAta,
    attackerOutputAta,
    takerWsolAta,
    recentBlockhash,
    addressLookupTableSnapshots,
    basePolicy,
    zeroXKey,
    zeroXKeyId,
    altAttesterKey,
    altAttesterKeyId,
    trusted0xKeys: { [zeroXKeyId]: zeroXKey.publicKey },
    arkheAuthKey,
    arkheReceiptKey,
    checkpointKey,
    buildCoveredSwapPayload,
    buildOpaqueRouterPayload,
    makeSigned0xExchange,
    extraUnauthorizedSystemTransfer,
    extraUnauthorizedSplTransfer,
  };
}

export function runFullOfflinePilotSuite() {
  const f = createDeterministicPilotFixtures();
  const replayStore = new SingleUseReplayStore();
  const receipts = [];

  // Case 1: Signed test fixture above spend cap -> HTTP sig PASS, Rust BLOQUEADO, 0 key calls
  const aboveCapEx = f.makeSigned0xExchange({
    requestObj: {
      sellToken: f.inputMint.toBase58(),
      buyToken: f.outputMint.toBase58(),
      sellAmount: '250000000',
      taker: f.taker.toBase58(),
      slippageBps: 50,
    },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '250000000', minBuyAmount: '240000000' }),
  });
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-1-above-cap-signed-test-fixture',
      description: 'Fixture assinada de teste para pedido acima do teto de gasto do agente',
      provenance: 'test-fixture',
      request: aboveCapEx.request,
      response: aboveCapEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    })
  );

  // Case 2: Extra transfer injected locally BEFORE authorization -> Rust BLOQUEADO, 0 key calls
  const extraTxEx = f.makeSigned0xExchange({
    requestObj: {
      sellToken: f.inputMint.toBase58(),
      buyToken: f.outputMint.toBase58(),
      sellAmount: '80000000',
      taker: f.taker.toBase58(),
      slippageBps: 50,
      nonce: 'case-2',
    },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96000000' }),
  });
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-2-extra-transfer-before-auth',
      description: 'Transferência adicional inserida durante a montagem local antes da autorização',
      provenance: 'test-fixture',
      request: extraTxEx.request,
      response: extraTxEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
      extraInstructionsBeforeAuth: [f.extraUnauthorizedSystemTransfer],
    })
  );

  // Case 3: Opaque external program -> Rust INCONCLUSIVO, 0 auth, 0 key calls
  const opaqueEx = f.makeSigned0xExchange({
    requestObj: {
      sellToken: f.inputMint.toBase58(),
      buyToken: f.outputMint.toBase58(),
      sellAmount: '50000000',
      taker: f.taker.toBase58(),
      slippageBps: 50,
      nonce: 'case-3',
    },
    responseObj: f.buildOpaqueRouterPayload({ sellAmount: '50000000', minBuyAmount: '96000000' }),
  });
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-3-opaque-route-inconclusive',
      description: 'Rota assinada com programa opaco cujos efeitos o validador Rust não consegue determinar',
      provenance: 'test-fixture',
      request: opaqueEx.request,
      response: opaqueEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    })
  );

  // Case 4: Message mutated AFTER test authorization -> BOTH policyVerdict=ELEGÍVEL and signingBoundaryOutcome=REJECTED_AT_BOUNDARY
  const tamperAfterEx = f.makeSigned0xExchange({
    requestObj: {
      sellToken: f.inputMint.toBase58(),
      buyToken: f.outputMint.toBase58(),
      sellAmount: '75000000',
      taker: f.taker.toBase58(),
      slippageBps: 50,
      nonce: 'case-4',
    },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '75000000', minBuyAmount: '96000000' }),
  });
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-4-message-mutated-after-auth',
      description: 'Mensagem original elegível, mas versão alterada em 1 byte é rejeitada na fronteira de assinatura',
      provenance: 'test-fixture',
      request: tamperAfterEx.request,
      response: tamperAfterEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
      mutateMessageAfterAuth: bytes => {
        const tampered = Buffer.from(bytes);
        tampered[tampered.length - 1] ^= 0x01;
        return tampered;
      },
    })
  );

  // Case 5: Covered route with attested ALT within policy -> Rust ELEGÍVEL -> test signer gets exact bytes
  const eligibleReq = {
    sellToken: f.inputMint.toBase58(),
    buyToken: f.outputMint.toBase58(),
    sellAmount: '80000000',
    taker: f.taker.toBase58(),
    slippageBps: 50,
    nonce: 'case-5',
  };
  const eligibleEx = f.makeSigned0xExchange({
    requestObj: eligibleReq,
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96500000' }),
  });
  const eligibleBoundary = new DryRunSigningBoundary({ trustedAuthPublicKey: f.arkheAuthKey.publicKey });
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-5-covered-route-eligible',
      description: 'Rota compreendida com snapshot de ALT atestado dentro dos limites da política (autoridade Rust)',
      provenance: 'test-fixture',
      request: eligibleEx.request,
      response: eligibleEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
      signingBoundary: eligibleBoundary,
    })
  );

  // Case 6: Benign payload, but compiled MessageV0 wire bytes route output to attacker destination -> Rust BLOQUEADO
  const wireMismatchEx = f.makeSigned0xExchange({
    requestObj: { ...eligibleReq, nonce: 'case-6-wire-dest-mismatch' },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96500000' }),
  });
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-6-wire-destination-mismatch',
      description: 'Resumo/JSON dentro dos limites, mas bytes reais da MessageV0 apontam para outra conta de destino',
      provenance: 'test-fixture',
      request: wireMismatchEx.request,
      response: wireMismatchEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
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
    })
  );

  // Case 7: Response body altered keeping original headers & signature -> BLOQUEADO before assembly
  const alteredResBody = Buffer.from(eligibleEx.response.bodyBytes.toString('utf8').replace('96500000', '96500001'), 'utf8');
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-7-response-body-tampered',
      description: 'Corpo da resposta alterado mantendo os cabeçalhos e a assinatura RFC 9421 originais',
      provenance: 'test-fixture',
      request: eligibleEx.request,
      response: { ...eligibleEx.response, bodyBytes: alteredResBody },
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    })
  );

  // Case 8: Request swapped with recalculated request Content-Digest header only -> BLOQUEADO
  const swappedReqBody = Buffer.from(JSON.stringify({ ...eligibleReq, sellAmount: '99999999' }), 'utf8');
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-8-request-swapped-digest-recomputed',
      description: 'Pedido substituído com Content-Digest do pedido recalculado, sem assinatura correspondente',
      provenance: 'test-fixture',
      request: {
        ...eligibleEx.request,
        headers: { ...eligibleEx.request.headers, 'content-digest': formatContentDigest(swappedReqBody) },
        bodyBytes: swappedReqBody,
      },
      response: eligibleEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    })
  );

  // Case 9: Expired (> 60s window with fixed clock) -> BLOQUEADO
  const expiredEx = f.makeSigned0xExchange({
    requestObj: { ...eligibleReq, nonce: 'case-9-expired' },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96500000' }),
    created: FIXED_0X_CREATED_UNIX,
  });
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-9-signature-expired',
      description: 'Fixture assinada fora da janela de 60 segundos (relógio avançado em 61s)',
      provenance: 'test-fixture',
      request: expiredEx.request,
      response: expiredEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_0X_CREATED_UNIX + 61,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    })
  );

  // Case 10: Replay of Case 5 inside 60s window -> BLOQUEADO by local replay store
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-10-response-replay',
      description: 'Reapresentação da mesma resposta assinada dentro da janela de 60 segundos',
      provenance: 'test-fixture',
      request: eligibleEx.request,
      response: eligibleEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX + 5,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
    })
  );

  // Case 11: Fixed MessageV0 wire bytes, but address at used ALT index is swapped in snapshot -> Rust BLOQUEADO, 0 auth
  const altSwapEx = f.makeSigned0xExchange({
    requestObj: { ...eligibleReq, nonce: 'case-11-alt-index-swapped' },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96500000' }),
  });
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-11-alt-snapshot-index-swapped-blocked',
      description: 'Bytes da MessageV0 fixos, mas endereço no índice usado da ALT foi trocado no snapshot (divergência comprovada)',
      provenance: 'test-fixture',
      request: altSwapEx.request,
      response: altSwapEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
      overrideAltSnapshotsForEvaluation: snaps => {
        // Keep MessageV0 wire bytes FIXED; swap index 3 (outputMint) in the ALT snapshot handed to Rust
        snaps[0].addresses[3] = f.fakeMint.toBase58();
        return snaps;
      },
    })
  );

  // Case 12: Fixed MessageV0 wire bytes, but ALT snapshot lacks attestation evidence -> Rust INCONCLUSIVO, 0 auth
  const altUnattestedEx = f.makeSigned0xExchange({
    requestObj: { ...eligibleReq, nonce: 'case-12-alt-unattested' },
    responseObj: f.buildCoveredSwapPayload({ sellAmount: '80000000', minBuyAmount: '96500000' }),
  });
  receipts.push(
    runZeroXAuthorizationCase({
      caseId: 'case-12-alt-snapshot-unattested-inconclusive',
      description: 'Bytes da MessageV0 fixos e endereços compatíveis, mas snapshot da ALT sem evidência de origem/atestação',
      provenance: 'test-fixture',
      request: altUnattestedEx.request,
      response: altUnattestedEx.response,
      trusted0xKeys: f.trusted0xKeys,
      nowUnixSeconds: FIXED_CLOCK_UNIX,
      replayStore,
      addressLookupTableSnapshots: f.addressLookupTableSnapshots,
      payerKey: f.taker.toBase58(),
      recentBlockhash: f.recentBlockhash,
      policy: f.basePolicy,
      arkheAuthPrivateKey: f.arkheAuthKey.privateKey,
      overrideAltSnapshotsForEvaluation: snaps => {
        snaps[0].attestation = null;
        return snaps;
      },
    })
  );

  const bundle = buildPilotReceiptBundle({
    receipts,
    network: f.basePolicy.network,
    issuedAt: FIXED_CLOCK_UNIX,
    arkheReceiptPrivateKey: f.arkheReceiptKey.privateKey,
    checkpointPrivateKey: f.checkpointKey.privateKey,
  });

  const trust = {
    schema: 'arkhe-zerox-pilot-trust/v1',
    network: f.basePolicy.network,
    checkpointVerificationTime: FIXED_CLOCK_UNIX,
    trusted0xKeysPem: {
      [f.zeroXKeyId]: f.zeroXKey.publicKey.export({ type: 'spki', format: 'pem' }),
    },
    trustedArkheAuthPublicKeyPem: f.arkheAuthKey.publicKey.export({ type: 'spki', format: 'pem' }),
    trustedArkheReceiptPublicKeyPem: f.arkheReceiptKey.publicKey.export({ type: 'spki', format: 'pem' }),
    trustedCheckpointPublicKeyPem: f.checkpointKey.publicKey.export({ type: 'spki', format: 'pem' }),
  };

  return { fixtures: f, receipts, bundle, trust };
}

function main() {
  const [command, bundlePath, trustPath] = process.argv.slice(2);
  if (command === 'run') {
    const { bundle, trust } = runFullOfflinePilotSuite();
    mkdirSync('output', { recursive: true });
    writeFileSync('output/zerox-pilot-bundle.json', JSON.stringify(bundle, null, 2));
    writeFileSync('output/zerox-pilot-trust.json', JSON.stringify(trust, null, 2));

    const verification = verifyPilotReceiptBundle(bundle, {
      trusted0xKeys: trust.trusted0xKeysPem,
      trustedArkheAuthPublicKey: trust.trustedArkheAuthPublicKeyPem,
      trustedArkheReceiptPublicKey: trust.trustedArkheReceiptPublicKeyPem,
      trustedCheckpointPublicKey: trust.trustedCheckpointPublicKeyPem,
      expectedNetwork: trust.network,
      checkpointVerificationTime: trust.checkpointVerificationTime,
    });

    console.log(
      JSON.stringify(
        {
          mode: bundle.mode,
          decisionAuthority: bundle.decisionAuthority,
          bundlePath: 'output/zerox-pilot-bundle.json',
          trustPath: 'output/zerox-pilot-trust.json',
          rootHex: bundle.rootHex,
          leafCount: bundle.leafCount,
          offlineVerificationPassed: verification.ok,
          cases: verification.caseResults,
        },
        null,
        2
      )
    );
    if (!verification.ok) process.exitCode = 1;
  } else if (command === 'verify') {
    if (!bundlePath || !trustPath) {
      throw new Error('Usage: node src/zerox-pilot-cli.mjs verify <bundle.json> <trust.json>');
    }
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    const trust = JSON.parse(readFileSync(trustPath, 'utf8'));
    const verification = verifyPilotReceiptBundle(bundle, {
      trusted0xKeys: trust.trusted0xKeysPem,
      trustedArkheAuthPublicKey: trust.trustedArkheAuthPublicKeyPem,
      trustedArkheReceiptPublicKey: trust.trustedArkheReceiptPublicKeyPem,
      trustedCheckpointPublicKey: trust.trustedCheckpointPublicKeyPem,
      expectedNetwork: trust.network,
      checkpointVerificationTime: trust.checkpointVerificationTime,
    });
    console.log(JSON.stringify(verification, null, 2));
    if (!verification.ok) process.exitCode = 1;
  } else {
    throw new Error('Usage: node src/zerox-pilot-cli.mjs run | verify <bundle.json> <trust.json>');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
