'use client';

/**
 * Time Series — charts salvos de contagem ao longo do tempo. Cada chart
 * bucketiza as instâncias de um Object Type pela data de criação (dia/hora),
 * ABAC-filtrado, e roda AO VIVO contra a ontologia. Reusa o SeriesChart
 * (Onda 19) p/ a linha/barras. Espelha /platform/v23/timeseries.
 *
 * 2-pane: lista de charts (esq) · criação + render do selecionado (dir).
 * Estética sharp.
 */
import * as React from 'react';
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle2, LineChart, BarChart3, Clock } from 'lucide-react';

import { TimeSeries, Ontology, type TimeSeriesChart, type TimeSeriesRender, type OntologyNodeType } from '@/lib/api';
import { SeriesChart, MultiSeriesChart, type SeriesChartType, type NamedSeries } from '@/components/charts/series-chart';

const INP = 'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary';
const BUCKETS = [{ value: 'day', label: 'Por dia' }, { value: 'hour', label: 'Por hora' }];

// Transformações de série (funções puras sobre os pontos — Foundry-style).
const TS_TRANSFORMS = [
  { value: 'raw', label: 'Bruto' },
  { value: 'cumulative', label: 'Acumulado' },
  { value: 'moving_avg', label: 'Média móvel (3)' },
  { value: 'delta', label: 'Variação (Δ)' },
] as const;
type TsTransform = (typeof TS_TRANSFORMS)[number]['value'];

function applyTransform(pts: { label: string; value: number }[], t: TsTransform): { label: string; value: number }[] {
  if (t === 'raw' || pts.length === 0) return pts;
  if (t === 'cumulative') {
    let acc = 0;
    return pts.map((p) => ({ label: p.label, value: (acc += p.value) }));
  }
  if (t === 'delta') {
    return pts.map((p, i) => ({ label: p.label, value: i === 0 ? 0 : p.value - pts[i - 1].value }));
  }
  // moving_avg (janela 3)
  const w = 3;
  return pts.map((p, i) => {
    const slice = pts.slice(Math.max(0, i - w + 1), i + 1);
    const avg = slice.reduce((a, s) => a + s.value, 0) / slice.length;
    return { label: p.label, value: Math.round(avg * 100) / 100 };
  });
}

