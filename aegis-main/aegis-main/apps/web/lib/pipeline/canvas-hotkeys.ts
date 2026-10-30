/**
 * F8.5 — roteador PURO dos atalhos de teclado do canvas (paridade n8n, plano
 * §4-F8 item 5). O handler do PipelineCanvas resolve a ação aqui e aplica os
 * efeitos; a tabela tecla→ação fica testável sem ReactFlow/jsdom.
 *
 * Guards (docs n8n não especificam — decisão registrada):
 *  - foco em input/textarea/select/contentEditable → nada (nunca roubar forms);
 *  - NDV/NodesPanel abertos (paused) → nada (cada overlay tem o próprio teclado);
 *  - zoom funciona TAMBÉM em readOnly (view-only); edição exige !readOnly.
 */
export type CanvasHotkeyAction =
  | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'zoom-fit'
  | 'undo' | 'redo'
  | 'select-all' | 'copy' | 'paste' | 'delete' | 'duplicate'
  | 'run-node' | 'run-board'
  | 'open' | 'deactivate' | 'toggle-pin' | 'rename'
  | 'deselect';

export interface CanvasHotkeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** Foco em campo editável? Guard compartilhado dos handlers de teclado
 * (canvas, tecla N do BoardCanvas) — nunca roubar tecla de forms. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
}

export interface CanvasHotkeyCtx {
  readOnly: boolean;
  /** NDV overlay ou NodesPanel abertos — o teclado do canvas dorme. */
  paused: boolean;
  /** Há nó(s) selecionado(s) no ReactFlow. */
  hasSelection: boolean;
  /** Há aresta(s) selecionada(s) (Delete também as remove). */
  hasEdgeSelection: boolean;
  /** Foco em input/textarea/select/contentEditable. */
  inEditable: boolean;
}

export function resolveCanvasHotkey(e: CanvasHotkeyEvent, ctx: CanvasHotkeyCtx): CanvasHotkeyAction | null {
  if (ctx.inEditable || ctx.paused || e.altKey) return null;
  const mod = !!(e.ctrlKey || e.metaKey);
  const key = e.key;
  const lower = key.toLowerCase();

  // Zoom (n8n: +/−/0 reset/1 fit) — view-only, vale até em readOnly.
  if (!mod) {
    if (key === '+' || key === '=') return 'zoom-in';
    if (key === '-' || key === '_') return 'zoom-out';
    if (key === '0') return 'zoom-reset';
    if (key === '1') return 'zoom-fit';
    if (key === 'Escape') return 'deselect';
  }
  if (ctx.readOnly) return null;

  if (mod && lower === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (mod && lower === 'a') return 'select-all';
  if (mod && lower === 'v') return 'paste';
  if (mod && key === 'Enter') return ctx.hasSelection ? 'run-node' : 'run-board';
  if (mod && lower === 'c') return ctx.hasSelection ? 'copy' : null;
  if (mod && lower === 'd') return ctx.hasSelection ? 'duplicate' : null;
  if (mod) return null;

  if ((key === 'Delete' || key === 'Backspace') && (ctx.hasSelection || ctx.hasEdgeSelection)) return 'delete';
  if (!ctx.hasSelection) return null;
  if (key === 'Enter') return 'open';
  if (key === 'F2') return 'rename';
  if (lower === 'd') return 'deactivate';
  if (lower === 'p') return 'toggle-pin';
  return null;
}
