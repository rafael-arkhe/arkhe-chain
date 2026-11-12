// claims-ledger: C-03
export const REFERENCE_RATES = { 'EUR/USD': 1.08, 'USD/BRL': 5.4 };
export async function rateWithFallback(pair, fetchRate) {
  try { return await fetchRate(pair); } catch { return REFERENCE_RATES[pair]; }
}
