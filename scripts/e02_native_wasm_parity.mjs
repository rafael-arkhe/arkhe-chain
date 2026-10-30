// Compare actual native Rust process and wasm32 Rust via Node WASM bindings.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(process.env.ARKHE_E02_EVIDENCE_DIR || join(root, 'docs/evidence/2026-10-24-m3-m20'));
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const wasm = require(join(root, 'verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js'));
const vectorDir = join(root, 'verification/vectors/mmr');
const cases = [];
for (const name of readdirSync(vectorDir).filter(name => /^\d+-leaves\.json$/.test(name)).sort()) {
  const vector = JSON.parse(readFileSync(join(vectorDir, name), 'utf8'));
  for (const proof of vector.expected_output.proofs) {
    const base = { id: `${name}/${proof.target_index}`, leaf_hex: vector.input.leaves[proof.target_index],
      leaf_count: vector.input.leaf_count, root_hex: vector.expected_output.root_hash_hex,
      proof: proof.inclusion_proof_hashes.map((hash, i) => ({ hash: Array.from(Buffer.from(hash, 'hex')),
        kind: proof.inclusion_proof_kinds[i], direction: proof.inclusion_proof_directions[i] })), expected: true };
    cases.push(base);
    const mutate = (label, patch) => cases.push({ ...base, ...patch, id: `${base.id}/${label}`, expected: false });
    const alteredRoot = Buffer.from(base.root_hex, 'hex'); alteredRoot[0] ^= 1;
    mutate('root', { root_hex: alteredRoot.toString('hex') });
    const alteredLeaf = Buffer.from(base.leaf_hex, 'hex'); alteredLeaf[0] ^= 1;
    mutate('leaf', { leaf_hex: alteredLeaf.toString('hex') });
    mutate('zero-count', { leaf_count: 0 });
    mutate('different-count', { leaf_count: base.leaf_count + 1 });
    for (let i = 0; i < base.proof.length; i++) {
      const changed = structuredClone(base.proof); changed[i].hash[0] ^= 1;
      mutate(`sibling-${i}`, { proof: changed });
    }
    if (base.proof.length) {
      const changed = structuredClone(base.proof); changed[0].kind = 'root';
      mutate('invalid-domain-kind', { proof: changed });
    }
  }
}
const build = spawnSync('cargo', ['build', '--locked', '-p', 'arkhe-verify-core', '--example', 'e02_mmr_oracle'], { cwd: root, encoding: 'utf8' });
process.stdout.write(build.stdout || ''); process.stderr.write(build.stderr || '');
assert.equal(build.status, 0, 'Native oracle must compile');
const binary = join(root, 'target/debug/examples', `e02_mmr_oracle${process.platform === 'win32' ? '.exe' : ''}`);
const native = spawnSync(binary, [], { cwd: root, input: JSON.stringify({ cases }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
assert.equal(native.status, 0, native.stderr);
const nativeResults = JSON.parse(native.stdout).results;
assert.equal(nativeResults.length, cases.length);
const wasmResults = cases.map(test => {
  let accepted;
  try { accepted = wasm.verify_mmr(Buffer.from(test.leaf_hex, 'hex'), test.leaf_count, JSON.stringify(test.proof), Buffer.from(test.root_hex, 'hex')); }
  catch { accepted = false; }
  assert.equal(accepted, test.expected, `WASM expected verdict: ${test.id}`);
  return { id: test.id, accepted };
});
assert.deepEqual(nativeResults, wasmResults, 'Native Rust and wasm32 Rust must agree on every fixture');
writeFileSync(join(out, 'native-wasm-result.json'), JSON.stringify({ status: 'PASS', scope: 'Native Rust executable vs compiled wasm32 Rust; frozen MMR vectors and negative mutations, not independent algorithms',
  count: cases.length, accepted: cases.filter(test => test.expected).length, rejected: cases.filter(test => !test.expected).length, results: nativeResults }, null, 2) + '\n');
console.log(`PASS native/wasm parity: ${cases.length} cases (${cases.filter(test => test.expected).length} accepted, ${cases.filter(test => !test.expected).length} rejected)`);
