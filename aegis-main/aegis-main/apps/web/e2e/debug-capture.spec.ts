import { test } from '@playwright/test';

const BASE = 'https://ouroville.lat';

test('captura requests reais de /cameras e conexoes', async ({ page }) => {
  const reqs: { url: string; status: number }[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/')) reqs.push({ url: r.url(), status: r.status() });
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'commit', timeout: 90000 });
  const u = page.locator('#username');
  const p = page.locator('#password');
  for (let i = 0; i < 5; i++) {
    await u.fill('admin');
    await p.fill('Admin@Ouroville2026');
    if ((await u.inputValue()) === 'admin' && (await p.inputValue()) === 'Admin@Ouroville2026') break;
    await page.waitForTimeout(300);
  }
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), {
    timeout: 60000,
    waitUntil: 'commit',
  });
  await page.goto(`${BASE}/cameras`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('--- REQUESTS /cameras ---');
  for (const r of reqs.filter((x) => x.url.includes('cctv'))) console.log(r.status, r.url);
  console.log('cctv requests:', reqs.filter((x) => x.url.includes('cctv')).length);

  await page.goto(`${BASE}/painel-de-controle/dados?aba=conexoes`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('--- REQUESTS conexoes (connector/edge) ---');
  for (const r of reqs.filter((x) => /connector|edge/.test(x.url))) console.log(r.status, r.url);
  console.log('total api requests:', reqs.length);
});