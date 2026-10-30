import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { sign, scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const browser = process.argv.includes('--browser');
const port = browser ? 3003 : 3004;
const origin = `http://127.0.0.1:${port}`;
const directory = mkdtempSync(join(tmpdir(), 'arkhe-intra-http-'));
const env = { ...process.env, ARKHE_INTRA_DATA_DIR: directory, ARKHE_INTRA_ORIGIN: origin, ARKHE_REKOR_URL: '', ARKHE_REKOR_PUBLIC_KEY_FILE: '' };
execFileSync(process.execPath, ['scripts/setup.mjs'], { cwd, env, stdio: 'pipe' });
if (browser) {
  // Isolated UI fixture only. Never changes the user's actual accounts.
  const path = join(directory, 'accounts.json'); const users = JSON.parse(readFileSync(path));
  users[0].passwordHash = scryptSync('Arkhe-UI-Smoke-2026!', users[0].salt, 64).toString('hex');
  writeFileSync(path, JSON.stringify(users));
}
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stdout.on('data', bytes => { logs += bytes; }); child.stderr.on('data', bytes => { logs += bytes; });
let stopping = false;
function stop() { if (!stopping) { stopping = true; child.kill(); } }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
const credentials = JSON.parse(readFileSync(join(directory, 'credentials.json')));
const cookies = {};
async function api(path, role, data) {
  const response = await fetch(origin + '/api/' + path, { ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}), headers: { Origin: origin, 'Content-Type': 'application/json', ...(role ? { Cookie: cookies[role] } : {}) } });
  return { response, value: await response.json() };
}
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { ready = (await fetch(origin + '/api/health')).ok; } catch {}
    if (ready) break;
    if (child.exitCode !== null) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, logs);
  if (browser) { console.log('Isolated UI fixture ready at ' + origin + '/login; author@arkhe.local / Arkhe-UI-Smoke-2026!'); }
  else {
    assert.equal((await api('dashboard')).response.status, 401);
    for (const role of ['author', 'reviewer', 'owner']) {
      const credential = credentials.find(row => row.email.startsWith(role + '@'));
      const result = await api('login', null, credential); assert.equal(result.response.status, 200);
      cookies[role] = result.response.headers.get('set-cookie').split(';')[0];
    }
    const created = await api('documents', 'author', { title: 'Prova HTTP fullstack', department: 'Jurídico & Compliance', body: 'Relatório sintético. Nenhuma decisão institucional ou chamada Rekor real.' });
    assert.equal(created.response.status, 201);
    const id = created.value.id;
    for (const [role, action] of [['author', 'submit'], ['reviewer', 'review'], ['owner', 'approve']]) {
      const challenge = (await api(`documents/${id}/challenge`, role, { action })).value;
      assert.equal(typeof challenge.statement, 'string');
      const signature = sign(null, Buffer.from(challenge.statement), readFileSync(join(directory, role + '.private.pem'))).toString('base64');
      const result = await api(`documents/${id}/transition`, role, { action, signature, digest: challenge.digest, revision: challenge.revision });
      assert.equal(result.response.status, 200);
    }
    assert.equal((await api(`documents/${id}/publish`, 'owner', {})).response.status, 503);
    const verification = await api(`documents/${id}/verify`, 'owner');
    assert.equal(verification.value.integrity, 'PASS'); assert.equal(verification.value.signatures, 'PASS'); assert.equal(verification.value.anchor, 'INCONCLUSIVE');
    assert.equal((await api('dashboard', 'owner')).value.counts.events, 4);
    for (const path of ['/', '/login', '/juridico', '/documentos', '/documentos/novo', `/documentos/${id}`, `/recibos/${id}`, `/certificados/${id}`, '/auditoria', '/assistente', '/verificar', '/offline/index.html', '/offline/app.mjs', '/offline/verify.mjs', '/verifier/arkhe_verify_wasm.js', '/verifier/arkhe_verify_wasm_bg.wasm']) {
      const response = await fetch(origin + path); assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      if (path.endsWith('.wasm')) assert.match(response.headers.get('content-type'), /application\/wasm/);
    }
    console.log('PASS real Next HTTP: sessions -> create -> three signatures -> SQLite -> export/verify; 16 pages/assets; Rekor fail-closed; no remote writes.');
    stop();
  }
} catch (error) { stop(); console.error(logs); throw error; }
