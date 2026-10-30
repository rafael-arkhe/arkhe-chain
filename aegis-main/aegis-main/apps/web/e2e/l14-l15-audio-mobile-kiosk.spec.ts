/**
 * E2E · L15 (Mobile + Kiosk scoped).
 * ────────────────────────────────────────────────────────────────────────
 * NOTA (W4): o passo L14 (página /painel-de-controle/audio) foi aposentado.
 * A suíte forense de áudio migrou para o painel do AIP Chat
 * (AudioArtifactPanel) e tem cobertura própria; a rota /audio não existe mais.
 * Mantidos aqui os passos de mobile + kiosk.
 *
 * 1. Login admin via /api/auth/login.
 * 2. Resize 375×812 (mobile) + revisita /painel-de-controle/acoes →
 *    confirma data-mobile=true e toggle de ações.
 * 3. Cria scoped-session via API + tenta usar token kiosk → verifica
 *    read-only (write tentado retorna 401/403; read do workspace passa).
 * 4. Sem console errors.
 * 5. Screenshots em test-results/l14-l15/.
 * 6. Imprime "L14+L15 VALIDATION: PASS" no console no final.
 */
import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

import { login } from './helpers/login';

const SCREENSHOT_DIR = 'test-results/l14-l15';

async function captureNoConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  // Lista de erros ignoráveis em e2e dev: presigned URLs apontam pra
  // `minio:9000` (resolve só dentro da rede do Podman). O browser do
  // Playwright roda fora da rede, então o player não consegue baixar o
  // áudio — esperado. Restante (TypeError, ReferenceError) é regressão.
  const IGNORABLE_PATTERNS = [
    /ERR_NAME_NOT_RESOLVED/,
    /minio:9000/,
    /Failed to load resource: net::/,
  ];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORABLE_PATTERNS.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

