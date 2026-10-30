/**
 * inc4 — layout do NDV: larguras dos painéis laterais (INPUT/OUTPUT) do overlay,
 * ajustáveis pelo operador via resizer (espelho do 3-pane resizer do n8n). O centro
 * (parâmetros) é flexível e ocupa o resto. Puro → o clamp é testável isoladamente.
 */
export const NDV_PANE_MIN = 240;
export const NDV_PANE_MAX = 720;
export const NDV_PANE_DEFAULT_IN = 340;
export const NDV_PANE_DEFAULT_OUT = 360;

/** Trava a largura de um painel lateral entre [min,max] (evita esmagar o centro). */
export function clampPaneWidth(w: number, min = NDV_PANE_MIN, max = NDV_PANE_MAX): number {
  if (Number.isNaN(w)) return min;
  return Math.max(min, Math.min(max, Math.round(w)));
}
