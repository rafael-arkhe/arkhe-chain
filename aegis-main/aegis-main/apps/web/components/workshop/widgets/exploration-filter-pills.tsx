'use client';

/**
 * Exploration Filter Pills — Wave G.3 (2026-05-23).
 *
 * Variante do `filter_pills` com ênfase em EXPLORAÇÃO multi-grupo —
 * pesquisa R2 `slate/widgets/exploration-search.md` + `control.md`.
 *
 * Diferenças vs. `filter_pills` (mantido por compat):
 *   - Aceita `pills` agrupadas por `group` e renderiza cada grupo
 *     numa linha rotulada (ex.: "Severidade", "Status", "UF").
 *   - Emite evento `painel.filter.changed` sempre que a seleção muda,
 *     com payload `{ active, by_group, target }`.
 *   - Output dual: `bindings[target]` (lista flat) + opcionalmente
 *     `bindings[target_by_group]` (mapa group → []).
 */
import * as React from 'react';
import { Check, X, ListFilter } from 'lucide-react';

import { cn } from '@/lib/cn';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { Workshop } from '@/lib/workshop/client';

type PillOption = { value: string; label: string; group?: string };

type Cfg = {
  target?: string;
  target_by_group?: string;
  pills?: PillOption[];
  multi?: boolean;
  title?: string;
  /** Pills AO VIVO: valores distintos de `field` do ObjectSet `distinct_variable`. */
  field?: string;
  distinct_variable?: string;
  distinct_object_type?: string;
};

