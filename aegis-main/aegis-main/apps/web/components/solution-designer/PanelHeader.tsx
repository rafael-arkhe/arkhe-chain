'use client';

/**
 * PanelHeader (#11) — chrome consistente p/ os painéis laterais do Desenho da
 * Operação (LeftPane "Componentes", Inspetor do nó), alinhado ao padrão que os
 * painéis de Diagrama/AIP (chat, Histórico, Passo a passo) já seguem:
 *
 *   [ ícone  TÍTULO            ] [ ações…  × ]
 *            subtítulo opcional
 *
 * Barra cinza (bg-canvas-light), reta (sem rounded), sem emoji. O `actions`
 * recebe botões extras (ex.: excluir nó) antes do "×". Mantém os testids dos
 * controles configuráveis p/ não quebrar os contratos existentes.
 */
import * as React from 'react';
import { X, type LucideIcon } from 'lucide-react';

export function PanelHeader({
  icon: Icon,
  title,
  subtitle,
  titleTestId,
  actions,
  onClose,
  closeTestId,
  closeLabel,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  titleTestId?: string;
  /** Ações extras (ex.: excluir) renderizadas antes do "×". */
  actions?: React.ReactNode;
  onClose?: () => void;
  closeTestId?: string;
  closeLabel?: string;
}) {
  return (
    <div className="flex-none flex items-center justify-between gap-2 px-3 py-2 border-b border-border-light bg-canvas-light">
      <div className="flex items-center gap-1.5 min-w-0">
        {Icon && (
          <Icon className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
        )}
        <div className="min-w-0">
          <p
            className="text-[10px] uppercase tracking-wider text-muted-on-light truncate"
            data-testid={titleTestId}
          >
            {title}
          </p>
          {subtitle && (
            <p className="text-[10.5px] text-muted-on-light truncate">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            data-testid={closeTestId}
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
