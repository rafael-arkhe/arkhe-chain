import { test, expect } from '@playwright/test';

/**
 * #6 — os modos "Apresentar" são DEGRAUS de detalhe (Resumo/Operacional/Completo)
 * e funcionam com seções de WIDGET (antes o filtro por kind escondia tudo →
 * "Sem seções neste modo"). Prova: cada degrau revela o nível certo, a legenda
 * explica o que mostra + a contagem, e um doc sem seções no degrau atual oferece
 * a saída (Completo) em vez de um beco sem fim.
 */
async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/briefings');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('degraus de detalhe revelam as seções de widget no nível certo + legenda + contagem', async ({ page }) => {
  await loginAdmin(page);
  const ts = Date.now();

  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug: `e2e-modos-${ts}`,
      title: 'E2E Modos',
      classification_level: 'restrito',
      sections: [
        { id: 'a', kind: 'widget', heading: 'Destaque', widget: 'callout', props: { tone: 'info', title: 'T', body: 'B' } },
        { id: 'b', kind: 'markdown', heading: 'Detalhe', body: 'texto operacional' },
        { id: 'c', kind: 'widget', heading: 'Visual', widget: 'figure', props: { caption: 'fig' } },
      ],
    },
  });
  const doc = await created.json();

  await page.goto(`/briefings?doc=${doc.id}`);
  await expect(page.getByTestId('briefings-doc')).toBeVisible({ timeout: 20000 });

  // contagem por degrau no seletor: resumo 1 (callout), operacional 2 (+markdown),
  // completo 3 (+figura). Prova que o widget NÃO some mais.
  await expect(page.getByTestId('briefings-modo-resumo')).toContainText('1');
  await expect(page.getByTestId('briefings-modo-operacional')).toContainText('2');
  await expect(page.getByTestId('briefings-modo-analitico')).toContainText('3');

  // legenda sempre-visível explica o degrau + contagem
  await expect(page.getByTestId('briefings-modo-legend')).toBeVisible();

  // default = operacional: Destaque + Detalhe visíveis; Visual (nível completo) não.
  await expect(page.getByRole('heading', { name: 'Destaque' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Detalhe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visual' })).toHaveCount(0);

  // Resumo: só Destaque (callout, nível 1).
  await page.getByTestId('briefings-modo-resumo').click();
  await expect(page.getByRole('heading', { name: 'Destaque' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Detalhe' })).toHaveCount(0);

  // Completo: tudo, incl. a seção de WIDGET de viz (Visual).
  await page.getByTestId('briefings-modo-analitico').click();
  await expect(page.getByRole('heading', { name: 'Visual' })).toBeVisible();

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});

test('degrau vazio ENSINA a saída (Ver tudo / Completo) em vez de beco sem fim', async ({ page }) => {
  await loginAdmin(page);
  const ts = Date.now();

  // doc só com uma seção de NÍVEL COMPLETO (figura) → Resumo/Operacional vazios.
  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug: `e2e-modovazio-${ts}`,
      title: 'E2E Modo Vazio',
      classification_level: 'restrito',
      sections: [{ id: 'v', kind: 'widget', heading: 'SoVisual', widget: 'figure', props: { caption: 'x' } }],
    },
  });
  const doc = await created.json();

  await page.goto(`/briefings?doc=${doc.id}`);
  await expect(page.getByTestId('briefings-doc')).toBeVisible({ timeout: 20000 });

  // default operacional não tem nada deste nível → estado que ENSINA, não "sem seções".
  await expect(page.getByTestId('briefings-modo-empty')).toBeVisible();
  // a saída leva ao Completo, onde a figura aparece.
  await page.getByTestId('briefings-modo-showall').click();
  await expect(page.getByRole('heading', { name: 'SoVisual' })).toBeVisible();

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
