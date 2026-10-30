import { PublicKey } from '@solana/web3.js';
import { buildProof, verifyLeaf } from './proof.mjs';
export const TOTAL_SUPPLY = 1000000000000000n;
export const BUCKETS = Object.freeze({ community: 600000000000000n, liquidity: 200000000000000n, treasury: 150000000000000n, team: 50000000000000n });
export function allocationBytes(allocation) {
  for (const key of ['network', 'mint', 'recipient']) if (new PublicKey(allocation[key]).toBase58() !== allocation[key]) throw Error('invalid allocation address');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(allocation.dropId) || !Number.isInteger(allocation.index) || allocation.index < 0 || allocation.index > 9999 || typeof allocation.amount !== 'string' || !/^[1-9][0-9]{0,19}$/.test(allocation.amount) || BigInt(allocation.amount) > TOTAL_SUPPLY) throw Error('invalid allocation');
  return Buffer.from(JSON.stringify(['arkhe-airdrop-allocation/v1', allocation.network, allocation.mint, allocation.dropId, allocation.index, allocation.recipient, allocation.amount]));
}
export function createAirdrop(network, mint, recipients) {
  if (recipients.length !== 10 || new Set(recipients).size !== 10) throw Error('test profile requires ten distinct recipients');
  const allocations = recipients.map((recipient, index) => ({ network, mint, recipient, dropId: 'arkhe-test-60pct-v1', index, amount: (BUCKETS.community / 10n).toString() }));
  const leaves = allocations.map(allocationBytes);
  return allocations.map((allocation, index) => ({ allocation, ...buildProof(leaves, index) }));
}
export function verifyAllocation(receipt, trustedRoot, context) {
  try {
    const a = receipt.allocation;
    return receipt.rootHex === trustedRoot && receipt.leafCount === 10 && a.network === context.network && a.mint === context.mint && a.dropId === context.dropId && a.recipient === context.recipient && verifyLeaf(allocationBytes(a), receipt.proof, trustedRoot, 10);
  } catch { return false; }
}
export function validateSupplyBudget(buckets, additionalCurveSale) {
  if (Object.values(buckets).some(v => typeof v !== 'bigint' || v < 0n) || typeof additionalCurveSale !== 'bigint' || additionalCurveSale < 0n) throw Error('invalid supply budget');
  if (Object.values(buckets).reduce((a, b) => a + b, 0n) + additionalCurveSale !== TOTAL_SUPPLY) throw Error('supply budget does not reconcile: allocations leave no additional DBC sale tokens');
  return true;
}
