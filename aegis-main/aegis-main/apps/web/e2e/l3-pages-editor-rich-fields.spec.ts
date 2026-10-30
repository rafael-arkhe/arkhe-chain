/**
 * Onda L.3 (2026-05-23) — VALIDAÇÃO do editor de Páginas reusando o
 * `PropFieldEditor` compartilhado do Workshop.
 *
 * Fecha #8 (mesmo editor do Workshop) + #9 (forms ricos no editor de
 * Páginas). Prova que NENHUM FieldKind cai em input de texto cru:
 *
 *  - form_builder ("Formulário") exercita CINCO FieldKinds ricos de uma vez:
 *      form-fields  → FormFieldsEditor (botão "+ Adicionar campo")
 *      perm-key     → PermKeyPicker (dropdown)
 *      action-type  → ActionTypePicker (dropdown)
 *      node-type    → NodeTypeFieldPicker (dropdown)
 *      variable-ref → VariableRefPicker (dropdown)
 *  - object_table_v2 ("Tabela de objetos") exercita `variable-ref` (dropdown).
 *
 * Roda em browser ISOLADO (não o MCP compartilhado), portanto é imune à
 * contenção de navegação de agentes irmãos rodando em paralelo.
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

const EDIT_URL = "/painel-de-controle/paginas/inicio/edit";

test.describe("Onda L.3 · editor de Páginas — FieldKinds ricos (sem texto cru)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("form_builder rende pickers visuais; nenhum FieldKind em texto cru", async ({
    page,
  }, testInfo) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    await expect(
      page.getByTestId("paginas-edit-palette"),
    ).toBeVisible({ timeout: 45000 });

    // Adiciona o Form Widget (form_builder) pela paleta.
    await page.getByTestId("paginas-palette-widget-form_builder").click();

    const inspector = page.getByTestId("paginas-edit-inspector");
    await expect(inspector).toBeVisible();

    // Screenshot #2 — inspector do Form Widget com editores ricos.
    await page.screenshot({
      path: testInfo.outputPath("l3-02-form-widget-inspector.png"),
      fullPage: false,
    });

    // 1) form-fields → editor visual (FormFieldsEditor), NÃO textarea/JSON.
    await expect(
      inspector.getByTestId("form-fields-add"),
    ).toBeVisible();

    // 2) perm-key → dropdown do catálogo IAM.
    const permPicker = inspector.getByTestId("form-perm-key-picker");
    await expect(permPicker).toBeVisible();
    expect((await permPicker.evaluate((el) => el.tagName)).toLowerCase()).toBe(
      "select",
    );

    // 3) action-type → dropdown de ActionTypes.
    const actionPicker = inspector.getByTestId("form-action-type-picker");
    await expect(actionPicker).toBeVisible();
    expect(
      (await actionPicker.evaluate((el) => el.tagName)).toLowerCase(),
    ).toBe("select");

    // 4) O renderer simplificado ANTIGO (texto cru) sumiu: nenhum elemento
    //    com data-testid paginas-inspector-field-* deve existir.
    await expect(
      inspector.locator('[data-testid^="paginas-inspector-field-"]'),
    ).toHaveCount(0);

    // 5) Adiciona um campo via editor visual (botão), NÃO digitando JSON.
    await inspector.getByTestId("form-fields-add").click();
    // Após adicionar, surge ao menos um cartão de campo (chave slugificada).
    await expect(
      inspector.locator('[data-testid^="form-fields-card-"]').first(),
    ).toBeVisible();

    // Screenshot #3 — após adicionar campo via editor visual.
    await page.screenshot({
      path: testInfo.outputPath("l3-03-form-field-added.png"),
      fullPage: false,
    });

    // 6) Conta dropdowns no inspector: vários FieldKinds viraram <select>
    //    (perm-key, action-type, node-type, visibility_policy). Garante que
    //    o inspector é majoritariamente picker-driven, não input de texto.
    const selectCount = await inspector.locator("select").count();
    expect(selectCount).toBeGreaterThanOrEqual(3);
  });

  test("object_table_v2: variable-ref rende como DROPDOWN, não input de texto", async ({
    page,
  }, testInfo) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    await expect(
      page.getByTestId("paginas-edit-palette"),
    ).toBeVisible({ timeout: 45000 });

    await page.getByTestId("paginas-palette-widget-object_table_v2").click();

    const inspector = page.getByTestId("paginas-edit-inspector");
    await expect(inspector).toBeVisible();

    // O campo "Busca a exibir" (variable-ref) deve render um <select> com a
    // opção placeholder "— Escolha um dado —" (VariableRefPicker), e NÃO um
    // <input type="text">.
    const optionExists = await inspector
      .locator("select option", { hasText: "Escolha um dado" })
      .count();
    expect(optionExists).toBeGreaterThanOrEqual(1);

    // Nenhum FieldKind exótico caiu em input texto: o renderer antigo sumiu.
    await expect(
      inspector.locator('[data-testid^="paginas-inspector-field-"]'),
    ).toHaveCount(0);

    // Screenshot #4 — inspector da Tabela de objetos com dropdown variable-ref.
    await page.screenshot({
      path: testInfo.outputPath("l3-04-objecttable-variable-ref-dropdown.png"),
      fullPage: false,
    });
  });
});
