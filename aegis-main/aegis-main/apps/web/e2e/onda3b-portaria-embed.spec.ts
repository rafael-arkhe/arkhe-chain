/**
 * Onda 3b (Safe Tag) — GESTO AO VIVO da portaria embutida same-origin.
 *
 * O operador (porteiro.piloto, papel operador_campo, tenant condominio-piloto)
 * LOGA no security-app (:3002), abre as Páginas ``experience_kind:'embed'``
 * "Alertas ao Vivo" e "Mapa Vivo" (iframe SAME-ORIGIN das SPAs de portaria) e
 * VÊ o push chegar: um visitante manda um fix → cartão/roster aparecem; o
 * visitante DESVIA → o cartão vira "erro" (sirene) em tempo real.
 *
 * Prova o núcleo da fusão: o cookie httpOnly do operador flui same-origin para
 * dentro do iframe E para o ``EventSource /api/stream/live`` (o push só fecha
 * assim). Guestalerts é Maps-free (cartões em DOM = prova visível robusta);
 * livemap prova o roster (dado recebido) independente do canvas do Maps.
 *
 * Setup (usuário/token/geo) vem por env E2E_ONDA3B (JSON) — ver
 * ontology-module/scratchpad/setup_onda3b.py.
 */
import { test, expect, type Page } from '@playwright/test';

import { login } from './helpers/login';

const S = JSON.parse(process.env.E2E_ONDA3B || '{}');

async function pushFix(page: Page, pt: { lat: number; lng: number }) {
  // proxy público anônimo → backend /public/v1/guest/<token>/fix. Republica no
  // Pub/Sub do tenant (o SSE, já inscrito, captura o próximo push).
  const r = await page.request.post(
    `/api/public/guest/${encodeURIComponent(S.visitor_token)}/fix`,
    { data: pt, headers: { 'Content-Type': 'application/json' } },
  );
  expect(r.ok(), `fix falhou: ${r.status()} ${await r.text().catch(() => '')}`).toBeTruthy();
}

test('portaria embutida same-origin: operador vê o push (alertas + mapa)', async ({ page }) => {
  test.setTimeout(180000);
  expect(S.visitor_token, 'E2E_ONDA3B ausente (rode setup_onda3b.py)').toBeTruthy();

  // captura as respostas do stream (prova cookie→SSE 200, não 401/403).
  const sse: { url: string; status: number; ct: string }[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/stream/live')) {
      sse.push({
        url: res.url(),
        status: res.status(),
        ct: res.headers()['content-type'] || '',
      });
    }
  });

  const me = await login(page, {
    username: S.porteiro_user,
    password: S.porteiro_pass,
  });
  expect(me?.tenant?.slug).toBe('condominio-piloto');
  expect(me?.permissions).toContain('security.alertas.view');

  // ── ALERTAS AO VIVO (guestalerts — cartões em DOM) ────────────────────────
  // goto tolerante (Next dev pode compilar a rota no 1º hit) + espera o iframe.
  await page
    .goto('/paginas/portaria-alertas/view', { waitUntil: 'commit', timeout: 120000 })
    .catch(() => {});
  const frameEl = page.locator('[data-testid="embed-frame"]');
  await expect(frameEl).toHaveAttribute('src', '/portaria/guestalerts/index.html', {
    timeout: 120000,
  });

  // o EventSource abre no load do SPA → 200 event-stream (cookie fluiu same-origin).
  await expect
    .poll(() => sse.find((s) => s.status === 200 && s.ct.includes('text/event-stream')) ? 'ok' : sse.map((s) => s.status).join(','), {
      timeout: 45000,
    })
    .toBe('ok');

  const gf = page.frameLocator('[data-testid="embed-frame"]');
  // desbloqueia o "modo alerta" (só p/ áudio; não bloqueia os cartões).
  await gf.locator('#allow-audio-button').click({ timeout: 8000 }).catch(() => {});

  // visitante manda fix DENTRO → cartão aparece (retry: o Pub/Sub não bufferiza,
  // então re-empurramos até o SSE, já inscrito, pegar).
  await expect(async () => {
    await pushFix(page, S.fix_inside);
    await expect(gf.locator('#list-container .list-item').first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60000 });
  await expect(gf.getByText('Visitante Demo').first()).toBeVisible({ timeout: 10000 });
  // #3 DESNORMALIZAÇÃO — o cartão mostra telefone (contact.phone) + unidade
  // (geo.house_number) que vieram JUNTO no push, sem N+ reads client-side.
  await expect(gf.locator('#list-container .list-item .phone').first()).toHaveText(
    '+5511988887777',
    { timeout: 10000 },
  );
  await expect(gf.locator('#list-container .list-item .unit').first()).toContainText(
    'Unidade 42B',
    { timeout: 10000 },
  );

  // visitante DESVIA → o cartão vira "erro" (dispara a sirene) em tempo real.
  await expect(async () => {
    await pushFix(page, S.fix_deviate);
    await expect(gf.locator('#list-container .list-item .status.error').first()).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 60000 });

  await page.screenshot({ path: 'e2e/artifacts/onda3b-alertas.png', fullPage: true });

  // roster do stream (dado recebido) confirma o push chegou ao data layer.
  const alertsFrame = page.frames().find((f) => f.url().includes('/portaria/guestalerts/'));
  const alertsRoster = await alertsFrame!.evaluate(
    () => (window as any).__aegisLive?.roster?.size ?? 0,
  );
  expect(alertsRoster).toBeGreaterThan(0);

  // ── MAPA VIVO (livemap — roster; markers são canvas do Maps) ───────────────
  await page
    .goto('/paginas/portaria-mapa/view', { waitUntil: 'commit', timeout: 120000 })
    .catch(() => {});
  await expect(frameEl).toHaveAttribute('src', '/portaria/livemap/index.html', { timeout: 120000 });

  await expect
    .poll(() => sse.filter((s) => s.status === 200).length >= 2 ? 'ok' : String(sse.length), {
      timeout: 45000,
    })
    .toBe('ok');

  // push → o roster do livemap recebe o token do visitante (independe do canvas
  // do Google Maps: o stream sobe mesmo sem a key de Maps do site).
  await expect(async () => {
    await pushFix(page, S.fix_inside);
    const mapFrame = page.frames().find((f) => f.url().includes('/portaria/livemap/'));
    const size = await mapFrame!.evaluate(() => (window as any).__aegisLive?.roster?.size ?? 0);
    expect(size).toBeGreaterThan(0);
  }).toPass({ timeout: 60000 });

  await page.screenshot({ path: 'e2e/artifacts/onda3b-mapa.png', fullPage: true });
});
