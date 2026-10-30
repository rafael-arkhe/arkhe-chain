'use client';

/**
 * Painel de Controle · Atividade dos usuários
 *
 * Sprint H4 (2026-05-22). 2-col layout espelhando
 * `painel-de-controle-research/cp-usage-metrics-platformusage.png`:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Atividade dos usuários                            ⭐     │
 *   │ Compreenda o uso da plataforma na organização.           │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Uso da plataforma │ Uso de recursos                      │
 *   ├──────────────┬───────────────────────────────────────────┤
 *   │ Aggregate by │ Active users count   Group by Day/W/M/Y   │
 *   │ Filter by    │                                           │
 *   │ Interaction  │  Stacked bar chart                        │
 *   │ Date range   │                                           │
 *   └──────────────┴───────────────────────────────────────────┘
 */
import * as React from 'react';
import { Building2, Download, Search } from 'lucide-react';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { ControlPanel, type CPActivity } from '@/lib/api';
import { cn } from '@/lib/cn';

type Tab = 'platform' | 'resource';
type Aggregate = 'app' | 'group' | 'resource';
type Interaction = 'view' | 'modify';
type GroupBy = 'day' | 'week' | 'month' | 'year';

interface DateRangePreset {
  key: string;
  label: string;
  days: number;
}

const PRESETS: DateRangePreset[] = [
  { key: 'past_week', label: 'Última semana', days: 7 },
  { key: 'past_month', label: 'Último mês', days: 30 },
  { key: 'past_3m', label: 'Últimos 3 meses', days: 90 },
  { key: 'past_6m', label: 'Últimos 6 meses', days: 180 },
  { key: 'past_year', label: 'Último ano', days: 365 },
  { key: 'past_2y', label: 'Últimos 2 anos', days: 730 },
];

const SECURITY_APPS = ['workshop', 'agentes', 'ontologia', 'buscar', 'ficha', 'fluxos', 'cameras', 'geo', 'rede', 'explorador', 'relatorios', 'briefings', 'painel-de-controle'];

const GROUP_BY_LABEL: Record<GroupBy, string> = {
  day: 'dia',
  week: 'semana',
  month: 'mês',
  year: 'ano',
};

