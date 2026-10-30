'use client';

/**
 * UsedColorsButton — Sprint F2 do Parity Audit (2026-05-21).
 *
 * Botão "Cores" no toolbar do editor abre popover ancorado (360px) com:
 *   - Seção "Cores salvas" — catálogo `app.used_colors` editável.
 *     Cada entry: nome, hex picker, contador de ocorrências, botão X.
 *   - Seção "Cores em uso (não salvas)" — scan dos hex literais em
 *     `app.layout` + `app.pages[].layout` + `app.overlays[].layout`
 *     usando regex `/#[0-9a-fA-F]{6}/`. Pra cada hex único ainda não
 *     catalogado, botão "+ Salvar" cria entry no catálogo.
 *   - Footer "+ Adicionar cor" cria entry vazia que o operador edita.
 *
 * Decisão técnica: o renderer NÃO consome esse catálogo. Operador copia
 * o hex e cola onde quiser (props de widget, marcador customizado, etc).
 * A trampolim entre catálogo e widget é manual de propósito — evita
 * acoplamento e mantém o catálogo como referência visual.
 */

import * as React from 'react';
import { Copy, Palette, Plus, X } from 'lucide-react';
import type { LayoutNode, UsedColorEntry, WorkshopApp } from '@/lib/workshop/types';

const HEX_REGEX = /#[0-9a-fA-F]{6}\b/g;

function normalizeHex(raw: string): string | null {
  const m = raw.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return `#${m[1].toLowerCase()}`;
}

function newId(): string {
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Coleta TODOS os hex strings literais em `props` (recursivo, depth-bounded). */
function collectHexFromValue(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6) return;
  if (typeof value === 'string') {
    const matches = value.match(HEX_REGEX);
    if (matches) for (const m of matches) out.add(m.toLowerCase());
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectHexFromValue(v, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectHexFromValue(v, out, depth + 1);
    }
  }
}

function collectNodes(app: WorkshopApp): LayoutNode[] {
  const all: LayoutNode[] = [];
  if (app.pages && app.pages.length > 0) {
    for (const p of app.pages) all.push(...(p.layout.root ?? []));
  } else if (app.layout) {
    all.push(...(app.layout.root ?? []));
  }
  for (const o of app.overlays ?? []) {
    all.push(...(o.layout.root ?? []));
  }
  return all;
}

