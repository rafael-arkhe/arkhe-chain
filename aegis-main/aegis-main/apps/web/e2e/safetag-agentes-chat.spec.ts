/**
 * Onda 5, 2ª fatia (Safe Tag) — GESTO AO VIVO: busca do vertical SOB OS
 * AGENTES (fix #4 do operador; /buscar segue escondido).
 *
 * O porteiro conversa com o AIP ("Conversas") e:
 *   1. pergunta "quais visitas estão ativas?" → o loop de tools REAL chama
 *      `guest_visits_query` e responde com as visitas vivas do banco;
 *   2. pede "emita um link de acesso…" → o loop chama `guest_link_issue`
 *      (Action aegis.guest.issue_and_share sob o principal DO PORTEIRO) e o
 *      link /m/ REAL volta na conversa.
 * A experiência do chat é a SEMEADA no vertical (greeting + sugestões +
 * tools curadas sem OSINT — ilha D9), via /platform/v25/aip/experience.
 *
 * + fix cosmético certificado: com a home = Página do condomínio, o header da
 *   raiz "/" mostra o título da Página e NÃO o subtítulo "CCTV n/n streams"
 *   do dashboard de inteligência.
 *
 * Pré-requisitos (HANDOFF): stack :8002/:3002 up, seed do piloto aplicado
 * (AEGIS_SEED_SAFETAG=1), LLM real configurado (openrouter) — sem mocks
 * (feedback_aip_e2e_real_llm).
 *
 * GOTCHA do ambiente: o front em build de PROD (`next start`, NODE_ENV=
 * production) seta os cookies de sessão com `Secure`; o `page.request` do
 * Playwright sobre `http://127.0.0.1` DESCARTA cookies Secure → o login helper
 * falha (me=null). Chromium trata `localhost` como contexto confiável, então
 * rode com `E2E_BASE_URL=http://localhost:3002` (ou o front em `next dev`).
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

test('header da raiz "/": home = Página do condomínio SEM o subtítulo CCTV', async ({ page }) => {
  test.setTimeout(120000);
  const me = await login(page, {
    username: 'porteiro.piloto',
    password: 'Porteiro!Onda3b',
  });
  expect(me?.tenant?.slug).toBe('condominio-piloto');

  await page.goto('/', { waitUntil: 'commit', timeout: 120000 }).catch(() => {});
  const home = page.locator('[data-home-app-id="page::inicio-condominio"]');
  await expect(home).toBeVisible({ timeout: 120000 });

  // título do header = o título da Página escolhida…
  await expect(
    page.getByText('Início do Condomínio', { exact: true }).first(),
  ).toBeVisible();
  // …e o subtítulo fixo do dashboard de inteligência NÃO aparece.
  await expect(page.getByText(/CCTV \d+\/\d+ streams/)).toHaveCount(0);

  await page.screenshot({
    path: 'e2e/artifacts/onda5b-header-sem-cctv.png',
    fullPage: false,
  });
});

test('porteiro no chat: visitas ativas + emissão de link por linguagem natural (LLM real)', async ({ page }) => {
  test.setTimeout(420000);

  // prova de mecanismo: captura os turnos do loop de tools REAL.
  const turns: Array<{ tools: string[]; final: string; allowed: string[] }> = [];
  page.on('response', async (res) => {
    if (!res.url().includes('/api/agent/tools/run')) return;
    try {
      const body = await res.json();
      const reqBody = res.request().postDataJSON() as {
        allowed_tools?: string[];
      };
      turns.push({
        tools: (body.trace || []).map((t: { tool: string }) => t.tool),
        final: body.final_text || '',
        allowed: reqBody?.allowed_tools || [],
      });
    } catch {
      /* body não-JSON — ignora */
    }
  });

  const me = await login(page, {
    username: 'porteiro.piloto',
    password: 'Porteiro!Onda3b',
  });
  expect(me?.tenant?.slug).toBe('condominio-piloto');
  expect(me?.permissions).toContain('public.token.read');
  expect(me?.permissions).toContain('messaging.send');

  await page
    .goto('/paginas/aip-threads/view', { waitUntil: 'commit', timeout: 120000 })
    .catch(() => {});

  // experiência SEMEADA do vertical chegou ao chat (greeting + sugestões).
  await expect(
    page.getByTestId('aip-chat-landing-greeting').first(),
  ).toContainText('AIP do condomínio', { timeout: 60000 });
  await expect(
    page.getByText('Quais visitas estão ativas agora?').first(),
  ).toBeVisible();

  // nova conversa (nasce com as tools CURADAS da experiência do tenant).
  await page.getByTestId('aip-chat-new-conversation').click();
  const input = page.getByTestId('aip-chat-composer-input');
  await expect(input).toBeVisible({ timeout: 30000 });

  // ── turno 1: busca sob agentes (guest_visits_query) ───────────────────────
  await input.fill('Quais visitas estão ativas agora? Liste os nomes.');
  await page.getByTestId('aip-chat-composer-send').click();
  await expect
    .poll(() => turns.length, { timeout: 180000 })
    .toBeGreaterThan(0);
  expect(turns[0].tools).toContain('guest_visits_query');
  // curadoria D9 na request REAL do browser: tools do vertical, sem OSINT.
  expect(turns[0].allowed).toContain('guest_link_issue');
  expect(turns[0].allowed).not.toContain('entity_dossier');
  // resposta renderizada cita dado VIVO do banco (as visitas do cert/sim).
  await expect(
    page.getByTestId('aip-chat-panel-messages'),
  ).toContainText(/Cert|Simulado|ativa/i, { timeout: 60000 });
  await page.screenshot({
    path: 'e2e/artifacts/onda5b-chat-visitas.png',
    fullPage: false,
  });

  // ── turno 2: emissão do link por linguagem natural (guest_link_issue) ─────
  await input.fill(
    'Emita um link de acesso para a visitante Clara Browser, unidade 12, ' +
      'telefone +5511922223333.',
  );
  await page.getByTestId('aip-chat-composer-send').click();
  await expect.poll(() => turns.length, { timeout: 240000 }).toBeGreaterThan(1);
  expect(turns[1].tools).toContain('guest_link_issue');
  // o link /m/ REAL volta na conversa do porteiro.
  await expect(
    page.getByTestId('aip-chat-panel-messages'),
  ).toContainText('/m/', { timeout: 60000 });
  await page.screenshot({
    path: 'e2e/artifacts/onda5b-chat-link.png',
    fullPage: false,
  });

  // fim-a-fim: o token emitido PELO CHAT existe no backend (via a API real).
  const adm = await page.request.post('/api/auth/login', {
    data: { username: 'admin.piloto', password: 'AdminPiloto!Onda1x' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(adm.ok()).toBeTruthy();
  const toks = await page.request.get('/api/platform/v23/guest-tokens');
  expect(toks.ok()).toBeTruthy();
  const list = (await toks.json()) as Array<{ subject?: string }>;
  expect(
    list.some((t) => (t.subject || '').startsWith('Clara Browser')),
  ).toBeTruthy();
});
