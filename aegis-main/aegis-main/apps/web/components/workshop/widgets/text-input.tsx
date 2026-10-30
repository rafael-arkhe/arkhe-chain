'use client';

/**
 * Text Input — Sprint 5 do parity roadmap.
 * Input genérico que escreve em uma variable (string ou number).
 * Emite `value_change` na mudança.
 */
import * as React from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  target?: string;
  label?: string;
  placeholder?: string;
  type?: 'text' | 'number';
  debounce_ms?: number;
};

function TextInput({ config, bindings, setBinding, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const target = cfg.target ?? '';
  const debounce = cfg.debounce_ms ?? 300;
  const initial =
    target && typeof bindings[target] !== 'undefined' && bindings[target] !== null
      ? String(bindings[target])
      : '';
  const [local, setLocal] = React.useState(initial);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setLocal(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, bindings[target]]);

  const onChange = (v: string) => {
    setLocal(v);
    if (!target) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const val = cfg.type === 'number' ? (v === '' ? null : Number(v)) : v;
      setBinding(target, val);
      emit?.('value_change', { value: val, target });
    }, debounce);
  };

  if (!target) {
    return (
      <div className="bg-white border border-border-light p-2 text-[11px] text-muted-on-light italic">
        Configure `target` (variable) no Inspetor.
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light p-2">
      {cfg.label && (
        <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono mb-1">
          {cfg.label}
        </label>
      )}
      <input
        type={cfg.type === 'number' ? 'number' : 'text'}
        value={local}
        onChange={(e) => onChange(e.target.value)}
        placeholder={cfg.placeholder}
        data-testid={`text-input-${target}`}
        className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
      />
    </div>
  );
}

registerWidget('text_input', TextInput, {
  group: 'data',
  label: 'Input de texto',
  description:
    'Campo livre de texto ou número que grava em um dado, com pequeno atraso para evitar disparos a cada tecla.',
  icon: 'text-cursor-input',
  defaultColSpan: 5,
  mockConfig: {
    label: 'Buscar por nome',
    target: 'q',
    placeholder: 'Digite e tecle…',
  },
  mockVariables: {},
  previewWidth: 280,
  previewHeight: 70,
  config_schema: [
    { name: 'label', label: 'Rótulo', field: 'string', placeholder: 'Buscar por nome' },
    { name: 'target', label: 'Dado destino', field: 'variable-ref' },
    { name: 'type', label: 'Tipo', field: 'select', options: [{ value: 'text', label: 'Texto' }, { value: 'number', label: 'Número' }], default: 'text' },
    { name: 'placeholder', label: 'Texto de exemplo', field: 'string', placeholder: 'Digite e tecle…' },
    { name: 'debounce_ms', label: 'Atraso (ms)', field: 'number', min: 0, max: 2000, step: 50, default: 300, unit: 'ms' },
  ],
});
