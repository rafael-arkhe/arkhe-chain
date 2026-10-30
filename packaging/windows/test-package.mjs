import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { sign } from 'node:crypto';
const root = resolve(process.argv[2]);
const temp = mkdtempSync(join(tmpdir(), 'Arkhe pacote ç '));
const data = join(temp, 'dados privados');
const origin = 'http://127.0.0.1:13043';
const env = { ...process.env, PATH: process.env.SystemRoot + '\\System32', ARKHE_INTRA_DATA_DIR: data, ARKHE_PORT: '13043', ARKHE_REKOR_URL: '', ARKHE_REKOR_PUBLIC_KEY_FILE: '' };
const executable = join(root, 'arkhe-cli.exe');
const results = [];
function record(message) { results.push(message); console.log('PASS ' + message); }
function cli(args, expected = 0) {
  try { const out = execFileSync(executable, args, { cwd: temp, env, encoding: 'utf8', windowsHide: true, timeout: 60000 }); assert.equal(expected, 0); return out; }
  catch (error) { if (error.status !== undefined && error.status === expected) return String(error.stdout) + String(error.stderr); throw error; }
}
const cookies = {};
async function api(path, role, body) {
  const response = await fetch(origin + '/api/' + path, { signal: AbortSignal.timeout(15000), method: body ? 'POST' : 'GET', headers: { Connection: 'close', Origin: origin, 'Content-Type': 'application/json', ...(role ? { Cookie: cookies[role] } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { response, value: await response.json() };
}
try {
  assert.match(cli(['--version']), /0\.1\.0/);
  assert.match(cli(['--help']), /backup/);
  assert.match(cli(['doctor']), /PASS/);
  cli(['invalid-command'], 1);
  cli(['status'], 3);
  record('CLI version/help/doctor/invalid command/stopped status; PATH without development tools');
  // Occupied ports must be rejected without creating accounts or stopping anyone.
  const occupied = createServer();
  await new Promise((done, reject) => occupied.once('error', reject).listen(13043, '127.0.0.1', done));
  try { assert.match(cli(['start'], 1), /occupied/); assert.equal(existsSync(join(data, 'accounts.json')), false); }
  finally { await new Promise(done => occupied.close(done)); }
  record('Occupied port rejected safely');
  assert.match(cli(['start']), /RUNNING/);
  const first = JSON.parse(readFileSync(join(data, 'server.json')));
  cli(['start']);
  assert.equal(JSON.parse(readFileSync(join(data, 'server.json'))).Pid, first.Pid);
  assert.match(cli(['status']), /RUNNING/);
  execFileSync(join(root, 'Arkhe.exe'), ['status'], { cwd: temp, env, windowsHide: true, timeout: 15000 });
  record('Bundled server starts from unrelated directory with spaces/unicode; repeated start is idempotent');
  assert.equal((await api('dashboard')).response.status, 401);
  const credentials = JSON.parse(readFileSync(join(data, 'credentials.json')));
  for (const role of ['author', 'reviewer', 'owner']) {
    const result = await api('login', null, credentials.find(row => row.email.startsWith(role + '@')));
    assert.equal(result.response.status, 200);
    cookies[role] = result.response.headers.get('set-cookie').split(';')[0];
  }
  const created = await api('documents', 'author', { title: 'Teste do pacote Windows', department: 'Qualidade', body: 'Documento sintético de teste da distribuição.' });
  assert.equal(created.response.status, 201);
  const id = created.value.id;
  for (const [role, action] of [['author', 'submit'], ['reviewer', 'review'], ['owner', 'approve']]) {
    const challenge = (await api(`documents/${id}/challenge`, role, { action })).value;
    const signature = sign(null, Buffer.from(challenge.statement), readFileSync(join(data, role + '.private.pem'))).toString('base64');
    assert.equal((await api(`documents/${id}/transition`, role, { action, signature, digest: challenge.digest, revision: challenge.revision })).response.status, 200);
  }
  const verification = await api(`documents/${id}/verify`, 'owner');
  assert.equal(verification.value.integrity, 'PASS');
  assert.equal(verification.value.signatures, 'PASS');
  assert.equal((await api(`documents/${id}/publish`, 'owner', {})).response.status, 503);
  const exported = await api(`documents/${id}/export`, 'owner'); assert.equal(exported.response.status, 200);
  record('Real HTTP: login, create, three signatures, verify, export; Rekor publication fails closed');
  assert.equal((await api('credentials/me', 'owner')).value.status, 'active');
  assert.equal((await api('development', 'author')).response.status, 403);
  const development = await api('development', 'owner');
  assert.equal(development.response.status, 200); assert.equal(development.value.modules.length, 23);
  assert.equal((await api('evaluations','owner')).response.status,200);
  assert.equal((await api('evaluations','author')).response.status,403);
  assert.equal((await api('credentials/invitations', 'owner', {email:'package-test@example.test',role:'author'})).response.status, 201);
  record('Packaged credential invitation and development catalog: 23 modules, governance-only access');
  for (const path of ['/login', '/registro', '/credenciais', '/desenvolvimento', '/avaliacoes', '/juridico', '/documentos', '/auditoria', '/offline/index.html', '/offline/app.mjs', '/verifier/arkhe_verify_wasm.js', '/verifier/arkhe_verify_wasm_bg.wasm']) {
    const response = await fetch(origin + path); assert.equal(response.status, 200, path); assert.equal(response.headers.get('x-frame-options'), 'DENY');
    if (path.endsWith('.wasm')) assert.match(response.headers.get('content-type'), /application\/wasm/);
  }
  record('Packaged pages, offline assets and WASM return HTTP 200 with security headers');
  cli(['backup', join(temp, 'should-not-exist')], 1);
  cli(['stop']); cli(['status'], 3);
  const accountBytes = readFileSync(join(data, 'accounts.json'));
  const backup = join(temp, 'backup privado');
  cli(['backup', backup]);
  assert.deepEqual(readFileSync(join(backup, 'accounts.json')), accountBytes);
  assert.equal(existsSync(join(backup, 'intra.sqlite')), true);
  cli(['backup', backup], 1);
  cli(['start']);
  assert.deepEqual(readFileSync(join(data, 'accounts.json')), accountBytes);
  assert.equal((await api(`documents/${id}/verify`, 'owner')).value.signatures, 'PASS');
  record('Stop/restart preserves accounts, sessions and signed document; offline backup preserves data and refuses overwrite');
  cli(['stop']);
  // Restore the backup into a separate data directory and verify existing evidence.
  env.ARKHE_INTRA_DATA_DIR = backup;
  cli(['start']);
  assert.equal((await api(`documents/${id}/verify`, 'owner')).value.signatures, 'PASS');
  record('Backup restore to a separate directory serves existing signed document');
  const report = { status: 'PASS', package: root, at: new Date().toISOString(), results, isolatedData: temp };
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { cli(['stop']); }

