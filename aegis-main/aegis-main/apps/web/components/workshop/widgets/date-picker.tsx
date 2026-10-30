'use client';

/**
 * Date Picker — Sprint 5 do parity roadmap.
 * Date / date-range que escreve em uma variable. Emite value_change.
 */
import * as React from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  target?: string;
  label?: string;
  /** 'date' (default) ou 'range' (escreve {from, to}). */
  mode?: 'date' | 'range';
};

function DatePicker({ config, bindings, setBinding, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const target = cfg.target ?? '';
  const mode = cfg.mode ?? 'date';
  const raw = target ? bindings[target] : undefined;

  if (!target) {
    return (
      <div className="bg-white border border-border-light p-2 text-[11px] text-muted-on-light italic">
        Configure `target` no Inspetor.
      </div>
    );
  }

  if (mode === 'range') {
    const range = (raw && typeof raw === 'object' ? raw : {}) as { from?: string; to?: string };
    const set = (next: { from?: string; to?: string }) => {
      setBinding(target, next);
      emit?.('value_change', { value: next, target });
    };
    return (
      <div className="bg-white border border-border-light p-2 space-y-1">
        {cfg.label && (
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono">
            {cfg.label}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={range.from ?? ''}
            onChange={(e) => set({ ...range, from: e.target.value || undefined })}
            data-testid={`date-from-${target}`}
            className="flex-1 h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
          />
          <span className="text-[10px] text-muted-on-light">→</span>
          <input
            type="date"
            value={range.to ?? ''}
            onChange={(e) => set({ ...range, to: e.target.value || undefined })}
            data-testid={`date-to-${target}`}
            className="flex-1 h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
          />
        </div>
      </div>
    );
  }

  const value = typeof raw === 'string' ? raw : '';
  return (
    <div className="bg-white border border-border-light p-2">
      {cfg.label && (
        <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono mb-1">
          {cfg.label}
        </label>
      )}
      <input
        type="date"
        value={value}
        onChange={(e) => {
          setBinding(target, e.target.value);
          emit?.('value_change', { value: e.target.value, target });
        }}
        data-testid={`date-${target}`}
        className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
      />
    </div>
  );
}

registerWidget('date_picker', DatePicker, {
  group: 'data',
  label: 'Seletor de data',
  description:
    'Seletor de data única ou de intervalo (início e fim) que grava o valor escolhido em um dado.',
  icon: 'calendar',
  defaultColSpan: 5,
  mockConfig: { label: 'Data inicial', target: 'data', mode: 'date' },
  mockVariables: {},
  previewWidth: 280,
  previewHeight: 70,
  config_schema: [
    { name: 'label', label: 'Rótulo', field: 'string', placeholder: 'Data inicial' },
    { name: 'target', label: 'Dado destino', field: 'variable-ref' },
    { name: 'mode', label: 'Modo de seleção', field: 'select', options: [{ value: 'date', label: 'Data única' }, { value: 'range', label: 'Intervalo (início e fim)' }], default: 'date' },
  ],
});
