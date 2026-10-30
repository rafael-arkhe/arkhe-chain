/**
 * ONDA 4/final — SMOKE DE NAVEGAÇÃO do operador cliente-zero.
 *
 * "Assegurar tudo a nível final para o usuário": loga como cz-supervisor
 * (tenant de DOMÍNIO NOVO, logística/mineração) e visita TODA página do sidenav.
 * Cada página PRECISA montar sem quebrar — o shell aparece, NÃO há card de erro de
 * widget (WidgetErrorBoundary), NÃO há overlay de erro do Next, e NENHUMA exceção
 * JS não-capturada. É a prova de que um cliente novo navega o app inteiro sem
 * nada explodir na mão dele.
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

const CZ_TENANT = '3cb8b1da-bb80-4478-8678-f4f5bc2ff7cb';

const ROUTES: { path: string; label: string }[] = [
  { path: '/', label: 'inicio' },
  { path: '/buscar', label: 'buscar' },
  { path: '/geo', label: 'mapa' },
  { path: '/cameras', label: 'cameras' },
  { path: '/explorador', label: 'explorador' },
  { path: '/rede', label: 'rede' },
  { path: '/alertas', label: 'alertas' },
  { path: '/relatorios', label: 'relatorios' },
  { path: '/briefings', label: 'briefings' },
  { path: '/docs', label: 'docs' },
];

test('operador cliente-zero navega TODAS as páginas sem quebrar', async ({ page }) => {
  test.setTimeout(600000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(`${page.url()} :: ${e.message}`));

  const me = await login(page, {
    username: 'cz-supervisor',
    password: process.env.CZ_PW || 'ClienteZero#2026',
  });
  expect(me?.tenant?.id, 'sessão no tenant cliente-zero').toBe(CZ_TENANT);

  // AQUECE o auth: navega uma vez e espera o AuthProvider hidratar (header mostra
  // o usuário, não "Entrar") — senão a 1ª página pega o principal ainda nulo.
  await page.goto('/', { waitUntil: 'commit', timeout: 90000 }).catch(() => {});
  await expect(page.getByText('cz-supervisor').first()).toBeVisible({ timeout: 90000 });

  const report: Record<string, string> = {};
  const failures: string[] = [];

  for (const r of ROUTES) {
    const before = pageErrors.length;
    // 'commit' = navegação commitada (o `next dev` compila a rota no 1º acesso e o
    // 'load' pode nunca fechar com dados carregando).
    await page.goto(r.path, { waitUntil: 'commit', timeout: 90000 }).catch(() => {});

    // shell montou → não é tela branca (timeout generoso absorve o JIT-compile do dev)
    let shellOk = true;
    try {
      await expect(page.getByText('OPERAÇÃO', { exact: false }).first()).toBeVisible({
        timeout: 90000,
      });
    } catch {
      shellOk = false;
    }
    await page.waitForTimeout(2500);

    // SINAIS CONFIÁVEIS de quebra (o `nextjs-portal` é sempre presente em dev → não serve):
    const widgetErrCards = await page.locator('[data-testid^="workshop-widget-error-"]').count();
    // dialog de erro do Next tem conteúdo específico (runtime/build error)
    const nextErrDialog = await page
      .locator('[data-nextjs-dialog], [data-nextjs-error-overlay], nextjs-portal [role="dialog"]')
      .count();
    const jsErrors = pageErrors.length - before;

    report[r.path] = `shell=${shellOk} widgetErr=${widgetErrCards} nextErrDialog=${nextErrDialog} js=${jsErrors}`;
    await page.screenshot({ path: `e2e/artifacts/nav-${r.label}.png`, fullPage: false });

    if (!shellOk) failures.push(`${r.path}: shell não montou (tela branca?)`);
    if (widgetErrCards > 0) failures.push(`${r.path}: ${widgetErrCards} card(s) de erro de widget`);
    if (nextErrDialog > 0) failures.push(`${r.path}: dialog de erro do Next`);
    if (jsErrors > 0) failures.push(`${r.path}: ${jsErrors} exceção(ões) JS`);
  }

  // eslint-disable-next-line no-console
  console.log('[nav-smoke]\n' + JSON.stringify(report, null, 2));
  if (pageErrors.length) {
    // eslint-disable-next-line no-console
    console.log('[nav-smoke pageerrors]\n' + pageErrors.join('\n'));
  }

  expect(failures, `páginas que quebraram:\n${failures.join('\n')}`).toEqual([]);
  expect(pageErrors, `exceções JS não-capturadas:\n${pageErrors.join('\n')}`).toEqual([]);
});
