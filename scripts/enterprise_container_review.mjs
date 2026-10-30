import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { promisify } from 'node:util';
import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sign } from 'node:crypto';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, 'arkhe-enterprise/validation/2026-10-23/resilience-standalone');
mkdirSync(output, { recursive: true });
const engine = process.env.ARKHE_CONTAINER_ENGINE || 'podman';
const prefix = engine === 'podman' ? ['--connection', 'arkhe-runtime'] : [];
const image = process.env.ARKHE_ENTERPRISE_IMAGE || 'localhost/arkhe-enterprise:review';
const name = `arkhe-enterprise-review-${Date.now()}`, volume = `${name}-data`;
const origin = 'http://127.0.0.1:3012';
const command = args => execFileSync(engine, [...prefix, ...args], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true }).trim();
const report = { date: '2026-10-23', engine, scope: 'standalone server.js inside Linux container; synthetic accounts and persistent disposable volume; no paid service calls', checks: [], screenshots: [], status: 'RUNNING' };
let browser, created = false, volumeCreated = false;
async function ready() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${origin}/api/ready`, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error('Standalone container did not become healthy');
}
async function api(path, cookie, data, extraHeaders = {}) {
  const response = await fetch(`${origin}/api/${path}`, { ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}), headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders } });
  return { status: response.status, value: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
try {
  const info = JSON.parse(command(['image', 'inspect', image]))[0];
  report.imageId = info.Id; report.imageDigest = info.Digest || null; report.imageUser = info.Config.User;
  assert.equal(info.Config.User, 'node');
  command(['volume', 'create', volume]); volumeCreated = true;
  command(['create', '--name', name, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '-p', '127.0.0.1:3012:3003', '-e', `ARKHE_INTRA_ORIGIN=${origin}`, '-e', 'ARKHE_ENTERPRISE_PHASE=internal', '-v', `${volume}:/data`, image]); created = true;
  command(['start', name]); await ready();
  const credentials = JSON.parse(command(['exec', name, 'node', '-e', "process.stdout.write(require('fs').readFileSync('/data/credentials.json','utf8'))"]));
  const owner = credentials.find(item => item.email.startsWith('owner@'));
  const author = credentials.find(item => item.email.startsWith('author@'));
  const ownerLogin = await api('login', null, { email: owner.email, password: owner.password }); assert.equal(ownerLogin.status, 200);
  const authorLogin = await api('login', null, { email: author.email, password: author.password }); assert.equal(authorLogin.status, 200);
  const createdDoc = await api('documents', authorLogin.cookie, { title: 'Documento sintético no standalone', department: 'Teste de empacotamento', body: 'Evidência sintética para verificar SQLite e WASM no contêiner.' });
  assert.equal(createdDoc.status, 201);
  const dashboard = await api('dashboard', ownerLogin.cookie); assert.equal(dashboard.status, 200); assert.equal(dashboard.value.counts.documents, 1); assert.equal(dashboard.value.auditIntegrity, true);
  report.checks.push('Read-only root filesystem; user node; writable persistent volume; real login, SQLite document creation and BLAKE3 WASM audit');
  const previewInput = { company: 'Empresa de teste', cnpj: '12.abc.345/01de-35', cnae: '9999-9/99', sectorId: 'generic', departments: ['legal'], integrations: [] };
  const previewHeaders = { 'Idempotency-Key': 'container-preview-key-001' };
  const preview = await api('enterprise/preview', ownerLogin.cookie, previewInput, previewHeaders);
  assert.deepEqual((await api('enterprise/preview', ownerLogin.cookie, previewInput, previewHeaders)).value, preview.value);
  assert.equal((await api('enterprise/preview', ownerLogin.cookie, { ...previewInput, company:'Different' }, previewHeaders)).status,409);
  report.checks.push('Preview HTTP Idempotency-Key replays exactly and rejects different payload');
  assert.equal(preview.status, 200); assert.equal(preview.value.configuration.cnpj, '12ABC34501DE35');
  const challenge = await api('enterprise/representation/challenge', ownerLogin.cookie, { previewHash: preview.value.previewHash, capacity: 'administrator', documents: [{ kind: 'constitution', sha256: 'a'.repeat(64) }, { kind: 'identity', sha256: 'b'.repeat(64) }] });
  assert.equal(challenge.status, 200);
  const key = command(['exec', name, 'node', '-e', "process.stdout.write(require('fs').readFileSync('/data/owner.private.pem','utf8'))"]);
  const signature = sign(null, Buffer.from(challenge.value.statement), key).toString('base64');
  const recorded = await api('enterprise/representation/record', ownerLogin.cookie, { challengeId: challenge.value.id, signature });
  assert.equal(recorded.status, 201, recorded.value.error); assert.equal(recorded.value.basis.anchor.leafCount, 3);
  report.checks.push('Alphanumeric CNPJ survives preview; Linux Rust engine verifies Ed25519 and records local WormGraph checkpoint');
  const commit = await api('enterprise/commit', ownerLogin.cookie, { previewHash: preview.value.previewHash, representationId: recorded.value.id, confirm: true });
  assert.equal(commit.status, 503); assert.equal((await api('enterprise', ownerLogin.cookie)).value.profile, null);
  report.checks.push('Missing Serpro credentials still block commit after valid local declaration');
  const requireBrowser = createRequire(process.env.ARKHE_BROWSER_NODE_MODULES ? resolve(process.env.ARKHE_BROWSER_NODE_MODULES, 'package.json') : join(root, 'apps/arkhe-intra/package.json'));
  const { chromium } = requireBrowser('playwright');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
  const [cookieName, cookieValue] = ownerLogin.cookie.split('=');
  await context.addCookies([{ name: cookieName, value: cookieValue, url: origin, httpOnly: true, sameSite: 'Strict' }]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [path, heading, screenshot] of [
    ['/enterprise', 'Cadeia de custódia e dossiês', 'enterprise'],
    ['/enterprise/perfis', 'Meus departamentos', 'perfis'],
    ['/enterprise/onboarding', 'Um ambiente que fala sua linguagem.', 'onboarding'],
  ]) {
    const response = await page.goto(origin + path); assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    await page.screenshot({ path: join(output, `${screenshot}.png`), fullPage: true });
    report.screenshots.push(`${screenshot}.png`);
    console.log(`PASS standalone ${path}`);
  }
  assert.deepEqual(errors, []);
  const stylesheet = await page.locator('link[rel=stylesheet]').first().getAttribute('href');
  assert.ok(stylesheet); assert.equal((await fetch(origin + stylesheet)).status, 200);
  report.checks.push('Three Enterprise routes rendered in Chromium from generated standalone server; CSS assets return 200; no page errors');
  await context.close(); await browser.close(); browser = null;
  const loginBody = JSON.stringify({email:owner.email,password:owner.password});
  let slowRequest;
  const slowResponse = new Promise((resolve,reject) => {
    slowRequest = httpRequest(`${origin}/api/login`, {method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(loginBody)}}, response => { response.resume(); response.on('end',()=>resolve(response.statusCode)); });
    slowRequest.on('error',reject); slowRequest.write(loginBody.slice(0,10));
  });
  await new Promise(resolve=>setTimeout(resolve,150));
  const stopping = promisify(execFile)(engine,[...prefix,'stop','--time','25',name],{windowsHide:true});
  await new Promise(resolve=>setTimeout(resolve,400));
  slowRequest.end(loginBody.slice(10));
  assert.equal(await slowResponse,200);
  await stopping;
  report.checks.push('In-flight login body completes successfully while SIGTERM drains HTTP server');
  assert.equal(JSON.parse(command(['inspect', name]))[0].State.ExitCode, 0);
  report.checks.push('SIGTERM forwarded to Next; graceful exit 0 within container stop budget');
  command(['start', name]); await ready();
  const after = await api('dashboard', ownerLogin.cookie); assert.equal(after.status, 200); assert.equal(after.value.counts.documents, 1); assert.equal(after.value.auditIntegrity, true);
  report.checks.push('Restart preserves document, sessions and audit integrity in the named volume');
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message; process.exitCode = 1; console.error(error.message);
} finally {
  if (browser) await browser.close();
  if (created) {
    try { writeFileSync(join(output, 'server.log'), command(['logs', name]) + '\n'); } catch {}
    command(['rm', '--force', name]);
  }
  if (volumeCreated) command(['volume', 'rm', volume]);
  writeFileSync(join(output, 'container-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status}: ${report.checks.length} standalone checks, ${report.screenshots.length} screenshots; temporary container/volume removed`);
}
