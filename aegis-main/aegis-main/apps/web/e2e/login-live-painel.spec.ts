import { expect, test } from '@playwright/test';

const USER = process.env.E2E_LOGIN_USER || 'admin';
const PASS = process.env.E2E_LOGIN_PASS || '';

test('login do painel (live): UI autentica e o shell monta', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/login', { waitUntil: 'commit', timeout: 90000 });
  await expect(page).toHaveURL(/\/login/);
  await page.locator('#username').fill(USER);
  await page.locator('#password').fill(PASS);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), {
    timeout: 60000,
    waitUntil: 'commit',
  });

  await expect(page.getByText('OPERAÇÃO', { exact: false }).first()).toBeVisible({
    timeout: 60000,
  });

  expect(pageErrors, `exceções JS não-capturadas:\n${pageErrors.join('\n')}`).toEqual([]);
});
