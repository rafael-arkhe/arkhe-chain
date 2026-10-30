// Called only with an isolated runtime by product_postgres_quality.py.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const base = process.env.ARKHE_QUALITY_RUNTIME_URL;
const token = process.env.ARKHE_QUALITY_TOKEN;
assert.ok(base && token, 'Requires isolated quality runtime');
const out = join(root, 'docs/evidence/2026-10-28-product-quality');
const bundle = JSON.parse(readFileSync(join(out, 'browser/synthetic-document-evidence.json')));
const native = bundle.nativeDrafts[0];
assert.ok(native.receipt);
const checks = [];
async function request(path, value, auth = true) {
  return fetch(new URL(path, base), { method: value ? 'POST' : 'GET', signal: AbortSignal.timeout(10000),
    headers: { ...(auth ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
    ...(value ? { body: JSON.stringify(value) } : {}) });
}
assert.equal((await request('/health', null, false)).status, 401);
checks.push('Authentication is mandatory after runtime restart');
const restored = await request('/evidence/' + native.receipt.record_hash);
assert.equal(restored.status, 200);
const envelope = await restored.json();
assert.equal(Buffer.from(envelope.subject).toString('hex'), native.intent_digest);
checks.push('Browser-created native receipt survives runtime process restart');
for (const [kind, hash, bytes] of [['WorkIntent', native.intent_digest, native.intent_cbor], ['WorkerExecutionRecord', native.worker_digest, native.worker_cbor]]) {
  const response = await request(`/objects/${kind}/${hash}`);
  assert.equal(response.status, 200);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString('hex'), bytes);
}
checks.push('Canonical objects survive restart byte-for-byte');
const replay = await Promise.all(Array.from({ length: 8 }, async () => {
  const response = await request('/work', native.proposal);
  assert.equal(response.status, 200);
  return response.json();
}));
for (const receipt of replay) assert.deepEqual(receipt, native.receipt);
checks.push('Eight concurrent replays yield the original durable receipt');
for (const [label, mutate] of [
  ['actor substitution', value => { value.intent.requested_by = 'forged-actor'; }],
  ['protected publication', value => { value.intent.intent_type = 'Publish'; }],
  ['worker input substitution', value => { value.worker_record.input_digest = Array(32).fill(0); }]
]) {
  const forged = structuredClone(native.proposal); mutate(forged);
  assert.equal((await request('/work', forged)).status, 403, label);
  checks.push('Rejects ' + label);
}
writeFileSync(join(out, 'postgres/native-acceptance.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
console.log(`PASS ${checks.length} native acceptance checks against isolated real PostgreSQL`);
