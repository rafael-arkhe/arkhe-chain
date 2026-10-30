import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, SystemProgram } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getMint, getTokenMetadata, getAccount } from '@solana/spl-token';
import { DynamicBondingCurveClient, deriveDbcPoolAddress, deriveDammV2PoolAddress, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import { allowedEndpoint, memoInstruction, MEMO_PROGRAM_ID, assertLocalGenesis } from './transaction.mjs';
import { checkpointMemo, hash } from './proof.mjs';
import { exportLifecycle, verifyLifecycle } from './lifecycle.mjs';
import { testCurve, DAMM_CONFIG, DAMM_CONFIG_SHA256, PROGRAM_FIXTURES, REFERENCE_COMMIT, DEPLOYMENT_SOURCE, CURVE_FEE_BPS, MIGRATED_FEE_BPS } from './meteora-config.mjs';
import { beforeTrading, afterMigration, expectProgramRejection, expiredTransaction } from './prelaunch-checks.mjs';

const endpoint = allowedEndpoint(process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:18899');
assert(new URL(endpoint).protocol === 'http:', 'Meteora test requires an isolated local validator');
const connection = new Connection(endpoint, 'finalized');
const payer = Keypair.generate(), config = Keypair.generate(), baseMint = Keypair.generate();
const dammConfig = new PublicKey(DAMM_CONFIG);
const dbcPool = deriveDbcPoolAddress(NATIVE_MINT, baseMint.publicKey, config.publicKey);
const dammPool = deriveDammV2PoolAddress(dammConfig, baseMint.publicKey, NATIVE_MINT);
const client = new DynamicBondingCurveClient(connection, 'finalized');
const amm = new CpAmm(connection);
const events = [], transactions = [];
const checks = [];
const extended = process.argv.includes('--prelaunch');
const outputDirectory = process.env.METEORA_OUTPUT_DIR ?? 'output/meteora';
mkdirSync(outputDirectory, { recursive: true });
const save = (name, value) => writeFileSync(`${outputDirectory}/${name}.json`, JSON.stringify(value, null, 2));
save('report', { status: 'RUNNING', endpoint });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
let genesisHash;

async function finalized(signature, lastValidBlockHeight) {
  for (let attempt = 0; attempt < 180; attempt++) {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.err) {
      const failure = Error(`transaction failed: ${JSON.stringify(status.err)}`);
      failure.transactionFailure = status.err; failure.signature = signature;
      failure.logs = (await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }))?.meta?.logMessages ?? [];
      throw failure;
    }
    if (status?.confirmationStatus === 'finalized') return;
    if (lastValidBlockHeight && await connection.getBlockHeight('finalized') > lastValidBlockHeight) throw Error(`expired: ${signature}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error(`finalization timeout: ${signature}`);
}
async function send(tx, signers = [], expectedProgram) {
  if (!tx.instructions.some(ix => ix.programId.equals(ComputeBudgetProgram.programId))) tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 800000 }));
  const latest = await connection.getLatestBlockhash('finalized');
  tx.feePayer = payer.publicKey; tx.recentBlockhash = latest.blockhash;
  tx.sign(payer, ...signers);
  const messageHash = hash(tx.serializeMessage());
  const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: 'finalized' });
  await finalized(signature, latest.lastValidBlockHeight);
  const record = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  assert(record?.meta && record.meta.err === null, 'finalized transaction must exist and succeed');
  assert.equal(hash(record.transaction.message.serialize()), messageHash, 'RPC transaction must equal signed message');
  if (expectedProgram) assert(record.transaction.message.compiledInstructions.some(ix => record.transaction.message.staticAccountKeys[ix.programIdIndex].equals(expectedProgram)), 'expected program must be invoked');
  const entry = { signature, slot: record.slot, messageHash, wireTransactionBase64: tx.serialize().toString('base64'), fee: record.meta.fee, logMessages: record.meta.logMessages, preTokenBalances: record.meta.preTokenBalances, postTokenBalances: record.meta.postTokenBalances };
  transactions.push(entry); save('transactions', transactions);
  return entry;
}
const baseAta = getAssociatedTokenAddressSync(baseMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
async function walletBase() {
  if (!await connection.getAccountInfo(baseAta)) return new BN(0);
  return new BN((await getAccount(connection, baseAta, 'finalized', TOKEN_2022_PROGRAM_ID)).amount.toString());
}
async function poolState() {
  const pool = await client.state.getPool(dbcPool);
  assert(pool, 'DBC pool must exist');
  return pool.poolState;
}
async function observation() {
  const p = await client.state.getPool(dbcPool);
  const result = [['walletBase', (await walletBase()).toString()]];
  if (p) for (const key of ['baseReserve', 'quoteReserve', 'sqrtPrice', 'isMigrated', 'migrationProgress']) result.push([key, String(p.poolState[key])]);
  return result;
}
async function recordPhase(phase, tx, observations, program = new PublicKey(PROGRAM_FIXTURES[0].program)) {
  events.push({ phase, sequence: events.length, genesisHash, program: program.toBase58(), config: config.publicKey.toBase58(), dbcPool: dbcPool.toBase58(), dammPool: dammPool.toBase58(), baseMint: baseMint.publicKey.toBase58(), quoteMint: NATIVE_MINT.toBase58(), signature: tx.signature, slot: tx.slot, messageHash: tx.messageHash, observations });
  save('events', events);
  console.log(`${phase}: finalized at slot ${tx.slot}`);
}
async function dbcSwap(amountIn, sell, partial = false) {
  const pool = await client.state.getPool(dbcPool);
  const stateConfig = await client.state.getPoolConfig(config.publicKey);
  const currentSlot = await connection.getSlot('finalized');
  const currentTime = await connection.getBlockTime(currentSlot);
  assert.notEqual(currentTime, null);
  const swapMode = partial ? SwapMode.PartialFill : SwapMode.ExactIn;
  const quote = client.pool.swapQuote2({ virtualPool: pool, config: stateConfig, swapBaseForQuote: sell, amountIn, swapMode, slippageBps: 100, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: new BN(currentTime) });
  assert(quote.minimumAmountOut?.gt(new BN(0)), 'quote must return positive bounded output');
  const tx = await client.pool.swap2({ swapMode, swapBaseForQuote: sell, amountIn, minimumAmountOut: quote.minimumAmountOut, owner: payer.publicKey, payer: payer.publicKey, pool: dbcPool, referralTokenAccount: null });
  return { tx, quote };
}

try {
  genesisHash = await connection.getGenesisHash();
  assertLocalGenesis(genesisHash);
  const fixtureEvidence = [];
  for (const fixture of PROGRAM_FIXTURES) {
    const account = await connection.getAccountInfo(new PublicKey(fixture.program));
    assert(account?.executable, `missing local program: ${fixture.program}`);
    let executableBytes = account.data;
    if (account.owner.toBase58() === 'BPFLoaderUpgradeab1e11111111111111111111111') {
      assert(account.data.length === 36 && account.data.readUInt32LE() === 2, 'invalid upgradeable program account');
      const programData = await connection.getAccountInfo(new PublicKey(account.data.subarray(4, 36)));
      assert(programData?.owner.equals(account.owner) && programData.data.readUInt32LE() === 3, 'invalid program data');
      executableBytes = programData.data.subarray(45);
    }
    assert.equal(sha256(executableBytes), fixture.sha256, `program differs from pinned test fixture: ${fixture.file}`);
    fixtureEvidence.push(fixture);
  }
  const configAccount = await connection.getAccountInfo(dammConfig);
  assert(configAccount?.owner.equals(new PublicKey(PROGRAM_FIXTURES[1].program)), 'DAMM migration config missing');
  assert.equal(sha256(configAccount.data), DAMM_CONFIG_SHA256, 'DAMM config differs from pinned devnet snapshot');
  const airdrop = await connection.requestAirdrop(payer.publicKey, 100_000_000_000);
  await finalized(airdrop);
  // Official program tests pre-fund this PDA for flash rent; payer reimburses it.
  const flashRentAuthority = new PublicKey('FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM');
  const initialFlashRent = await connection.getBalance(flashRentAuthority, 'finalized');
  if (initialFlashRent < 1_000_000_000) await send(new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: flashRentAuthority, lamports: 1_000_000_000 - initialFlashRent })));
  const flashRentBefore = await connection.getBalance(flashRentAuthority, 'finalized');
  const curve = testCurve();
  const threshold = curve.migrationQuoteThreshold;
  assert(threshold.gt(new BN(1000000)) && threshold.lt(new BN(30000000000)), 'test graduation must fit faucet budget');
  save('run', { status: 'RUNNING', endpoint, genesisHash, referenceCommit: REFERENCE_COMMIT, fixtureEvidence, dammConfig: DAMM_CONFIG, dammConfigDataSha256: sha256(configAccount.data), threshold: threshold.toString() });
  const configTx = await client.partner.createConfig2({ config: config.publicKey, feeClaimer: payer.publicKey, leftoverReceiver: payer.publicKey, payer: payer.publicKey, quoteMint: NATIVE_MINT, ...curve, transferFeeParameters: null });
  const configRecord = await send(configTx, [config], new PublicKey(PROGRAM_FIXTURES[0].program));
  const decodedConfig = await client.state.getPoolConfig(config.publicKey);
  assert(decodedConfig.poolFees.baseFee.cliffFeeNumerator.eq(new BN(CURVE_FEE_BPS * 100000)), 'on-chain DBC fee must match candidate');
  await recordPhase('config', configRecord, [['migrationQuoteThreshold', threshold.toString()], ['tokenType', 'Token2022'], ['feeBps', String(CURVE_FEE_BPS)]]);
  const create = await client.creator.createPool({ baseMint: baseMint.publicKey, config: config.publicKey, name: 'ARKHE METEORA TEST', symbol: 'ARKHET', uri: 'https://example.invalid/arkhe-meteora-test.json', payer: payer.publicKey, poolCreator: payer.publicKey });
  const createRecord = await send(create, [baseMint], new PublicKey(PROGRAM_FIXTURES[0].program));
  const mintState = await getMint(connection, baseMint.publicKey, 'finalized', TOKEN_2022_PROGRAM_ID);
  assert.equal(mintState.decimals, 6); assert.equal(mintState.mintAuthority, null); assert.equal(mintState.freezeAuthority, null);
  assert.equal((await getTokenMetadata(connection, baseMint.publicKey, 'finalized')).name, 'ARKHE METEORA TEST');
  await recordPhase('create', createRecord, await observation());
  const testContext = { connection, payer, baseMint, baseAta, client, dbcPool, dammPool, amm, send, checks };
  if (extended) await beforeTrading(testContext);
  if (extended && process.argv.includes('--expiry')) await expiredTransaction(testContext);

  // Reject early migration explicitly; a network failure is not a passing test.
  let prematureMigrationRejected = false;
  const premature = await client.migration.migrateToDammV2({ pool: dbcPool, dammConfig, payer: payer.publicKey });
  try { await send(premature.transaction, [premature.firstPositionNftKeypair, premature.secondPositionNftKeypair]); }
  catch (error) {
    if (!/PoolIsIncompleted|NotPermitToDoThisAction/.test(JSON.stringify(error.logs ?? []) + error.message)) throw error;
    prematureMigrationRejected = true;
  }
  assert(prematureMigrationRejected, 'premature migration must be rejected');

  const beforeBuy = await poolState();
  const buy = await dbcSwap(threshold.divn(10), false);
  const buyRecord = await send(buy.tx, [], new PublicKey(PROGRAM_FIXTURES[0].program));
  const bought = await walletBase();
  assert(bought.gt(new BN(0))); assert((await poolState()).quoteReserve.gt(beforeBuy.quoteReserve));
  await recordPhase('buy', buyRecord, [...await observation(), ['minimumOut', buy.quote.minimumAmountOut.toString()]]);
  if (extended) {
    let replay;
    try { replay = await connection.sendRawTransaction(Buffer.from(buyRecord.wireTransactionBase64, 'base64'), { preflightCommitment: 'finalized' }); assert.equal(replay, buyRecord.signature); }
    catch (error) { if (!/already been processed/i.test(error.message)) throw error; replay = buyRecord.signature; }
    assert.equal((await connection.getSignatureStatuses([replay])).value[0].confirmationStatus, 'finalized');
    assert((await walletBase()).eq(bought));
    checks.push({ name: 'identical-transaction-resubmission-is-idempotent', status: 'PASS', signature: replay });
  }
  const sellAmount = bought.divn(2), beforeSell = await poolState();
  const sell = await dbcSwap(sellAmount, true);
  const sellRecord = await send(sell.tx, [], new PublicKey(PROGRAM_FIXTURES[0].program));
  assert((await walletBase()).eq(bought.sub(sellAmount))); assert((await poolState()).quoteReserve.lt(beforeSell.quoteReserve));
  await recordPhase('sell', sellRecord, [...await observation(), ['amountIn', sellAmount.toString()], ['minimumOut', sell.quote.minimumAmountOut.toString()]]);

  const graduate = await dbcSwap(threshold.muln(2), false, true);
  const graduateRecord = await send(graduate.tx, [], new PublicKey(PROGRAM_FIXTURES[0].program));
  assert((await poolState()).quoteReserve.gte(threshold), 'graduation threshold must be met on-chain');
  await recordPhase('graduate', graduateRecord, await observation());
  const migration = await client.migration.migrateToDammV2({ pool: dbcPool, dammConfig, payer: payer.publicKey });
  let migrationRecord;
  if (extended && process.argv.includes('--resume-workers')) {
    save('migration-resume-state', { endpoint, genesisHash, pool: dbcPool.toBase58(), dammConfig: dammConfig.toBase58() });
    const workers = await Promise.all(['a', 'b'].map(id => new Promise((resolve, reject) => {
      const result = `${outputDirectory}/migration-worker-${id}.json`;
      const child = spawn(process.execPath, [fileURLToPath(new URL('./migration-worker.mjs', import.meta.url)), `${outputDirectory}/migration-resume-state.json`, result], { windowsHide: true, stdio: 'pipe' });
      let stderr = ''; child.stderr.on('data', data => stderr += data); child.on('error', reject);
      child.on('exit', code => { try { if (![0, 2].includes(code)) throw Error(stderr); resolve(JSON.parse(readFileSync(result, 'utf8'))); } catch (error) { reject(error); } });
    })));
    const winners = workers.filter(r => r.status === 'PASS'), losers = workers.filter(r => r.status === 'FAIL');
    assert.equal(winners.length, 1); assert.equal(losers.length, 1);
    assert(/NotPermitToDoThisAction/.test(JSON.stringify(losers[0])));
    migrationRecord = winners[0].record; transactions.push(migrationRecord); save('transactions', transactions);
    checks.push({ name: 'migration-resumed-by-competing-processes-without-original-keys', status: 'PASS', workerPayer: winners[0].workerPayer, winner: migrationRecord.signature, loser: losers[0] });
  } else if (extended) {
    const competitor = await client.migration.migrateToDammV2({ pool: dbcPool, dammConfig, payer: payer.publicKey });
    const outcomes = await Promise.allSettled([migration, competitor].map(m => send(m.transaction, [m.firstPositionNftKeypair, m.secondPositionNftKeypair], new PublicKey(PROGRAM_FIXTURES[0].program))));
    const winners = outcomes.filter(r => r.status === 'fulfilled'), losers = outcomes.filter(r => r.status === 'rejected');
    assert.equal(winners.length, 1, 'only one racing migration must commit'); assert.equal(losers.length, 1);
    const failure = losers[0].reason;
    assert(/NotPermitToDoThisAction/.test(JSON.stringify(failure.logs ?? []) + failure.message) || failure.transactionFailure?.InstructionError?.[1]?.Custom === 6022, 'loser must fail the migrated-state check');
    migrationRecord = winners[0].value;
    checks.push({ name: 'concurrent-migration-single-winner', status: 'PASS', winner: migrationRecord.signature, rejectedSignature: failure.signature ?? null, transactionFailure: failure.transactionFailure ?? null, logs: failure.logs ?? [] });
  } else migrationRecord = await send(migration.transaction, [migration.firstPositionNftKeypair, migration.secondPositionNftKeypair], new PublicKey(PROGRAM_FIXTURES[0].program));
  assert.equal((await poolState()).isMigrated, 1);
  assert.equal(await connection.getBalance(flashRentAuthority, 'finalized'), flashRentBefore, 'flash rent must be reimbursed');
  const damm = await amm.fetchPoolState(dammPool);
  assert(Buffer.from(damm.poolFees.baseFee.baseFeeInfo.data).readBigUInt64LE(0) === BigInt(MIGRATED_FEE_BPS) * 100000n, 'on-chain DAMM fee must match candidate');
  assert(damm.liquidity.gt(new BN(0)));
  assert(damm.tokenAMint.equals(baseMint.publicKey) && damm.tokenBMint.equals(NATIVE_MINT));
  const vaultA = await getAccount(connection, damm.tokenAVault, 'finalized', TOKEN_2022_PROGRAM_ID);
  const vaultB = await getAccount(connection, damm.tokenBVault, 'finalized', TOKEN_PROGRAM_ID);
  assert(vaultA.amount > 0n && vaultB.amount > 0n);
  await recordPhase('migrate', migrationRecord, [...await observation(), ['dammLiquidity', damm.liquidity.toString()], ['dammVaultA', vaultA.amount.toString()], ['dammVaultB', vaultB.amount.toString()]]);
  if (extended) {
    const duplicate = await client.migration.migrateToDammV2({ pool: dbcPool, dammConfig, payer: payer.publicKey });
    await expectProgramRejection('second-migration-is-rejected', () => send(duplicate.transaction, [duplicate.firstPositionNftKeypair, duplicate.secondPositionNftKeypair]), /NotPermitToDoThisAction|already in use|AccountAlready|Constraint|PoolIsCompleted/i, checks);
  }

  async function dammSwap(sell, amount) {
    const state = await amm.fetchPoolState(dammPool);
    const slot = await connection.getSlot('finalized');
    const time = await connection.getBlockTime(slot);
    const input = sell ? baseMint.publicKey : NATIVE_MINT;
    const quote = amm.getQuote({ inAmount: amount, inputTokenMint: input, slippage: 1, poolState: state, currentTime: time, currentSlot: slot, tokenADecimal: 6, tokenBDecimal: 9 });
    assert(quote.minSwapOutAmount.gt(new BN(0)));
    const transaction = await amm.swap({ payer: payer.publicKey, pool: dammPool, inputTokenMint: input, outputTokenMint: sell ? NATIVE_MINT : baseMint.publicKey, amountIn: amount, minimumAmountOut: quote.minSwapOutAmount, tokenAMint: state.tokenAMint, tokenBMint: state.tokenBMint, tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault, tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null, poolState: state });
    const before = await walletBase();
    const entry = await send(transaction, [], new PublicKey(PROGRAM_FIXTURES[1].program));
    const after = await walletBase();
    if (sell) assert(after.eq(before.sub(amount))); else assert(after.sub(before).gte(quote.minSwapOutAmount));
    await recordPhase(sell ? 'damm-sell' : 'damm-buy', entry, [['walletBaseBefore', before.toString()], ['walletBaseAfter', after.toString()], ['amountIn', amount.toString()], ['minimumOut', quote.minSwapOutAmount.toString()]], new PublicKey(PROGRAM_FIXTURES[1].program));
    return after.sub(before);
  }
  const dammBought = await dammSwap(false, new BN(10000000));
  await dammSwap(true, dammBought.divn(2));
  if (extended) { await afterMigration(testContext); save('checks', checks); }

  const bundle = exportLifecycle(events);
  assert(verifyLifecycle(bundle, bundle.rootHex, 8));
  const altered = structuredClone(bundle); altered.receipts[2].event.observations[0][1] = '999999';
  assert.equal(verifyLifecycle(altered, bundle.rootHex, 8), false);
  const anchor = await send(new Transaction().add(memoInstruction(checkpointMemo(bundle.rootHex, 8))), [], MEMO_PROGRAM_ID);
  const anchorTransaction = await connection.getTransaction(anchor.signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  assert(anchorTransaction.transaction.message.compiledInstructions.some(ix => anchorTransaction.transaction.message.staticAccountKeys[ix.programIdIndex].equals(MEMO_PROGRAM_ID) && Buffer.from(ix.data).equals(Buffer.from(checkpointMemo(bundle.rootHex, 8)))));
  save('receipts', bundle);
  const report = {
    status: 'PASS', environment: 'LOCAL_VALIDATOR_PINNED_PROGRAMS', deploymentSource: DEPLOYMENT_SOURCE, endpoint, genesisHash,
    referenceCommit: REFERENCE_COMMIT, fixtureEvidence, dammConfig: DAMM_CONFIG, dammConfigDataSha256: sha256(configAccount.data),
    sdkVersions: { dbc: '2.0.0', cpAmm: '1.5.1' }, config: config.publicKey.toBase58(),
    mint: baseMint.publicKey.toBase58(), dbcPool: dbcPool.toBase58(), dammPool: dammPool.toBase58(),
    migrationQuoteThreshold: threshold.toString(), flashRentAuthority: flashRentAuthority.toBase58(),
    curveFeeBps: CURVE_FEE_BPS, migratedPoolFeeBps: MIGRATED_FEE_BPS,
    flashRentLamports: flashRentBefore, flashRentReimbursed: true, prematureMigrationRejected,
    token2022: true, mintAuthorityRevoked: true, freezeAuthorityRevoked: true,
    dbcBuySellVerified: true, migrationVerified: true, dammBuySellVerified: true,
    arkheInclusionVerified: true, tamperRejected: true, leafCount: 8, rootHex: bundle.rootHex,
    anchorSignature: anchor.signature, checkpointTransactionVerified: true,
    mainnetCompatibilityVerified: false, transferHookVerified: false, globalTransferCoverage: false
  };
  report.additionalChecks = checks.map(({ name, status }) => ({ name, status }));
  save('report', report);
  save('run', { status: 'PASS', endpoint, genesisHash, rootHex: bundle.rootHex });
  rmSync(`${outputDirectory}/failure.json`, { force: true });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  save('failure', { status: 'FAIL', completedPhases: events.map(e => e.phase), message: error.message, logs: error.logs ?? [] });
  save('checks', checks);
  save('report', { status: 'FAIL', completedPhases: events.map(e => e.phase), message: error.message });
  console.error(error); process.exitCode = 1;
}
