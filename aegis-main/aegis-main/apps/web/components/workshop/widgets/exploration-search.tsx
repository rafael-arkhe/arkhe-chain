'use client';

/**
 * Exploration Search Bar — Tier B1 do parity roadmap (2026-05-20).
 *
 * Search bar com syntax estruturada num único campo:
 *
 *   `bare words`         — vão pro `_q` (full-text)
 *   `key:value`          — filter exato {key: value}
 *   `key:"two words"`    — filter exato com espaços
 *   `-key:value`         — exclusion (negação)
 *
 * Output shape escrito em `bindings[target]`:
 *
 *   { _q: string, _props: { key: value }, _exclude: { key: value } }
 *
 * Widgets a jusante (object_table, object_list, exploração genérica)
 * consomem essa shape para construir queries. Emite `value_change`.
 *
 * Sugestões de fields via autocomplete (datalist) — operador vê os
 * properties disponíveis ao digitar `:`.
 */
import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  target?: string;
  /** Lista de fields conhecidos pra autocomplete sugerir key:value. */
  fields?: string[];
  placeholder?: string;
  label?: string;
  /** Quando true, mostra chips dos filtros parseados embaixo do input. */
  show_chips?: boolean;
};

export interface ExplorationQuery {
  _q: string;
  _props: Record<string, string>;
  _exclude: Record<string, string>;
}

/**
 * Parser do query string — extrai key:value, exclusions e bare words.
 * Suporta `"strings com espaços"`.
 */
export function parseExplorationQuery(raw: string): ExplorationQuery {
  const _q: string[] = [];
  const _props: Record<string, string> = {};
  const _exclude: Record<string, string> = {};

  // Tokeniza respeitando quoted strings
  const tokens: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of raw) {
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (ch === ' ' && !inQuote) {
      if (cur) tokens.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);

  for (const tok of tokens) {
    const neg = tok.startsWith('-');
    const body = neg ? tok.slice(1) : tok;
    const m = body.match(/^([\w.-]+):(.+)$/);
    if (m) {
      let value = m[2];
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      if (neg) _exclude[m[1]] = value;
      else _props[m[1]] = value;
    } else {
      if (neg) continue; // `-foo` sem `:` é ignorado por enquanto
      let bare = body;
      if (bare.startsWith('"') && bare.endsWith('"')) bare = bare.slice(1, -1);
      _q.push(bare);
    }
  }

  return { _q: _q.join(' '), _props, _exclude };
}

