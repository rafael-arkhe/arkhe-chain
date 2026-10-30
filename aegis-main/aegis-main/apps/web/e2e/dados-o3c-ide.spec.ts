/**
 * E2E · Onda 3 · O3c — EDITOR INLINE no nó de código (headline da Onda 3).
 *
 * Prova o GESTO ao vivo: um autor (admin tem function.write) adiciona um nó de
 * CÓDIGO, abre o SandboxIDE embutido num Dialog (Monaco real, contrato BATCH),
 * salva e o nó passa a apontar p/ a Code Function criada. Trava 1 (picker vs
 * editor por permissão) é coberta no jest (pipeline-board-code-ide). Régua:
 * feedback_e2e_via_playwright_cli.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Onda 3 · O3c — editor inline no nó de código", () => {
  test("autor abre o SandboxIDE, salva e o nó vincula a Function criada", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin — tem function.write (autoria)
    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);

    // Board FRESCO (nome único) → canvas vazio e determinístico.
    await page.getByTestId("pb-new").click();
    await page.getByTestId("pb-create-name").fill(`o3c-${Date.now()}`);
    await page.getByTestId("pb-create-confirm").click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible();

    // Adiciona um nó de CÓDIGO (op='code' pré-setado pela paleta categorizada).
    await page.getByTestId("pb-add-codigo").click();
    await expect(page.getByTestId("pb-inspector")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-op")).toHaveValue("code");

    // Trava 1 (autoria): o EDITOR inline está disponível além do picker.
    const editBtn = page.getByTestId("pb-cfg-code-edit");
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // O SandboxIDE abre num Dialog (Monaco real, lazy) — toolbar pronta.
    await expect(page.getByTestId("pb-code-ide-drawer")).toBeVisible();
    await expect(page.getByTestId("sandbox-ide")).toBeVisible();
    await expect(page.getByTestId("ide-run")).toBeVisible();

    // Salvar e vincular → cria a Code Function (batch) e fecha o drawer.
    await page.getByTestId("pb-code-ide-save").click();
    await expect(page.getByTestId("pb-code-ide-drawer")).toBeHidden();

    // O nó agora aponta p/ a Function criada (picker com valor não-vazio).
    await expect(page.getByTestId("pb-cfg-code-fn")).not.toHaveValue("");

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
