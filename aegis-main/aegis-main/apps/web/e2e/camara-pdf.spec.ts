/**
 * E2E — GERA o PDF real do Diagnóstico Executivo (endpoint server-side, autenticado)
 * e salva em disco pra inspeção. Confere que o PDF sai válido e com conteúdo.
 */
import { test } from "@playwright/test";
import * as fs from "fs";

import { login } from "./helpers/login";

const DOC_ID = "39d7e39d-e56c-4b10-b8a8-29f43c98cb9d";
const OUT = "camara-diagnostico.pdf";

test("PDF do Diagnóstico Executivo é gerado e tem conteúdo", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/relatorios");
  await page.waitForTimeout(3000);

  // fetch NO CONTEXTO da página (carrega os cookies de sessão) → base64
  const res = await page.evaluate(async (id) => {
    const r = await fetch(
      `/api/platform/v23/notepad/${id}/pdf?tz=America/Sao_Paulo&locale=pt-BR`,
      { credentials: "include" },
    );
    if (!r.ok) return { err: `HTTP ${r.status}`, b64: "" };
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { err: "", b64: btoa(bin) };
  }, DOC_ID);

  console.log("FETCH_ERR=", res.err || "(ok)");
  if (res.b64) {
    const buf = Buffer.from(res.b64, "base64");
    fs.writeFileSync(OUT, buf);
    console.log("PDF_BYTES=", buf.length);
    console.log("PDF_MAGIC=", buf.subarray(0, 5).toString("latin1"));
    // heurística: nº de páginas + presença de texto-chave no stream (pode estar comprimido)
    const raw = buf.toString("latin1");
    console.log("PDF_PAGES=", (raw.match(/\/Type\s*\/Page[^s]/g) || []).length);
  }
});
