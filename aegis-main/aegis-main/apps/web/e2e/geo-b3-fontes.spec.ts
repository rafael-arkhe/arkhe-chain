/**
 * §B MAPA — onda 2 (B3), gesto do operador AO VIVO.
 *
 * A aba "Fontes" do /geo era 5 SourceCard hardcoded (endpoint técnico, raso).
 * Agora é um registro DATA-DRIVEN (GET /api/v1/geo/sources + câmeras/cercas/
 * correlações do contexto): categorizado, com TAG, busca, estado honesto e
 * deep-link "abrir fluxo/origem". Este spec dirige o gesto real: abre a aba,
 * vê as fontes reais, filtra por busca, e confirma o deep-link + zero i18n cru.
 *
 * Pré: 1 OntologyNode Observation com geopoint semeado no tenant do admin
 * (created_by agent:inpe.focos_collect) — o harness de shell semeia/limpa.
 *
 * Roda: npx playwright test geo-b3-fontes.spec.ts
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test('B3: aba Fontes data-driven — categorias, busca, estado honesto, deep-link', async ({ page }) => {
  await login(page);
  await page.goto('/geo', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('painel-camadas')).toBeVisible({ timeout: 45000 });

  // Abre a aba Fontes.
  await page.getByTestId('tab-fontes').click();
  await expect(page.getByTestId('fontes-busca')).toBeVisible({ timeout: 15000 });

  // Facetas de categoria presentes (referência sempre há; cctv/cercas/correlação
  // são compostas do contexto).
  // 15s como as irmãs: a faceta depende do fetch async de /geo/sources (box sob carga)
  await expect(page.getByTestId('fontes-facet-cat-reference')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('fontes-facet-cat-cctv')).toBeVisible({ timeout: 15000 });

  // Fonte de REFERÊNCIA real (catálogo keyless) + fonte de ONTOLOGIA (semeada,
  // com producer humanizado).
  const ontRow = page.getByTestId('fonte-ontology:Observation');
  await expect(page.getByTestId('fonte-reference:ibge_uf_malha')).toBeVisible({ timeout: 15000 });
  await expect(ontRow).toBeVisible();
  await expect(ontRow).toContainText('Inpe Focos Collect'); // producer humanizado, nunca "agent:"

  // Deep-link "abrir origem" da fonte de câmeras aponta pra /cameras.
  await expect(page.getByTestId('fonte-link-cctv')).toHaveAttribute('href', '/cameras');

  // i18n: nenhuma chave crua "geo.sources." vaza no painel.
  const panelText = await page.getByTestId('painel-camadas').innerText();
  expect(panelText).not.toMatch(/geo\.sources\./);

  // Busca filtra de verdade: "IBGE" some com a ontologia, mantém as camadas IBGE.
  await page.getByTestId('fontes-busca').fill('IBGE');
  await expect(page.getByTestId('fonte-reference:ibge_uf_malha')).toBeVisible();
  await expect(ontRow).toHaveCount(0);
});
