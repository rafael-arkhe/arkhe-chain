/**
 * §C C1 (/cameras) — MOSAICOS NOMEADOS, gesto do operador AO VIVO.
 *
 * Antes: botão "Mosaico N×" jogava TODAS as câmeras na grade e polava detecção
 * de TODAS a cada 5s (não escala). Agora: recortes NOMEADOS salvos por operador
 * no backend (/me/context camera_mosaics), grade e polling só do mosaico ativo,
 * seleção por FILTRO (cidade/situação/tags/zona) ou manual.
 *
 * Este spec dirige o gesto ponta-a-ponta:
 *   criar por filtro (cidade São Paulo → 3 câmeras, viva a contagem) → ativar →
 *   grade escopada (3 SP, sem Campinas) → polling escopado (Campinas NUNCA é
 *   polada) → persistir no reload (backend) → editar (renomear) → excluir.
 *
 * Pré: 4 streams semeados no tenant aegis (3 São Paulo, 1 Campinas) + o
 * camera_mosaics do admin limpo → 1º mosaico nasce com id 'm1'.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

// ids dos streams semeados (E2E-C1-*) — Campinas é a prova do escopo do polling.
const CAMPINAS_ID = '419ce3ce-6e51-4184-aed9-b3e406278897';
const SP_IDS = [
  '6a133877-d7eb-41a8-ba45-6d8770b3bf56', // Portaria Norte
  'e67b9405-468a-4d6c-83d1-d89188e39c61', // Avenida Central
  '17c091e8-468d-4353-bba0-2cd833cdef7a', // Patio Sul
];

test('C1: mosaico nomeado — criar por filtro, grade + polling escopados, persistir, editar, excluir', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  // captura o polling de detecção POR stream (prova do escopo do mosaico).
  const detStreamIds = new Set<string>();
  page.on('request', (r) => {
    const m = r.url().match(/\/cctv\/streams\/([0-9a-f-]{36})\/detections/i);
    if (m) detStreamIds.add(m[1].toLowerCase());
  });

  const who = await login(page);
  expect(who?.tenant?.slug).toBe('aegis');
  await page.goto('/cameras', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('cameras-tags')).toBeVisible({ timeout: 45000 });
  await expect(page.getByText('E2E-C1 Portaria Norte', { exact: false }).first()).toBeVisible({
    timeout: 15000,
  });

  // ── Criar mosaico por FILTRO (cidade São Paulo) ───────────────────────────
  await page.getByTestId('mosaic-trigger').click();
  await page.getByTestId('mosaic-new').click();
  const modal = page.getByTestId('mosaic-editor-modal');
  await expect(modal).toBeVisible();
  await page.getByTestId('mosaic-name-input').fill('Zona E2E SP');
  // modo filtro é o default; seleciona cidade São Paulo → 3 câmeras
  await page.getByTestId('mosaic-filter-city').selectOption('São Paulo');
  await expect(page.getByTestId('mosaic-count')).toContainText('3');
  await page.getByTestId('mosaic-save').click();
  await expect(modal).toBeHidden();

  // ── Ativou: trigger mostra o nome; grade escopada (3 SP, SEM Campinas) ────
  await expect(page.getByTestId('mosaic-trigger')).toContainText('Zona E2E SP');
  const grid = page.getByTestId('mosaic-view');
  await expect(grid).toBeVisible();
  await expect(grid.getByText('E2E-C1 Portaria Norte', { exact: false })).toBeVisible();
  await expect(grid.getByText('E2E-C1 Patio Sul', { exact: false })).toBeVisible();
  await expect(grid.getByText('E2E-C1 Avenida Central', { exact: false })).toBeVisible();
  await expect(grid.getByText('E2E-C1 Rótula Campinas', { exact: false })).toHaveCount(0);

  // ── Polling ESCOPADO: um ciclo (5s) e a câmera de Campinas NUNCA é polada ──
  await page.waitForTimeout(6500);
  expect(detStreamIds.size).toBeGreaterThan(0);
  expect(Array.from(detStreamIds)).not.toContain(CAMPINAS_ID);
  for (const id of detStreamIds) expect(SP_IDS).toContain(id);

  // ── Persiste no RELOAD (backend /me/context camera_mosaics) ───────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('cameras-tags')).toBeVisible({ timeout: 45000 });
  await page.getByTestId('mosaic-trigger').click();
  await expect(page.getByTestId('mosaic-item-m1')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('mosaic-load-m1')).toContainText('Zona E2E SP');

  // ── Editar: renomear e salvar ─────────────────────────────────────────────
  await page.getByTestId('mosaic-edit-m1').click();
  const modal2 = page.getByTestId('mosaic-editor-modal');
  await expect(modal2).toBeVisible();
  await page.getByTestId('mosaic-name-input').fill('Zona E2E SP v2');
  await page.getByTestId('mosaic-save').click();
  await expect(modal2).toBeHidden();
  await page.getByTestId('mosaic-trigger').click();
  await expect(page.getByTestId('mosaic-load-m1')).toContainText('Zona E2E SP v2');

  // ── Excluir: confirmModal → some da lista ─────────────────────────────────
  await page.getByTestId('mosaic-remove-m1').click();
  await page.getByTestId('confirm-ok').click();
  await page.getByTestId('mosaic-trigger').click();
  await expect(page.getByTestId('mosaic-item-m1')).toHaveCount(0);

  expect(errors, `pageerrors: ${errors.join(' | ')}`).toEqual([]);
});
