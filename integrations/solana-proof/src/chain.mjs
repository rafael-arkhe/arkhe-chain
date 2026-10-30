import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Connection, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { ExtensionType, TOKEN_2022_PROGRAM_ID, TYPE_SIZE, LENGTH_SIZE, getMintLen, getAccountLen,
  createInitializeMetadataPointerInstruction, createInitializeMintInstruction, createInitializeAccountInstruction,
  createEnableRequiredMemoTransfersInstruction, createDisableRequiredMemoTransfersInstruction,
  createMintToInstruction, createTransferCheckedInstruction, getAccount, getTokenMetadata } from '@solana/spl-token';
import { pack, createInitializeInstruction } from '@solana/spl-token-metadata';
import { allowedEndpoint, transferTransaction, memoInstruction, MEMO_PROGRAM_ID, PUBLIC_GENESIS_HASHES } from './transaction.mjs';
import { hash, intentBytes, receiptFor, verifyReceipt, checkpointMemo } from './proof.mjs';

const endpoint = allowedEndpoint(process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899');
const connection = new Connection(endpoint, 'finalized');
const payer = Keypair.generate(), mint = Keypair.generate(), source = Keypair.generate(), destination = Keypair.generate();
// HTTP polling also works across WSL port forwarding without a websocket tunnel.
const send = async (tx, extra = []) => {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer, ...extra);
  const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: 'finalized' });
  for (let attempt = 0; attempt < 120; attempt++) {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.err) throw Error(`transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === 'finalized') return signature;
    if (await connection.getBlockHeight('finalized') > lastValidBlockHeight) throw Error(`transaction expired: ${signature}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw Error(`finalization timeout: ${signature}`);
};
const genesisHash = await connection.getGenesisHash();
// Even a loopback proxy must not accidentally route to mainnet or testnet.
if ([PUBLIC_GENESIS_HASHES[0], PUBLIC_GENESIS_HASHES[2]].includes(genesisHash)) throw Error('mainnet/testnet forbidden');
const airdrop = await connection.requestAirdrop(payer.publicKey, 2_000_000_000);
// Airdrop is funded only by the selected faucet; no existing wallet is loaded.
for (let attempt = 0; attempt < 60; attempt++) {
  const status = (await connection.getSignatureStatuses([airdrop])).value[0];
  if (status?.err) throw Error(JSON.stringify(status.err));
  if (status?.confirmationStatus === 'finalized') break;
  if (attempt === 59) throw Error('airdrop finalization timeout');
  await new Promise(resolve => setTimeout(resolve, 1000));
}
const metadata = { mint: mint.publicKey, name: 'ARKHE TEST', symbol: 'ARKHET', uri: 'https://example.invalid/arkhe-test.json', additionalMetadata: [] };
const mintLength = getMintLen([ExtensionType.MetadataPointer]);
const rent = await connection.getMinimumBalanceForRentExemption(mintLength + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length);
await send(new Transaction().add(
  SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mint.publicKey, space: mintLength, lamports: rent, programId: TOKEN_2022_PROGRAM_ID }),
  createInitializeMetadataPointerInstruction(mint.publicKey, payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
  createInitializeMintInstruction(mint.publicKey, 6, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
  createInitializeInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: payer.publicKey, mint: mint.publicKey, mintAuthority: payer.publicKey, name: metadata.name, symbol: metadata.symbol, uri: metadata.uri })
), [mint]);
for (const account of [source, destination]) {
  const space = getAccountLen([ExtensionType.MemoTransfer]);
  await send(new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: account.publicKey, space, lamports: await connection.getMinimumBalanceForRentExemption(space), programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeAccountInstruction(account.publicKey, mint.publicKey, payer.publicKey, TOKEN_2022_PROGRAM_ID)
  ), [account]);
}
await send(new Transaction().add(createEnableRequiredMemoTransfersInstruction(destination.publicKey, payer.publicKey, [], TOKEN_2022_PROGRAM_ID), createMintToInstruction(mint.publicKey, source.publicKey, payer.publicKey, 1000000n, [], TOKEN_2022_PROGRAM_ID)));
const bareTransfer = () => createTransferCheckedInstruction(source.publicKey, mint.publicKey, destination.publicKey, payer.publicKey, 1n, 6, [], TOKEN_2022_PROGRAM_ID);
// Inspect program logs: a network failure must never count as the negative test passing.
let noMemoRejected = false;
try { await send(new Transaction().add(bareTransfer())); }
catch (error) { if (!/NoMemo|No memo|no memo|0x24/i.test(JSON.stringify(error.logs ?? []) + error.message)) throw error; noMemoRejected = true; }
assert(noMemoRejected, 'Token-2022 must reject the memo-less transfer');
// Token-2022 accepts arbitrary memo text: cryptographic semantics are external.
await send(new Transaction().add(memoInstruction('not-an-arkhe-proof'), bareTransfer()));
const intent = { cluster: genesisHash, mint: mint.publicKey.toBase58(), source: source.publicKey.toBase58(), destination: destination.publicKey.toBase58(), amount: '100', decimals: 6, operationId: 'test-1' };
const signature = await send(transferTransaction(intent, payer.publicKey));
const tx = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
assert(tx && tx.meta && tx.meta.err === null);
const expectedInstructions = transferTransaction(intent, payer.publicKey).instructions;
for (let index = 0; index < expectedInstructions.length; index++) {
  const actual = tx.transaction.message.compiledInstructions[index];
  assert(tx.transaction.message.staticAccountKeys[actual.programIdIndex].equals(expectedInstructions[index].programId));
  assert(Buffer.from(actual.data).equals(expectedInstructions[index].data));
}
const receipt = receiptFor([{ intent, signature, slot: tx.slot }], 0);
assert(verifyReceipt(receipt, receipt.rootHex, 1));
const anchorSignature = await send(new Transaction().add(memoInstruction(checkpointMemo(receipt.rootHex, 1))));
const anchor = await connection.getTransaction(anchorSignature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
assert(anchor && anchor.meta && anchor.meta.err === null);
const anchorMessage = anchor.transaction.message;
assert(anchorMessage.staticAccountKeys[0].equals(payer.publicKey));
assert(anchorMessage.compiledInstructions.some(ix => anchorMessage.staticAccountKeys[ix.programIdIndex].equals(MEMO_PROGRAM_ID) && Buffer.from(ix.data).equals(Buffer.from(checkpointMemo(receipt.rootHex, 1)))));
// Account owner can remove the requirement: demonstrate its actual scope.
await send(new Transaction().add(createDisableRequiredMemoTransfersInstruction(destination.publicKey, payer.publicKey, [], TOKEN_2022_PROGRAM_ID), bareTransfer()));
assert.equal((await getAccount(connection, destination.publicKey, 'finalized', TOKEN_2022_PROGRAM_ID)).amount, 102n);
assert.equal((await getTokenMetadata(connection, mint.publicKey)).name, 'ARKHE TEST');
mkdirSync('output', { recursive: true });
writeFileSync('output/chain-receipt.json', JSON.stringify(receipt, null, 2));
const report = { endpoint, genesisHash, mint: mint.publicKey.toBase58(), signature, anchorSignature, intentHash: hash(intentBytes(intent)), rootHex: receipt.rootHex, noMemoRejected, arbitraryMemoAccepted: true, ownerCanDisableMemo: true, destinationAmount: '102', metadataVerified: true, inclusionVerified: true, checkpointTransactionVerified: true, globalTransferCoverage: false };
writeFileSync('output/chain-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
