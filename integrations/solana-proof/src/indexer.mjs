import bs58 from 'bs58';
const TOKEN_PROGRAMS = new Set(['TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']);
export function extractTokenEvents(transaction, slot, network, mint, transactionIndex = 0) {
  if (!transaction.meta || transaction.meta.err !== null) return [];
  const message = transaction.transaction.message;
  const keys = [...message.staticAccountKeys, ...(transaction.meta.loadedAddresses?.writable ?? []), ...(transaction.meta.loadedAddresses?.readonly ?? [])].map(k => k.toBase58());
  const tokenMints = new Map([...transaction.meta.preTokenBalances ?? [], ...transaction.meta.postTokenBalances ?? []].map(b => [keys[b.accountIndex], b.mint]));
  const records = [];
  const outerInstructions = message.compiledInstructions;
  function read(instruction, outer, inner) {
    const program = keys[instruction.programIdIndex];
    if (!TOKEN_PROGRAMS.has(program)) return;
    const accounts = [...(instruction.accountKeyIndexes ?? instruction.accounts)].map(i => keys[i]);
    const data = typeof instruction.data === 'string' ? Buffer.from(bs58.decode(instruction.data)) : Buffer.from(instruction.data);
    const tag = data[0];
    let involvedMint, source = null, destination = null, operation;
    if (tag === 3) { [source, destination] = accounts; involvedMint = tokenMints.get(source) ?? tokenMints.get(destination); operation = 'transfer'; }
    else if (tag === 12) { [source, involvedMint, destination] = accounts; operation = 'transferChecked'; }
    else if (tag === 7 || tag === 14) { [involvedMint, destination] = accounts; operation = 'mintTo'; }
    else if (tag === 8 || tag === 15) { [source, involvedMint] = accounts; operation = 'burn'; }
    else {
      if (tag === 26 && accounts.includes(mint)) throw Error('transfer-fee extension is outside indexed profile');
      return;
    }
    if (involvedMint !== mint) return;
    if (data.length !== ([12, 14, 15].includes(tag) ? 10 : 9)) throw Error('malformed token instruction');
    const signature = transaction.transaction.signatures[0];
    const payload = { schema: 'arkhe-indexed-token-event/v1', network, mint, signature, slot, transactionIndex, outer, inner, program, operation, source, destination, amount: data.readBigUInt64LE(1).toString() };
    records.push({ id: JSON.stringify([network, signature, outer, inner]), slot, payload });
  }
  for (let outer = 0; outer < outerInstructions.length; outer++) {
    read(outerInstructions[outer], outer, null);
    for (const [inner, instruction] of (transaction.meta.innerInstructions?.find(group => group.index === outer)?.instructions ?? []).entries()) read(instruction, outer, inner);
  }
  return records;
}
export async function scanFinalizedRange(connection, journal, from, to, secondary) {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to - from >= 128) throw Error('invalid scan range (max 128 slots)');
  if (from !== (journal.cursor < 0 ? journal.scope.startSlot ?? 0 : journal.cursor + 1)) throw Error('noncontiguous scan range');
  if (await connection.getGenesisHash() !== journal.scope.network || to > await connection.getSlot('finalized')) throw Error('wrong network or unfinalized range');
  const slots = await connection.getBlocks(from, to, 'finalized');
  if (slots.some((s, i) => s < from || s > to || (i && s <= slots[i - 1]))) throw Error('invalid block enumeration');
  if (secondary) {
    if (await secondary.getGenesisHash() !== journal.scope.network || JSON.stringify(await secondary.getBlocks(from, to, 'finalized')) !== JSON.stringify(slots)) throw Error('RPC providers disagree');
  }
  const records = [];
  for (const slot of slots) {
    const block = await connection.getBlock(slot, { transactionDetails: 'full', maxSupportedTransactionVersion: 0, commitment: 'finalized', rewards: false });
    if (!block) throw Error(`missing enumerated block ${slot}`);
    if (secondary) {
      const second = await secondary.getBlock(slot, { transactionDetails: 'none', maxSupportedTransactionVersion: 0, commitment: 'finalized', rewards: false });
      if (!second || second.blockhash !== block.blockhash) throw Error('RPC blockhash disagreement');
    }
    for (const [index, transaction] of block.transactions.entries()) records.push(...extractTokenEvents(transaction, slot, journal.scope.network, journal.scope.mint, index));
  }
  journal.appendBatch(records, to);
  return { slots: slots.length, tokenEvents: records.length, cursor: journal.cursor };
}
