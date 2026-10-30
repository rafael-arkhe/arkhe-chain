/**
 * §B MAPA — onda 4 (B5.2 zonas KMZ/GeoJSON), gesto do operador AO VIVO.
 *
 * O operador importa zonas de contexto de um GeoJSON (Itapetininga-style), elas
 * viram camada persistente no /geo (node_type='GeoZone', extrusão por categoria)
 * e podem ser removidas. Convenção /geo: o desenho WebGL não é asserido em
 * headless — asserimos o data-flow: import via modal → aparecem na lista Zonas
 * → persistem (reload) → removem. (O render extrudado é código espelho do
 * renderer de zonas do web-app; o backend está certificado por curl 201/204.)
 *
 * Roda: npx playwright test geo-b52-zonas.spec.ts
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

const FIXTURE =
  'C:/Users/Proton/AppData/Local/Temp/claude/E--Apps-safe-core/f0cb92bf-e456-435a-a85f-40d532bf0160/scratchpad/zonas.geojson';

test('B5.2: importar GeoJSON → zonas na lista + persistem + removem', async ({ page }) => {
  await login(page);
  await page.goto('/geo', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('painel-camadas')).toBeVisible({ timeout: 45000 });

  // Abre o modal de importar zona (seção Zonas nasce aberta; botão gated manage).
  await page.getByTestId('importar-zona').click();
  await expect(page.getByTestId('importar-zona-modal')).toBeVisible();

  // Escolhe o arquivo GeoJSON → preview mostra 2 zonas.
  await page.getByTestId('zona-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('zona-preview')).toContainText('2', { timeout: 10000 });

  // Lê o tipo de cada zona da propriedade "tipo" (Zona Alfa=exclusion).
  await page.getByTestId('zona-category-prop').fill('tipo');
  await page.getByTestId('zona-import-confirm').click();

  // Modal fecha; as 2 zonas entram na lista, persistidas no backend.
  await expect(page.getByTestId('importar-zona-modal')).toBeHidden({ timeout: 10000 });
  const lista = page.getByTestId('lista-zonas');
  await expect(lista.getByText('Zona Alfa', { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(lista.getByText('Zona Bravo', { exact: false })).toBeVisible();

  // PERSISTE: recarrega o /geo e as zonas continuam lá (backend, não localStorage).
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('painel-camadas')).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId('lista-zonas').getByText('Zona Alfa', { exact: false }))
    .toBeVisible({ timeout: 15000 });

  // REMOVE uma zona pelo gesto (trash → confirmar) — some da lista.
  const rowAlfa = page.getByTestId('lista-zonas').locator('li', { hasText: 'Zona Alfa' });
  await rowAlfa.getByRole('button', { name: /remover/i }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('lista-zonas').getByText('Zona Alfa', { exact: false }))
    .toBeHidden({ timeout: 10000 });
  // a outra zona segue lá
  await expect(page.getByTestId('lista-zonas').getByText('Zona Bravo', { exact: false })).toBeVisible();
});
