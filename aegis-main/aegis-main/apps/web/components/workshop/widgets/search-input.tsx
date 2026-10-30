'use client';

/**
 * Search Input — Sprint L7 (2026-05-23).
 *
 * Pesquisa R2 Slate · widgets/control.md.
 *
 * Input debounced que grava em uma variable + emite `search.changed`.
 * Diferente do widget genérico `text_input`: este já vem com ícone de lupa,
 * placeholder otimizado para query, hint de keyboard shortcut, botão limpar
 * e dispara um evento dedicado (`search.changed`) com o termo trimmed.
 *
 * Config:
 *   - target: string         external_id da variable destino (obrigatório)
 *   - placeholder?: string   default "Buscar…"
 *   - debounce_ms?: number   default 300
 *   - min_length?: number    default 0 (não emite até atingir)
 *   - autofocus?: boolean    default false
 */
import * as React from 'react';
import { Search, X } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  target?: string;
  placeholder?: string;
  debounce_ms?: number;
  min_length?: number;
  autofocus?: boolean;
};

export function SearchInput({
  config,
  bindings,
  setBinding,
  emit,
}: WidgetRenderProps) {
  const cfg = (config ?? {}) as Cfg;
  const target = cfg.target?.trim() ?? '';
  const debounce = cfg.debounce_ms ?? 300;
  const minLen = cfg.min_length ?? 0;

  const initial = React.useMemo(() => {
    if (!target) return '';
    const v = bindings?.[target];
    return v == null ? '' : String(v);
  }, [bindings, target]);

  const [local, setLocal] = React.useState(initial);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // sync external → local quando target/binding muda fora deste widget
  React.useEffect(() => {
    setLocal(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, target]);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const commit = React.useCallback(
    (value: string) => {
      if (!target) return;
      const trimmed = value.trim();
      if (trimmed.length < minLen) return;
      setBinding(target, trimmed);
      emit?.('search.changed', { value: trimmed, target });
    },
    [target, minLen, setBinding, emit],
  );

  const onChange = (next: string) => {
    setLocal(next);
    if (!target) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), debounce);
  };

  const clear = () => {
    setLocal('');
    if (timer.current) clearTimeout(timer.current);
    if (!target) return;
    setBinding(target, '');
    emit?.('search.changed', { value: '', target });
  };

  if (!target) {
    return (
      <div
        className="border border-border-light bg-white p-3 text-[11px] text-muted-on-light italic"
        data-testid="search-input-empty"
      >
        Configure `target` (variable destino) no Inspector.
      </div>
    );
  }

  const showClear = local.length > 0;

  return (
    <div
      className="border border-border-light bg-white p-2"
      data-testid="search-input"
    >
      <div className="relative h-8 flex items-center bg-canvas-light border border-border-light focus-within:border-primary">
        <Search
          className="absolute left-2 w-3.5 h-3.5 text-muted-on-light pointer-events-none"
          strokeWidth={1.5}
        />
        <input
          type="search"
          value={local}
          onChange={(e) => onChange(e.target.value)}
          placeholder={cfg.placeholder ?? 'Buscar…'}
          autoFocus={cfg.autofocus === true}
          data-testid={`search-input-field-${target}`}
          className="h-full w-full pl-7 pr-7 text-[12px] bg-transparent outline-none"
        />
        {showClear && (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar busca"
            data-testid={`search-input-clear-${target}`}
            className="absolute right-1 h-6 w-6 flex items-center justify-center hover:bg-border-light/60"
          >
            <X
              className="w-3 h-3 text-muted-on-light"
              strokeWidth={1.5}
            />
          </button>
        )}
      </div>
      {minLen > 0 && local.length > 0 && local.length < minLen && (
        <p
          className="mt-1 text-[10px] font-mono text-muted-on-light"
          data-testid="search-input-hint"
        >
          Mínimo {minLen} caracteres
        </p>
      )}
    </div>
  );
}

registerWidget('search_input', SearchInput, {
  group: 'data',
  label: 'Campo de busca',
  description:
    'Caixa de busca dedicada com debounce, atalho de limpeza e evento próprio. Grava o termo digitado em uma variável.',
  icon: 'search',
  defaultColSpan: 5,
  mockConfig: {
    target: 'q',
    placeholder: 'Buscar por nome, CPF ou placa…',
    debounce_ms: 300,
    min_length: 2,
  },
  mockVariables: {},
  previewWidth: 360,
  previewHeight: 80,
  config_schema: [
    {
      name: 'target',
      label: 'Variável destino',
      field: 'variable-ref',
    },
    {
      name: 'placeholder',
      label: 'Texto de exemplo',
      field: 'string',
      placeholder: 'Buscar…',
    },
    {
      name: 'debounce_ms',
      label: 'Atraso (ms)',
      field: 'number',
      min: 0,
      max: 2000,
      step: 50,
      default: 300,
      unit: 'ms',
    },
    {
      name: 'min_length',
      label: 'Mínimo de caracteres',
      field: 'number',
      min: 0,
      max: 20,
      default: 0,
    },
    {
      name: 'autofocus',
      label: 'Focar ao carregar',
      field: 'boolean',
    },
  ],
});
