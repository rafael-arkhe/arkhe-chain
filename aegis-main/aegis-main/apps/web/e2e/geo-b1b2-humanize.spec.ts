/**
 * §B MAPA — onda 1 (B1 + B2), gesto do operador AO VIVO.
 *
 * B1: a camada legada `onto-*` (Entity Resolution, tabela vazia, inerte no
 *     clique) foi RETIRADA — o globo tem que montar normalmente sem ela.
 * B2: o rótulo do pin/detalhe NUNCA renderiza UUID/slug técnico. O dado real
 *     tem 195.744 `Observation` com name `obs:hotspot:<uuid>`; o backend agora
 *     humaniza (`Observation · <id curto>`) e enriquece o resumo (payload).
 *
 * Convenção /geo (igual geo-reference-layers.spec): o desenho WebGL do Cesium
 * não é asserido em headless — asserimos o FLUXO que alimenta o render (a
 * camada data-driven da ontologia entra no painel) + que nenhum painel do DOM
 * vaza UUID/slug. A humanização do NOME em si é certificada na fonte (curl ao
 * vivo em /api/v1/geo/nodes + pytest test_geo_humanize) e no espelho do front
 * (jest geo-utils humanizePinLabel).
 *
 * Roda: npx playwright test geo-b1b2-humanize.spec.ts
 * Pré: um OntologyNode `Observation` com geopoint semeado no tenant do admin
 * (o harness de shell semeia antes e limpa depois).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

test('B1+B2: /geo monta sem a camada onto-* + camada da ontologia humanizada, zero UUID no DOM', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await login(page);
  await page.goto('/geo', { waitUntil: 'domcontentloaded' });

  // Globo + painel montam — a remoção da camada legada onto-* não derruba o boot.
  await expect(page.getByTestId('cesium-globe')).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId('painel-camadas')).toBeVisible({ timeout: 45000 });

  // Camada data-driven da ontologia lista o node_type HUMANIZADO (Observation).
  const ont = page.getByTestId('camadas-ontologia');
  await expect(ont).toBeVisible();
  await expect(ont.getByText('Observation', { exact: false })).toBeVisible({ timeout: 20000 });

  // Liga a camada — os nós geo plotam (rótulo do pin via humanizePinLabel).
  const toggle = page.getByTestId('layer-toggle-Observation');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Ocultar camada', { timeout: 15000 });

  // Nenhum vazamento de UUID/slug técnico em NENHUM texto do DOM (todos os painéis).
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/obs:hotspot:/i);
  expect(bodyText).not.toMatch(UUID_RE);

  // Sem erro de console/boot referente à camada removida ou ao globo.
  const relevant = errors.filter(
    (e) => !/ResizeObserver|Cesium ion|Ion\.|WebGL|favicon|401|hydrat/i.test(e),
  );
  expect(relevant, `erros de console inesperados:\n${relevant.join('\n')}`).toHaveLength(0);
});
