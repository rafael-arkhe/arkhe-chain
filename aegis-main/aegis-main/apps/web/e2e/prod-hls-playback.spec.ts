/**
 * E2E — HLS playback nas 3 câmeras da portaria via /cameras.
 *
 * O que prova: cada câmera carrega o player HLS, o vídeo ATINGE `playing`
 * (não fica preso em "Conectando stream HLS…" nem cai em "falha de stream
 * nativa"), e o badge de tag aparece na sidebar (LPR/FACE).
 *
 *   E2E_BASE=https://ouroville.lat E2E_USER=admin E2E_PASS='…' \
 *     npx playwright test tests/e2e-hls-playback.spec.ts
 *
 * Credenciais SEMPRE via ambiente — nada de segredo commitado. Sem
 * E2E_USER/E2E_PASS a suíte inteira é PULADA (skip com motivo).
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.E2E_BASE ?? 'https://ouroville.lat';
const LOGIN = process.env.E2E_USER;
const PASS = process.env.E2E_PASS;

test.skip(!LOGIN || !PASS, 'credenciais E2E_USER/E2E_PASS ausentes');

/** Espera o player HLS sair de "loading" e atingir `playing` OU `error`. */
async function esperarPlayer(page: Page, timeoutMs = 20_000): Promise<'playing' | 'error'> {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    // o player seta data-testid="hls-player" no wrapper; o estado interno
    // reflete no DOM: loading tem o spinner, error tem WifiOff, playing tem
    // o <video> sem overlay de estado
    const erro = page.locator('[data-testid="hls-player"] >> text=falha de stream');
    const conectando = page.locator('[data-testid="hls-player"] >> text=Conectando stream');
    const videoEl = page.locator('[data-testid="hls-player"] video');

    if (await erro.isVisible({ timeout: 200 }).catch(() => false)) return 'error';
    if (await videoEl.isVisible({ timeout: 200 }).catch(() => false)) {
      // vídeo visível E sem overlay de loading → playing
      const loadingVis = await conectando.isVisible({ timeout: 200 }).catch(() => false);
      if (!loadingVis) return 'playing';
      // vídeo existe mas ainda mostra loading → verifica readyState
      const ready = await videoEl.evaluate((el: HTMLVideoElement) => el.readyState);
      if (ready >= 3) return 'playing'; // HAVE_FUTURE_DATA ou melhor
    }
    await page.waitForTimeout(500);
  }
  return 'error';
}

async function login(page: Page) {
  // skip no nível do arquivo garante LOGIN/PASS definidos quando os testes rodam
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="username"], input[type="text"], #username', LOGIN!);
  await page.fill('input[name="password"], input[type="password"], #password', PASS!);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/inicio**', { timeout: 15_000 }).catch(() => {
    // pode ir para / ou /cameras — só espera sair de /login
    return page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10_000 });
  });
}

test.describe('HLS playback — portaria', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const CAMERAS = [
    { name: 'Portaria - PLACA DE CARROS', tag: 'LPR' },
    { name: 'Portaria - PLACA DE MOTOS', tag: 'LPR' },
    { name: 'Portaria - Facial', tag: 'FACE' },
  ];

  for (const cam of CAMERAS) {
    test(`HLS toca: ${cam.name}`, async ({ page }) => {
      await page.goto(`${BASE}/cameras`);
      await page.waitForSelector('[data-testid="hls-player"]', { timeout: 15_000 });

      // clica na câmera na sidebar (se não for a já ativa)
      const card = page.locator(`button:has-text("${cam.name}")`).first();
      if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
        await card.click();
        await page.waitForTimeout(500);
      }

      // badge da tag na sidebar
      const badge = page.locator(`li:has-text("${cam.name}") >> span:text-is("${cam.tag}")`);
      await expect(badge.first()).toBeVisible({ timeout: 5000 });

      // HLS atinge playing
      const estado = await esperarPlayer(page, 20_000);
      expect(estado, `${cam.name}: player deveria atingir 'playing'`).toBe('playing');

      // o <video> tem dimensões reais (não 0x0)
      const dims = await page
        .locator('[data-testid="hls-player"] video')
        .evaluate((el: HTMLVideoElement) => ({
          w: el.videoWidth,
          h: el.videoHeight,
        }));
      expect(dims.w, `${cam.name}: videoWidth > 0`).toBeGreaterThan(0);
      expect(dims.h, `${cam.name}: videoHeight > 0`).toBeGreaterThan(0);

      // E O TEMPO AVANÇA — prova real de reprodução (o hls.js leva ~5-7s
      // para arrancar na borda ao vivo; readyState≥3 sozinho ainda pode ser
      // vídeo pausado no frame 0 — foi exatamente o falso-negativo medido).
      await expect
        .poll(
          async () =>
            page.locator('[data-testid="hls-player"] video').evaluate((el: HTMLVideoElement) => el.currentTime),
          { timeout: 30_000, message: `${cam.name}: currentTime avançou` },
        )
        .toBeGreaterThan(0);
    });
  }

  test('sem "falha de stream nativa" em nenhuma câmera após 15s', async ({ page }) => {
    await page.goto(`${BASE}/cameras`);
    await page.waitForSelector('[data-testid="hls-player"]', { timeout: 15_000 });

    for (const cam of CAMERAS) {
      const card = page.locator(`button:has-text("${cam.name}")`).first();
      if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
        await card.click();
        await page.waitForTimeout(500);
        const erro = page.locator('[data-testid="hls-player"] >> text=falha de stream');
        await expect(erro).not.toBeVisible({ timeout: 15_000 });
      }
    }
  });
});
