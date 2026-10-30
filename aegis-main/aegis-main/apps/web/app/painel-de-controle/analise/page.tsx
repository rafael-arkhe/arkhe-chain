'use client';

/**
 * Análise — hub que consolida as ferramentas de análise sobre Object Sets
 * (Fase 1 da consolidação de IA). Um header único + segmentado:
 *   - Panorama (Fácil, default): escolhe um tipo → total + distribuição
 *     automática + atalho p/ séries. Zero montagem de card.
 *   - Distribuições (Avançado): workspace do Quiver embutido.
 *   - Séries (Avançado): workspace de Time Series embutido.
 *
 * Tira "Quiver · Análise" e "Time Series" da sidenav (2 → 1 "Análise"), sem
 * jargão no topo. Rotas /quiver e /timeseries seguem vivas (deep-link).
 */
import * as React from 'react';
import { LineChart, BarChart3, LayoutGrid, Loader2 } from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { ANALISE_TABS } from '@/components/control-panel/hub-tabs';
import { Ontology, type OntologyNodeType, type ObjectTypeProperty } from '@/lib/api';
import { SeriesChart } from '@/components/charts/series-chart';
import { QuiverWorkspace } from '@/components/analise/quiver-workspace';
import { TimeSeriesWorkspace } from '@/components/analise/time-series-workspace';

const INP = 'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary';
// campos categóricos viáveis p/ uma distribuição automática (Panorama).
const CATEGORICAL = new Set(['text', 'keyword', 'string', 'enum', 'boolean']);

type Tab = 'panorama' | 'dist' | 'series';
const TABS: { value: Tab; label: string; Icon: typeof LayoutGrid }[] = [
  { value: 'panorama', label: 'Panorama', Icon: LayoutGrid },
  { value: 'dist', label: 'Distribuições', Icon: BarChart3 },
  { value: 'series', label: 'Séries', Icon: LineChart },
];

export default function AnalisePage() {
  return (
    <RequirePerm perm="ontology.objects.read">
      <Hub />
    </RequirePerm>
  );
}