/** Conta quantas vezes cada hex literal aparece nas props dos widgets. */
function buildUsageMap(app: WorkshopApp): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of collectNodes(app)) {
    const seen = new Set<string>();
    collectHexFromValue(node.widget.props, seen);
    for (const hex of seen) {
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  // Inclui também valores do header_config (cor do header em hex).
  if (app.header_config?.color) {
    const norm = normalizeHex(app.header_config.color);
    if (norm) counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }
  return counts;
}

export function UsedColorsButton({
  app,
  onChange,
}: {
  app: WorkshopApp;
  onChange: (next: WorkshopApp) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const saved = app.used_colors ?? [];
  const usage = React.useMemo(() => buildUsageMap(app), [app]);

  const savedHexes = React.useMemo(
    () => new Set(saved.map((c) => c.hex.toLowerCase())),
    [saved],
  );

  const unsavedHexes = React.useMemo(
    () =>
      Array.from(usage.entries())
        .filter(([hex]) => !savedHexes.has(hex.toLowerCase()))
        .sort((a, b) => b[1] - a[1]),
    [usage, savedHexes],
  );

  const updateSaved = (next: UsedColorEntry[]) => {
    onChange({ ...app, used_colors: next });
  };

  const addBlank = () => {
    const entry: UsedColorEntry = { id: newId(), name: '', hex: '#3b82f6' };
    updateSaved([...saved, entry]);
  };

  const saveFromUnsaved = (hex: string) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    const entry: UsedColorEntry = {
      id: newId(),
      name: '',
      hex: normalized,
    };
    updateSaved([...saved, entry]);
  };

  const removeEntry = (id: string) => {
    updateSaved(saved.filter((c) => c.id !== id));
  };

  const patchEntry = (id: string, patch: Partial<UsedColorEntry>) => {
    updateSaved(
      saved.map((c) => {
        if (c.id !== id) return c;
        const next: UsedColorEntry = { ...c, ...patch };
        // Normaliza hex se preenchido manualmente.
        if (typeof patch.hex === 'string') {
          const norm = normalizeHex(patch.hex);
          if (norm) next.hex = norm;
        }
        return next;
      }),
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
        data-testid="workshop-used-colors-toggle"
        title="Catálogo de cores deste painel — operador salva e copia o hex"
      >
        <Palette className="w-3 h-3" strokeWidth={1.5} /> Cores
        {saved.length > 0 && (
          <span className="px-1 text-[9px] font-mono bg-primary/15 text-primary border border-primary/30">
            {saved.length}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 bg-canvas-light border border-border-light w-[360px] max-h-[480px] z-30 surface-light flex flex-col"
          data-testid="workshop-used-colors-popover"
        >
          <header className="px-3 py-2 border-b border-border-light shrink-0">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono text-muted-on-light">
              Catálogo de cores
            </p>
            <p className="text-[10px] text-muted-on-light leading-snug mt-1 normal-case tracking-normal">
              Salve cores recorrentes pra copiar o hex e colar nos widgets.
            </p>
          </header>

          <div className="flex-1 overflow-y-auto">
            <section>
              <header className="px-3 py-2 bg-raised-light/40 border-b border-border-light flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono font-semibold">
                  Cores salvas · {saved.length}
                </p>
              </header>
              {saved.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-muted-on-light italic">
                  Nenhuma cor salva ainda.
                </p>
              ) : (
                <ul className="divide-y divide-border-light/60">
                  {saved.map((c) => {
                    const used = usage.get(c.hex.toLowerCase()) ?? 0;
                    return (
                      <li
                        key={c.id}
                        data-testid={`used-color-row-${c.id}`}
                        className="px-3 py-2 flex items-center gap-2"
                      >
                        <label className="relative inline-block w-6 h-6 border border-border-light shrink-0">
                          <input
                            type="color"
                            value={c.hex}
                            onChange={(e) => patchEntry(c.id, { hex: e.target.value })}
                            aria-label={`Cor de ${c.name || c.hex}`}
                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                          />
                          <span
                            className="absolute inset-0 pointer-events-none"
                            style={{ backgroundColor: c.hex }}
                          />
                        </label>
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => patchEntry(c.id, { name: e.target.value })}
                          placeholder="Nome (ex.: Alerta crítico)"
                          className="flex-1 h-6 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary min-w-0"
                        />
                        <input
                          type="text"
                          value={c.hex}
                          onChange={(e) => patchEntry(c.id, { hex: e.target.value })}
                          className="w-[78px] h-6 px-2 text-[10px] font-mono bg-white border border-border-light outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(c.hex);
                          }}
                          title="Copiar hex"
                          aria-label="Copiar hex"
                          className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-primary border border-transparent hover:border-primary"
                        >
                          <Copy className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                        <span
                          className="text-[9px] font-mono text-muted-on-light min-w-[28px] text-right"
                          title={`Aparece ${used} vez(es) nos widgets`}
                        >
                          {used > 0 ? `×${used}` : '—'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEntry(c.id)}
                          title="Remover do catálogo"
                          aria-label="Remover"
                          className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger/40"
                        >
                          <X className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {unsavedHexes.length > 0 && (
              <section>
                <header className="px-3 py-2 bg-warning/15 border-y border-warning/40">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-text-on-light font-mono font-semibold">
                    Cores em uso (não salvas) · {unsavedHexes.length}
                  </p>
                  <p className="text-[10px] text-text-on-light/75 normal-case tracking-normal leading-snug mt-1">
                    Hex encontrados nos widgets que ainda não estão catalogados.
                  </p>
                </header>
                <ul className="divide-y divide-border-light/60">
                  {unsavedHexes.map(([hex, count]) => (
                    <li
                      key={hex}
                      className="px-3 py-2 flex items-center gap-2"
                    >
                      <span
                        className="inline-block w-6 h-6 border border-border-light shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                      <span className="flex-1 text-[11px] font-mono text-text-on-light">
                        {hex}
                      </span>
                      <span
                        className="text-[9px] font-mono text-muted-on-light"
                        title={`Aparece ${count} vez(es)`}
                      >
                        ×{count}
                      </span>
                      <button
                        type="button"
                        onClick={() => saveFromUnsaved(hex)}
                        data-testid={`used-color-save-${hex}`}
                        className="h-6 px-2 text-[10px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" strokeWidth={1.5} /> Salvar
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <footer className="px-3 py-2 border-t border-border-light bg-raised-light/40 shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={addBlank}
              data-testid="used-color-add"
              className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" strokeWidth={1.5} /> Adicionar cor
            </button>
            {saved.length > 0 && (
              <button
                type="button"
                onClick={() => updateSaved([])}
                className="ml-auto text-[10px] font-mono text-muted-on-light hover:text-danger underline"
              >
                limpar catálogo
              </button>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}

