/**
 * GARANTIA DA ESPINHA — o app GERADO pelo AIP Arquiteto renderiza ao vivo sem quebrar.
 *
 * Fecha o loop: prompt → Arquiteto gera → materializa → RENDERIZA. O app
 * `cz-arquiteto-frota` foi gerado de UM prompt de uma linha ("monitorar a frota de
 * caminhoes da mineracao e prever manutencao por telemetria") e tem 34 widgets de 18
 * tipos (object_table, heatmap, pivot_table, vega_chart, calendar, timeline,
 * sankey_flow, loop_layout, writeback_form...). Logado como cz-supervisor, abrimos o
 * app e provamos que NENHUM dos 34 widgets gerados quebra — a robustez N/N + o
 * WidgetErrorBoundary seguram um app gerado por máquina, com dado ainda vazio.
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

const CZ_TENANT = '3cb8b1da-bb80-4478-8678-f4f5bc2ff7cb';

// Dois apps GERADOS pelo Arquiteto no cliente-zero:
//  - heurístico: scaffold determinístico (34 widgets)
//  - LLM real (openrouter): domínio-específico frota/mineração (Sensor/Motor/... 60 widgets)
const GENERATED_APPS: { id: string; label: string; kind: string }[] = [
  { id: 'df34ae21-93cd-488c-a562-a62c897ed22b', label: '34w-heuristico', kind: 'heurístico' },
  { id: '07a35a74-206e-4223-a6db-a8b61581aae6', label: '60w-llm', kind: 'LLM domínio-específico' },
];

for (const app of GENERATED_APPS) {
  test(`app GERADO (${app.kind}) renderiza ao vivo sem quebrar [${app.label}]`, async ({ page }) => {
  const APP_ID = app.id;
  test.setTimeout(150000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const me = await login(page, {
    username: 'cz-supervisor',
    password: process.env.CZ_PW || 'ClienteZero#2026',
  });
  expect(me?.tenant?.id, 'sessão cliente-zero').toBe(CZ_TENANT);

  // aquece o auth
  await page.goto('/', { waitUntil: 'commit', timeout: 90000 }).catch(() => {});
  await expect(page.getByText('cz-supervisor').first()).toBeVisible({ timeout: 90000 });

  await page.goto(`/workshop/view/${APP_ID}`, { waitUntil: 'commit', timeout: 90000 }).catch(() => {});

  // shell montou
  await expect(page.getByText('OPERAÇÃO').first()).toBeVisible({ timeout: 60000 });
  // CONTEÚDO do app REALMENTE renderizou (auth hidratou + RequirePerm liberou) — senão
  // a asserção de "no Inspetor" passaria trivialmente numa página vazia (falso-positivo).
  await expect(page.getByText(/Aplicação/i).first()).toBeVisible({ timeout: 90000 });
  // e um widget de dado do app está montado (não só o cabeçalho).
  await expect(
    page.locator('[data-testid^="workshop-widget-"]').first(),
  ).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(4000);

  const widgetErrCards = await page.locator('[data-testid^="workshop-widget-error-"]').count();
  // gap "precisa configurar": NENHUMA instrução de dev/config pode vazar pro operador
  // num app gerado (os filtros nascem fiados; sem dado → estado neutro, não hint).
  const devConfigLeaks = await page.getByText(/no Inspetor/i).count();
  await page.screenshot({ path: `e2e/artifacts/cz-app-gerado-${app.label}.png`, fullPage: true });

  // NENHUM widget gerado pode quebrar (a robustez segura o app gerado por máquina)
  expect(widgetErrCards, `${widgetErrCards} widget(s) do app gerado quebraram`).toBe(0);
  expect(devConfigLeaks, `${devConfigLeaks} instrução(ões) "no Inspetor" vazando pro operador`).toBe(0);
  expect(pageErrors, `exceções JS no app gerado:\n${pageErrors.join('\n')}`).toEqual([]);
  });
}
