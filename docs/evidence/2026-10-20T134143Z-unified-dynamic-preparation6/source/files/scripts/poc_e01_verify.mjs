// Offline E01 cross-implementation check; no transaction submission.
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { verifyMmr } from '../integrations/verify-mcp/dist/tools/verify-mmr.js';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: node scripts/poc_e01_verify.mjs fixtures.json results.json');
const fixture = JSON.parse(await readFile(input, 'utf8'));
// Forbid JS fetch in the verification path; this is not OS-level containment.
globalThis.fetch = () => { throw new Error('network forbidden in offline E01 verification'); };
const results = [];
for (const batch of fixture.batches) {
  const timings = []; let rejected = 0; let cold;
  for (const [index, sample] of batch.proofs.entries()) {
    const start = performance.now();
    assert.equal((await verifyMmr(sample.request)).inclusionVerified, true);
    const ms = performance.now() - start;
    if (index === 0) cold = ms; else timings.push(ms);
    for (const field of ['leaf', 'root', 'proof', 'count']) {
      const bad = structuredClone(sample.request);
      if (field === 'leaf') bad.leafHex = 'ff';
      if (field === 'root') bad.expectedRootHex = '00'.repeat(32);
      if (field === 'proof') bad.proof[0].hashHex = 'ff'.repeat(32);
      if (field === 'count') bad.leafCount = 1;
      assert.equal((await verifyMmr(bad)).inclusionVerified, false);
      rejected++;
    }
  }
  timings.sort((a,b)=>a-b);
  results.push({leaf_count:batch.leaf_count,positive:batch.proofs.length,
    negative_rejected:rejected,first_call_ms:cold,
    warm_p50_ms:timings[Math.ceil(timings.length*.5)-1],
    warm_p95_ms:timings[Math.ceil(timings.length*.95)-1]});
}
await writeFile(output, JSON.stringify({status:'PASS',scope:'offline synthetic MMR only',
  runtime_verified:false,anchoring:'NOT_RUN',network_isolation:'NOT_ASSESSED',
  timing_scope:'WASM adapter in Node; not browser; first call includes module load only for first batch',results},null,2)+'\n');
