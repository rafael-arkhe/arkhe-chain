/**
 * FRENTE A (2026-06-26) — rótulo humano pt-BR/en-US do TIPO de objeto (node_type/kind).
 *
 * PROBLEMA: a UI vinha renderizando `node.node_type` CRU ("person"/"username"/
 * "email" em inglês) direto na tela. Isto resolve o kind pela CAMADA DE EXIBIÇÃO,
 * MESMO padrão de lib/i18n/class-labels.ts (o backend nunca precisa saber de locale).
 *
 * MULTI-DOMÍNIO: nenhum vertical é hardcoded — o kind vem do DADO (ontologia).
 * Qualquer kind novo que ainda não tenha par curado no dict cai no fallback
 * (label do backend → capitalize do próprio kind) e aparece legível na hora.
 *
 * Resolução (nesta ordem):
 *   1. dicionário `kind.<lower(kind)>` (pt-BR default + en-US peer);
 *   2. fallbackLabel (label que o backend tiver mandado), se houver;
 *   3. capitalize do kind canônico — nunca string vazia.
 *
 * O caller passa o próprio `t` (useT()): o helper fica PURO (testável sem
 * provider) e a tradução segue o locale ativo do operador.
 */

type Translate = (key: string) => string;

/** Chave do dict para o label do kind (sempre minúsculo/trim). */
export function objectKindLabelKey(kind: string): string {
  return `kind.${(kind || '').trim().toLowerCase()}`;
}

/** Capitaliza o kind cru — fallback final quando não há tradução nem label. */
function capitalizeKind(kind: string): string {
  const s = (kind || '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/**
 * Label humano do TIPO de objeto no locale ativo:
 *   dict (`kind.<lower>`) → fallbackLabel → capitalize(kind).
 *
 * `t()` devolve a própria chave quando não há tradução; usamos isso para
 * detectar a falta e cair no próximo fallback (mantém multi-domínio).
 */
export function objectKindLabel(
  t: Translate,
  kind: string,
  fallbackLabel?: string,
): string {
  if (!kind || !kind.trim()) return fallbackLabel || '';
  const key = objectKindLabelKey(kind);
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return fallbackLabel || capitalizeKind(kind);
}
