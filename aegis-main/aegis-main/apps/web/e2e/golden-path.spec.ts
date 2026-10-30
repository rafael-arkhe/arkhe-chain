/**
 * SPEC LEGADO (zustand-auth era).
 *
 * Esse spec foi escrito quando o security-app usava auth zustand local +
 * botão "Entrar como (papel)" e mock de KPIs locais. A refatoração de
 * auth pra cookies httpOnly + IAM real (Sprint 0) removeu:
 *   - User `investigador.mendonca` (não existe no backend);
 *   - `papel-*` testids no /login;
 *   - testid `kpis` na home (KPIs viraram widgets Workshop).
 *
 * Mantemos como referência histórica dos fluxos cobertos antes, mas
 * todos os testes ficam `.skip`. O spec atual em pé é
 * `parlamentar-flow.spec.ts`.
 */
import { test, expect } from '@playwright/test';

test.skip(true, 'legacy zustand-auth spec — substituído por parlamentar-flow.spec.ts');

async function login(page: import('@playwright/test').Page, papel = 'investigador', next = '/') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator('#username').fill('investigador.mendonca');
  await page.locator('#password').fill('senha-demo-1234');
  if (papel !== 'investigador') {
    await page.getByTestId(`papel-${papel}`).click();
  }
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 });
  await page.getByTestId('header').waitFor({ state: 'visible', timeout: 10000 });
}

test.describe('Auth · login redireciona e estabelece sessão', () => {
  test('login com investigador entrega no painel', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await login(page, 'investigador');
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('header')).toBeVisible();
    await expect(page.getByTestId('kpis')).toBeVisible();
  });
});

test.describe('Sidenav agrupada · 4 seções', () => {
  test('renderiza seções e itens válidos', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('section-operacao')).toBeVisible();
    await expect(page.getByTestId('section-analise')).toBeVisible();
    await expect(page.getByTestId('section-conteudo')).toBeVisible();
    await expect(page.getByTestId('section-governanca')).toBeVisible();
    await expect(page.getByText('Canais', { exact: true })).toHaveCount(0);
  });
});

test.describe('Golden path · operador investiga objeto e cria cerca', () => {
  test('navega painel → buscar → ficha → geo → polígono', async ({ page }) => {
    await login(page);

    await page.getByTestId('nav-buscar').click();
    await expect(page).toHaveURL(/\/buscar/);
    await expect(page.getByTestId('filtros')).toBeVisible();
    await expect(page.getByTestId('lista-resultados')).toBeVisible();

    await page.getByTestId('filtros-query').fill('carlos');
    await expect(page.getByTestId('resultado-pes-001')).toBeVisible();
    await page.getByTestId('resultado-pes-001').click();
    await expect(page.getByTestId('detalhe-objeto')).toBeVisible();

    await page.getByTestId('abrir-ficha').click();
    await expect(page).toHaveURL(/\/ficha\/pes-001/);
    await expect(page.getByTestId('paleta-widgets')).toBeVisible();
    await expect(page.getByTestId('canvas-ficha')).toBeVisible();
    await expect(page.getByTestId('inspetor')).toBeVisible();

    await page.getByTestId('nav-geo').click();
    await expect(page).toHaveURL(/\/geo/);
    await expect(page.getByTestId('painel-camadas')).toBeVisible();
    await expect(page.getByTestId('mapa-canvas')).toBeVisible();

    await page.getByTestId('tool-poligono').click();
    const overlay = page.getByTestId('poligono-overlay');
    const box = await overlay.boundingBox();
    if (!box) throw new Error('poligono-overlay sem bounding box');
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6);

    await expect(page.getByTestId('geofence-actions')).toBeVisible();
    await expect(page.getByTestId('criar-geofence')).toBeVisible();
  });
});

test.describe('RBAC · auditor é restrito a auditoria', () => {
  test('auditor não consegue acessar Buscar (sidenav disabled + RequirePerm bloqueia rota)', async ({ page }) => {
    await login(page, 'auditor');
    const navBuscar = page.getByTestId('nav-buscar');
    await expect(navBuscar).toHaveAttribute('aria-disabled', 'true');
    await page.goto('/buscar');
    await expect(page.getByText('Acesso negado')).toBeVisible();
  });
});

test.describe('Cesium · controles disponíveis', () => {
  test('toggle de terreno/labels/lighting renderiza', async ({ page }) => {
    await login(page, 'investigador', '/geo');
    await expect(page.getByTestId('cesium-terrain')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('cesium-labels')).toBeVisible();
    await expect(page.getByTestId('cesium-lighting')).toBeVisible();
  });
});

test.describe('Alertas · triagem', () => {
  test('lista alertas e resolve um', async ({ page }) => {
    await login(page, 'investigador', '/alertas');
    await expect(page.getByTestId('alertas-canais')).toBeVisible();
    await expect(page.getByTestId('alertas-lista')).toBeVisible();
    await page.getByTestId('alerta-a1').click();
    await page.getByTestId('alerta-resolver').click();
    await expect(page.getByTestId('alerta-resolver')).toHaveText(/Resolvido/);
  });
});

test.describe('Admin · 8 abas, federacao e auditoria com dados', () => {
  test('comandante alterna abas', async ({ page }) => {
    await login(page, 'comandante', '/admin');
    await expect(page.getByTestId('admin-tab-federacao')).toBeVisible();
    await page.getByTestId('admin-tab-auditoria').click();
    await expect(page.getByText(/GET \/iam\/audit/)).toBeVisible();
    await page.getByTestId('admin-tab-acessos').click();
    await expect(page.getByText(/GET \/iam\/roles/)).toBeVisible();
  });
});

test.describe('Câmeras · HLS real + LPR overlay', () => {
  test('player carrega SP-123 e troca de stream funciona', async ({ page }) => {
    await login(page, 'investigador', '/cameras');
    await expect(page.getByTestId('hls-player')).toBeVisible();
    await expect(page.getByTestId('stream-card-fb-sp055-110a')).toBeVisible();
    await expect(page.getByTestId('stream-card-fb-sp123-026b')).toBeVisible();
    await page.getByTestId('stream-card-fb-sp055-110a').click();
    await expect(page.getByTestId('hls-player')).toBeVisible();
    await expect(page.getByTestId('lpr-overlay')).toBeVisible();
    await page.getByTestId('toggle-lpr').click();
    await page.getByTestId('toggle-lpr').click();
    await expect(page.getByTestId('stream-custom-code')).toBeVisible();
  });

  test('presets SP-055 e SP-123 disponíveis', async ({ page }) => {
    await login(page, 'investigador', '/cameras');
    await expect(page.getByTestId('stream-preset-sp055-110a')).toBeVisible();
    await expect(page.getByTestId('stream-preset-sp055-110b')).toBeVisible();
    await expect(page.getByTestId('stream-preset-sp123-026b')).toBeVisible();
  });
});

test.describe('Paleta de comandos', () => {
  test('abre pelo header, busca e fecha', async ({ page }) => {
    await login(page);
    await page.getByTestId('header-search').click();
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await page.keyboard.type('geo');
    await expect(page.getByText('Ir para — Geo')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-palette')).toHaveCount(0);
  });
});
