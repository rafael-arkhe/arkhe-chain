import { test, expect } from '@playwright/test';

/**
 * T4 /explorador — verificação em camadas + Criar alerta deste conjunto.
 *
 * Cobre as 4 dores: 3-pane presente, switch de visão (Tabela), construtor de
 * camada dinâmico, e o botão "Criar alerta deste conjunto" criando uma busca
 * monitorada de VERDADE (POST /alerts/feeds) — fim do botão morto.
 */

async function login(page: import('@playwright/test').Page, next = '/explorador') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator('#username').fill('ferreira');
  await page.locator('#password').fill('CertPass-2026!');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
}

test('explorador: 3-pane, switch de visão, construtor de camada e criar alerta real', async ({
  page,
}) => {
  await login(page, '/explorador');
  await page.goto('/explorador');

  // 3-pane presente
  await expect(page.getByTestId('explorador-propriedades')).toBeVisible();
  await expect(page.getByTestId('explorador-visualizacao')).toBeVisible();
  await expect(page.getByTestId('explorador-pipeline')).toBeVisible();

  // espera a carga inicial sair do "Carregando…"
  await expect(page.getByText('Carregando…')).toHaveCount(0, { timeout: 30000 });

  // Switch de visão → Tabela renderiza
  await page.getByTestId('explorador-vista-tabela').click();
  await expect(page.locator('th', { hasText: 'Classificação' })).toBeVisible();

  // Construtor de camada dinâmico: campo "Texto livre" (default) + valor → Camada
  await page.getByTestId('explorador-builder-valor').fill('a');
  await page.getByTestId('explorador-builder-add').click();

  // Uma camada aparece no pipeline e habilita o "Criar alerta"
  await expect(page.getByText('Texto contém "a"')).toBeVisible();
  const criarAlerta = page.getByTestId('criar-alerta-pipeline');
  await expect(criarAlerta).toBeEnabled();

  // Abre o modal e cria a busca monitorada de verdade
  await criarAlerta.click();
  await expect(page.getByTestId('criar-alerta-modal')).toBeVisible();
  await page.getByTestId('criar-alerta-nome').fill('E2E · explorador camadas');
  await page.getByTestId('criar-alerta-confirm').click();

  // Toast de sucesso (POST /alerts/feeds OK) e modal fecha
  await expect(page.getByText(/busca monitorada criada/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('criar-alerta-modal')).toHaveCount(0);
});
