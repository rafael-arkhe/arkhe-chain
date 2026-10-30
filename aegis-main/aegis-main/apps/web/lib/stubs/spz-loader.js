/**
 * Stub de `@spz-loader/core` (dep transitiva do `@cesium/engine` via
 * GltfSpzLoader.js). O mapa /geo do AEGIS renderiza PONTOS num globo Cesium —
 * NUNCA carrega Gaussian Splats (formato SPZ). A lib real inlina um módulo
 * WebAssembly (Emscripten/Embind) como TEMPLATE STRING; o minificador SWC do
 * Next 15 quebra esse literal num escape OCTAL inválido → o chunk não faz parse
 * no browser (`Octal escape sequences are not allowed in template strings` +
 * `ChunkLoadError`), derrubando o /geo inteiro.
 *
 * Stubar (alias no next.config) remove o WASM do bundle sem afetar o mapa. Se
 * algum dia carregarmos SPZ de verdade, `loadSpz` lança erro claro em vez de
 * silenciosamente falhar. Ver docs/safetag-aegis/ e a memória do edge.
 */
export function loadSpz() {
  throw new Error(
    "@spz-loader/core stub: Gaussian Splats (SPZ) não são usados no AEGIS " +
      "(o /geo é mapa de pontos). Remova o stub do next.config se precisar de SPZ.",
  );
}

export default { loadSpz };