function ExplorationSearch({ config, bindings, setBinding, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const target = cfg.target ?? '';
  const debounceMs = 250;
  const [raw, setRaw] = React.useState('');
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hidrata do binding existente (back-format pra string)
  React.useEffect(() => {
    if (!target) return;
    const v = bindings[target];
    if (!v || typeof v !== 'object') {
      setRaw('');
      return;
    }
    const q = v as ExplorationQuery;
    const parts: string[] = [];
    if (q._q) parts.push(q._q);
    for (const [k, val] of Object.entries(q._props ?? {})) {
      parts.push(`${k}:${val.includes(' ') ? `"${val}"` : val}`);
    }
    for (const [k, val] of Object.entries(q._exclude ?? {})) {
      parts.push(`-${k}:${val.includes(' ') ? `"${val}"` : val}`);
    }
    setRaw(parts.join(' '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const apply = (next: string) => {
    if (!target) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const parsed = parseExplorationQuery(next);
      setBinding(target, parsed);
      emit?.('value_change', { value: parsed, target });
    }, debounceMs);
  };

  const onChange = (next: string) => {
    setRaw(next);
    apply(next);
  };

  const clear = () => {
    setRaw('');
    if (target) {
      setBinding(target, { _q: '', _props: {}, _exclude: {} });
      emit?.('value_change', { value: { _q: '', _props: {}, _exclude: {} }, target });
    }
  };

  if (!target) {
    return (
      <div className="bg-white border border-border-light p-2 text-[11px] text-muted-on-light italic">
        Configure `target` (variable) no Inspetor.
      </div>
    );
  }

  const parsed = React.useMemo(() => parseExplorationQuery(raw), [raw]);
  const hasFilters =
    Object.keys(parsed._props).length > 0 || Object.keys(parsed._exclude).length > 0;
  const fields: string[] = Array.isArray(cfg.fields)
    ? cfg.fields
    : typeof cfg.fields === 'string'
      ? (cfg.fields as string).split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  return (
    <div className="bg-white border border-border-light flex flex-col" data-testid="exploration-search">
      {cfg.label && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono">
            {cfg.label}
          </p>
        </header>
      )}
      <div className="p-2 flex flex-col gap-1.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light pointer-events-none" strokeWidth={1.5} />
          <input
            type="text"
            value={raw}
            onChange={(e) => onChange(e.target.value)}
            placeholder={cfg.placeholder ?? 'nome:Maria status:ativo -arquivado:true'}
            list={fields.length > 0 ? `expl-fields-${target}` : undefined}
            data-testid={`exploration-search-${target}`}
            className="w-full h-8 pl-7 pr-7 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary font-mono"
          />
          {raw && (
            <button
              type="button"
              onClick={clear}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-danger"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
            </button>
          )}
          {fields.length > 0 && (
            <datalist id={`expl-fields-${target}`}>
              {fields.map((f) => (
                <option key={f} value={`${f}:`} />
              ))}
            </datalist>
          )}
        </div>
        {cfg.show_chips !== false && hasFilters && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(parsed._props).map(([k, v]) => (
              <span
                key={`p-${k}`}
                className="h-5 px-1.5 text-[10px] font-mono bg-primary/10 text-primary border border-primary/30 flex items-center gap-1"
              >
                {k}: <strong className="font-semibold">{v}</strong>
              </span>
            ))}
            {Object.entries(parsed._exclude).map(([k, v]) => (
              <span
                key={`e-${k}`}
                className="h-5 px-1.5 text-[10px] font-mono bg-danger/10 text-danger border border-danger/30 flex items-center gap-1"
              >
                NOT {k}: <strong className="font-semibold">{v}</strong>
              </span>
            ))}
          </div>
        )}
        {parsed._q && (
          <p className={cn('text-[10px] font-mono text-muted-on-light truncate', cfg.show_chips === false && 'mt-0')}>
            full-text: <span className="text-text-on-light">{parsed._q}</span>
          </p>
        )}
      </div>
    </div>
  );
}

registerWidget('exploration_search', ExplorationSearch, {
  group: 'data',
  label: 'Exploration search (estruturada)',
  description:
    'Search bar com syntax `key:value` + negação `-key:value` + bare words = full-text. Output {_q, _props, _exclude} pra widgets a jusante.',
  icon: 'search',
  defaultColSpan: 10,
  mockConfig: {
    target: 'q',
    label: 'Filtrar',
    fields: ['nome', 'cpf', 'partido', 'uf', 'status'],
    placeholder: 'nome:Maria uf:SP -arquivado:true',
    show_chips: true,
  },
  mockVariables: {},
  previewWidth: 420,
  previewHeight: 120,
  config_schema: [
    { name: 'label', label: 'Rótulo', field: 'string' },
    { name: 'target', label: 'Variable destino', field: 'variable-ref' },
    { name: 'placeholder', label: 'Placeholder', field: 'string' },
    {
      name: 'fields',
      label: 'Fields conhecidos (CSV)',
      description: 'Sugestões no autocomplete. Ex: nome,cpf,uf.',
      field: 'string',
      placeholder: 'nome,cpf,uf,status',
    },
    {
      name: 'show_chips',
      label: 'Mostrar chips dos filtros',
      field: 'boolean',
      default: true,
    },
  ],
});
