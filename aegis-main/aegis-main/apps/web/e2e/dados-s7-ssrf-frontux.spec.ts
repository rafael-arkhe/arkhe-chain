/**
 * E2E · Sprint 7 (hardening, ÚLTIMO) — SSRF + Front-UX, ao vivo.
 * Cert de dois gestos:
 *  1) SSRF: um board com conector HTTP apontando p/ IP interno (169.254.169.254,
 *     metadata de nuvem) FALHA claramente ao Executar — nunca alcança a rede
 *     interna com o header de auth.
 *  2) Front-UX: criar um board com nome DUPLICADO (mesmo slug) devolve feedback
 *     pt-BR pela API (409) — o operador vê o motivo, não um silêncio.
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

test.describe("S7 — SSRF + front-ux (ao vivo)", () => {
  test("conector p/ IP interno falha ao executar; board duplicado dá 409", async ({ page }) => {
    test.setTimeout(120_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    const tag = `s7_${Date.now()}`;

    // ── Gesto 1: SSRF — conector HTTP p/ o endpoint de metadata da nuvem ──────
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s7-ssrf-${tag}`, display_name: `E2E S7 SSRF ${tag}`,
        graph: {
          nodes: [
            { id: "trg", op: "trigger", config: { trigger_kind: "manual" }, position: { x: 40, y: 180 } },
            {
              id: "http", op: "skill",
              config: {
                skill_key: "connector.http",
                params: {
                  base_url: "http://169.254.169.254", path: "/latest/meta-data/",
                  serializer: { format: "json" },
                },
                mode: "once", output: "coleta",
              },
              position: { x: 320, y: 180 },
            },
            { id: "out", op: "ontology_output", config: { target_node_type: "S7Coisa", id_field: "id" }, position: { x: 620, y: 180 } },
          ],
          edges: [{ from: "trg", to: "http" }, { from: "http", to: "out" }],
        },
      },
    });
    expect(mk.ok(), `create ssrf board → ${mk.status()}`).toBeTruthy();
    const board = (await mk.json()) as { id: string };

    const run = await page.request.post(`/api/platform/v23/pipeline/${board.id}/run`, {
      data: { incremental: false, branch: "main" },
    });
    // o run é REJEITADO (build FAILED): a resposta traz status FAILED ou erro.
    const runBody = await run.json().catch(() => ({}));
    const failed =
      run.status() >= 400 ||
      runBody?.status === "FAILED" ||
      String(runBody?.error ?? "").length > 0;
    expect(failed, `SSRF: run devia falhar, veio ${run.status()} ${JSON.stringify(runBody)}`).toBeTruthy();
    // e o board NÃO materializou nenhuma instância do IP interno
    expect(runBody?.rows_out ?? 0, "SSRF materializou linhas do IP interno").toBe(0);

    // ── Gesto 2: front-ux — criar board com o MESMO slug → 409 ────────────────
    const dupSlug = `e2e-s7-dup-${tag}`;
    const first = await page.request.post(`/api/platform/v23/pipeline`, {
      data: { slug: dupSlug, display_name: `Dup ${tag}` },
    });
    expect(first.ok(), `1º create → ${first.status()}`).toBeTruthy();
    const second = await page.request.post(`/api/platform/v23/pipeline`, {
      data: { slug: dupSlug, display_name: `Dup ${tag} again` },
    });
    expect(second.status(), "slug duplicado devia dar 409").toBe(409);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
