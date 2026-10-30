// Run after build. Uses bundled Playwright through ARKHE_BROWSER_NODE_MODULES.
// Only synthetic accounts and a temporary single-org database are exercised.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const appRoot = join(root, 'apps/arkhe-intra');
const requireApp = createRequire(join(appRoot, 'package.json'));
const requireBrowser = createRequire(process.env.ARKHE_BROWSER_NODE_MODULES ? resolve(process.env.ARKHE_BROWSER_NODE_MODULES, 'package.json') : join(appRoot, 'package.json'));
const { chromium } = requireBrowser('playwright');
const next = requireApp('next');
const dataDir = mkdtempSync(join(tmpdir(), 'arkhe-enterprise-browser-'));
const output = join(root, 'arkhe-enterprise/validation/2026-10-23/pilot');
mkdirSync(output, { recursive: true });
const origin = 'http://127.0.0.1:3011';
process.env.ARKHE_INSTALL_ROOT = root;
process.env.ARKHE_INTRA_DATA_DIR = dataDir;
process.env.ARKHE_INTRA_ORIGIN = origin;
process.env.ARKHE_ENTERPRISE_PHASE = 'internal';
const setup = spawnSync(process.execPath, ['scripts/setup.mjs'], { cwd: appRoot, env: process.env, stdio: 'pipe' });
assert.equal(setup.status, 0, 'Isolated account setup failed');
const credentials = JSON.parse(readFileSync(join(dataDir, 'credentials.json')));
const report = { date: '2026-10-23', scope: 'production build; isolated synthetic single-org data; no external registry calls', screenshots: [], checks: [], pageErrors: [], expectedApiFailures: [], status: 'RUNNING' };
let browser, server, app;
async function screenshot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(resolveFrame)));
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
  const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(size.content <= size.viewport, `Horizontal overflow in ${name}: ${JSON.stringify(size)}`);
  report.screenshots.push({ file: `${name}.png`, ...size });
  console.log(`PASS screenshot ${name}`);
}
async function login(page, role) {
  const credential = credentials.find(item => item.email.startsWith(`${role}@`));
  await page.goto(`${origin}/login`);
  await page.getByLabel('E-mail', { exact: true }).fill(credential.email);
  await page.getByLabel('Senha', { exact: true }).fill(credential.password);
  await page.getByRole('button', { name: 'Acessar ambiente' }).click();
  await page.waitForURL(origin + '/');
  await page.getByRole('heading', { name: /Olá,/ }).waitFor();
}
try {
  process.chdir(appRoot);
  app = next({ dev: false, dir: appRoot, hostname: '127.0.0.1', port: 3011 });
  await app.prepare();
  // Next reads .env files; these checks deliberately exercise the unconfigured gate.
  delete process.env.ARKHE_SERPRO_CONSUMER_KEY;
  delete process.env.ARKHE_SERPRO_CONSUMER_SECRET;
  server = createServer(app.getRequestHandler());
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(3011, '127.0.0.1', resolveListen); });
  browser = await chromium.launch({ headless: true });
  report.browserVersion = browser.version();
  report.nodeVersion = process.version;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await login(page, 'owner');
  await page.getByRole('link', { name: 'Arkhe Enterprise', exact: true }).click();
  await page.getByRole('heading', { name: 'Cadeia de custódia e dossiês', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'O primeiro registro começa aqui' }).waitFor();
  await screenshot(page, 'enterprise-empty-desktop');
  const initialState = await (await context.request.get(`${origin}/api/enterprise`)).json();
  assert.equal(initialState.profile, null); assert.equal(initialState.registryConfigured, false);
  assert.equal(initialState.sectors.length, 13);
  report.checks.push('UI login and authenticated Enterprise navigation; real empty database; 12 sectors plus generic');

  const authorContext = await browser.newContext({ baseURL: origin });
  const author = credentials.find(item => item.email.startsWith('author@'));
  const authorLogin = await authorContext.request.post('/api/login', { headers: { Origin: origin }, data: { email: author.email, password: author.password } });
  assert.equal(authorLogin.status(), 200);
  const created = await authorContext.request.post('/api/documents', { headers: { Origin: origin }, data: { title: 'Política de retenção · demonstração local', department: 'Jurídico', body: 'Documento sintético para validar a apresentação e a inspeção. Sem certificação ou publicação.' } });
  assert.equal(created.status(), 201);
  await page.reload();
  await page.getByRole('heading', { name: 'Política de retenção · demonstração local' }).waitFor();
  await screenshot(page, 'enterprise-desktop');
  await page.getByRole('button', { name: 'Inspecionar', exact: true }).click();
  await page.getByRole('dialog').getByText('Verificação inconclusiva', { exact: true }).waitFor();
  await screenshot(page, 'enterprise-evidence-dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  report.checks.push('Document from isolated API renders; verifier reports inconclusive without signatures/anchor; dialog closes with Escape');

  await page.goto(`${origin}/enterprise/perfis`);
  await page.getByRole('heading', { name: 'Meus departamentos' }).waitFor();
  await screenshot(page, 'enterprise-perfis-desktop');
  await page.locator('label.ent-choice').filter({ has: page.locator('strong', { hasText: /^Executivo$/ }) }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Salvar meus departamentos' }).click();
  await page.getByLabel('Persona ativa', { exact: true }).selectOption('executive');
  await page.goto(`${origin}/enterprise`);
  await page.getByRole('heading', { name: 'Visão de governança', exact: true }).waitFor();
  await screenshot(page, 'enterprise-executive-desktop');
  report.checks.push('Department preferences persist and persona switch renders executive view');

  await page.goto(`${origin}/enterprise/onboarding`);
  await page.getByLabel('Razão social', { exact: true }).waitFor();
  await screenshot(page, 'enterprise-onboarding-desktop');
  await page.getByLabel('Razão social', { exact: true }).fill('Empresa de teste');
  await page.getByLabel('CNPJ numérico ou alfanumérico', { exact: true }).fill('12.abc.345/01de-35');
  await page.getByLabel('CNAE principal', { exact: true }).fill('9999-9/99');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Usar sugestão: Genérico / Não classificado' }).click();
  await page.getByRole('button', { name: 'Gerar preview', exact: true }).click();
  await page.getByText('PREVIEW OBRIGATÓRIO · ADR-010', { exact: true }).waitFor();
  await screenshot(page, 'enterprise-onboarding-preview-desktop');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar preview', exact: true }).click();
  await page.getByLabel('Contrato social ou estatuto', { exact: true }).setInputFiles({ name: 'contrato-sintetico.txt', mimeType: 'text/plain', buffer: Buffer.from('Constituicao sintetica para teste, sem valor legal.') });
  await page.getByLabel('Documento de identidade do signatário', { exact: true }).setInputFiles({ name: 'identidade-sintetica.txt', mimeType: 'text/plain', buffer: Buffer.from('Identidade sintetica para teste, sem dados reais.') });
  await page.getByLabel('Chave Ed25519 da sua conta (.pem)', { exact: true }).setInputFiles(join(dataDir, 'owner.private.pem'));
  await page.getByRole('checkbox', { name: /Declaro representar/ }).check();
  await page.getByRole('button', { name: 'Assinar declaração e registrar hashes', exact: true }).click();
  await page.getByText('Declaração e hashes registrados no WormGraph local.', { exact: false }).waitFor();
  await screenshot(page, 'enterprise-representation-recorded');
  report.checks.push('Alphanumeric CNPJ preserved; mandatory document hashes and Ed25519 declaration recorded through real Rust WormGraph engine; no powers-verification claim');
  await page.getByRole('checkbox', { name: /Revisei o preview/ }).check();
  const blockedCommit = page.waitForResponse(response => response.url().endsWith('/api/enterprise/commit') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirmar perfil', exact: true }).click();
  assert.equal((await blockedCommit).status(), 503);
  await page.getByRole('alert').getByText('Confirmação bloqueada:', { exact: false }).waitFor();
  await screenshot(page, 'enterprise-onboarding-blocked-commit');
  assert.equal((await (await context.request.get(`${origin}/api/enterprise`)).json()).profile, null);
  report.checks.push('Six-step wizard generates server preview; unconfigured registry blocks commit with visible error and leaves profile empty');
  report.expectedApiFailures.push('POST enterprise/commit 503: registry not configured');

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, heading, name] of [
    ['/enterprise', 'Visão de governança', 'enterprise-mobile'],
    ['/enterprise/perfis', 'Meus departamentos', 'enterprise-perfis-mobile'],
    ['/enterprise/onboarding', 'Um ambiente que fala sua linguagem.', 'enterprise-onboarding-mobile'],
  ]) {
    await page.goto(origin + path);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    await screenshot(page, name);
  }
  await page.getByLabel('Razão social', { exact: true }).fill('Empresa de teste');
  await page.getByLabel('CNPJ numérico ou alfanumérico', { exact: true }).fill('12.abc.345/01de-35');
  await page.getByLabel('CNAE principal', { exact: true }).fill('9999-9/99');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Usar sugestão: Genérico / Não classificado' }).waitFor();
  report.checks.push('Mobile routes render without horizontal page overflow; unknown CNAE suggests generic');

  await page.route('**/api/enterprise', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Indisponibilidade simulada para testar a interface.' }) }));
  await page.goto(`${origin}/enterprise`);
  await page.getByRole('heading', { name: 'Não foi possível abrir o portal' }).waitFor();
  await screenshot(page, 'enterprise-api-error-mobile');
  await page.unroute('**/api/enterprise');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.getByRole('heading', { name: 'Visão de governança', exact: true }).waitFor();
  report.checks.push('Simulated API outage renders retry state; retry recovers after restoring API');
  report.expectedApiFailures.push('GET enterprise 503: browser-injected outage');
  assert.deepEqual(report.pageErrors, []);
  report.checks.push('No uncaught browser page errors');
  await authorContext.close();
  await context.close();
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message; console.error(error.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  if (app) await app.close();
  writeFileSync(join(output, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status}: ${report.screenshots.length} screenshots, ${report.checks.length} browser checks`);
}
