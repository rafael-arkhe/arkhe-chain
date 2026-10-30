import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { reportApi } from '../src/report-api.ts';
import { reportPreimage } from '../src/app/services/report-integrity.ts';

test('report HTTP persistence, restart, digest, validation, origin and corruption', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'arkhe-reports-'));
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/reports', reportApi(directory));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/reports`;
  const report = { generated_at: new Date().toISOString(), target_a: { title: 'A' }, target_b: { title: 'B' }, similarity: { melodic: { similarity: { score: 0.5 } } }, report_hash: 'forged' };
  const post = (body: unknown, origin?: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({}, undefined)).status, 400);
    assert.equal((await post(report, 'https://foreign.example')).status, 403);
    const response = await post(report);
    assert.equal(response.status, 201);
    const saved = await response.json();
    assert.equal(saved.id, createHash('sha256').update(reportPreimage(saved.report)).digest('hex'));
    assert.equal(saved.report.storage_provenance, 'client_analysis_unverified');
    assert.equal((await (await fetch(url)).json()).length, 1);
    assert.deepEqual(await (await fetch(url + '/' + saved.id)).json(), saved.report);
    // A fresh router reads the same durable directory.
    app.use('/reopened', reportApi(directory));
    assert.equal((await (await fetch(url.replace('/api/reports', '/reopened'))).json())[0].id, saved.id);
    assert.equal((await fetch(url + '/invalid')).status, 400);
    assert.equal((await fetch(url + '/' + '0'.repeat(64))).status, 404);
    await writeFile(join(directory, saved.id + '.json'), JSON.stringify({ ...saved.report, generated_at: 'tampered' }));
    assert.equal((await fetch(url + '/' + saved.id)).status, 409);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
