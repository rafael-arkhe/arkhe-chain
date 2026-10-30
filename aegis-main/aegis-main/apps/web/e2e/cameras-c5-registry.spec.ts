/**
 * §C C5 (/painel-de-controle/dados › Câmeras) — seção GESTORA, gesto AO VIVO.
 *
 * "Registrar câmera" saiu de /cameras (operador só OPERA) e virou uma seção
 * gerida no Acervo de /dados: lista PAGINADA + busca/filtros NO SERVIDOR (escala
 * a milhares via GET /cctv/streams/page), + Registrar câmera (modal movido) +
 * Placas procuradas (Hotlist) + Pipeline de detecções unificados.
 *
 * Certifica: a seção carrega a lista do servidor; a busca dispara refetch com
 * `q` no servidor e reduz a lista; o filtro de cidade idem; Registrar abre o
 * modal; Hotlist e Pipeline estão embutidos; e /cameras NÃO tem mais o botão.
 *
 * Pré: 5 streams semeados (E2E-C5-*: 3 São Paulo, 1 Campinas, 1 Santos).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test('C5: seção Câmeras gerida — lista paginada + busca/filtro no servidor + registrar + hotlist/pipeline; /cameras sem botão', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  const pageReqs: string[] = [];
  page.on('request', (r) => {
    if (/\/cctv\/streams\/page/.test(r.url())) pageReqs.push(r.url());
  });

  const who = await login(page);
  expect(who?.tenant?.slug).toBe('aegis');

  await page.goto('/painel-de-controle/dados?aba=cameras', { waitUntil: 'domcontentloaded' });
  const ws = page.getByTestId('cameras-workspace');
  await expect(ws).toBeVisible({ timeout: 45000 });

  // Lista carregada do SERVIDOR (5 semeadas) + range/total honestos.
  await expect(ws.getByText('E2E-C5 Portaria Norte', { exact: false })).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('cameras-registry-range')).toContainText('5');
  expect(pageReqs.length).toBeGreaterThan(0);

  // BUSCA no SERVIDOR: "campinas" dispara ?q=campinas e reduz para 1.
  await page.getByTestId('cameras-registry-search').fill('campinas');
  await expect
    .poll(() => pageReqs.some((u) => /[?&]q=campinas/i.test(u)), { timeout: 5000 })
    .toBe(true);
  await expect(ws.getByText('E2E-C5 Rótula Campinas', { exact: false })).toBeVisible();
  await expect(ws.getByText('E2E-C5 Portaria Norte', { exact: false })).toBeHidden();
  await expect(page.getByTestId('cameras-registry-range')).toContainText('1');

  // LIMPAR restaura os 5.
  await page.getByTestId('cameras-registry-clear').click();
  await expect(ws.getByText('E2E-C5 Portaria Norte', { exact: false })).toBeVisible();

  // FILTRO de cidade no SERVIDOR: Campinas dispara ?city=Campinas.
  await page.getByTestId('cameras-registry-city').selectOption('Campinas');
  await expect
    .poll(() => pageReqs.some((u) => /[?&]city=Campinas/i.test(u)), { timeout: 5000 })
    .toBe(true);
  await expect(ws.getByText('E2E-C5 Rótula Campinas', { exact: false })).toBeVisible();
  await expect(ws.getByText('E2E-C5 Litoral Santos', { exact: false })).toBeHidden();
  await page.getByTestId('cameras-registry-clear').click();

  // REGISTRAR câmera: o botão (modal movido de /cameras) abre o modal.
  await page.getByTestId('cameras-registry-register').click();
  await expect(page.getByTestId('register-camera-modal')).toBeVisible();
  // fecha clicando no scrim (canto — fora do card centralizado → onClose)
  await page.getByTestId('register-camera-modal').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('register-camera-modal')).toBeHidden();

  // UNIFICADOS na seção: Placas procuradas + Pipeline de detecções.
  await expect(page.getByTestId('hotlist-section')).toBeVisible();
  await expect(page.getByTestId('pipeline-section')).toBeVisible();

  // /cameras NÃO tem mais o botão Registrar (operador só opera).
  await page.goto('/cameras', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('cameras-tags')).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId('abrir-registrar-camera')).toHaveCount(0);

  expect(errors, `pageerrors: ${errors.join(' | ')}`).toEqual([]);
});
