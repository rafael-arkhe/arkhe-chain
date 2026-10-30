// Local product acceptance, synthetic accounts and isolated SQLite only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
// A QA-only rebuild marker prevents reading a half-written Next production build.
const buildMarker = join(root, 'docs/evidence/2026-10-28-product-quality/post-fix-build.json');
for (let attempt = 0; attempt < 600; attempt++) {
  let marker;
  try { marker = JSON.parse(readFileSync(buildMarker)); } catch { break; }
  if (marker.status === 'FAIL') throw new Error('Quality production build failed');
  if (marker.status === 'PASS') break;
  if (attempt === 599) throw new Error('Timed out waiting for quality production build');
  await new Promise(resolve => setTimeout(resolve, 1000));
}
const appRoot = join(root, 'apps/arkhe-intra');
const requireApp = createRequire(join(appRoot, 'package.json'));
const requireBrowser = createRequire(join(root, 'ops/local/e02-browser-tools/package.json'));
const { chromium } = requireBrowser('playwright');
const { default: AxeBuilder } = requireBrowser('@axe-core/playwright');
const next = requireApp('next');
const output = process.env.ARKHE_QUALITY_BROWSER_OUTPUT || join(root, 'docs/evidence/2026-10-28-product-quality/browser');
mkdirSync(output, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'arkhe-product-browser-'));
const origin = 'http://127.0.0.1:3017';
process.env.ARKHE_INSTALL_ROOT = root;
process.env.ARKHE_INTRA_DATA_DIR = dataDir;
process.env.ARKHE_INTRA_ORIGIN = origin;
process.env.ARKHE_REKOR_URL = '';
process.env.ARKHE_REKOR_PUBLIC_KEY_FILE = '';
const setup = spawnSync(process.execPath, ['scripts/setup.mjs'], { cwd: appRoot, env: process.env, stdio: 'pipe', windowsHide: true });
assert.equal(setup.status, 0, 'Isolated account setup');
const credentials = JSON.parse(readFileSync(join(dataDir, 'credentials.json')));
if (process.env.ARKHE_QUALITY_RUNTIME_URL) writeFileSync(join(dataDir, 'native-drafts.json'), JSON.stringify({
  endpoint: process.env.ARKHE_QUALITY_RUNTIME_URL, token: process.env.ARKHE_QUALITY_TOKEN,
  actor: 'quality-service', binary: join(root, 'target/debug/examples/intra_draft.exe')
}));
const report = { scope: 'Production Next build, synthetic accounts, isolated local databases. No external analytics or publishing.', checks: [], axe: [], screenshots: [], pageErrors: [], status: 'RUNNING' };
let browser, server, app;
async function check(name, fn) { await fn(); report.checks.push(name); console.log('PASS ' + name); }
async function capture(page, name) {
  await page.screenshot({ path: join(output, name + '.png'), fullPage: true, animations: 'disabled' });
  const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(size.content <= size.viewport, 'No horizontal overflow: ' + name);
  report.screenshots.push(name + '.png');
}
async function accessibility(page, name) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length, selectors: nodes.map(n => n.target), summaries: nodes.map(n => n.failureSummary) }));
  report.axe.push({ page: name, violations });
  if (violations.length) console.log('A11Y findings ' + name + ': ' + JSON.stringify(violations));
}
async function login(page, role) {
  const credential = credentials.find(value => value.email.startsWith(role + '@'));
  await page.goto(origin + '/login');
  await page.getByLabel('E-mail', { exact: true }).fill(credential.email);
  await page.getByLabel('Senha', { exact: true }).fill(credential.password);
  await page.getByRole('button', { name: 'Acessar ambiente' }).click();
  await page.waitForURL(origin + '/');
}
async function signStep(page, role, action) {
  await page.getByLabel('Chave Ed25519 da sua conta (.pem)').setInputFiles({ name: 'synthetic.pem', mimeType: 'application/x-pem-file', buffer: readFileSync(join(dataDir, role + '.private.pem')) });
  await page.getByLabel('Conferi esta versão e autorizo esta transição.').check();
  await page.getByRole('button', { name: action, exact: true }).click();
  await page.getByText('Assinatura validada. A transição foi registrada na trilha local.', { exact: true }).waitFor();
}
try {
  process.chdir(appRoot);
  app = next({ dev: false, dir: appRoot, hostname: '127.0.0.1', port: 3017 });
  await app.prepare();
  // Next loads local .env files. Test gates must override those values after prepare.
  process.env.ARKHE_REKOR_URL = ''; process.env.ARKHE_REKOR_PUBLIC_KEY_FILE = '';
  server = createServer(app.getRequestHandler());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3017, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  const contexts = {};
  const pages = {};
  for (const role of ['author', 'reviewer', 'owner']) {
    contexts[role] = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', reducedMotion: 'reduce' });
    pages[role] = await contexts[role].newPage();
    pages[role].on('pageerror', error => report.pageErrors.push(error.message));
  }
  const page = pages.author;
  await check('Login form: keyboard focus and accessibility', async () => {
    await page.goto(origin + '/login');
    await accessibility(page, 'login'); await capture(page, 'login');
    await page.getByLabel('E-mail', { exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.getByLabel('Senha', { exact: true }).evaluate(el => document.activeElement === el), true);
  });
  for (const role of ['author', 'reviewer', 'owner']) await check('UI login ' + role, () => login(pages[role], role));
  await check('Empty library and impossible search are actionable', async () => {
    await page.goto(origin + '/documentos');
    await page.getByRole('heading', { name: 'Seu repositório está pronto para começar' }).waitFor();
    await page.getByLabel('Filtrar documentos').fill('no-match-qa');
    await page.getByRole('heading', { name: 'Nenhum documento com estes filtros' }).waitFor();
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await capture(page, 'empty-library'); await accessibility(page, 'library');
  });
  let id;
  await check('UI create, plain text safety and edit revision', async () => {
    await page.goto(origin + '/documentos/novo');
    await page.getByLabel('Título do documento').fill('QA Jornada documental');
    await page.getByLabel('Conteúdo', { exact: false }).fill('Texto sintético <script>window.arkheXss=true</script>');
    await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    await page.waitForURL(/\/documentos\/[a-f0-9-]{36}$/);
    id = page.url().split('/').at(-1);
    await page.getByRole('heading', { name: 'QA Jornada documental', exact: true }).first().waitFor();
    assert.equal(await page.evaluate(() => window.arkheXss), undefined);
    await page.getByText('Editar rascunho', { exact: true }).click();
    await page.getByLabel('Título', { exact: true }).fill('QA Jornada documental v2');
    await page.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
    await page.getByText('Nova revisão salva.', { exact: true }).waitFor();
    await page.getByText('Revisão 2', { exact: true }).waitFor();
    await capture(page, 'draft-desktop'); await accessibility(page, 'draft');
  });
  await check('Reviewer cannot read a private draft', async () => {
    const response = await contexts.reviewer.request.get(`${origin}/api/documents/${id}`);
    assert.equal(response.status(), 404);
  });
  if (process.env.ARKHE_QUALITY_RUNTIME_URL) await check('Browser → API → Rust → PostgreSQL → verified native receipt', async () => {
    await page.getByRole('button', { name: 'Registrar rascunho no kernel' }).click();
    await page.getByText('Versão registrada; recibo e bytes canônicos conferidos no runtime.', { exact: true }).waitFor();
    const response = await contexts.author.request.get(`${origin}/api/documents/${id}/native-draft`);
    const result = await response.json();
    assert.ok(result.records[0].receipt?.record_hash);
    await capture(page, 'native-draft-confirmed');
  });
  await check('Three distinct roles sign in the browser', async () => {
    await signStep(page, 'author', 'Assinar e enviar à revisão');
    await pages.reviewer.goto(`${origin}/documentos/${id}`);
    await signStep(pages.reviewer, 'reviewer', 'Assinar revisão');
    await pages.owner.goto(`${origin}/documentos/${id}`);
    await signStep(pages.owner, 'owner', 'Assinar aprovação');
    await capture(pages.owner, 'approved-document'); await accessibility(pages.owner, 'approved');
  });
  await check('Publication gate preserves approval without Rekor configuration', async () => {
    await pages.owner.getByRole('button', { name: 'Ancorar e publicar' }).click();
    await pages.owner.getByRole('alert').filter({ hasText: 'Rekor não configurado.' }).waitFor();
    const response = await contexts.owner.request.get(`${origin}/api/documents/${id}`);
    assert.equal((await response.json()).state, 'approved');
  });
  await check('Export signatures and audit funnel agree; no native or signing secrets', async () => {
    const response = await contexts.owner.request.get(`${origin}/api/documents/${id}/export`);
    const bundle = await response.json();
    assert.deepEqual(bundle.document.signatures.map(s => s.action), ['submit', 'review', 'approve']);
    assert.equal(bundle.audit.filter(e => e.event.action === 'submit').length, 1);
    const bytes = JSON.stringify(bundle);
    assert.doesNotMatch(bytes, /PRIVATE KEY|passwordHash|Bearer /);
    if (process.env.ARKHE_QUALITY_TOKEN) assert.equal(bytes.includes(process.env.ARKHE_QUALITY_TOKEN), false);
    writeFileSync(join(output, 'synthetic-document-evidence.json'), JSON.stringify(bundle, null, 2));
  });
  await check('Library search and state filter reflect committed state', async () => {
    await pages.owner.goto(origin + '/documentos');
    await pages.owner.getByLabel('Filtrar documentos').fill('Jornada');
    await pages.owner.getByLabel('Filtrar por estado').selectOption('approved');
    await pages.owner.getByRole('heading', { name: 'QA Jornada documental v2' }).waitFor();
    await pages.owner.getByLabel('Filtrar por estado').selectOption('published');
    await pages.owner.getByRole('heading', { name: 'Nenhum documento com estes filtros' }).waitFor();
  });
  await check('Mobile document remains usable without horizontal overflow', async () => {
    await pages.owner.setViewportSize({ width: 390, height: 844 });
    await pages.owner.goto(`${origin}/documentos/${id}`);
    await pages.owner.getByRole('heading', { name: 'QA Jornada documental v2', exact: true }).first().waitFor();
    await capture(pages.owner, 'approved-mobile'); await accessibility(pages.owner, 'mobile');
  });
  await check('Bounded concurrent reads preserve state (30 requests, concurrency 5)', async () => {
    const latencies = [];
    for (let n = 0; n < 6; n++) await Promise.all(Array.from({ length: 5 }, async () => {
      const start = performance.now();
      const response = await contexts.owner.request.get(origin + '/api/dashboard');
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).documents.find(d => d.id === id).state, 'approved');
      latencies.push(performance.now() - start);
    }));
    latencies.sort((a, b) => a - b);
    report.readSmoke = { requests: 30, concurrency: 5, p50_ms: Math.round(latencies[14]), p95_ms: Math.round(latencies[28]), max_ms: Math.round(latencies.at(-1)) };
  });
  assert.deepEqual(report.pageErrors, []);
  assert.equal(report.axe.flatMap(page => page.violations).filter(v => ['critical', 'serious'].includes(v.impact)).length, 0, 'Serious accessibility violations remain; see report');
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = error.message;
  console.error(error.message); process.exitCode = 1;
} finally {
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await app?.close();
}
