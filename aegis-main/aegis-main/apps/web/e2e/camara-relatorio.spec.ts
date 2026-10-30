/**
 * E2E — o Diagnóstico Executivo é um Document (NotepadDoc) e por isso aparece nas DUAS
 * superfícies nativas: /relatorios (documento) e /briefings (apresentação).
 */
import { test } from "@playwright/test";
import { login } from "./helpers/login";

test("Diagnóstico Executivo aparece em /relatorios e /briefings", async ({ page }) => {
  test.setTimeout(120_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await login(page);
  await page.setViewportSize({ width: 1400, height: 1100 });

  await page.goto("/relatorios");
  await page.waitForTimeout(5000);
  const inRel = await page.getByText("Diagnóstico Executivo", { exact: false }).count();
  console.log("EM_RELATORIOS=", inRel);
  await page.screenshot({ path: "camara-relatorios.png", fullPage: true });

  // abre o documento em /relatorios → confere o conteúdo executivo
  await page.getByText("Diagnóstico Executivo", { exact: false }).first().click();
  await page.waitForTimeout(3500);
  // conteúdo vive em <textarea> no editor → lê pelos values, não pelo innerText
  const vals = await page.locator("textarea").evaluateAll((els) =>
    els.map((e) => (e as HTMLTextAreaElement).value).join("\n"));
  console.log("TEM_PANORAMA=", /onde a população mais cobra/i.test(vals));
  console.log("TEM_SOLUCAO=", /Como o AEGIS resolve/i.test(vals));

  // "Visualizar" = o que o secretário lê (markdown renderizado)
  const ver = page.getByRole("button", { name: "Visualizar", exact: false }).first();
  if (await ver.count()) {
    await ver.click();
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: "camara-relatorio-aberto.png", fullPage: true });

  await page.goto("/briefings");
  await page.waitForTimeout(5000);
  const inBrief = await page.getByText("Diagnóstico Executivo", { exact: false }).count();
  console.log("EM_BRIEFINGS=", inBrief);
  await page.screenshot({ path: "camara-briefings.png", fullPage: true });

  console.log("PAGE_ERRORS=", JSON.stringify(errs));
});
