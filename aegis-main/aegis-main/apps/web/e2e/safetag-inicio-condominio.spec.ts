/**
 * Onda 5, 1ª fatia (Safe Tag) — GESTO AO VIVO do "Início do condomínio".
 *
 * O Início do tenant deixa de ser o dashboard de inteligência: o app-shell do
 * condominio-piloto aponta ``homepage.page_id = inicio-condominio`` e a raiz
 * ``/`` renderiza a Página workshop semeada (app transiente
 * ``page::inicio-condominio``) — TUDO widget genérico (PLANO §8.2, estilo
 * olddashboard): KPIs de visitas (metric_card sobre objectSet+count), as telas
 * de portaria como TILES iframe SAME-ORIGIN (o cookie flui p/ o iframe E p/ o
 * EventSource /api/stream/live — embed 3b em tile) e as listas CRUD da
 * ontologia (pessoa/unidade/visita).
 *
 * Pré-requisitos do ambiente (HANDOFF): seed aplicado no piloto
 * (scratchpad/apply_embed_seed.py), dados demo do CRUD
 * (scratchpad/demo_inicio_data.py) e simulador de visitante rodando
 * (scratchpad/sim_visitante.py) p/ o push vivo nos tiles.
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

test('início do condomínio: homepage do tenant vira a página workshop com KPIs, listas e tiles vivos', async ({ page }) => {
  test.setTimeout(180000);

  // prova cookie→SSE dentro dos TILES (não 401/403): captura /api/stream/live.
  const sse: { status: number; ct: string }[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/stream/live')) {
      sse.push({
        status: res.status(),
        ct: res.headers()['content-type'] || '',
      });
    }
  });

  const me = await login(page, {
    username: 'porteiro.piloto',
    password: 'Porteiro!Onda3b',
  });
  expect(me?.tenant?.slug).toBe('condominio-piloto');
  expect(me?.permissions).toContain('security.painel.view');

  // ── raiz "/" resolve homepage.page_id → Page workshop (não o seed) ────────
  await page.goto('/', { waitUntil: 'commit', timeout: 120000 }).catch(() => {});
  const home = page.locator('[data-home-app-id="page::inicio-condominio"]');
  await expect(home).toBeVisible({ timeout: 120000 });
  await expect(home).toHaveAttribute('data-home-source', 'page');

  // ── KPIs de visitas (#1 do operador) dirigidos pelo CRUD da ontologia ─────
  const kpi = (label: string) =>
    page.locator('[data-testid="metric-card"]', { hasText: label });
  await expect(kpi('Visitas ativas')).toContainText('1', { timeout: 60000 });
  await expect(kpi('Visitas finalizadas')).toContainText('1');
  await expect(kpi('Desvios')).toContainText('1');
  await expect(kpi('Pessoas cadastradas')).toContainText('2');

  // ── listas CRUD (§8.2: usuários/visitantes/endereços → pessoa/unidade/visita)
  const lists = page.locator('[data-testid="object-list"]');
  await expect(lists).toHaveCount(3);
  await expect(page.getByText('Maria Silva')).toBeVisible();
  await expect(page.getByText('VIS-0001')).toBeVisible();
  await expect(
    lists.filter({ hasText: 'Unidades' }).getByText('42B', { exact: true }),
  ).toBeVisible();

  // ── telas de portaria como TILES same-origin (#3 do operador) ─────────────
  const tiles = page.locator('[data-testid="iframe-widget"]');
  await expect(tiles).toHaveCount(2);
  await expect(
    page.locator('[data-testid="iframe-widget"][src="/portaria/livemap/index.html"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="iframe-widget"][src="/portaria/guestalerts/index.html"]'),
  ).toBeVisible();

  // o EventSource dos SPAs abre DENTRO do tile → 200 event-stream = o cookie
  // httpOnly fluiu same-origin (o núcleo do mecanismo 3b, agora em tile).
  await expect
    .poll(
      () =>
        sse.find((s) => s.status === 200 && s.ct.includes('text/event-stream'))
          ? 'ok'
          : sse.map((s) => s.status).join(','),
      { timeout: 60000 },
    )
    .toBe('ok');

  // push VIVO no tile: o simulador de visitante alimenta o roster do livemap
  // (independe do canvas do Google Maps).
  await expect
    .poll(
      async () => {
        const mapFrame = page
          .frames()
          .find((f) => f.url().includes('/portaria/livemap/'));
        if (!mapFrame) return -1;
        return mapFrame.evaluate(
          () => (window as unknown as { __aegisLive?: { roster?: Map<string, unknown> } })
            .__aegisLive?.roster?.size ?? 0,
        );
      },
      { timeout: 60000 },
    )
    .toBeGreaterThan(0);

  await page.screenshot({
    path: 'e2e/artifacts/onda5-inicio-condominio.png',
    fullPage: true,
  });
});

test('admin do condomínio vê o MESMO início (homepage é do tenant, não do usuário)', async ({ page }) => {
  test.setTimeout(120000);
  const me = await login(page, {
    username: 'admin.piloto',
    password: 'AdminPiloto!Onda1x',
  });
  expect(me?.tenant?.slug).toBe('condominio-piloto');

  await page.goto('/', { waitUntil: 'commit', timeout: 120000 }).catch(() => {});
  const home = page.locator('[data-home-app-id="page::inicio-condominio"]');
  await expect(home).toBeVisible({ timeout: 120000 });
  await expect(page.locator('[data-testid="metric-card"]', { hasText: 'Visitas ativas' })).toBeVisible();
  await page.screenshot({
    path: 'e2e/artifacts/onda5-inicio-admin.png',
    fullPage: true,
  });
});
