import assert from 'node:assert/strict';
import { Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { memoInstruction } from './transaction.mjs';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT, createMintToInstruction, createAssociatedTokenAccountIdempotentInstruction, getMetadataPointerState, getMint, getTokenMetadata, getAccount } from '@solana/spl-token';
import { createUpdateFieldInstruction } from '@solana/spl-token-metadata';
import { SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';

export async function expectProgramRejection(name, operation, pattern, checks) {
  try { await operation(); }
  catch (error) {
    const logs = error.logs ?? error.transactionLogs ?? [];
    const evidence = JSON.stringify(logs) + error.message;
    if (!logs.length || !pattern.test(evidence)) throw error;
    const result = { name, status: 'PASS', rejection: 'RPC_PROGRAM_PREFLIGHT', message: error.message, logs };
    checks.push(result);
    return result;
  }
  throw Error(`${name}: invalid operation was accepted`);
}
export async function beforeTrading(context) {
  const { connection, payer, baseMint, client, dbcPool, send, checks } = context;
  const mint = await getMint(connection, baseMint.publicKey, 'finalized', TOKEN_2022_PROGRAM_ID);
  const metadata = await getTokenMetadata(connection, baseMint.publicKey, 'finalized');
  const pointer = getMetadataPointerState(mint);
  assert.equal(metadata.updateAuthority, undefined);
  assert.equal(pointer.authority, null);
  assert(pointer.metadataAddress.equals(baseMint.publicKey));
  checks.push({ name: 'immutable-metadata-authorities', status: 'PASS', supplyBaseUnits: mint.supply.toString(), updateAuthority: null, pointerAuthority: null });
  await send(new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, context.baseAta, payer.publicKey, baseMint.publicKey, TOKEN_2022_PROGRAM_ID)));
  await expectProgramRejection('mint-after-revocation', () => send(new Transaction().add(createMintToInstruction(baseMint.publicKey, context.baseAta, payer.publicKey, 1n, [], TOKEN_2022_PROGRAM_ID))), /FixedSupply|fixed supply|0x5/i, checks);
  await expectProgramRejection('metadata-update-after-revocation', () => send(new Transaction().add(createUpdateFieldInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: baseMint.publicKey, updateAuthority: payer.publicKey, field: 'Name', value: 'ATTACK' }))), /ImmutableMetadata|0x35c2b5c1/i, checks);
  const buildSwap = (amountIn, minimumAmountOut) => client.pool.swap2({ pool: dbcPool, owner: payer.publicKey, payer: payer.publicKey, swapBaseForQuote: false, swapMode: SwapMode.ExactIn, amountIn: new BN(amountIn), minimumAmountOut: new BN(minimumAmountOut), referralTokenAccount: null });
  await expectProgramRejection('dbc-impossible-minimum-output', async () => send(await buildSwap('1000000', '18446744073709551615')), /ExceededSlippage|slippage/i, checks);
  await assert.rejects(() => buildSwap('0', '0'), /Amount is zero/);
  checks.push({ name: 'dbc-zero-input', status: 'PASS', rejection: 'SDK_VALIDATION' });
}
export async function afterMigration(context) {
  const { connection, payer, amm, dammPool, baseMint, send, checks } = context;
  const positions = await amm.getUserPositionByPool(dammPool, payer.publicKey);
  assert.equal(positions.length, 1, 'one locked partner position must be owned by payer');
  const position = positions[0];
  assert(position.positionState.permanentLockedLiquidity.gtn(0));
  assert(position.positionState.unlockedLiquidity.isZero());
  assert(position.positionState.vestedLiquidity.isZero());
  const state = await amm.fetchPoolState(dammPool);
  const common = { position: position.position, positionNftAccount: position.positionNftAccount, pool: dammPool, tokenAMint: baseMint.publicKey, tokenBMint: NATIVE_MINT, tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault, tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID };
  const slot = await connection.getSlot('finalized');
  const remove = await amm.removeLiquidity({ ...common, owner: payer.publicKey, liquidityDelta: new BN(1), tokenAAmountThreshold: new BN(0), tokenBAmountThreshold: new BN(0), vestings: [], currentPoint: new BN(await connection.getBlockTime(slot)) });
  await expectProgramRejection('owner-cannot-withdraw-permanently-locked-liquidity', () => send(remove), /Error Code: InsufficientLiquidity/i, checks);
  const attacker = Keypair.generate();
  await send(new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: attacker.publicKey, lamports: 100000000 })));
  const steal = await amm.claimPositionFee({ ...common, owner: attacker.publicKey });
  await expectProgramRejection('nonowner-cannot-claim-position-fees', () => send(steal, [attacker]), /Error Code: InvalidAuthority/i, checks);
  const before = (await getAccount(connection, state.tokenBVault, 'finalized', TOKEN_PROGRAM_ID)).amount;
  const claim = await amm.claimPositionFee({ ...common, owner: payer.publicKey });
  await send(claim);
  const after = (await getAccount(connection, state.tokenBVault, 'finalized', TOKEN_PROGRAM_ID)).amount;
  assert(before > after, 'locked position owner should receive earned quote fees');
  const finalPosition = await amm.fetchPositionState(position.position);
  assert(finalPosition.permanentLockedLiquidity.eq(position.positionState.permanentLockedLiquidity));
  checks.push({ name: 'locked-position-owner-can-claim-fees-without-unlocking', status: 'PASS', quoteFeesClaimed: (before - after).toString(), position: position.position.toBase58(), permanentLockedLiquidity: finalPosition.permanentLockedLiquidity.toString(), unlockedLiquidity: finalPosition.unlockedLiquidity.toString() });
  const impossible = await amm.swap({ payer: payer.publicKey, pool: dammPool, inputTokenMint: NATIVE_MINT, outputTokenMint: baseMint.publicKey, amountIn: new BN(1000000), minimumAmountOut: new BN('18446744073709551615'), tokenAMint: state.tokenAMint, tokenBMint: state.tokenBMint, tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault, tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null, poolState: state });
  await expectProgramRejection('damm-impossible-minimum-output', () => send(impossible), /ExceededSlippage|slippage/i, checks);
}
export async function expiredTransaction(context) {
  const { connection, payer, checks } = context;
  const latest = await connection.getLatestBlockhash('finalized');
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: latest.blockhash }).add(memoInstruction('ARKHE:expiry-negative-test'));
  tx.sign(payer);
  const deadline = Date.now() + 90000;
  while (await connection.getBlockHeight('finalized') <= latest.lastValidBlockHeight) {
    if (Date.now() > deadline) throw Error('unable to observe blockhash expiry within local test budget');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await assert.rejects(() => connection.sendRawTransaction(tx.serialize(), { preflightCommitment: 'finalized' }), /Blockhash not found|BlockhashNotFound/i);
  checks.push({ name: 'expired-transaction-rejected', status: 'PASS', lastValidBlockHeight: latest.lastValidBlockHeight, observedBlockHeight: await connection.getBlockHeight('finalized'), rejection: 'RPC_BLOCKHASH_VALIDATION' });
}
