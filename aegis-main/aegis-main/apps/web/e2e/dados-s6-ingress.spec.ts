/**
 * E2E · Sprint 6 (hardening) — INGRESS do webhook, contra o endpoint PÚBLICO
 * real do backend (HMAC, sem Bearer). Cert AO VIVO de três gestos:
 *  1) corpo 3MB → 413 (rejeitado ANTES de bufferizar/verificar HMAC);
 *  2) HMAC VÁLIDO com 1001 linhas → 422 (teto de linhas) e o board NÃO roda;
 *  3) rajada no MESMO slug → 429 (rate-limit por slug+IP em memória).
 */
import { test, expect } from "@playwright/test";
import crypto from "crypto";
import { login } from "./helpers/login";

const BACKEND = process.env.E2E_ONTOLOGY_URL || "http://localhost:8002";

test.describe("S6 — ingress do webhook (ao vivo)", () => {
  test("corpo gigante 413 · 1001 linhas 422 · rajada 429", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    const tag = `s6_${Date.now()}`;

    // Setup autenticado via proxy do front: board rascunho + gatilho (o secret
    // do webhook volta UMA vez na criação — é ele que assina os gestos abaixo).
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s6-${tag}`, display_name: `E2E S6 ${tag}`,
        graph: {
          nodes: [
            { id: "t", op: "trigger", config: { trigger_kind: "webhook" }, position: { x: 40, y: 180 } },
            { id: "st", op: "transform", config: { op: "set", args: { fields: [{ key: "flag", value: "ok", type: "text" }] } }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "t", to: "st" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = (await mk.json()) as { id: string };

    const mkTrg = await page.request.post(`/api/platform/v23/pipeline/triggers`, {
      data: { slug: `e2e-s6-wh-${tag}`, board_id: board.id },
    });
    expect(mkTrg.ok(), `create trigger → ${mkTrg.status()}`).toBeTruthy();
    const trg = (await mkTrg.json()) as { slug: string; secret: string };
    const hook = `${BACKEND}/platform/v23/pipeline/trigger/${trg.slug}`;

    // ── Gesto 1: corpo 3MB → 413 (o teto default é 2MB) ─────────────────────
    const big = JSON.stringify({ pad: "x".repeat(3 * 1024 * 1024) });
    const r1 = await page.request.post(hook, {
      headers: { "content-type": "application/json", "x-aegis-signature": "00".repeat(32) },
      data: big,
    });
    expect(r1.status(), "corpo de 3MB devia tomar 413").toBe(413);

    // ── Gesto 2: HMAC VÁLIDO com 1001 linhas → 422, board sem run ───────────
    const rowsBody = JSON.stringify({ rows: Array.from({ length: 1001 }, (_, i) => ({ i })) });
    const sig = crypto.createHmac("sha256", trg.secret).update(rowsBody).digest("hex");
    const r2 = await page.request.post(hook, {
      headers: { "content-type": "application/json", "x-aegis-signature": sig },
      data: rowsBody,
    });
    expect(r2.status(), "1001 linhas devia tomar 422").toBe(422);
    const runs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
    expect(Array.isArray(runs) ? runs.length : -1, "entrega capada NÃO podia rodar o board").toBe(0);

    // ── Gesto 3: rajada no MESMO slug → 429 (limite default 60/min) ─────────
    let got429 = 0;
    for (let tries = 1; tries <= 70 && !got429; tries += 1) {
      const r = await page.request.post(hook, {
        headers: { "content-type": "application/json", "x-aegis-signature": "ff".repeat(32) },
        data: "{}",
      });
      if (r.status() === 429) got429 = tries;
      else expect(r.status(), "antes do limite: HMAC inválido = 401").toBe(401);
    }
    expect(got429, "rajada nunca tomou 429 (rate-limit inerte)").toBeGreaterThan(0);
  });
});
