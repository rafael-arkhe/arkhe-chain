/**
 * GET /api/config (F1.2 do plano de frota · 2026-08-02)
 *
 * Config de RUNTIME do front. Existe para que UMA imagem do security-app sirva
 * qualquer cliente: os tokens de mapa chegam pela env do container e são lidos
 * aqui, no servidor, a cada requisição — em vez de serem inlinados no bundle
 * pelo `next build` (que é o que o Next faz com todo `NEXT_PUBLIC_*`, e que
 * obrigava a borda a buildar a aplicação no primeiro boot).
 *
 * Anônima por design, como `/api/brand` e `/api/styles/brand/public`: as
 * superfícies de convidado (`/m/<token>`, `/visitante`) renderizam mapa sem
 * cookie de acesso. Não há perda de sigilo — estes são tokens de CLIENTE, que
 * o browser precisa ter em mãos para falar com o Mapbox/Cesium; antes desta
 * rota eles viajavam literalmente dentro do JavaScript público.
 *
 * O que NÃO entra aqui: nada que o browser não devesse ver. Esta rota devolve
 * uma lista fechada de campos — não ecoa `process.env`.
 */
import { NextResponse } from "next/server";

// A env é lida a cada requisição: sem isto o Next pode avaliar a rota no build
// e congelar os valores — exatamente o problema que esta rota resolve.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    {
      mapboxToken:
        process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "",
      cesiumIonToken:
        process.env.CESIUM_ION_TOKEN ||
        process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ||
        "",
    },
    {
      headers: {
        // Token trocado sem redeploy tem de valer no próximo reload; e um
        // proxy/CDN no caminho não pode servir o token de um tenant para outro.
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}
