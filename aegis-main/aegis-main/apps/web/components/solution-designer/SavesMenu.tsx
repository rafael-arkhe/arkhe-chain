'use client';

/**
 * SavesMenu (#10) — dropdown "▾" do split-button [Salvar ▾].
 *
 * Resolve a ambiguidade do antigo "Restaurar do histórico" (que confundia com
 * o painel de Histórico do AIP): aqui o operador vê a LISTA dos seus diagramas
 * salvos e clica p/ reabrir. O botão "Salvar" ao lado faz o save rápido; este
 * "▾" só abre a lista.
 *
 * Estética: reto (sem rounded), sem emoji, click-outside + ESC fecham.
 */
import * as React from 'react';
import { ChevronDown, FilePlus2, Check } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import type { SolutionDiagram } from '@/lib/api';

export function SavesMenu({
  diagrams,
  currentId,
  onSelect,
  onCreateNew,
  onOpen,
}: {
  diagrams: SolutionDiagram[];
  currentId: string | null;
  onSelect: (d: SolutionDiagram) => void;
  onCreateNew: () => void;
  /** Chamado ao abrir — p/ a página recarregar a lista (refresh leve). */
  onOpen?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  // Paridade com o OverflowMenu irmão: foca o 1º item ao abrir (entrada por teclado).
  const firstItemRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    firstItemRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next) onOpen?.();
      return next;
    });
  };

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={t('solutions.mySaves')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="solutions-save-menu-toggle"
        className="h-8 px-1.5 inline-flex items-center justify-center bg-white border border-l-0 border-border-light text-text-on-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('solutions.mySaves')}
          data-testid="solutions-saves-menu"
          className="absolute top-full right-0 mt-1 z-50 w-[300px] bg-white border border-border-light shadow-lg"
        >
          <p className="px-3 py-2 text-[9px] uppercase tracking-widest text-muted-on-light border-b border-border-light">
            {t('solutions.mySaves')}
          </p>
          <div className="max-h-72 overflow-auto py-1">
            {diagrams.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-muted-on-light" data-testid="solutions-saves-empty">
                {t('solutions.noSavesYet')}
              </p>
            ) : (
              diagrams.map((d, i) => {
                const active = d.id === currentId;
                return (
                  <button
                    key={d.id}
                    ref={i === 0 ? firstItemRef : undefined}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onSelect(d);
                    }}
                    data-testid={`solutions-save-item-${d.id}`}
                    className={cn(
                      'w-full flex items-start gap-2 px-3 py-2 text-left',
                      'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary hover:bg-canvas-light',
                    )}
                  >
                    <Check
                      className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', active ? 'text-primary' : 'text-transparent')}
                      strokeWidth={1.5}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12px] text-text-on-light truncate">
                        {d.title || t('solutions.untitledOperation')}
                      </span>
                      <span className="block text-[9.5px] font-mono text-muted-on-light mt-0.5">
                        v{d.version ?? 1} · {d.nodes.length} {t('solutions.nodesShort')}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <button
            ref={diagrams.length === 0 ? firstItemRef : undefined}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onCreateNew();
            }}
            data-testid="solutions-saves-new"
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-primary border-t border-border-light hover:bg-canvas-light focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
          >
            <FilePlus2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
            {t('solutions.newDiagram')}
          </button>
        </div>
      )}
    </div>
  );
}
