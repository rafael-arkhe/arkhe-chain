/**
 * §B MAPA — onda 5 (B5.3 animações reais), cert do gesto AO VIVO.
 *
 * As animações são real-driven e SÓ BORDA (sem glow): "sonar ring" na CHEGADA
 * de detecção nova + foco de calor pulsando SÓ o tamanho (halo/glow removido) +
 * prefers-reduced-motion. O movimento WebGL não é asserido em headless
 * (convenção /geo) — as curvas puras são cobertas por jest (geo-animations) e
 * aqui asserimos que os CAMINHOS de animação (camada de foco de calor pulsante +
 * tick de detecções com o pulso de chegada) rodam AO VIVO sem derrubar o globo.
 *
 * Roda: npx playwright test geo-b53-anim.spec.ts
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test('B5.3: camada de foco pulsante + tick de detecções rodam sem crash (só-borda, real-driven)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));

  await login(page);
  await page.goto('/geo', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('painel-camadas')).toBeVisible({ timeout: 45000 });

  // Liga o foco de calor (camada de referência pulsante) — exercita o caminho
  // do pulso SÓ-BORDA corrigido (halo/glow removido).
  await page.getByTestId('camadas-referencia').getByText('Camadas de referência', { exact: false }).click();
  const focos = page.getByTestId('ref-layer-toggle-focos_calor');
  await expect(focos).toBeVisible({ timeout: 10000 });
  await focos.click();
  await expect(focos).toHaveAttribute('aria-label', 'Ocultar camada', { timeout: 15000 });

  // Liga a camada de Detecções recentes — dispara o tick (bootstrap semeia sem
  // pulsar; o sonar ring de chegada só acende em arrivals reais subsequentes).
  const detSection = page.locator('div.border-b', { hasText: 'Detecções recentes' });
  await detSection.getByRole('button', { name: /Mostrar camada/i }).click();

  // Deixa o tick rodar (bootstrap + processamento) — não pode derrubar o globo.
  await page.waitForTimeout(8000);

  const relevant = errors.filter((e) => !/ResizeObserver|Cesium ion|Ion\.|WebGL|favicon|401|hydrat/i.test(e));
  expect(relevant, `erros inesperados:\n${relevant.join('\n')}`).toHaveLength(0);
  await expect(page.getByTestId('cesium-globe')).toBeVisible();
});
