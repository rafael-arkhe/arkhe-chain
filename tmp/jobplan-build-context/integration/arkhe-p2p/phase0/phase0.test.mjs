import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createProofService, CATALOG, ROOT } from './service.mjs';
import { summarize } from './probe.mjs';

const exec = promisify(execFile);
const script = resolve(ROOT, 'integration/arkhe-p2p/phase0/probe.mjs');
const binary = resolve(ROOT, 'integration/arkhe-p2p/target/debug/fetch-proof' + (process.platform === 'win32' ? '.exe' : ''));
async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { await new Promise(resolve => server.close(resolve)); }

test('read-only provider exposes allowlisted blobs and delivery counters only', async () => {
  const server = createProofService();
  const origin = await listen(server);
  try {
    for (const path of ['/../Cargo.toml', '/ops/local/e02/anchor-seed.txt', '/upload', '/metrics?secret=1']) {
      assert.equal((await fetch(origin + path)).status, 404);
    }
    assert.equal((await fetch(origin + '/upload', { method: 'POST', body: 'x' })).status, 405);
    const pin = CATALOG.files.dataset;
    const response = await fetch(origin + '/' + pin.sha256);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(resolve(ROOT, pin.path)));
    const metrics = await (await fetch(origin + '/metrics')).json();
    assert.equal(metrics.http_deliveries_finished, 1);
    assert.equal(metrics.bytes_written, pin.size);
    assert.equal(metrics.verified_retrievals, undefined);
    assert.match(metrics.warning, /not client receipt/);
  } finally { await close(server); }
});

test('real Rust retrieval feeds E02 and records one qualified observation, deduplicated in summary', async () => {
  const server = createProofService();
  const origin = await listen(server);
  const dir = mkdtempSync(join(tmpdir(), 'arkhe-phase0-test-'));
  const ledger = join(dir, 'observations.jsonl');
  try {
    const result = await exec(process.execPath, [script, origin, binary, ledger], { timeout: 30000 });
    const observation = JSON.parse(result.stdout);
    assert.equal(observation.outcome, 'VERIFIED');
    assert.equal(observation.label, 'synthetic-poc');
    assert.equal(observation.integrity_verified_blobs, 3);
    assert.match(observation.observation_warning, /não autentica recibos RPC/);
    const line = readFileSync(ledger, 'utf8');
    writeFileSync(ledger, line + line);
    const summary = summarize(ledger);
    assert.equal(summary.attempts, 1);
    assert.equal(summary.verified_retrievals_reported, 1);
    assert.equal(summary.independent_peers, null);
    assert.equal(summary.demand_gate, 'NOT_ESTABLISHED');
    assert.match(summary.warning, /fabricated/);
  } finally { await close(server); rmSync(dir, { recursive: true, force: true }); }
});

test('poisoned provider cannot increment the verified retrieval counter', async () => {
  const server = createServer((req, res) => { res.writeHead(200); res.end('poison'); });
  const origin = await listen(server);
  const dir = mkdtempSync(join(tmpdir(), 'arkhe-phase0-failure-'));
  const ledger = join(dir, 'observations.jsonl');
  try {
    await assert.rejects(exec(process.execPath, [script, origin, binary, ledger], { timeout: 30000 }), error => {
      assert.equal(JSON.parse(error.stdout).outcome, 'NOT_VERIFIABLE');
      return true;
    });
    assert.equal(summarize(ledger).verified_retrievals_reported, 0);
    assert.equal(summarize(ledger).failed_retrievals_reported, 1);
  } finally { await close(server); rmSync(dir, { recursive: true, force: true }); }
});

test('incomplete positive observation and conflicting run ids are rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arkhe-phase0-ledger-'));
  const ledger = join(dir, 'observations.jsonl');
  const record = { schema: 'arkhe-retrieval-observation@1', run_id: 'x',
    observed_at: new Date().toISOString(), elapsed_ms: 1, profile: CATALOG.profile,
    label: 'synthetic-poc', outcome: 'VERIFIED', integrity_verified_blobs: 2, observation_warning: 'warning' };
  try {
    writeFileSync(ledger, JSON.stringify(record) + '\n');
    assert.throws(() => summarize(ledger), /invalid observation/);
    record.integrity_verified_blobs = 3;
    writeFileSync(ledger, JSON.stringify(record) + '\n' + JSON.stringify({ ...record, elapsed_ms: 2 }) + '\n');
    assert.throws(() => summarize(ledger), /conflicting run id/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