function Hub() {
  const [tab, setTab] = React.useState<Tab>('panorama');
  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col">
      <CpHubSubnav group="Análise" tabs={ANALISE_TABS} />
      <header className="h-12 px-4 border-b border-border-light flex items-center gap-3 shrink-0">
        <h1 className="text-[13px] font-semibold text-text-on-light">Análise</h1>
        <div className="flex items-center gap-1" role="group" aria-label="Modo de análise">
          {TABS.map(({ value, label, Icon }) => (
            <button key={value} type="button" data-testid={`an-tab-${value}`} onClick={() => setTab(value)} aria-pressed={tab === value}
              className={'h-7 px-2.5 text-[11px] border flex items-center gap-1.5 ' + (tab === value ? 'border-primary text-primary bg-primary/5' : 'border-border-light bg-white hover:border-primary')}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-on-light">
          {tab === 'panorama' ? 'Visão rápida de um tipo — total e distribuição automáticas.'
            : tab === 'dist' ? 'Métricas, distribuições e filtros sob medida (avançado).'
            : 'Séries temporais — agregação no tempo e série por instância (avançado).'}
        </span>
      </header>
      <div className="flex-1 min-h-0">
        {tab === 'panorama' && <Panorama />}
        {tab === 'dist' && <QuiverWorkspace embedded />}
        {tab === 'series' && <TimeSeriesWorkspace embedded />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Panorama (Fácil) — escolhe um tipo → total + distribuição automática por um  */
/* campo categórico. Reusa o motor de agregação (Onda 14) + SeriesChart.        */
function Panorama() {
  const [types, setTypes] = React.useState<OntologyNodeType[]>([]);
  const [objectType, setObjectType] = React.useState('');
  const [props, setProps] = React.useState<ObjectTypeProperty[]>([]);
  const [field, setField] = React.useState('');
  const [total, setTotal] = React.useState<number | null>(null);
  const [dist, setDist] = React.useState<{ label: string; value: number }[]>([]);
  const [state, setState] = React.useState<'idle' | 'loading' | 'error'>('idle');

  React.useEffect(() => {
    Ontology.listNodeTypes()
      .then((list) => {
        setTypes(list);
        // Abre VIVO: pré-seleciona o tipo mais populado (já temos o count) → total
        // + distribuição renderizam na abertura, sem o operador adivinhar e clicar.
        const top = [...list]
          .filter((t) => (t.count ?? 0) > 0)
          .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
        if (top) setObjectType((cur) => cur || top.name);
      })
      .catch(() => {});
  }, []);

  // tipo → contrato (campos) + total; escolhe automaticamente o 1º campo categórico.
  React.useEffect(() => {
    setProps([]); setField(''); setTotal(null); setDist([]);
    if (!objectType) return;
    Ontology.objectTypeSchema(objectType)
      .then((s) => {
        const ps = s.properties || [];
        setProps(ps);
        const firstCat = ps.find((p) => CATEGORICAL.has(p.type));
        if (firstCat) setField(firstCat.key);
      })
      .catch(() => setProps([]));
  }, [objectType]);

  const tsCount = React.useMemo(() => props.filter((p) => p.type === 'timeseries').length, [props]);

  // Headline usa o count AUTORITATIVO do tipo (mesmo nº do dropdown), não o
  // aggregate — alguns node_types têm count mas sem Object Type formal (aggregate
  // devolve 0 / schema 404). Assim o panorama nunca abre mostrando "Total 0".
  const selectedCount = React.useMemo(
    () => types.find((t) => t.name === objectType)?.count ?? null,
    [types, objectType],
  );

  // total + distribuição por campo escolhido (auto), via o motor da Onda 14.
  React.useEffect(() => {
    if (!objectType) return;
    let cancelled = false;
    setState('loading');
    const totalP = Ontology.aggregateObjectSet(objectType, { op: 'count' });
    const distP = field
      ? Ontology.aggregateObjectSet(objectType, { op: 'count', group_by: [`properties.${field}`] })
      : Promise.resolve({ result: [] as unknown });
    Promise.all([totalP, distP]).then(([t, d]) => {
      if (cancelled) return;
      setTotal(typeof t.result === 'number' ? t.result : null);
      const rows = Array.isArray(d.result) ? d.result : [];
      setDist(rows.map((b) => {
        const key = (b as Record<string, unknown>).key as Record<string, unknown> | undefined;
        const label = key ? String(Object.values(key)[0] ?? '—') : '—';
        const value = Number((b as Record<string, unknown>).count ?? 0);
        return { label, value: Number.isFinite(value) ? value : 0 };
      }));
      setState('idle');
    }).catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [objectType, field]);

  return (
    <div className="h-full overflow-y-auto scrollbar-hide p-4" data-testid="an-panorama">
      <div className="max-w-3xl space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-72">
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Tipo de objeto</label>
            <select value={objectType} data-testid="an-type" onChange={(e) => setObjectType(e.target.value)} className={INP}>
              <option value="">— escolher tipo —</option>
              {types.map((t) => <option key={t.name} value={t.name}>{t.label} · {t.count}</option>)}
            </select>
          </div>
          {props.some((p) => CATEGORICAL.has(p.type)) && (
            <div className="w-56">
              <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Distribuir por</label>
              <select value={field} data-testid="an-field" onChange={(e) => setField(e.target.value)} className={INP}>
                {props.filter((p) => CATEGORICAL.has(p.type)).map((p) => <option key={p.key} value={p.key}>{p.label || p.key}</option>)}
              </select>
            </div>
          )}
        </div>

        {!objectType ? (
          <CpEmptyState
            icon={LayoutGrid}
            title="Escolha um tipo para ver o panorama"
            description="Selecione um tipo de objeto acima — o total e a distribuição aparecem automaticamente. Quando a ontologia tiver objetos, o panorama abre já no tipo mais populado."
          />
        ) : state === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-on-light" />
        ) : state === 'error' ? (
          <span className="text-[11px] text-danger">erro ao carregar o panorama.</span>
        ) : (
          <>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="border border-border-light bg-white px-4 py-3" data-testid="an-total">
                <span className="block text-[10px] uppercase tracking-wider text-muted-on-light">Total</span>
                <span className="block text-2xl font-semibold text-text-on-light tabular-nums">{(selectedCount ?? total ?? 0).toLocaleString('pt-BR')}</span>
              </div>
              {tsCount > 0 && (
                <div className="text-[11px] text-muted-on-light">
                  {tsCount} série(s) temporal(is) disponível(is) — abra <span className="text-primary">Séries</span>.
                </div>
              )}
            </div>
            {field && dist.length > 0 ? (
              <div className="border border-border-light bg-white p-3" data-testid="an-dist-chart">
                <p className="text-[11px] font-semibold text-text-on-light mb-2">Distribuição por {props.find((p) => p.key === field)?.label || field}</p>
                <SeriesChart type="bar" series={dist} />
              </div>
            ) : field ? (
              <p className="text-[11px] text-muted-on-light italic">Sem instâncias visíveis para a distribuição.</p>
            ) : (
              <p className="text-[11px] text-muted-on-light italic">O tipo não tem campo categórico para distribuição automática — use Distribuições.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
