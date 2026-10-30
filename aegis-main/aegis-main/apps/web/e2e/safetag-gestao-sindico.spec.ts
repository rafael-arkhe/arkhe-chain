/**
 * Onda 5, 3ª fatia (Safe Tag) — GESTÃO do condomínio (síndico).
 *
 * O síndico loga e VÊ a superfície de gestão nativa AEGIS (sem UX legada):
 *   1. sua HOME é a Página de Gestão (homepage POR-USUÁRIO = gestao-condominio;
 *      o porteiro segue no Início do tenant) com KPIs + MAPA DE CALOR (geo_map
 *      heatmap sobre os desvios com geopoint) + tabela/timeline de desvios;
 *   2. o BRIEFING da operação (boletim-operacao, gerado pelo Coordenador) aparece
 *      em /briefings e o síndico o abre;
 *   3. o síndico NÃO vê a busca OSINT (/buscar escondido/negado) — ilha D9.
 *
 * Pré-requisitos: rodar antes `podman exec ontology-api python scratchpad/
 * cert_onda5c.py` (cria sindico.piloto, aponta a homepage, semeia os desvios
 * com geopoint e gera o briefing). GOTCHA de cookies Secure em prod → rodar com
 * E2E_BASE_URL=http://localhost:3002 (ver safetag-agentes-chat.spec.ts).
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

test('síndico: home = Página de Gestão com KPIs + mapa de calor dos desvios', async ({ page }) => {
  test.setTimeout(180000);
  const me = await login(page, {
    username: 'sindico.piloto',
    password: 'Sindico!Onda5x',
  });
  expect(me?.tenant?.slug).toBe('condominio-piloto');
  expect(me?.roles).toContain('sindico');
  // ilha D9 — o síndico não tem a busca OSINT nem sandbox
  expect(me?.permissions).not.toContain('security.buscar.view');
  expect(me?.permissions).toContain('security.briefings.view');

  // a raiz "/" resolve a homepage POR-USUÁRIO → Página de Gestão
  await page.goto('/', { waitUntil: 'commit', timeout: 120000 }).catch(() => {});
  const home = page.locator('[data-home-app-id="page::gestao-condominio"]');
  await expect(home).toBeVisible({ timeout: 120000 });
  await expect(home).toHaveAttribute('data-home-source', 'page');

  // header = título da Página de Gestão (fix da 2ª fatia), sem CCTV
  await expect(page.getByText('Gestão do Condomínio', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/CCTV \d+\/\d+ streams/)).toHaveCount(0);

  // KPIs de gestão
  const kpi = (label: string) =>
    page.locator('[data-testid="metric-card"]', { hasText: label });
  await expect(kpi('Desvios')).toContainText(/\d/, { timeout: 60000 });
  await expect(kpi('Visitas ativas')).toBeVisible();

  // MAPA DE CALOR — geo_map em modo heatmap com os desvios (geopoint semeado).
  // No modo heatmap a camada de densidade usa data-testid="geo-map-heat-N".
  const mapa = page.locator('[data-testid="geo-map-widget"]');
  await expect(mapa).toBeVisible({ timeout: 60000 });
  await expect(mapa.locator('[data-testid="geo-map-heatmap"]')).toBeVisible();
  // pelo menos 1 ponto de calor = desvio lido de properties.geopoint (a ponte)
  await expect
    .poll(
      async () => page.locator('[data-testid^="geo-map-heat-"]').count(),
      { timeout: 60000 },
    )
    .toBeGreaterThan(0);
  // e o contador honesto do widget confirma os desvios com posição
  await expect(page.locator('[data-testid="geo-map-count"]')).toContainText(
    /marcador/,
  );

  await page.screenshot({
    path: 'e2e/artifacts/onda5c-gestao-sindico.png',
    fullPage: true,
  });
});

test('síndico: o Briefing da operação (gerado pelo Coordenador) aparece em /briefings', async ({ page }) => {
  test.setTimeout(120000);
  const me = await login(page, {
    username: 'sindico.piloto',
    password: 'Sindico!Onda5x',
  });
  expect(me?.roles).toContain('sindico');

  await page
    .goto('/briefings', { waitUntil: 'commit', timeout: 120000 })
    .catch(() => {});

  // o boletim vivo da operação está na lista de briefings
  await expect(
    page.getByText('Boletim da Operação', { exact: false }).first(),
  ).toBeVisible({ timeout: 60000 });
  await page.getByText('Boletim da Operação', { exact: false }).first().click();

  // ao abrir, vê o conteúdo (KPIs / desvios) materializado
  await expect(
    page.getByText(/Indicadores da operação|Desvios de hoje|Eventos de desvio/).first(),
  ).toBeVisible({ timeout: 60000 });

  await page.screenshot({
    path: 'e2e/artifacts/onda5c-briefing-operacao.png',
    fullPage: true,
  });
});
