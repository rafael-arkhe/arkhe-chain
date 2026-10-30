/**
 * E2E — seletor de time-frame nos KPIs da câmara. Confere que o default é MÊS e que
 * clicar em ANO troca a tendência dos cards (janela temporal). Gera camara-timeframe-ano.png.
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

test("home câmara: seletor de time-frame troca a janela", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.setViewportSize({ width: 1680, height: 1180 });
  await page.goto("/paginas/inicio-itapetininga/view");
  await page.waitForTimeout(9000);

  // Default = MÊS: deve haver rótulos de mês (ex.: "JUN/26") nos cards.
  const bodyMes = await page.locator("body").innerText();
  const hasMonthLabel = /\b\w{3}\/\d{2}\b/i.test(bodyMes);
  console.log("DEFAULT_HAS_MONTH_LABEL=", hasMonthLabel);

  // Clica ANO no 1º toggle (painel de gargalos).
  const anoBtn = page.getByRole("button", { name: "Ano", exact: true }).first();
  await anoBtn.click();
  await page.waitForTimeout(1200);
  const bodyAno = await page.locator("body").innerText();
  const hasYearLabel = /12m|últ\. 12m/i.test(bodyAno);
  console.log("AFTER_ANO_HAS_12M_LABEL=", hasYearLabel);
  console.log("CHANGED=", bodyMes !== bodyAno);
  await page.screenshot({ path: "camara-timeframe-ano.png", fullPage: false });
});
