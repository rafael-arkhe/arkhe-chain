import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { Connection, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { ExtensionType, TOKEN_2022_PROGRAM_ID, TYPE_SIZE, LENGTH_SIZE, getMintLen, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, createMintToInstruction, createSetAuthorityInstruction, AuthorityType, createTransferCheckedInstruction, getAccount, getMint } from '@solana/spl-token';
import { pack, createInitializeInstruction } from '@solana/spl-token-metadata';
import { allowedEndpoint, PUBLIC_GENESIS_HASHES, memoInstruction } from './transaction.mjs';
import { TOTAL_SUPPLY, BUCKETS, createAirdrop, verifyAllocation, validateSupplyBudget } from './airdrop.mjs';
const endpoint = allowedEndpoint(process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:18899');
const directory = endpoint.includes('devnet') ? 'output/prelaunch/airdrop-devnet' : 'output/prelaunch/airdrop-local'; mkdirSync(directory, { recursive: true });
const save = (name, value) => writeFileSync(`${directory}/${name}.json`, JSON.stringify(value, null, 2));
save('report', { status: 'RUNNING', endpoint });
const connection = new Connection(endpoint, 'finalized'), payer = Keypair.generate(), mint = Keypair.generate();
const recipients = Array.from({ length: 10 }, () => Keypair.generate().publicKey);
const reserves = Object.fromEntries(['liquidity', 'treasury', 'team'].map(role => [role, Keypair.generate().publicKey]));
const signatures = [];
let faucetBlocked = false;
async function wait(signature) {
  for (let i = 0; i < 180; i++) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw Error(JSON.stringify(status.err));
    if (status?.confirmationStatus === 'finalized') return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('finalization timeout');
}
async function send(tx, keys = []) {
  tx.feePayer = payer.publicKey; tx.recentBlockhash = (await connection.getLatestBlockhash('finalized')).blockhash;
  tx.sign(payer, ...keys);
  const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: 'finalized' }); await wait(signature); signatures.push(signature); return signature;
}
try {
  const network = await connection.getGenesisHash();
  if ([PUBLIC_GENESIS_HASHES[0], PUBLIC_GENESIS_HASHES[2]].includes(network)) throw Error('mainnet/testnet forbidden');
  if (endpoint.includes('devnet')) assert.equal(network, PUBLIC_GENESIS_HASHES[1]);
  try { await wait(await connection.requestAirdrop(payer.publicKey, 1000000000)); }
  catch (error) { faucetBlocked = true; save('report', { status: 'BLOCKED_FAUCET', endpoint, network, message: error.message, mintCreated: false }); throw error; }
  validateSupplyBudget(BUCKETS, 0n);
  const metadata = { mint: mint.publicKey, name: 'ARKHE AIRDROP TEST', symbol: 'ARKHET', uri: 'https://example.invalid/arkhe-airdrop-test.json', additionalMetadata: [] };
  const size = getMintLen([ExtensionType.MetadataPointer]);
  const rent = await connection.getMinimumBalanceForRentExemption(size + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length);
  await send(new Transaction().add(SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mint.publicKey, space: size, lamports: rent, programId: TOKEN_2022_PROGRAM_ID }), createInitializeMetadataPointerInstruction(mint.publicKey, null, mint.publicKey, TOKEN_2022_PROGRAM_ID), createInitializeMintInstruction(mint.publicKey, 6, payer.publicKey, null, TOKEN_2022_PROGRAM_ID), createInitializeInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: payer.publicKey, mint: mint.publicKey, mintAuthority: payer.publicKey, name: metadata.name, symbol: metadata.symbol, uri: metadata.uri })), [mint]);
  const ata = owner => getAssociatedTokenAddressSync(mint.publicKey, owner, false, TOKEN_2022_PROGRAM_ID);
  for (const owner of [payer.publicKey, ...recipients, ...Object.values(reserves)]) await send(new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata(owner), owner, mint.publicKey, TOKEN_2022_PROGRAM_ID)));
  await send(new Transaction().add(createMintToInstruction(mint.publicKey, ata(payer.publicKey), payer.publicKey, TOTAL_SUPPLY, [], TOKEN_2022_PROGRAM_ID), createSetAuthorityInstruction(mint.publicKey, payer.publicKey, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID)));
  const receipts = createAirdrop(network, mint.publicKey.toBase58(), recipients.map(k => k.toBase58())); const root = receipts[0].rootHex;
  const rootAnchor = await send(new Transaction().add(memoInstruction(`ARKHE:v1:airdrop-root:10:${root}`)));
  for (const receipt of receipts) {
    assert(verifyAllocation(receipt, root, receipt.allocation));
    await send(new Transaction().add(memoInstruction(`ARKHE:v1:airdrop:${root}:${receipt.allocation.index}`), createTransferCheckedInstruction(ata(payer.publicKey), mint.publicKey, ata(recipients[receipt.allocation.index]), payer.publicKey, BigInt(receipt.allocation.amount), 6, [], TOKEN_2022_PROGRAM_ID)));
  }
  for (const [role, owner] of Object.entries(reserves)) await send(new Transaction().add(createTransferCheckedInstruction(ata(payer.publicKey), mint.publicKey, ata(owner), payer.publicKey, BUCKETS[role], 6, [], TOKEN_2022_PROGRAM_ID)));
  for (const recipient of recipients) assert.equal((await getAccount(connection, ata(recipient), 'finalized', TOKEN_2022_PROGRAM_ID)).amount, BUCKETS.community / 10n);
  for (const [role, owner] of Object.entries(reserves)) assert.equal((await getAccount(connection, ata(owner), 'finalized', TOKEN_2022_PROGRAM_ID)).amount, BUCKETS[role]);
  assert.equal((await getAccount(connection, ata(payer.publicKey), 'finalized', TOKEN_2022_PROGRAM_ID)).amount, 0n);
  const mintState = await getMint(connection, mint.publicKey, 'finalized', TOKEN_2022_PROGRAM_ID); assert.equal(mintState.supply, TOTAL_SUPPLY); assert.equal(mintState.mintAuthority, null);
  save('receipts', receipts); save('signatures', signatures);
  const report = { status: 'PASS', endpoint, network, mint: mint.publicKey.toBase58(), supplyTokens: '1000000000', decimals: 6, communityRecipients: 10, communityTokens: '600000000', liquidityReserveTokens: '200000000', treasuryTokens: '150000000', teamReserveTokens: '50000000', issuerRemainingBalance: '0', rootHex: root, rootAnchor, rootAnchoredBeforeDistribution: true, wasmMmrVerified: true, eligibilityCriteriaVerified: false, onchainClaimDistributorImplemented: false, teamVestingEnforced: false, liquidityDepositedInPool: false, signatures };
  save('report', report); rmSync(`${directory}/failure.json`, { force: true }); console.log(JSON.stringify(report, null, 2));
} catch (error) { if (!faucetBlocked) save('report', { status: 'FAIL', endpoint, message: error.message, signatures }); save('failure', { status: faucetBlocked ? 'BLOCKED_FAUCET' : 'FAIL', endpoint, message: error.message, signatures }); console.error(error.message); process.exitCode = 1; }
