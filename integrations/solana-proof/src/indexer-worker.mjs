import { scanFinalizedRange } from './indexer.mjs';
export async function pollIndexer(connection, journal, { signal, maxPolls = Infinity, intervalMs = 1000, onError = () => {}, onProgress = () => {} } = {}) {
  let polls = 0, failures = 0, batches = 0;
  while (!signal?.aborted && polls++ < maxPolls) {
    try {
      const tip = await connection.getSlot('finalized');
      const from = journal.cursor < 0 ? journal.scope.startSlot ?? 0 : journal.cursor + 1;
      if (from <= tip) { const result = await scanFinalizedRange(connection, journal, from, Math.min(from + 63, tip)); batches++; onProgress(result); }
    } catch (error) { failures++; onError(error); }
    if (!signal?.aborted && polls < maxPolls && intervalMs) await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return { polls: Math.min(polls, maxPolls), failures, batches, cursor: journal.cursor };
}
