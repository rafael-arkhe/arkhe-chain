'use client';

/**
 * ProcessingModeSelector (#6) — escolhe COMO o nó de Processamento trata os dados:
 *
 *  - 'inference'   → só Inferência de IA (modelo + prompt + variáveis).
 *  - 'transformer' → só Transformação determinística (Code Function); SEM IA.
 *  - 'both'        → ambos (transformador pré-processa, IA infere). Padrão
 *                    retrocompatível — diagramas antigos sem o campo caem aqui.
 *
 * Os transformers são primeira-classe: o operador NÃO é forçado a usar LLM.
 * O modo escolhido condiciona o que o NodeInspector mostra e o que o
 * MaterializeDialog monta (transformer-only nunca envia model/prompt).
 *
 * Estética: segmented control reto (sem rounded), azul-aço no selecionado.
 */
import * as React from 'react';

import { useT } from '@/lib/i18n/provider';
import { InfoTip } from '@/components/ui/info-tip';

export type ProcessingMode = 'inference' | 'transformer' | 'both';

const MODES: ProcessingMode[] = ['inference', 'transformer', 'both'];

const MODE_LABEL_KEY: Record<ProcessingMode, 'solutions.processingModeInference' | 'solutions.processingModeTransformer' | 'solutions.processingModeBoth'> = {
  inference: 'solutions.processingModeInference',
  transformer: 'solutions.processingModeTransformer',
  both: 'solutions.processingModeBoth',
};

export function ProcessingModeSelector({
  mode,
  onModeChange,
}: {
  mode: ProcessingMode;
  onModeChange: (mode: ProcessingMode) => void;
}) {
  const t = useT();
  // Navegação por setas dentro do radiogroup (single-select acessível).
  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    onModeChange(MODES[(idx + dir + MODES.length) % MODES.length]);
  };
  return (
    <div className="space-y-1.5" data-testid="processing-mode-selector">
      <p id="processing-mode-label" className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
        {t('solutions.processingModeLabel')}
        <InfoTip text={t('solutions.processingModeHint')} />
      </p>
      <div
        role="radiogroup"
        aria-labelledby="processing-mode-label"
        className="flex border border-border-light divide-x divide-border-light"
      >
        {MODES.map((m, idx) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onModeChange(m)}
              onKeyDown={(e) => onKey(e, idx)}
              data-testid={`processing-mode-radio-${m}`}
              className={
                'flex-1 px-2 py-1.5 text-[10.5px] text-center transition-colors ' +
                (active
                  ? 'bg-primary text-white'
                  : 'bg-white text-text-on-light hover:bg-panel-light')
              }
            >
              {t(MODE_LABEL_KEY[m])}
            </button>
          );
        })}
      </div>
    </div>
  );
}