test.describe('L14 Audio + L15 Mobile + Kiosk — UI/API E2E', () => {
  test.beforeAll(async () => {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  });

  test('Mobile viewport + kiosk scoped session', async ({
    page,
  }) => {
    const errors = await captureNoConsoleErrors(page);

    // ── 1. Login
    await login(page);

    // W4: o passo L14 (página /painel-de-controle/audio) foi aposentado — a
    // suíte forense de áudio migrou para o painel do AIP Chat
    // (AudioArtifactPanel), com cobertura própria. A rota /audio não existe
    // mais; este e2e segue cobrindo mobile + kiosk.

    // ── 2. L15.A — Mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/painel-de-controle/acoes');
    await expect(page.getByTestId('acoes-page')).toBeVisible();
    // Lista pode estar vazia (tenant sem actions seed) — pelo menos data-mobile=true.
    const list = page.getByTestId('acoes-list');
    if (await list.count()) {
      await expect(list).toHaveAttribute('data-mobile', 'true');
    }
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04-mobile-acoes.png'),
      fullPage: true,
    });

    // Solutions também.
    await page.goto('/paginas/solutions/view');
    await expect(page.getByTestId('solutions-page')).toBeVisible();
    await expect(page.getByTestId('solutions-grid')).toHaveAttribute(
      'data-mobile',
      'true',
    );
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '05-mobile-solutions.png'),
      fullPage: true,
    });

    // Pilots também.
    await page.goto('/painel-de-controle/pilots');
    await expect(page.getByTestId('pilots-page')).toBeVisible();
    await expect(page.getByTestId('pilots-grid')).toHaveAttribute(
      'data-mobile',
      'true',
    );
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '06-mobile-pilots.png'),
      fullPage: true,
    });

    // Volta pro tamanho desktop.
    await page.setViewportSize({ width: 1280, height: 800 });

    // ── 4. L15.B — Kiosk scoped session
    // Primeiro precisamos de um workspace_id real do tenant. Tenta listar
    // via /api/workspaces (router top-level) ou cria um sob demanda.
    let workspaceId = '00000000-0000-4000-8000-000000000001'; // valid UUID fallback
    const wsRes = await page.request.get('/api/workspaces');
    if (wsRes.ok()) {
      const wsList = (await wsRes.json()) as { id: string }[];
      if (Array.isArray(wsList) && wsList.length > 0) {
        workspaceId = wsList[0].id;
      }
    }

    // Cria scoped-session
    const createRes = await page.request.post(
      '/api/platform/v23/kiosk/scoped-session',
      {
        data: {
          workspace_id: workspaceId,
          label: 'E2E L15 kiosk',
          ttl_hours: 24,
        },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    expect(
      createRes.ok(),
      `create scoped-session failed: ${createRes.status()} ${await createRes.text().catch(() => '')}`,
    ).toBeTruthy();
    const session = (await createRes.json()) as {
      session_id: string;
      token: string;
      workspace_id: string;
    };
    expect(session.token).toContain('kiosk-scoped-');

    // Usa o token direto contra o backend (não via /api proxy que injeta JWT).
    const apiBase = process.env.AEGIS_ONTOLOGY_URL || 'http://localhost:8002';

    // Read OK no workspace scoped
    const readRes = await page.request.get(
      `${apiBase}/workspaces/${session.workspace_id}`,
      {
        headers: { Authorization: `Bearer ${session.token}` },
      },
    );
    // Aceita 200 (workspace existe) OU 404 (workspace_id fictício) — o
    // ponto é que NÃO foi 401/403. Quando 401/403 sai porque o middleware
    // recusou; aqui queremos o caminho da resolução.
    expect(
      [200, 404].includes(readRes.status()),
      `kiosk read returned ${readRes.status()}, esperado 200 ou 404 (auth resolvido)`,
    ).toBeTruthy();

    // Write blocked — tenta criar workspace com token kiosk: deve dar 401
    // (não é um get_kiosk_or_principal endpoint, get_principal não aceita
    // kiosk tokens).
    const writeRes = await page.request.post(`${apiBase}/workspaces`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      data: {
        slug: 'kiosk-write-attempt',
        display_name: 'tentativa kiosk',
        description: '',
        project_id: '00000000-0000-0000-0000-000000000000',
        config: {},
      },
    });
    expect(
      [401, 403].includes(writeRes.status()),
      `kiosk write deveria ser bloqueado, retornou ${writeRes.status()}`,
    ).toBeTruthy();

    // Scope mismatch — tenta acessar um OUTRO workspace
    const otherWsId = '99999999-9999-9999-9999-999999999999';
    const mismatchRes = await page.request.get(
      `${apiBase}/workspaces/${otherWsId}`,
      {
        headers: { Authorization: `Bearer ${session.token}` },
      },
    );
    expect(
      mismatchRes.status(),
      `kiosk acessou workspace fora do escopo (status=${mismatchRes.status()})`,
    ).toBe(403);

    // Revoke session + retest
    const revokeRes = await page.request.post(
      `/api/platform/v23/kiosk/scoped-session/${session.session_id}/revoke`,
      { headers: { 'Content-Type': 'application/json' } },
    );
    expect(revokeRes.ok()).toBeTruthy();
    const revokedRead = await page.request.get(
      `${apiBase}/workspaces/${session.workspace_id}`,
      { headers: { Authorization: `Bearer ${session.token}` } },
    );
    expect(
      revokedRead.status(),
      `kiosk token revogado ainda foi aceito (status=${revokedRead.status()})`,
    ).toBe(401);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '07-kiosk-validated.png'),
      fullPage: true,
    });

    // ── 5. Zero console errors
    expect(
      errors,
      `console errors detected: ${JSON.stringify(errors, null, 2)}`,
    ).toEqual([]);

    // ── 7. Marker
    // eslint-disable-next-line no-console
    console.log('L14+L15 VALIDATION: PASS');
  });
});
