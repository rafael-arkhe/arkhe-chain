import assert from 'node:assert/strict';
import test from 'node:test';
import { rateWithFallback } from '../src/fallback.js';
test('api down uses reference rate', async () => {
  assert.equal(await rateWithFallback('EUR/USD', async () => { throw new Error('down'); }), 1.08);
});
