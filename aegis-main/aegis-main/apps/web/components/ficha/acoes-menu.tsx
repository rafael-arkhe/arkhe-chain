'use client';

/**
 * Toolbar "Ações" da /ficha (P5 — multidomínio).
 *
 * Popula o botão "Ações" do cabeçalho a partir do contrato do Object Type
 * (`type_def.actions` do objectTypeSchema) — antes era um stub desabilitado.
 * Genérico: vale pra QUALQUER tipo (carro, país, empresa, evento, operação,
 * conector...). Clicar numa ação leva o operador à seção "Ações" da ficha
 * (aba `acoes`), onde o widget governado executa via ActionType (gates +
 * lineage). Decoupled da shell via CustomEvent (`gotoFichaTab`).
 */
import * as React from 'react';
import { ChevronDown, Zap } from 'lucide-react';
import { type ObjectTypeSchema } from '@/lib/api';
import { useTypeActions, gotoFichaTab } from '@/lib/ficha/type-actions';
import { useT } from '@/lib/i18n/provider';

export function FichaAcoesMenu({
  entityType,
  schema,
}: {
  entityType: string;
  /** type-def já resolvido pela rota (objeto canônico). Ausente → busca. */
  schema?: ObjectTypeSchema | null;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const { actions } = useTypeActions(schema ?? null, entityType);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid="ficha-acoes-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2.5 text-[11px] bg-primary text-white flex items-center gap-1 hover:bg-primary-hover"
      >
        {t('ficha.toolbar.acoes')} <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          data-testid="ficha-acoes-menu"
          className="absolute right-0 top-[calc(100%+2px)] z-20 min-w-[220px] bg-white border border-border-light shadow-md"
        >
          {actions.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-on-light italic" data-testid="ficha-acoes-menu-empty">
              {t('ficha.toolbar.acoesVazio')}
            </p>
          ) : (
            <ul>
              {actions.map((a) => (
                <li key={a.name}>
                  <button
                    type="button"
                    data-testid="ficha-acoes-menu-item"
                    onClick={() => {
                      gotoFichaTab('acoes');
                      setOpen(false);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-1.5 text-left text-[11px] hover:bg-canvas-light transition-colors"
                  >
                    <Zap className="w-3 h-3 shrink-0 text-muted-on-light" strokeWidth={1.5} />
                    <span className="truncate">{a.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
