'use client';

/**
 * EditorCommandPalette — busca global do editor de aplicativos (Workshop).
 *
 * Onda M1.d (2026-05-23) — paridade com o "global search" do editor de apps
 * do Foundry, acessível por Ctrl+K / Cmd+K *dentro* do editor. Não confundir
 * com a paleta de comandos global (`components/shell/command-palette.tsx`),
 * que navega entre rotas. Esta é local ao editor montado e busca três
 * famílias de alvos editáveis:
 *
 *   1. Widgets — itens da paleta lateral, casados por `meta.label` /
 *      descrição. NUNCA pelo `type` cru (memory feedback_widget_type_never_
 *      raw_in_ui). Selecionar adiciona o widget ao canvas.
 *   2. Dados — variáveis do app (label / external_id). Selecionar abre o
 *      painel de Dados (variables).
 *   3. Ações — abrir os painéis do editor (Dados, Eventos, Estilos,
 *      Dependências, Versões, Comentários, Métricas).
 *
 * Componente controlado: o estado `open` e os handlers vivem no
 * WorkshopEditor, que também registra o atalho (capture-phase) pra ter
 * precedência sobre a paleta global.
 *
 * Visual: light-theme, sharp (sem rounded), focus-visible rings, aria-modal.
 */

import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Layers, Search, Settings2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { iconByName } from '@/lib/icon-by-name';

/** Widget candidato da paleta — só o necessário pra busca + render. */
export interface EditorPaletteWidget {
  type: string;
  label: string;
  description?: string;
  icon?: string;
  group: string;
}

/** Variável do app exposta na busca. */
export interface EditorVariableHit {
  id: string;
  label: string;
  externalId: string;
}

/** Ação do editor (abrir painel). */
export interface EditorActionHit {
  key: string;
  label: string;
  run: () => void;
}

type Row =
  | { kind: 'widget'; key: string; label: string; sub?: string; icon: string; run: () => void }
  | { kind: 'variable'; key: string; label: string; sub?: string; icon: string; run: () => void }
  | { kind: 'action'; key: string; label: string; sub?: string; icon: string; run: () => void };

const KIND_LABEL: Record<Row['kind'], string> = {
  widget: 'Widget',
  variable: 'Dados',
  action: 'Ação',
};

export function EditorCommandPalette({
  open,
  onClose,
  widgets,
  variables,
  actions,
  onAddWidget,
  onOpenVariables,
}: {
  open: boolean;
  onClose: () => void;
  widgets: EditorPaletteWidget[];
  variables: EditorVariableHit[];
  actions: EditorActionHit[];
  onAddWidget: (type: string) => void;
  onOpenVariables: () => void;
}) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Limpa busca/seleção sempre que (re)abre.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  const q = query.trim().toLowerCase();

  // Monta as linhas filtradas, na ordem Widgets → Dados → Ações.
  const rows = useMemo<Row[]>(() => {
    const widgetRows: Row[] = widgets
      .filter((w) => {
        if (!q) return true;
        const hay = `${w.label} ${w.description ?? ''} ${w.group}`.toLowerCase();
        return hay.includes(q);
      })
      // Limite generoso pra não estourar a lista quando a busca está vazia.
      .slice(0, 40)
      .map((w) => ({
        kind: 'widget' as const,
        key: `widget:${w.type}`,
        label: w.label,
        sub: w.description || w.group,
        icon: w.icon ?? 'square',
        run: () => onAddWidget(w.type),
      }));

    const variableRows: Row[] = variables
      .filter((v) => {
        if (!q) return true;
        return `${v.label} ${v.externalId}`.toLowerCase().includes(q);
      })
      .map((v) => ({
        kind: 'variable' as const,
        key: `variable:${v.id}`,
        label: v.label,
        sub: v.externalId,
        icon: 'database',
        run: onOpenVariables,
      }));

    const actionRows: Row[] = actions
      .filter((a) => (!q ? true : a.label.toLowerCase().includes(q)))
      .map((a) => ({
        kind: 'action' as const,
        key: `action:${a.key}`,
        label: a.label,
        sub: undefined,
        icon: 'settings-2',
        run: a.run,
      }));

    return [...widgetRows, ...variableRows, ...actionRows];
  }, [widgets, variables, actions, q, onAddWidget, onOpenVariables]);

  // Mantém o highlight dentro dos limites quando a lista encolhe.
  useEffect(() => {
    setHighlight((h) => (rows.length === 0 ? 0 : Math.min(h, rows.length - 1)));
  }, [rows.length]);

  if (!open) return null;

  const pick = (row: Row | undefined) => {
    if (!row) return;
    row.run();
    onClose();
  };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Busca do editor de aplicativos"
      data-testid="workshop-command-palette"
      className="fixed inset-0 z-[60] flex items-start justify-center p-16 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-white border border-border-light shadow-2xl flex flex-col text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-3 py-2 border-b border-border-light flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, rows.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(rows[highlight]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Buscar widgets, dados, ações…"
            data-testid="workshop-command-palette-input"
            aria-label="Buscar no editor"
            className="flex-1 h-7 text-[13px] outline-none bg-transparent text-text-on-light placeholder:text-muted-on-light"
          />
          <kbd className="text-[10px] font-mono text-muted-on-light/70">Esc</kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca"
            className="text-muted-on-light hover:text-text-on-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>
        <ul
          ref={listRef}
          className="max-h-[380px] overflow-y-auto"
          data-testid="workshop-command-palette-list"
        >
          {rows.length === 0 ? (
            <li className="px-3 py-4 text-[12px] text-muted-on-light italic">
              Nenhum resultado para “{query}”.
            </li>
          ) : (
            rows.map((row, i) => {
              const GroupIcon =
                row.kind === 'widget'
                  ? Layers
                  : row.kind === 'variable'
                    ? Database
                    : Settings2;
              const RowIcon =
                row.kind === 'widget' ? iconByName(row.icon) : GroupIcon;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    data-testid={`workshop-command-palette-row-${row.kind}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(row)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 h-10 text-[12.5px] text-left border-b border-border-light/40 last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                      highlight === i
                        ? 'bg-primary/5 text-primary'
                        : 'text-text-on-light hover:bg-canvas-light',
                    )}
                  >
                    <RowIcon
                      className="w-3.5 h-3.5 shrink-0 text-muted-on-light"
                      strokeWidth={1.5}
                    />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="truncate">{row.label}</span>
                      {row.sub && (
                        <span className="truncate text-[10.5px] text-muted-on-light">
                          {row.sub}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-on-light shrink-0">
                      {KIND_LABEL[row.kind]}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <footer className="px-3 py-1.5 border-t border-border-light/60 bg-canvas-light text-[10px] text-muted-on-light flex items-center gap-3">
          <span>
            <kbd className="font-mono">↑↓</kbd> navegar
          </span>
          <span>
            <kbd className="font-mono">Enter</kbd> selecionar
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> fechar
          </span>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
