'use client';

/**
 * Filter Pills (genérico) — Sprint 1 do Workshop parity roadmap.
 *
 * Substitui a faixa hardcoded de fontes do /buscar por um widget
 * reutilizável que pode aparecer em qualquer página/ficha.
 *
 * Config:
 *   - `target` (variable-ref): external_id da variable destino
 *   - `pills`: array `{value, label, group?}` — pills disponíveis
 *   - `multi`: bool — multi-select (default true) ou single-select
 *
 * Output:
 *   - `bindings[target]` = array<string> (multi) ou string (single)
 *
 * Padrão sharp: zero rounded, paleta primary + muted-on-light.
 */
import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { Workshop } from '@/lib/workshop/client';

type PillOption = { value: string; label: string; group?: string };

type Cfg = {
  /** external_id da variable-destino (lê + escreve via bindings). */
  target?: string;
  /** Valor semeado no `target` no mount quando ainda não-setado — evita que object
   *  sets que resolvem ${target} deem UnresolvedBinding/422 na 1ª query (ex.: filtro
   *  de período com default ""=todos). */
  default?: string | string[];
  /** Opções clicáveis. */
  pills?: PillOption[];
  /** true (default) = multi-select; false = single-select. */
  multi?: boolean;
  /** Título acima das pills (opcional). */
  title?: string;
  /**
   * Sprint C1 (Parity Audit): captura como ObjectSetFilter.
   * Quando declarado, paralelo ao binding "raw", também escreve um
   * predicate AST em `bindings[target_filter]` na shape canônica:
   *   { op: 'in', field: <filter_field>, value: [...selected] }
   * Isso permite usar o output direto como `kind=objectSet.filter`
   * server-side em queries downstream.
   */
  target_filter?: string;
  /** Property name usado no predicate (ex.: "uf", "status"). */
  filter_field?: string;
  /** Filtro AO VIVO: popula as pills com os valores DISTINTOS de `field` do
   *  ObjectSet `distinct_variable` (ou `distinct_object_type`). */
  field?: string;
  distinct_variable?: string;
  distinct_object_type?: string;
};

