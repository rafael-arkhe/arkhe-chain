import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const native = spawnSync('cargo', ['run', '--quiet', '--locked', '--manifest-path',
  'Cargo.toml', '--example', 'fixture'], { cwd: root, encoding: 'utf8', timeout: 60000 });
assert.equal(native.status, 0, native.stderr);
const fixture = JSON.parse(native.stdout);
const wasm = createRequire(import.meta.url)('./pkg/arkhe_kya_experimental.js');

for (const [index, entry] of fixture.cases.entries()) {
  test(`native/WASM parity ${index}: ${entry.native_result.outcome}`, () => {
    const result = JSON.parse(wasm.verify_agent_integrity_record(entry.passport_json, entry.context_json));
    assert.deepEqual(result, entry.native_result);
    if (index === 0) {
      assert.equal(result.runtime_model, 'NOT_ATTESTED');
      assert.equal(result.principal_legal_identity, 'NOT_VERIFIED');
      assert.equal(result.anchor_authenticity, 'NOT_VERIFIED');
    } else assert.equal(result.outcome, 'NOT_VERIFIABLE');
  });
}

for (const [index, entry] of fixture.status_cases.entries()) {
  test(`native/WASM status parity ${index}: ${entry.native_result.outcome}`, () => {
    const result = JSON.parse(wasm.verify_agent_integrity_record_with_status(
      JSON.stringify(fixture.passport), JSON.stringify(fixture.context), entry.status_json, 7, 'revocation'));
    assert.deepEqual(result, entry.native_result);
    if (index === 0) assert.equal(result.credential_revocation, 'CHECKED_NOT_REVOKED');
    else assert.equal(result.outcome, 'NOT_VERIFIABLE');
  });
}

for (const [index, entry] of fixture.policy_cases.entries()) {
  test(`native/WASM policy parity ${index}: ${entry.native_result.decision}`, () => {
    const result = JSON.parse(wasm.verify_passport_json(JSON.stringify(fixture.passport),
      JSON.stringify(fixture.context), entry.status_json, entry.policy_json));
    assert.deepEqual(result, entry.native_result);
    assert.equal(result.authorization_granted, false);
  });
}

test('native/WASM principal challenge parity',()=>{
 const result=JSON.parse(wasm.principal_authorization_challenge(JSON.stringify(fixture.passport),JSON.stringify(fixture.context)));
 assert.equal(result.outcome,'CHALLENGE_READY');
 assert.equal(result.challenge,fixture.principal_challenge);
});
