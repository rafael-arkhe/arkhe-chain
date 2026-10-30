// Production build review. No accounts, credentials or live blockchain calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const appRoot = join(root, 'apps/arkhe-intra');
const requireApp = createRequire(join(appRoot, 'package.json'));
const requireBrowser = createRequire(process.env.ARKHE_BROWSER_NODE_MODULES
  ? resolve(process.env.ARKHE_BROWSER_NODE_MODULES, 'package.json') : join(appRoot, 'package.json'));
const { chromium } = requireBrowser('playwright');
const { default: AxeBuilder } = requireBrowser('@axe-core/playwright');
const output = resolve(process.env.ARKHE_E02_EVIDENCE_DIR || join(root, 'docs/evidence/2026-10-24-m3-m20'));
mkdirSync(output, { recursive: true });
process.env.ARKHE_INSTALL_ROOT = root;
process.env.ARKHE_INTRA_DATA_DIR = mkdtempSync(join(tmpdir(), 'arkhe-e02-ui-'));
process.chdir(appRoot);
const app = requireApp('next')({ dev: false, dir: appRoot });
const report = { status: 'RUNNING', checks: [], pageErrors: [], screenshots: [],
  scope: 'Local production build, synthetic demo receipts, Chromium keyboard and axe WCAG 2.2 A/AA checks; no screen reader audit' };
let server, browser;
const auditAxe = async (page, label, selector) => {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (selector) builder = builder.include(selector);
  const result = await builder.analyze();
  const evidence = { label, axeVersion: result.testEngine.version, violations: result.violations, incomplete: result.incomplete.map(item => ({ id: item.id, impact: item.impact, description: item.description })) };
  report.axe ??= []; report.axe.push(evidence);
  assert.deepEqual(result.violations, [], `axe violations: ${label}`);
  check(`axe WCAG A/AA: ${label}, zero violations (${result.incomplete.length} manual-review items)`);
};
const check = label => { report.checks.push(label); console.log(`PASS ${label}`); };
try {
  await app.prepare();
  server = createServer(app.getRequestHandler());
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  report.browserVersion = browser.version(); report.nodeVersion = process.version;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/verificar/e02');
  await auditAxe(page, 'E02 initial page');
  await page.getByRole('button', { name: 'Carregar demonstração' }).click();
  const verify = page.getByRole('button', { name: 'Verificar no browser', exact: true });
  await verify.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('heading', { name: 'Compromisso verificado', exact: true }).waitFor();
  assert.equal(await dialog.locator('.e02-checks li').count(), 9);
  assert.equal(await dialog.locator('.e02-pass').count(), 9);
  assert.match(await dialog.innerText(), /recibos sintéticos/);
  await auditAxe(page, 'M3 success', 'dialog');
  check('M3: real browser WASM returns VERIFIED, nine PASS checks, synthetic receipts warning');
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press(key);
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement) || document.activeElement === document.body), true);
      // Chromium can place focus on the modal viewport at a wrap boundary.
      assert.equal(await page.evaluate(() => {
        const active = document.activeElement;
        return active === document.body || Boolean(active?.closest('dialog[open]'));
      }), true);
    }
  }
  check('M3: 24 forward and 24 reverse Tab presses never focus an outside control');
  await dialog.getByRole('button', { name: 'Ver detalhes da prova' }).click();
  await dialog.getByRole('heading', { name: 'Detalhes da prova', exact: true }).waitFor();
  assert.match(await dialog.locator('#e02-proof-details').innerText(), /recomputed_root/);
  await auditAxe(page, 'M20 success', 'dialog');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(output, 'm20-desktop.png') });
  report.screenshots.push('m20-desktop.png');
  await dialog.locator('#e02-proof-details').evaluate(el => el.scrollIntoView());
  await page.screenshot({ path: join(output, 'm20-desktop-details.png') });
  report.screenshots.push('m20-desktop-details.png');
  check('M20: details, full hashes and proof path render in the same dialog');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Baixar laudo JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(exported.complete, true); assert.equal(exported.aborted, null);
  assert.equal(exported.synthetic_demo, true); assert.equal(exported.checks.length, 9);
  check('JSON download: complete=true, aborted=null, demo marker, nine checks');
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
  assert.equal(await verify.evaluate(el => el === document.activeElement), true);
  check('Escape closes M20 and restores focus to the original verification button');
  const reopen = page.getByRole('button', { name: 'Resultado e detalhes da prova' });
  await reopen.click(); await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Fechar resultado' }).click();
  assert.equal(await reopen.evaluate(el => el === document.activeElement), true);
  check('Reopen M3 and close button restore focus to the summary trigger');
  // Warm module and fixtures first. Then prove verification makes no requests.
  await context.setOffline(true);
  await verify.click(); await dialog.waitFor();
  await dialog.getByRole('heading', { name: 'Compromisso verificado', exact: true }).waitFor();
  check('Offline verification succeeds after module/fixture loading; not a cold offline install test');
  await page.keyboard.press('Escape');
  await context.setOffline(false);
  const fixture = name => readFileSync(join(appRoot, 'public/e02/fixtures', name), 'utf8');
  const tampered = fixture('dataset.json').replace(/"root": "[0-9a-f]{64}"/, `"root": "${'0'.repeat(64)}"`);
  await page.locator('input[type=file]').nth(0).setInputFiles({ name: 'tampered.json', mimeType: 'application/json', buffer: Buffer.from(tampered) });
  await verify.click(); await dialog.waitFor();
  await dialog.getByRole('heading', { name: 'Não verificável', exact: true }).waitFor();
  assert.equal(await dialog.locator('.e02-fail').count(), 1);
  assert.match(await dialog.innerText(), /ROOT_MISMATCH/);
  assert.equal(await dialog.getByText('Não executado', { exact: true }).count(), 4);
  check('Tampered root: NOT_VERIFIABLE, exact failure and four NOT_RUN checks');
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole('button', { name: 'Ver detalhes da prova' }).click();
  assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(output, 'm20-mobile-failure.png') });
  report.screenshots.push('m20-mobile-failure.png');
  await auditAxe(page, 'M20 mobile failure', 'dialog');
  check('390px viewport: page and detailed failure dialog have no horizontal overflow');
  assert.deepEqual(report.pageErrors, []);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; console.error(error);
} finally {
  writeFileSync(join(output, 'ui-result.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(ok => server.close(ok)); }
  await app.close();
}
