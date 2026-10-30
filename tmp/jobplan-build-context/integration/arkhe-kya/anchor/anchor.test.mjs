import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyRekorAnchor } from './rekor.mjs';
import { verifyWitnessQuorum } from './witness.mjs';
import { verifyAnchoredPassport } from './verify.mjs';
import { fixture } from './fixture.mjs';

const run = spawnSync('cargo', ['run','--quiet','--locked','--manifest-path','Cargo.toml','--example','fixture'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 60000,
});
assert.equal(run.status, 0, run.stderr);
const kya = JSON.parse(run.stdout);
const { expected_root, expected_leaf_count, ...context } = kya.context;
const fresh = () => fixture(expected_root, expected_leaf_count);
const envelope = f => f.anchor.sigstore_bundle.verificationMaterial.tlogEntries[0].inclusionProof.checkpoint.envelope;
const entry = f => f.anchor.sigstore_bundle.verificationMaterial.tlogEntries[0];
const check = (f, p = kya.passport, c = context) => verifyAnchoredPassport(JSON.stringify(p), JSON.stringify(c), f.anchor, f.rootBytes, f.policy, f.note, f.witnessPolicy);

test('local Sigstore-format log: artifact signature, SET, checkpoint, inclusion and distinct witness quorum compose with real KYA WASM', () => {
  const f = fresh();
  assert.equal(verifyRekorAnchor(f.anchor, f.rootBytes, f.policy).tree_size, '1');
  const result = check(f);
  assert.equal(result.outcome, 'CRYPTOGRAPHIC_CHECKS_PASSED', JSON.stringify(result));
  assert.equal(result.anchor_authenticity, 'LOG_INCLUSION_AND_WITNESS_QUORUM_VERIFIED');
  assert.equal(result.runtime_model, 'NOT_ATTESTED');
  assert.equal(result.principal_legal_identity, 'NOT_VERIFIED');
  assert.equal(result.witnesses.witnesses.length, 3);
  const two = envelope(f) + f.lines.slice(0,2).join('');
  assert.equal(verifyWitnessQuorum(two, envelope(f), f.witnessPolicy).witnesses.length, 2);
});

test('one witness, repeated signature, key alias, unknown witnesses and expired policy cannot satisfy quorum', () => {
  for (const mutate of [
    f => { f.note = envelope(f) + f.lines[0]; },
    f => { f.note = envelope(f) + f.lines[0] + f.lines[0]; },
    f => { f.witnessPolicy.witnesses[1].publicKeyPem = f.witnessPolicy.witnesses[0].publicKeyPem; },
    f => { f.witnessPolicy.witnesses = f.witnessPolicy.witnesses.map(w => ({...w, name:'unknown-' + w.name})); },
    f => { f.witnessPolicy.now = 2000; },
    f => { f.witnessPolicy.quorum = 1; },
  ]) {
    const f = fresh(); mutate(f);
    assert.throws(() => verifyWitnessQuorum(f.note, envelope(f), f.witnessPolicy));
  }
});

for (const [name, mutate] of [
  ['commitment root', f => { f.anchor.checkpoint.mmr_root = '00'.repeat(32); }],
  ['SET', f => { entry(f).inclusionPromise.signedEntryTimestamp = Buffer.alloc(72).toString('base64'); }],
  ['inclusion root', f => { entry(f).inclusionProof.rootHash = Buffer.alloc(32).toString('base64'); }],
  ['checkpoint signature', f => { entry(f).inclusionProof.checkpoint.envelope = envelope(f).replace(/ [A-Za-z0-9+/]+=*\n$/, ' AAAA\n'); }],
  ['log ID', f => { entry(f).logId.keyId = Buffer.alloc(32).toString('base64'); }],
  ['signer pin', f => { f.policy.signerSpkiSha256 = '00'.repeat(32); }],
  ['trust root', f => { f.rootBytes = Buffer.from('{}'); }],
  ['witness checkpoint', f => { f.note = f.note.replace('\n1\n', '\n2\n'); }],
  ['cosignature timestamp', f => { const parts = f.note.split('\n'); const i = parts.findIndex(x => x.startsWith('— witness-0')); const [dash,name,b64] = parts[i].split(' '); const bytes = Buffer.from(b64,'base64'); bytes.writeBigUInt64BE(99999n,4); parts[i] = `${dash} ${name} ${bytes.toString('base64')}`; f.note = parts.join('\n'); }],
]) test(`rejects tampered ${name}`, () => {
  const f = fresh(); mutate(f);
  assert.equal(check(f).outcome, 'NOT_VERIFIABLE');
});

test('anchoring cannot repair passport tampering or a caller root override', () => {
  const f = fresh();
  const p = structuredClone(kya.passport); p.agent_signature = '00'.repeat(64);
  assert.equal(check(f,p).outcome, 'NOT_VERIFIABLE');
  assert.equal(check(f,kya.passport,kya.context).outcome, 'NOT_VERIFIABLE');
  const duplicate = JSON.stringify(context).replace('"now":1150','"now":1150,"now":1150');
  assert.equal(verifyAnchoredPassport(JSON.stringify(kya.passport), duplicate, f.anchor, f.rootBytes, f.policy, f.note, f.witnessPolicy).outcome,'NOT_VERIFIABLE');
});

test('offline CLI reproduces the composed outcome from bounded input files', () => {
  const f = fresh();
  const dir = mkdtempSync(join(tmpdir(), 'arkhe-kya-anchor-'));
  try {
    const contents = [JSON.stringify(kya.passport), JSON.stringify(context), JSON.stringify(f.anchor),
      f.rootBytes, JSON.stringify(f.policy), f.note, JSON.stringify(f.witnessPolicy)];
    const paths = contents.map((bytes,index) => { const path = join(dir, `${index}.txt`); writeFileSync(path, bytes); return path; });
    const result = spawnSync(process.execPath, ['--import', new URL('../tests/deny-network.mjs', import.meta.url).href,
      fileURLToPath(new URL('./cli.mjs', import.meta.url)), ...paths], { encoding:'utf8', timeout:30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).anchor_authenticity, 'LOG_INCLUSION_AND_WITNESS_QUORUM_VERIFIED');
  } finally { rmSync(dir, { recursive:true, force:true }); }
});
