/**
 * Campo "técnico" vs "de negócio" — heurística de ÚLTIMO RECURSO.
 *
 * Régua ontológica: quando há type-def, o contrato decide (declarado = negócio).
 * Esta heurística só entra quando NÃO há type-def — ex.: detecções de visão
 * (`object_det`) que carregam metadados de pipeline (device/cuda/source/...) que
 * não têm utilidade operacional e poluem a UI. Ponto ÚNICO reusado pela ficha
 * (`WidgetIdentificacao`) e pelos widgets de detecção (Alertas em destaque etc.)
 * — nunca duplicar a lista.
 */
// NOTA: first_seen_at/last_seen_at NÃO entram aqui — na ficha são NEGÓCIO
// (LAST/FIRST SEEN AT, úteis ao operador). Widgets que queiram escondê-los na
// linha de metadados filtram-nos à parte. Mantido idêntico ao que certificou a
// ficha (#6) pra não regredir aquele comportamento.
export const TECHNICAL_FIELD_RE =
  /(^|_)(id|kind|source|device|cuda|gpu|driver|frame_index|sha\d*|hash|embedding|vector|node_type|version|created_at|updated_at|created_by)(_|$)/i;

/** `true` quando a chave é metadado técnico de pipeline (sem valor operacional). */
export function isTechnicalField(key: string): boolean {
  return TECHNICAL_FIELD_RE.test(key);
}