export default function AtividadePage() {
  const [tab, setTab] = React.useState<Tab>('platform');
  const [aggregate, setAggregate] = React.useState<Aggregate>('app');
  const [interaction, setInteraction] = React.useState<Interaction>('view');
  const [groupBy, setGroupBy] = React.useState<GroupBy>('day');
  const [presetKey, setPresetKey] = React.useState('past_3m');
  const [selectedApps, setSelectedApps] = React.useState<string[]>(SECURITY_APPS.slice(0, 3));
  const [activity, setActivity] = React.useState<CPActivity | null>(null);
  const [resource, setResource] = React.useState<string | null>(null);

  React.useEffect(() => {
    const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[2];
    const to = new Date();
    const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    ControlPanel.activity({
      tab,
      aggregate: aggregate === 'app' ? 'app' : aggregate,
      interaction,
      group_by: groupBy,
      from: fmt(from),
      to: fmt(to),
    })
      .then(setActivity)
      .catch(() => setActivity(null));
  }, [tab, aggregate, interaction, groupBy, presetKey]);

  // Sprint H1.9: auto-select primeiro recurso quando trocar pra tab
  // resource e o response trouxer apps. Sem isso, o operador caía num
  // empty state confuso ("Selecione um recurso") mesmo com dados ok.
  React.useEffect(() => {
    if (tab !== 'resource') return;
    const apps = activity?.applications ?? [];
    if (!apps.length) return;
    if (resource && apps.includes(resource)) return;
    setResource(apps[0]);
  }, [tab, activity, resource]);

  const series = activity?.series ?? [];
  const filtered = series.filter((s) =>
    tab === 'resource' ? s.application_key === resource : selectedApps.includes(s.application_key),
  );

  return (
    <div className="flex flex-col h-full">
      <CpPageHeader
        title="Atividade dos usuários"
        subtitle="Compreenda o uso da plataforma na sua organização."
        actions={
          <button
            type="button"
            data-testid="cp-atividade-export"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
            Exportar CSV
          </button>
        }
      />

      <div className="px-6 pt-3 border-b border-border-light bg-white">
        <nav role="tablist" className="flex gap-5">
          <Tab label="Uso da plataforma" active={tab === 'platform'} onClick={() => setTab('platform')} testId="cp-atividade-tab-platform" />
          <Tab label="Uso de recursos" active={tab === 'resource'} onClick={() => setTab('resource')} testId="cp-atividade-tab-resource" />
        </nav>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <aside data-testid="cp-atividade-filters" className="w-[300px] shrink-0 bg-white border-r border-border-light overflow-y-auto">
          <FilterCard title="Agrupar por">
            <RadioRow
              checked={tab === 'platform' ? aggregate === 'app' : aggregate === 'resource'}
              label={tab === 'platform' ? 'Aplicação' : 'Recurso'}
              onChange={() => setAggregate(tab === 'platform' ? 'app' : 'resource')}
              testId="cp-atividade-agg-app"
            />
            <RadioRow
              checked={aggregate === 'group'}
              label="Grupo de usuários"
              onChange={() => setAggregate('group')}
              testId="cp-atividade-agg-group"
            />
          </FilterCard>

          <FilterCard title="Filtrar por">
            {tab === 'platform' ? (
              <>
                <p className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">Aplicações</p>
                <div className="relative my-1.5">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light" strokeWidth={1.5} />
                  <input
                    type="text"
                    placeholder="Buscar aplicações"
                    className="w-full h-7 pl-7 pr-2 text-[11.5px] bg-canvas-light border border-border-light"
                  />
                </div>
                <ul data-testid="cp-atividade-apps-list" className="space-y-1">
                  {SECURITY_APPS.map((app) => (
                    <li key={app}>
                      <label className="flex items-center gap-2 text-[12px] text-text-on-light cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedApps.includes(app)}
                          onChange={(e) =>
                            setSelectedApps((prev) =>
                              e.target.checked ? [...prev, app] : prev.filter((x) => x !== app),
                            )
                          }
                          data-testid={`cp-atividade-app-${app}`}
                          className="w-3.5 h-3.5"
                        />
                        <span>{app}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ResourceSelector
                resource={resource}
                setResource={setResource}
                applications={activity?.applications ?? []}
              />
            )}
          </FilterCard>

          <FilterCard title="Tipo de interação">
            <div className="flex h-7 bg-canvas-light border border-border-light">
              <button
                type="button"
                onClick={() => setInteraction('view')}
                data-testid="cp-atividade-interaction-view"
                className={cn(
                  'flex-1 text-[11.5px] font-medium',
                  interaction === 'view'
                    ? 'bg-primary text-white'
                    : 'text-text-on-light hover:bg-white',
                )}
              >
                Visualizar
              </button>
              <button
                type="button"
                onClick={() => setInteraction('modify')}
                data-testid="cp-atividade-interaction-modify"
                className={cn(
                  'flex-1 text-[11.5px] font-medium',
                  interaction === 'modify'
                    ? 'bg-primary text-white'
                    : 'text-text-on-light hover:bg-white',
                )}
              >
                Modificar
              </button>
            </div>
          </FilterCard>

          <FilterCard title="Período">
            <select
              value={presetKey}
              onChange={(e) => setPresetKey(e.target.value)}
              data-testid="cp-atividade-period"
              className="w-full h-7 px-2 text-[12px] bg-white border border-border-light"
            >
              {PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            {activity && (
              <p className="mt-1.5 text-[10.5px] text-muted-on-light font-mono">
                {activity.range_from} → {activity.range_to}
              </p>
            )}
          </FilterCard>
        </aside>

        <main className="flex-1 overflow-y-auto p-6 bg-canvas-light">
          <section className="bg-white border border-border-light">
            <header className="px-4 py-3 border-b border-border-light flex items-center gap-3">
              <h2 className="flex-1 text-[14px] font-semibold text-text-on-light">
                {tab === 'platform'
                  ? interaction === 'view'
                    ? `Usuários ativos por ${GROUP_BY_LABEL[groupBy]}`
                    : `Modificações por ${GROUP_BY_LABEL[groupBy]}`
                  : `Visualizações únicas por ${GROUP_BY_LABEL[groupBy]}`}
              </h2>
              <GroupByPicker value={groupBy} onChange={setGroupBy} />
            </header>
            <div className="px-4 py-4">
              {tab === 'resource' && !resource ? (
                <EmptyResourceState />
              ) : filtered.length === 0 ? (
                <p data-testid="cp-atividade-empty" className="py-16 text-center text-[12px] text-muted-on-light italic">
                  Sem dados nesse intervalo. As métricas são agregadas diariamente.
                </p>
              ) : (
                <StackedBarChart series={filtered} interaction={interaction} apps={tab === 'platform' ? selectedApps : [resource ?? '']} groupBy={groupBy} />
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Tab({
  label,
  active,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'pb-2 text-[13px] font-medium border-b-2 -mb-px',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-on-light hover:text-text-on-light',
      )}
    >
      {label}
    </button>
  );
}

function FilterCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-3.5 py-3 border-b border-border-light">
      <h3 className="text-[12px] font-semibold text-text-on-light mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function RadioRow({
  checked,
  label,
  onChange,
  testId,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-text-on-light cursor-pointer">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        data-testid={testId}
        className="w-3.5 h-3.5"
      />
      {label}
    </label>
  );
}

function GroupByPicker({
  value,
  onChange,
}: {
  value: GroupBy;
  onChange: (v: GroupBy) => void;
}) {
  const opts: { key: GroupBy; label: string }[] = [
    { key: 'day', label: 'Dia' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mês' },
    { key: 'year', label: 'Ano' },
  ];
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-on-light">
      <span>Agrupar por</span>
      <div className="flex h-6 bg-canvas-light border border-border-light">
        {opts.map((o) => (
          <button
            key={o.key}
            type="button"
            data-testid={`cp-atividade-groupby-${o.key}`}
            onClick={() => onChange(o.key)}
            className={cn(
              'px-2 text-[11px]',
              value === o.key ? 'bg-primary text-white' : 'text-text-on-light hover:bg-white',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResourceSelector({
  resource,
  setResource,
  applications,
}: {
  resource: string | null;
  setResource: (r: string | null) => void;
  applications: string[];
}) {
  // Sprint H1.9: lista vem do response (apps que têm dados), não mais
  // do SECURITY_APPS hardcoded (que listava 13 mas só 5 tinham série).
  // Fallback pra SECURITY_APPS quando response ainda não chegou (loading).
  const opts = applications.length > 0 ? applications : SECURITY_APPS;
  return (
    <div className="space-y-2">
      <label className="block text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
        Aplicação
      </label>
      <select
        data-testid="cp-atividade-application-select"
        className="w-full h-7 px-2 text-[12px] bg-white border border-border-light"
      >
        <option>Projeto</option>
      </select>
      <label className="block text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
        Recurso
      </label>
      <select
        value={resource ?? ''}
        onChange={(e) => setResource(e.target.value || null)}
        data-testid="cp-atividade-resource-select"
        className="w-full h-7 px-2 text-[12px] bg-white border border-border-light"
      >
        <option value="">Selecione um recurso</option>
        {opts.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyResourceState() {
  return (
    <div className="py-16 text-center" data-testid="cp-atividade-resource-empty">
      <Building2 className="w-10 h-10 text-muted-on-light/30 mx-auto" strokeWidth={1.5} />
      <p className="mt-3 text-[13px] font-medium text-muted-on-light">Selecione um recurso</p>
      <p className="text-[11.5px] text-muted-on-light/80">
        Escolha um recurso na lateral esquerda para visualizar as métricas.
      </p>
    </div>
  );
}

function StackedBarChart({
  series,
  interaction,
  apps,
  groupBy,
}: {
  series: CPActivity['series'];
  interaction: Interaction;
  apps: string[];
  groupBy: GroupBy;
}) {
  // Agrupa por date, depois empilha por application_key.
  const dates = Array.from(new Set(series.map((s) => s.date))).sort();
  const byDate: Record<string, Record<string, number>> = {};
  for (const s of series) {
    if (!byDate[s.date]) byDate[s.date] = {};
    byDate[s.date][s.application_key] = interaction === 'view' ? s.view_count : s.modify_count;
  }
  const max = Math.max(
    1,
    ...dates.map((d) => Object.values(byDate[d] ?? {}).reduce((a, b) => a + b, 0)),
  );
  const COLORS = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444'];

  // Sprint H1.8: Y-axis com 5 ticks (0, max/4, max/2, 3max/4, max).
  // X-axis com 3-4 labels equiespaçados (início, terço, dois-terços, fim).
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(max * p));
  const xLabelIndexes = dates.length <= 4
    ? dates.map((_, i) => i)
    : [0, Math.floor(dates.length / 3), Math.floor((dates.length * 2) / 3), dates.length - 1];
  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };

  // Headline descritivo
  const totalUsers = series.reduce(
    (acc, s) => acc + (interaction === 'view' ? s.view_count : s.modify_count),
    0,
  );
  const uniqueUsers = Math.max(0, ...series.map((s) => s.unique_users ?? 0));

  return (
    <div data-testid="cp-atividade-chart" className="w-full">
      <p className="mb-4 text-[11.5px] text-muted-on-light leading-relaxed">
        Mostrando{' '}
        <span className="font-semibold text-text-on-light">
          {interaction === 'view' ? 'visualizações' : 'modificações'}
        </span>{' '}
        por {GROUP_BY_LABEL[groupBy]} de <strong>{apps.length}</strong>{' '}
        {apps.length === 1 ? 'aplicação selecionada' : 'aplicações selecionadas'}. Total no período:{' '}
        <strong className="text-text-on-light font-mono">
          {totalUsers.toLocaleString('pt-BR')}
        </strong>{' '}
        · pico de usuários únicos:{' '}
        <strong className="text-text-on-light font-mono">{uniqueUsers}</strong>.
      </p>

      <div className="flex">
        {/* Y-axis */}
        <div className="w-10 shrink-0 h-[300px] flex flex-col-reverse justify-between text-[10px] font-mono text-muted-on-light pr-1 text-right">
          {yTicks.map((t) => (
            <span key={t} className="leading-none">
              {t}
            </span>
          ))}
        </div>

        {/* Chart area + gridlines */}
        <div className="flex-1 relative">
          {/* Gridlines */}
          <div className="absolute inset-0 flex flex-col-reverse justify-between pointer-events-none">
            {yTicks.map((t) => (
              <div key={t} className="border-t border-border-light/60 h-0" />
            ))}
          </div>
          {/* Bars */}
          <div className="relative flex items-stretch gap-1 h-[300px] border-b border-l border-border-light pl-1 pb-1 overflow-hidden">
            {dates.map((d) => {
              const stack = byDate[d] ?? {};
              const sum = Object.values(stack).reduce((a, b) => a + b, 0);
              const hPct = (sum / max) * 100;
              return (
                <div
                  key={d}
                  className="flex-1 flex flex-col justify-end items-center min-w-[4px] h-full"
                >
                  <div className="w-full flex flex-col-reverse" style={{ height: `${hPct}%` }}>
                    {apps.map((app, i) => {
                      const v = stack[app] ?? 0;
                      if (!v) return null;
                      const pct = (v / sum) * 100;
                      return (
                        <div
                          key={app}
                          style={{ height: `${pct}%`, background: COLORS[i % COLORS.length] }}
                          title={`${app} · ${d}: ${v}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {/* X-axis labels */}
          <div className="relative flex h-5 mt-1 text-[10px] font-mono text-muted-on-light">
            {dates.map((d, i) => (
              <div key={d} className="flex-1 text-center min-w-[4px]">
                {xLabelIndexes.includes(i) ? fmtDate(d) : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-3 text-[11px]">
        {apps.map((app, i) => (
          <li key={app} className="flex items-center gap-1.5">
            <span className="w-3 h-3 inline-block" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-text-on-light">{app}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
