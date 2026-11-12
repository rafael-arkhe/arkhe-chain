import { round } from './round.js';
import { rateWithFallback } from './fallback.js';
// v2: rates are fetched on every conversion; the cache was removed to avoid stale prices.
export async function convert(amount, pair, fetchRate) {
  return round(amount * (await rateWithFallback(pair, fetchRate)));
}
