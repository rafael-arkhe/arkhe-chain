/**
 * F8.5 — roteador puro dos atalhos do canvas (tabela tecla→ação + guards).
 * Paridade n8n: zoom +/−/0/1 · undo/redo Ctrl+Z/Ctrl+Shift+Z · Ctrl+A/C/V ·
 * Ctrl+Enter (nó selecionado=passo, sem seleção=board) · F2 rename · D/P/Enter/
 * Delete · Escape. Guards: input focado, overlay/painel abertos, readOnly.
 */
import { resolveCanvasHotkey, type CanvasHotkeyCtx } from '@/lib/pipeline/canvas-hotkeys';

const CTX: CanvasHotkeyCtx = {
  readOnly: false,
  paused: false,
  hasSelection: true,
  hasEdgeSelection: false,
  inEditable: false,
};
const ctx = (over: Partial<CanvasHotkeyCtx> = {}): CanvasHotkeyCtx => ({ ...CTX, ...over });

describe('guards', () => {
  it('foco em input/textarea → nada (nunca rouba forms)', () => {
    expect(resolveCanvasHotkey({ key: 'Delete' }, ctx({ inEditable: true }))).toBeNull();
    expect(resolveCanvasHotkey({ key: 'z', ctrlKey: true }, ctx({ inEditable: true }))).toBeNull();
  });
  it('NDV/NodesPanel abertos (paused) → nada', () => {
    expect(resolveCanvasHotkey({ key: 'd' }, ctx({ paused: true }))).toBeNull();
    expect(resolveCanvasHotkey({ key: 'p' }, ctx({ paused: true }))).toBeNull();
    expect(resolveCanvasHotkey({ key: '+' }, ctx({ paused: true }))).toBeNull();
  });
  it('Alt pressionado → nada', () => {
    expect(resolveCanvasHotkey({ key: 'd', altKey: true }, ctx())).toBeNull();
  });
  it('readOnly: zoom e Escape funcionam; edição não', () => {
    const ro = ctx({ readOnly: true });
    expect(resolveCanvasHotkey({ key: '+' }, ro)).toBe('zoom-in');
    expect(resolveCanvasHotkey({ key: '1' }, ro)).toBe('zoom-fit');
    expect(resolveCanvasHotkey({ key: 'Escape' }, ro)).toBe('deselect');
    expect(resolveCanvasHotkey({ key: 'z', ctrlKey: true }, ro)).toBeNull();
    expect(resolveCanvasHotkey({ key: 'Delete' }, ro)).toBeNull();
    expect(resolveCanvasHotkey({ key: 'F2' }, ro)).toBeNull();
  });
});

describe('zoom (n8n: +/−/0 reset/1 fit)', () => {
  it.each([
    ['+', 'zoom-in'], ['=', 'zoom-in'],
    ['-', 'zoom-out'], ['_', 'zoom-out'],
    ['0', 'zoom-reset'], ['1', 'zoom-fit'],
  ] as const)('%s → %s', (key, action) => {
    expect(resolveCanvasHotkey({ key }, ctx({ hasSelection: false }))).toBe(action);
  });
  it('com Ctrl não dispara (Ctrl+0/Ctrl+- são do navegador)', () => {
    expect(resolveCanvasHotkey({ key: '0', ctrlKey: true }, ctx())).toBeNull();
    expect(resolveCanvasHotkey({ key: '-', ctrlKey: true }, ctx())).toBeNull();
  });
});

describe('undo/redo', () => {
  it('Ctrl+Z → undo · Ctrl+Shift+Z → redo (meta idem)', () => {
    expect(resolveCanvasHotkey({ key: 'z', ctrlKey: true }, ctx({ hasSelection: false }))).toBe('undo');
    expect(resolveCanvasHotkey({ key: 'Z', ctrlKey: true, shiftKey: true }, ctx())).toBe('redo');
    expect(resolveCanvasHotkey({ key: 'z', metaKey: true }, ctx())).toBe('undo');
  });
});

describe('seleção e clipboard', () => {
  it('Ctrl+A → select-all (independe de seleção prévia)', () => {
    expect(resolveCanvasHotkey({ key: 'a', ctrlKey: true }, ctx({ hasSelection: false }))).toBe('select-all');
  });
  it('Ctrl+C só com seleção; Ctrl+V sempre (editável)', () => {
    expect(resolveCanvasHotkey({ key: 'c', ctrlKey: true }, ctx())).toBe('copy');
    expect(resolveCanvasHotkey({ key: 'c', ctrlKey: true }, ctx({ hasSelection: false }))).toBeNull();
    expect(resolveCanvasHotkey({ key: 'v', ctrlKey: true }, ctx({ hasSelection: false }))).toBe('paste');
  });
  it('Ctrl+D duplica só com seleção', () => {
    expect(resolveCanvasHotkey({ key: 'd', ctrlKey: true }, ctx())).toBe('duplicate');
    expect(resolveCanvasHotkey({ key: 'd', ctrlKey: true }, ctx({ hasSelection: false }))).toBeNull();
  });
});

describe('execução (Ctrl+Enter)', () => {
  it('com nó selecionado → run-node (passo); sem seleção → run-board', () => {
    expect(resolveCanvasHotkey({ key: 'Enter', ctrlKey: true }, ctx())).toBe('run-node');
    expect(resolveCanvasHotkey({ key: 'Enter', ctrlKey: true }, ctx({ hasSelection: false }))).toBe('run-board');
  });
});

describe('teclas de nó selecionado', () => {
  it('Enter abre · F2 renomeia · D desativa · P pina', () => {
    expect(resolveCanvasHotkey({ key: 'Enter' }, ctx())).toBe('open');
    expect(resolveCanvasHotkey({ key: 'F2' }, ctx())).toBe('rename');
    expect(resolveCanvasHotkey({ key: 'd' }, ctx())).toBe('deactivate');
    expect(resolveCanvasHotkey({ key: 'p' }, ctx())).toBe('toggle-pin');
  });
  it('Space NÃO renomeia mais (Space = pan, paridade n8n)', () => {
    expect(resolveCanvasHotkey({ key: ' ' }, ctx())).toBeNull();
  });
  it('sem seleção, teclas de nó não disparam', () => {
    const none = ctx({ hasSelection: false });
    expect(resolveCanvasHotkey({ key: 'Enter' }, none)).toBeNull();
    expect(resolveCanvasHotkey({ key: 'F2' }, none)).toBeNull();
    expect(resolveCanvasHotkey({ key: 'd' }, none)).toBeNull();
  });
});

describe('delete', () => {
  it('Delete/Backspace com nó OU aresta selecionada', () => {
    expect(resolveCanvasHotkey({ key: 'Delete' }, ctx())).toBe('delete');
    expect(resolveCanvasHotkey({ key: 'Backspace' }, ctx())).toBe('delete');
    expect(resolveCanvasHotkey({ key: 'Delete' }, ctx({ hasSelection: false, hasEdgeSelection: true }))).toBe('delete');
    expect(resolveCanvasHotkey({ key: 'Delete' }, ctx({ hasSelection: false }))).toBeNull();
  });
});