function FilterPills({ appId, config, bindings, setBinding, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const target = cfg.target ?? '';
  const staticPills = cfg.pills ?? [];
  const [fetched, setFetched] = React.useState<PillOption[]>([]);
  const wantsLive = !!cfg.field && !!(cfg.distinct_variable || cfg.distinct_object_type) && staticPills.length === 0;
  React.useEffect(() => {
    if (!wantsLive || !appId) return;
    let cancel = false;
    Workshop.distinctObjectSet(appId, {
      variable: cfg.distinct_variable,
      object_type: cfg.distinct_object_type,
      field: cfg.field as string,
    })
      .then((res) => { if (!cancel) setFetched((res.values || []).map((v) => ({ value: v, label: v }))); })
      .catch(() => { if (!cancel) setFetched([]); });
    return () => { cancel = true; };
  }, [appId, wantsLive, cfg.field, cfg.distinct_variable, cfg.distinct_object_type]);
  // Semeia o default no mount quando o target ainda não foi setado — assim os object
  // sets que resolvem ${target} não dão 422 na 1ª query (antes de qualquer clique).
  React.useEffect(() => {
    if (target && cfg.default !== undefined && bindings[target] === undefined) {
      setBinding(target, cfg.default);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const pills = staticPills.length > 0 ? staticPills : fetched;
  const multi = cfg.multi !== false;

  // Estado atual lido da variable destino.
  const raw = target ? bindings[target] : undefined;
  const selected: string[] = React.useMemo(() => {
    if (multi) {
      if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
      if (typeof raw === 'string') return [raw];
      return [];
    }
    return typeof raw === 'string' ? [raw] : [];
  }, [raw, multi]);

  const toggle = (value: string) => {
    if (!target) return;
    let nextValue: unknown;
    if (multi) {
      nextValue = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
    } else {
      nextValue = selected[0] === value ? '' : value;
    }
    setBinding(target, nextValue);
    // Sprint C1: captura paralela como ObjectSetFilter predicate AST.
    if (cfg.target_filter && cfg.filter_field) {
      const values = Array.isArray(nextValue) ? nextValue : nextValue ? [nextValue] : [];
      const predicate = values.length > 0
        ? { op: 'in' as const, field: cfg.filter_field, value: values }
        : null;
      setBinding(cfg.target_filter, predicate);
    }
    // Sprint 2: emite value_change pra eventos declarativos reagirem.
    emit?.('value_change', { value: nextValue, target });
  };

  const clearAll = () => {
    if (!target) return;
    setBinding(target, multi ? [] : '');
  };

  // Configurado = tem target E uma FONTE de valores (pills estáticas OU distinct ao vivo).
  const configured = !!target && (staticPills.length > 0 || wantsLive);

  if (!configured) {
    // Não-configurado: hint útil só no EDITOR (o gerador remove filtros não-fiados do
    // app do operador). Nunca aparece num filtro já fiado em runtime.
    return (
      <div className="bg-white border border-border-light p-2 text-[11px] text-muted-on-light italic">
        Configure `target` (variable) e `pills` no Inspetor.
      </div>
    );
  }

  if (pills.length === 0) {
    // CONFIGURADO mas sem valores (sem dado ainda / carregando) — estado NEUTRO, nunca
    // instrução de dev vazando pro operador. O filtro ganha pills quando o dado chega.
    return (
      <div
        className="bg-white border border-border-light p-2 flex flex-col gap-1.5"
        data-testid="filter-pills-empty"
      >
        {cfg.title && (
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono">
            {cfg.title}
          </p>
        )}
        <span className="text-[11px] text-muted-on-light italic">— sem valores para filtrar —</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light p-2 flex flex-col gap-1.5">
      {cfg.title && (
        <div className="flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono flex-1">
            {cfg.title}
          </p>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] font-mono text-muted-on-light hover:text-danger flex items-center gap-1"
              title="Limpar seleção"
            >
              <X className="w-3 h-3" strokeWidth={1.5} /> limpar
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filtros">
        {pills.map((p) => {
          const isActive = selected.includes(p.value);
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => toggle(p.value)}
              aria-pressed={isActive}
              data-testid={`filter-pill-${p.value}`}
              className={cn(
                'h-7 px-2 text-[11px] border transition-colors flex items-center gap-1.5',
                isActive
                  ? 'bg-primary text-white border-primary'
                  : 'bg-canvas-light text-muted-on-light border-border-light hover:border-primary hover:text-text-on-light',
              )}
              title={p.group ? `${p.group} · ${p.label}` : p.label}
            >
              {isActive && <Check className="w-3 h-3" strokeWidth={2} />}
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mock                                                                       */
/* -------------------------------------------------------------------------- */
const MOCK_PILLS: PillOption[] = [
  { value: 'critica', label: 'Crítica' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Média' },
  { value: 'baixa', label: 'Baixa' },
];

registerWidget('filter_pills', FilterPills, {
  group: 'data',
  label: 'Filtro · pills',
  description:
    'Faixa horizontal de etiquetas clicáveis pra filtrar a tela — aceita uma ou várias seleções ativas.',
  icon: 'list-filter',
  defaultColSpan: 10,
  mockConfig: {
    title: 'Gravidade',
    target: 'gravidade',
    pills: MOCK_PILLS,
    multi: true,
  },
  mockVariables: {},
  previewWidth: 320,
  config_schema: [
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho acima das pills (opcional).',
      field: 'string',
      placeholder: 'ex.: Gravidade',
    },
    {
      name: 'target',
      label: 'Dado destino',
      description:
        'ID do dado onde a seleção será gravada (lista quando múltipla, texto único quando exclusiva).',
      field: 'variable-ref',
    },
    {
      name: 'multi',
      label: 'Permitir múltiplas seleções',
      description: 'Quando ligado, várias pills podem ficar ativas ao mesmo tempo.',
      field: 'boolean',
      default: true,
    },
    {
      name: 'pills',
      label: 'Opções',
      description: 'Cada opção tem um valor, um rótulo e um grupo opcional.',
      field: 'option-list',
      itemShape: 'pills',
    },
    {
      name: 'target_filter',
      label: 'Filtro de busca (opcional)',
      description:
        'ID de um dado do tipo "Filtro de busca". Quando preenchido, gera um predicate AST que outras buscas podem consumir server-side.',
      field: 'variable-ref',
    },
    {
      name: 'filter_field',
      label: 'Campo do filtro',
      description: 'Nome da propriedade usada no predicate (ex.: uf, status, gravidade).',
      field: 'string',
      placeholder: 'ex.: uf',
    },
  ],
});