function groupPills(pills: PillOption[]): Map<string, PillOption[]> {
  const map = new Map<string, PillOption[]>();
  for (const p of pills) {
    const k = (p.group ?? '').trim() || 'Filtros';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  return map;
}

function ExplorationFilterPills({
  appId,
  config,
  bindings,
  setBinding,
  emit,
}: WidgetRenderProps) {
  const cfg = config as Cfg;
  const target = cfg.target ?? '';
  const staticPills = cfg.pills ?? [];
  const [fetched, setFetched] = React.useState<PillOption[]>([]);
  const wantsLive = !!cfg.field && !!(cfg.distinct_variable || cfg.distinct_object_type) && staticPills.length === 0;
  React.useEffect(() => {
    if (!wantsLive || !appId) return;
    let cancel = false;
    Workshop.distinctObjectSet(appId, {
      variable: cfg.distinct_variable, object_type: cfg.distinct_object_type, field: cfg.field as string,
    })
      .then((res) => { if (!cancel) setFetched((res.values || []).map((v) => ({ value: v, label: v }))); })
      .catch(() => { if (!cancel) setFetched([]); });
    return () => { cancel = true; };
  }, [appId, wantsLive, cfg.field, cfg.distinct_variable, cfg.distinct_object_type]);
  const pills = staticPills.length > 0 ? staticPills : fetched;
  const multi = cfg.multi !== false;
  const grouped = React.useMemo(() => groupPills(pills), [pills]);

  const raw = target ? bindings[target] : undefined;
  const active: string[] = React.useMemo(() => {
    if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
    if (typeof raw === 'string') return raw ? [raw] : [];
    return [];
  }, [raw]);

  const emitChange = React.useCallback(
    (next: string[]) => {
      // Map por grupo
      const byGroup: Record<string, string[]> = {};
      for (const p of pills) {
        if (!next.includes(p.value)) continue;
        const g = (p.group ?? '').trim() || 'Filtros';
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(p.value);
      }
      if (cfg.target_by_group) setBinding(cfg.target_by_group, byGroup);
      emit?.('painel.filter.changed', { active: next, by_group: byGroup, target });
    },
    [pills, cfg.target_by_group, setBinding, emit, target],
  );

  const toggle = (value: string) => {
    if (!target) return;
    let next: string[];
    if (multi) {
      next = active.includes(value)
        ? active.filter((v) => v !== value)
        : [...active, value];
    } else {
      next = active[0] === value ? [] : [value];
    }
    setBinding(target, multi ? next : (next[0] ?? ''));
    emitChange(next);
  };

  const clearAll = () => {
    if (!target) return;
    setBinding(target, multi ? [] : '');
    emitChange([]);
  };

  const configured = !!target && (staticPills.length > 0 || wantsLive);

  if (!configured) {
    // Não-configurado: hint só útil no EDITOR (o gerador não deixa filtro não-fiado
    // no app do operador). Nunca aparece num filtro já fiado em runtime.
    return (
      <div
        className="bg-white border border-border-light p-2 text-caption text-muted-on-light italic"
        data-testid="exploration-filter-pills-unconfigured"
      >
        Configure `target` e `pills` no Inspetor.
      </div>
    );
  }

  if (pills.length === 0) {
    // CONFIGURADO mas sem valores (sem dado / carregando) — estado NEUTRO, nunca
    // instrução de dev vazando pro operador.
    return (
      <div
        className="bg-white border border-border-light p-2 flex flex-col gap-1.5"
        data-testid="exploration-filter-pills-empty"
      >
        {cfg.title && (
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono">
            {cfg.title}
          </p>
        )}
        <span className="text-caption text-muted-on-light italic">— sem valores para filtrar —</span>
      </div>
    );
  }

  return (
    <div
      className="bg-white border border-border-light p-2 flex flex-col gap-2"
      data-testid="exploration-filter-pills-widget"
    >
      <header className="flex items-center gap-2">
        <ListFilter className="w-3 h-3 text-primary" strokeWidth={1.5} />
        <p className="text-caption uppercase tracking-[0.16em] font-semibold font-mono flex-1">
          {cfg.title ?? 'Filtros'}
        </p>
        {active.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            data-testid="exploration-filter-pills-clear"
            aria-label="Limpar seleção"
            className="text-caption font-mono text-muted-on-light hover:text-danger flex items-center gap-1"
          >
            <X className="w-3 h-3" strokeWidth={1.5} /> limpar
          </button>
        )}
      </header>

      <div className="flex flex-col gap-1.5">
        {[...grouped.entries()].map(([groupName, items]) => (
          <section
            key={groupName}
            data-testid={`exploration-filter-pills-group-${groupName}`}
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={groupName}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono w-[88px] shrink-0">
              {groupName}
            </p>
            <div className="flex flex-wrap gap-1">
              {items.map((p) => {
                const isActive = active.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => toggle(p.value)}
                    aria-pressed={isActive}
                    data-testid={`exploration-filter-pill-${p.value}`}
                    className={cn(
                      'h-6 px-2 text-caption border transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-primary',
                      isActive
                        ? 'bg-primary text-white border-primary'
                        : 'bg-canvas-light text-muted-on-light border-border-light hover:border-primary hover:text-text-on-light',
                    )}
                  >
                    {isActive && <Check className="w-3 h-3" strokeWidth={2} />}
                    {p.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mock                                                                       */
/* -------------------------------------------------------------------------- */

const MOCK_PILLS: PillOption[] = [
  { value: 'critica', label: 'Crítica', group: 'Severidade' },
  { value: 'alta', label: 'Alta', group: 'Severidade' },
  { value: 'media', label: 'Média', group: 'Severidade' },
  { value: 'aberta', label: 'Aberta', group: 'Status' },
  { value: 'em-analise', label: 'Em análise', group: 'Status' },
  { value: 'sp', label: 'SP', group: 'UF' },
  { value: 'rj', label: 'RJ', group: 'UF' },
  { value: 'mg', label: 'MG', group: 'UF' },
];

registerWidget('exploration_filter_pills', ExplorationFilterPills, {
  group: 'data',
  label: 'Filtros de exploração',
  description:
    'Faixa de etiquetas multi-grupo. Cada grupo aparece em uma linha rotulada e emite o evento "painel.filter.changed" no toggle.',
  icon: 'list-filter',
  defaultColSpan: 12,
  mockConfig: {
    title: 'Explorar incidentes',
    target: 'filtros',
    target_by_group: 'filtros_por_grupo',
    pills: MOCK_PILLS,
    multi: true,
  } satisfies Cfg,
  mockVariables: {},
  previewWidth: 460,
  previewHeight: 180,
  config_schema: [
    {
      name: 'title',
      label: 'Título',
      field: 'string',
      placeholder: 'ex.: Explorar incidentes',
    },
    {
      name: 'target',
      label: 'Dado destino (lista plana)',
      description: 'Variável onde a seleção combinada de todos os grupos é gravada.',
      field: 'variable-ref',
    },
    {
      name: 'target_by_group',
      label: 'Dado destino agrupado (opcional)',
      description: 'Variável que recebe um mapa { grupo: [valores] }.',
      field: 'variable-ref',
    },
    {
      name: 'multi',
      label: 'Permitir múltiplas seleções',
      field: 'boolean',
      default: true,
    },
    {
      name: 'pills',
      label: 'Opções',
      description: 'Cada opção tem um valor, um rótulo e um grupo (define a linha onde aparece).',
      field: 'option-list',
      itemShape: 'pills',
    },
  ],
});

export { ExplorationFilterPills };
