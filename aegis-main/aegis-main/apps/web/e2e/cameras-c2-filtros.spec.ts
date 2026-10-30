/**
 * §C C2 (/cameras) — lista de Streams escalável, gesto do operador AO VIVO.
 *
 * Antes: Cctv.streams.list() sem params carregava TODAS (não escala). Agora:
 * busca livre (client) + filtros de status/cidade/detecção (SERVIDOR, via os
 * params que já existiam no client) + botão limpar. Este spec dirige o gesto:
 * busca reduz a lista · filtro de cidade dispara o param no servidor e reduz ·
 * limpar restaura · o painel de detecções não quebra sem dados.
 *
 * Pré: 3 streams semeados no tenant admin (2 São Paulo, 1 Campinas).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test('C2: Streams — busca client + filtro de cidade no servidor + limpar', async ({ page }) => {
  const streamReqs: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/cctv/streams') && !/\/streams\/[0-9a-f]{8}/i.test(u)) streamReqs.push(u);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));

  await login(page);
  await page.goto('/cameras', { waitUntil: 'domcontentloaded' });
  const aside = page.getByTestId('cameras-tags');
  await expect(aside).toBeVisible({ timeout: 45000 });

  // 3 streams carregados.
  await expect(aside.getByText('Praça Norte', { exact: false })).toBeVisible({ timeout: 15000 });
  await expect(aside.getByText('Av. Central', { exact: false })).toBeVisible();

  // BUSCA client-side: "norte" mantém Praça Norte, some Av. Central.
  await page.getByTestId('streams-busca').fill('norte');
  await expect(aside.getByText('Praça Norte', { exact: false })).toBeVisible();
  await expect(aside.getByText('Av. Central', { exact: false })).toBeHidden();
  await page.getByTestId('streams-busca').fill('');
  await expect(aside.getByText('Av. Central', { exact: false })).toBeVisible();

  // FILTRO DE CIDADE no SERVIDOR: Campinas → dispara ?city=Campinas e reduz.
  await page.getByTestId('streams-filter-city').selectOption('Campinas');
  await expect
    .poll(() => streamReqs.some((u) => /city=Campinas/i.test(decodeURIComponent(u))), { timeout: 10000 })
    .toBeTruthy();
  await expect(aside.getByText('Av. Central', { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(aside.getByText('Praça Norte', { exact: false })).toBeHidden();

  // LIMPAR restaura a lista cheia.
  await page.getByTestId('streams-filter-clear').click();
  await expect(aside.getByText('Praça Norte', { exact: false })).toBeVisible({ timeout: 10000 });

  // Painel de Detecções não quebra sem dados (0 detecções).
  await expect(page.getByTestId('cameras-detections')).toBeVisible();
  const relevant = errors.filter((e) => !/ResizeObserver|Cesium|WebGL|favicon|401|hydrat|HLS|hls/i.test(e));
  expect(relevant, relevant.join('\n')).toHaveLength(0);
});