// Workspace exportado p/ embutir no hub Análise (Fase 1). `embedded` → altura
// fluida + esconde o título-ferramenta (o hub dá o nome); o seletor de modo fica.
export function TimeSeriesWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [list, setList] = React.useState<TimeSeriesChart[]>([]);
  const [types, setTypes] = React.useState<OntologyNodeType[]>([]);
  const [sel, setSel] = React.useState<TimeSeriesChart | null>(null);
  const [mode, setMode] = React.useState<'agg' | 'visor'>('agg');
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const reload = React.useCallback(() => { TimeSeries.list().then(setList).catch(() => setList([])); }, []);
  React.useEffect(() => { reload(); Ontology.listNodeTypes().then(setTypes).catch(() => {}); }, [reload]);

  async function remove(id: string) {
    try { await TimeSeries.remove(id); if (sel?.id === id) setSel(null); setMsg({ ok: true, text: 'Chart removido.' }); reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha.' }); }
  }

  return (
    <div className={(embedded ? 'h-full' : 'h-[calc(100vh-3rem)]') + ' flex flex-col'}>
      <header className="h-12 px-4 border-b border-border-light flex items-center gap-3 shrink-0">
        {!embedded && <Clock className="w-4 h-4 text-primary" />}
        {!embedded && <h1 className="text-[13px] font-semibold text-text-on-light">Time Series</h1>}
        <div className="flex items-center gap-1" role="group" aria-label="Modo">
          {([['agg', 'Agregação'], ['visor', 'Por instância']] as const).map(([m, label]) => (
            <button key={m} type="button" data-testid={`ts-mode-${m}`} onClick={() => setMode(m)} aria-pressed={mode === m}
              className={'h-6 px-2 text-[10px] border ' + (mode === m ? 'border-primary text-primary bg-primary/5' : 'border-border-light bg-white hover:border-primary')}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-on-light">{mode === 'agg' ? 'Contagem de instâncias ao longo do tempo, por tipo.' : 'Série [{t,v}] de uma propriedade de uma instância (multi-série).'}</span>
        {msg && (
          <span className={'ml-auto flex items-center gap-1.5 text-[11px] ' + (msg.ok ? 'text-success' : 'text-danger')} role="status" data-testid="ts-msg">
            {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}{msg.text}
          </span>
        )}
      </header>

      {mode === 'visor' ? <PropertyVisor types={types} /> : (
      <div className="flex-1 flex min-h-0">
        <aside className="w-64 border-r border-border-light flex flex-col shrink-0">
          <div className="h-9 px-3 border-b border-border-light flex items-center">
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light">Charts salvos</span>
          </div>
          <ul className="flex-1 overflow-y-auto scrollbar-hide" data-testid="ts-list">
            {list.length === 0 && <li className="px-3 py-3 text-[11px] text-muted-on-light italic">Nenhum chart. Crie um ao lado.</li>}
            {list.map((c) => (
              <li key={c.id} className="flex items-center border-b border-border-light/60">
                <button type="button" onClick={() => setSel(c)} data-testid={`ts-item-${c.slug}`}
                  className={'flex-1 text-left px-3 py-2 ' + (sel?.id === c.id ? 'bg-primary/5 text-primary' : 'hover:bg-canvas-light')}>
                  <span className="block truncate text-[11px] font-medium">{c.display_name}</span>
                  <span className="block text-[10px] text-muted-on-light">
                    {types.find((t) => t.name === c.node_type)?.label || c.node_type}
                    {' · '}
                    {BUCKETS.find((b) => b.value === String(c.config?.bucket || 'day'))?.label || 'Por dia'}
                  </span>
                </button>
                <button type="button" onClick={() => remove(c.id)} aria-label="Remover chart" data-testid={`ts-del-${c.slug}`} className="px-2 text-muted-on-light hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex-1 overflow-y-auto scrollbar-hide p-4 min-w-0 space-y-5">
          <CreateChart types={types} onCreated={(c) => { setMsg({ ok: true, text: 'Chart criado.' }); reload(); setSel(c); }} onErr={(t) => setMsg({ ok: false, text: t })} />
          {sel && <ChartRender chart={sel} />}
        </main>
      </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PropertyVisor (Onda 25) — visor da propriedade `timeseries` de uma          */
/* instância: tipo → instância → propriedade(s) timeseries → série [{t,v}] via */
/* a query TSDB-grade (janela + downsample). MULTI-SÉRIE (Slate): sobrepõe     */
/* várias propriedades + transformações (bruto/acum/média/Δ).                  */
function PropertyVisor({ types }: { types: OntologyNodeType[] }) {
  const [nodeType, setNodeType] = React.useState('');
  const [nodes, setNodes] = React.useState<{ id: string; name: string }[]>([]);
  const [nodeId, setNodeId] = React.useState('');
  const [props, setProps] = React.useState<{ key: string; label: string }[]>([]);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [maxPoints, setMaxPoints] = React.useState('500');
  const [transform, setTransform] = React.useState<TsTransform>('raw');
  const [seriesByProp, setSeriesByProp] = React.useState<Record<string, { label: string; value: number }[]>>({});
  const [state, setState] = React.useState<'idle' | 'loading' | 'error'>('idle');

  // tipo → instâncias + propriedades timeseries do contrato
  React.useEffect(() => {
    setNodes([]); setNodeId(''); setProps([]); setPicked([]); setSeriesByProp({});
    if (!nodeType) return;
    Ontology.listNodes({ node_type: nodeType, limit: 200 }).then((ns) => setNodes(ns.map((n) => ({ id: n.id, name: n.name }))) ).catch(() => setNodes([]));
    Ontology.objectTypeSchema(nodeType)
      .then((s) => setProps((s.properties || []).filter((p) => p.type === 'timeseries').map((p) => ({ key: p.key, label: p.label || p.key }))))
      .catch(() => setProps([]));
  }, [nodeType]);

  // instância/propriedades/janela → consulta cada propriedade selecionada
  const pickedKey = picked.join(',');
  React.useEffect(() => {
    if (!nodeId || picked.length === 0) { setSeriesByProp({}); setState('idle'); return; }
    let cancelled = false;
    setState('loading');
    const mp = Number(maxPoints) || undefined;
    Promise.all(picked.map((prop) =>
      Ontology.queryTimeseries(nodeId, prop, mp ? { max_points: mp } : {})
        .then((r) => [prop, r.points.map((pt) => ({ label: String(pt.t), value: Number(pt.v) }))] as const)
        .catch(() => [prop, []] as const),
    )).then((entries) => { if (!cancelled) { setSeriesByProp(Object.fromEntries(entries)); setState('idle'); } })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [nodeId, pickedKey, maxPoints]);

  const multi: NamedSeries[] = React.useMemo(
    () => picked.filter((p) => seriesByProp[p]).map((p) => ({
      name: props.find((x) => x.key === p)?.label || p,
      points: applyTransform(seriesByProp[p] || [], transform),
    })),
    [picked, seriesByProp, transform, props],
  );
  const totalPts = multi.reduce((a, s) => a + s.points.length, 0);

  return (
    <div className="flex-1 flex min-h-0" data-testid="ts-visor">
      <aside className="w-72 border-r border-border-light flex flex-col shrink-0 overflow-y-auto scrollbar-hide p-3 space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Tipo de objeto</label>
          <select value={nodeType} data-testid="visor-type" onChange={(e) => setNodeType(e.target.value)} className={INP}>
            <option value="">— escolher tipo —</option>
            {types.map((t) => <option key={t.name} value={t.name}>{t.label} · {t.count}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Instância</label>
          <select value={nodeId} data-testid="visor-instance" onChange={(e) => setNodeId(e.target.value)} className={INP} disabled={!nodes.length}>
            <option value="">{nodes.length ? '— escolher instância —' : 'sem instâncias'}</option>
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Propriedades timeseries</label>
          {props.length === 0 ? (
            <p className="text-[11px] text-muted-on-light italic">o tipo não tem propriedade timeseries no contrato.</p>
          ) : (
            <ul className="space-y-1" data-testid="visor-props">
              {props.map((p) => (
                <li key={p.key}>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input type="checkbox" data-testid={`visor-prop-${p.key}`} checked={picked.includes(p.key)}
                      onChange={(e) => setPicked((cur) => e.target.checked ? [...cur, p.key] : cur.filter((k) => k !== p.key))} />
                    {p.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Máx. pontos</label>
            <input type="number" min={2} value={maxPoints} data-testid="visor-maxpoints" onChange={(e) => setMaxPoints(e.target.value)} className={INP} />
          </div>
          <select value={transform} data-testid="visor-transform" onChange={(e) => setTransform(e.target.value as TsTransform)}
            className="h-7 px-1.5 text-[11px] bg-white border border-border-light outline-none focus:border-primary" aria-label="Transformação">
            {TS_TRANSFORMS.map((tr) => <option key={tr.value} value={tr.value}>{tr.label}</option>)}
          </select>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto scrollbar-hide p-4 min-w-0">
        <div className="border border-border-light p-3" data-testid="visor-chart">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[12px] font-semibold text-text-on-light flex-1">{nodeId && picked.length ? `${picked.length} série(s) · ${totalPts} pontos` : 'Série por instância'}</h2>
          </div>
          {state === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-muted-on-light" />}
          {state === 'error' && <span className="text-[11px] text-danger">erro ao consultar a série</span>}
          {state === 'idle' && multi.length > 0 && totalPts > 0 && <MultiSeriesChart type="line" series={multi} />}
          {state === 'idle' && (multi.length === 0 || totalPts === 0) && (
            <span className="text-[11px] text-muted-on-light italic">escolha instância + propriedade(s) timeseries.</span>
          )}
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function CreateChart({ types, onCreated, onErr }: {
  types: OntologyNodeType[]; onCreated: (c: TimeSeriesChart) => void; onErr: (t: string) => void;
}) {
  const [name, setName] = React.useState('');
  const [nodeType, setNodeType] = React.useState('');
  const [bucket, setBucket] = React.useState('day');
  const [busy, setBusy] = React.useState(false);

  async function create() {
    if (!name || !nodeType) { onErr('Informe nome e tipo de objeto.'); return; }
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setBusy(true);
    try {
      const c = await TimeSeries.create({ slug, display_name: name, node_type: nodeType, config: { bucket } });
      setName(''); onCreated(c);
    } catch (e) { onErr(e instanceof Error ? e.message : 'Falha ao criar.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="border border-border-light p-3" data-testid="ts-create">
      <h2 className="text-[12px] font-semibold text-text-on-light mb-2">Novo chart</h2>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="w-56">
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Nome</label>
          <input type="text" value={name} data-testid="ts-name" onChange={(e) => setName(e.target.value)} className={INP} placeholder="Ocorrências por dia" />
        </div>
        <div className="w-56">
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Tipo de objeto</label>
          <select value={nodeType} data-testid="ts-nodetype" onChange={(e) => setNodeType(e.target.value)} className={INP}>
            <option value="">— escolher tipo —</option>
            {types.map((t) => <option key={t.name} value={t.name}>{t.label} · {t.count}</option>)}
          </select>
        </div>
        <div className="w-36">
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Bucket</label>
          <select value={bucket} data-testid="ts-bucket" onChange={(e) => setBucket(e.target.value)} className={INP}>
            {BUCKETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <button type="button" onClick={create} disabled={busy} data-testid="ts-create-btn"
          className="h-7 px-3 text-[11px] flex items-center gap-1.5 border border-border-light bg-white hover:border-primary disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Criar
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
function ChartRender({ chart }: { chart: TimeSeriesChart }) {
  const [data, setData] = React.useState<TimeSeriesRender | null>(null);
  const [state, setState] = React.useState<'idle' | 'loading' | 'error'>('idle');
  const [kind, setKind] = React.useState<SeriesChartType>('line');
  const [transform, setTransform] = React.useState<TsTransform>('raw');

  React.useEffect(() => {
    let cancelled = false;
    setState('loading'); setData(null);
    TimeSeries.render(chart.id)
      .then((r) => { if (!cancelled) { setData(r); setState('idle'); } })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [chart.id]);

  const series = React.useMemo(
    () => applyTransform((data?.series || []).map((p) => ({ label: p.bucket, value: p.count })), transform),
    [data, transform],
  );

  return (
    <section className="border border-border-light p-3" data-testid="ts-render">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[12px] font-semibold text-text-on-light flex-1">{chart.display_name}</h2>
        <span className="text-[10px] text-muted-on-light">{data ? `${data.total_visible} instâncias` : ''}</span>
        <select value={transform} data-testid="ts-transform" onChange={(e) => setTransform(e.target.value as TsTransform)}
          className="h-6 px-1.5 text-[10px] bg-white border border-border-light outline-none focus:border-primary" aria-label="Transformação">
          {TS_TRANSFORMS.map((tr) => <option key={tr.value} value={tr.value}>{tr.label}</option>)}
        </select>
        <div className="flex items-center gap-1" role="group" aria-label="Tipo de gráfico">
          {([['line', LineChart], ['bar', BarChart3]] as const).map(([k, Icon]) => (
            <button key={k} type="button" data-testid={`ts-kind-${k}`} onClick={() => setKind(k)} aria-pressed={kind === k}
              className={'h-6 w-6 flex items-center justify-center border ' + (kind === k ? 'border-primary text-primary bg-primary/5' : 'border-border-light bg-white hover:border-primary')}>
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-[10rem]" data-testid="ts-chart">
        {state === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-muted-on-light" />}
        {state === 'error' && <span className="text-[11px] text-danger">erro ao renderizar</span>}
        {state === 'idle' && series.length > 0 && <SeriesChart type={kind} series={series} />}
        {state === 'idle' && series.length === 0 && <span className="text-[11px] text-muted-on-light italic">sem instâncias com data no período.</span>}
      </div>
    </section>
  );
}
