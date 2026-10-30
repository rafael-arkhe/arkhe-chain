/**
 * Gesto do operador: no /geo, ligar a camada de referência "Limites estaduais
 * (IBGE)" e ver o contador real (27 UFs) aparecer — prova o data-flow completo
 * pela UI real + backend (toggle → GET /geo/reference-layers/ibge_uf_malha →
 * GeoJSON → estado → painel). O desenho WebGL no Cesium não é asserido aqui
 * (headless), mas o fluxo que o alimenta é.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test('camadas de referência: ligar IBGE limites no /geo mostra 27 UFs', async ({ page }) => {
  await login(page); // admin default — ferreira não existe pós-reset (reference_dev_login)

  await page.goto('/geo', { waitUntil: 'domcontentloaded' });

  const painel = page.getByTestId('painel-camadas');
  await expect(painel).toBeVisible({ timeout: 30000 });

  // Seção "Camadas de referência" começa fechada — abre pelo header.
  const secao = page.getByTestId('camadas-referencia');
  await expect(secao).toBeVisible();
  await secao.getByText('Camadas de referência', { exact: false }).click();

  // Liga a camada de limites estaduais (sem parâmetro).
  const toggle = page.getByTestId('ref-layer-toggle-ibge_uf_malha');
  await expect(toggle).toBeVisible({ timeout: 10000 });
  await toggle.click();

  // Toggle vira "ativo" (aria-label muda).
  await expect(toggle).toHaveAttribute('aria-label', 'Ocultar camada', { timeout: 10000 });

  // PROVA REAL DE RENDER: o CesiumGlobe reporta as feições que entraram no globo
  // → o painel mostra "N no mapa". Se o globo NÃO desenhar, este indicador não
  // aparece (o débito que o operador pegou: "não vejo nada no mapa").
  await expect(
    page.getByTestId('ref-layer-rendered-ibge_uf_malha'),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByTestId('ref-layer-rendered-ibge_uf_malha'),
  ).toContainText('no mapa');
});

test('CNES por UF: escolhe a UF pelo NOME (dropdown) e os pontos desenham', async ({ page }) => {
  await login(page); // admin default — ferreira não existe pós-reset (reference_dev_login)
  await page.goto('/geo', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('painel-camadas')).toBeVisible({ timeout: 30000 });
  const secao = page.getByTestId('camadas-referencia');
  await secao.getByText('Camadas de referência', { exact: false }).click();

  // Seletor amigável de UF (nunca código cru) — escolhe Distrito Federal (53).
  const ufSelect = page.getByTestId('ref-layer-param-cnes_saude');
  await expect(ufSelect).toBeVisible({ timeout: 10000 });
  await ufSelect.selectOption('53');

  // Toggle habilita após escolher a UF; liga → pontos CNES desenham.
  const toggle = page.getByTestId('ref-layer-toggle-cnes_saude');
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(
    page.getByTestId('ref-layer-rendered-cnes_saude'),
  ).toBeVisible({ timeout: 60000 });
});
