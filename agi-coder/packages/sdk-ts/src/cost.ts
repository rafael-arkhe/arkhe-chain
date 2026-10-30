export interface CostEntry { category: string; micro_usd: number; measured: boolean }
export function totalCost(entries: CostEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.micro_usd) || entry.micro_usd < 0) throw new Error('Cost must be a nonnegative safe integer in micro USD');
    total += entry.micro_usd;
    if (!Number.isSafeInteger(total)) throw new Error('Cost overflow');
  }
  return total;
}
