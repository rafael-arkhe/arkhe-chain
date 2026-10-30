'use client';

/**
 * Quiver — análise interativa (free-form analysis do Foundry, Onda 17 UI).
 *
 * Referência: docs/research/foundry/workshop/widgets-visualization/free-form-analysis.md
 * — card canvas sobre um Object Set, com Metric/Table/Text cards e aggregations
 * (count/sum/avg/min/max/cardinality + group-by). Aqui o notebook é um Object Set
 * + uma pilha de cards que rodam AO VIVO no motor de agregação da Onda 14
 * (POST /workshop/object-set/aggregate) — análise SEM código. Salvo como
 * QuiverNotebook (cells). Estética sharp.
 */
import * as React from 'react';
import { Plus, Save, Trash2, Loader2, AlertCircle, CheckCircle2, BarChart3, LineChart, PieChart, Hash, Type as TypeIcon, Filter, X } from 'lucide-react';

import {
  Quiver, Ontology,
  type QuiverNotebook, type QuiverCell, type OntologyNodeType, type ObjectTypeProperty,
} from '@/lib/api';
import type { FilterPredicate, LeafOp } from '@/lib/workshop/types';
import { SeriesChart } from '@/components/charts/series-chart';
import { promptModal } from '@/components/dialog/confirm-dialog';

// Contour — ops de leaf suportadas pelo translate_predicate (backend).
const LEAF_OPS: { value: LeafOp; label: string }[] = [
  { value: 'eq', label: 'igual' },
  { value: 'neq', label: 'diferente' },
  { value: 'contains', label: 'contém' },
  { value: 'prefix', label: 'começa com' },
  { value: 'in', label: 'em (vírgula)' },
];

const INP = 'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary';
const AGG_OPS = ['count', 'sum', 'avg', 'min', 'max', 'cardinality'] as const;
const NEEDS_FIELD = new Set(['sum', 'avg', 'min', 'max', 'cardinality']);

// Onda 19 — tipos de gráfico (sem jargão técnico: rótulo pt-BR + ícone lucide).
const CHART_TYPES: { value: NonNullable<QuiverCell['chart_type']>; label: string; Icon: typeof BarChart3 }[] = [
  { value: 'bar', label: 'Barras', Icon: BarChart3 },
  { value: 'line', label: 'Linha', Icon: LineChart },
  { value: 'pie', label: 'Pizza', Icon: PieChart },
];

// Os dropdowns expõem a CHAVE LÓGICA do contrato (ex.: `status`); o backend
// (translate_predicate / _extract) navega o JSONB por path FÍSICO
// `properties.<key>`. A tradução acontece SÓ na fronteira da API — o que é
// persistido e exibido permanece lógico (sem jargão técnico pro operador).
function physField(key: string): string {
  return key && !key.includes('.') ? `properties.${key}` : key;
}
function physFilter(pred: FilterPredicate | null): FilterPredicate | null {
  if (!pred) return null;
  const p = pred as unknown as Record<string, unknown>;
  if (p.op === 'and' || p.op === 'or') {
    return { op: p.op, operands: ((p.operands as FilterPredicate[]) || []).map((o) => physFilter(o)!) } as FilterPredicate;
  }
  if (p.op === 'not') return { op: 'not', operand: physFilter(p.operand as FilterPredicate)! } as FilterPredicate;
  return { ...(p as object), field: physField(p.field as string) } as FilterPredicate;
}

function _rid() { return Math.random().toString(36).slice(2, 9); }

// Workspace exportado p/ ser embutido no hub Análise (Fase 1 da consolidação de
// IA). `embedded` → altura fluida + esconde o título-ferramenta (o hub dá o nome).
export function QuiverWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [list, setList] = React.useState<QuiverNotebook[]>([]);
  const [sel, setSel] = React.useState<QuiverNotebook | null>(null);
  const [objectType, setObjectType] = React.useState('');
  const [filter, setFilter] = React.useState<FilterPredicate | null>(null);
  const [cards, setCards] = React.useState<QuiverCell[]>([]);
  const [types, setTypes] = React.useState<OntologyNodeType[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const reload = React.useCallback(() => { Quiver.list().then(setList).catch(() => {}); }, []);
  React.useEffect(() => { reload(); Ontology.listNodeTypes().then(setTypes).catch(() => {}); }, [reload]);

  function open(nb: QuiverNotebook) {
    setSel(nb);
    const src = (nb.cells || []).find((c) => c.kind === 'source');
    setObjectType(src?.object_type || '');
    setFilter(src?.filter ?? null);
    setCards((nb.cells || []).filter((c) => c.kind !== 'source'));
    setDirty(false); setMsg(null);
  }
  async function create() {
    const name = await promptModal({ title: 'Nome da análise', confirmLabel: 'Criar' });
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const nb = await Quiver.create({ slug, display_name: name });
    reload(); open(nb);
  }
  function addCard(kind: QuiverCell['kind']) {
    let c: QuiverCell;
    if (kind === 'text') c = { id: _rid(), kind, text: '', title: 'Nota' };
    else if (kind === 'chart') c = { id: _rid(), kind, op: 'count', field: '', group_by: [], chart_type: 'bar', title: 'Gráfico' };
    else c = { id: _rid(), kind, op: 'count', field: '', group_by: [], title: kind === 'group' ? 'Distribuição' : 'Métrica' };
    setCards((cs) => [...cs, c]); setDirty(true);
  }
  function patchCard(id: string, patch: Partial<QuiverCell>) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))); setDirty(true);
  }
  function removeCard(id: string) { setCards((cs) => cs.filter((c) => c.id !== id)); setDirty(true); }

  async function save() {
    if (!sel) return;
    setBusy(true); setMsg(null);
    const cells: QuiverCell[] = [{ id: 'source', kind: 'source', object_type: objectType, filter }, ...cards];
    try {
      const nb = await Quiver.update(sel.id, { cells });
      setSel(nb); setDirty(false); setMsg({ ok: true, text: 'Análise salva.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha ao salvar.' });
    } finally { setBusy(false); }
  }

  return (
    <div className={(embedded ? 'h-full' : 'h-[calc(100vh-3rem)]') + ' flex flex-col'}>
      <header className="h-12 px-4 border-b border-border-light flex items-center gap-3 shrink-0">
        {!embedded && <h1 className="text-[13px] font-semibold text-text-on-light">Quiver · Análise</h1>}
        {!embedded && <span className="text-[11px] text-muted-on-light">Exploração sem código sobre um Object Set — métricas e distribuições ao vivo.</span>}
        {sel && (
          <button type="button" onClick={save} disabled={busy || !dirty} data-testid="qv-save"
            className="ml-auto h-7 px-3 text-[11px] flex items-center gap-1.5 border border-border-light bg-white disabled:opacity-50 hover:border-primary">
            <Save className="w-3.5 h-3.5" /> Salvar
          </button>
        )}
        {msg && (
          <span className={(sel ? '' : 'ml-auto ') + 'flex items-center gap-1.5 text-[11px] ' + (msg.ok ? 'text-success' : 'text-danger')}
            role="status" data-testid="qv-msg">
            {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}{msg.text}
          </span>
        )}
      </header>
      <div className="flex-1 flex min-h-0">
        <aside className="w-56 border-r border-border-light flex flex-col shrink-0">
          <div className="h-9 px-3 border-b border-border-light flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light">Análises</span>
            <button type="button" onClick={create} data-testid="qv-new" aria-label="Nova análise" className="text-muted-on-light hover:text-primary"><Plus className="w-4 h-4" /></button>
          </div>
          <ul className="flex-1 overflow-y-auto scrollbar-hide">
            {list.length === 0 && <li className="px-3 py-3 text-[11px] text-muted-on-light italic">Nenhuma análise. Crie uma.</li>}
            {list.map((nb) => (
              <li key={nb.id}>
                <button type="button" onClick={() => open(nb)} data-testid={`qv-nb-${nb.id}`}
                  className={'w-full text-left px-3 py-2 text-[11px] border-b border-border-light/60 ' + (sel?.id === nb.id ? 'bg-primary/5 text-primary' : 'hover:bg-canvas-light')}>
                  <span className="block truncate font-medium">{nb.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex-1 overflow-y-auto scrollbar-hide p-4 min-w-0">
          {!sel ? (
            <div className="h-full flex items-center justify-center text-[12px] text-muted-on-light">Selecione ou crie uma análise.</div>
          ) : (
            <div className="max-w-3xl space-y-4" data-testid="qv-canvas">
              <div className="flex items-end gap-3">
                <div className="w-72">
                  <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">Object Set (fonte)</label>
                  <select value={objectType} data-testid="qv-source" onChange={(e) => { setObjectType(e.target.value); setDirty(true); }} className={INP}>
                    <option value="">— escolher tipo —</option>
                    {types.map((t) => <option key={t.name} value={t.name}>{t.label} · {t.count}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-on-light mr-1">Card:</span>
                  <button type="button" onClick={() => addCard('metric')} data-testid="qv-add-metric" className="h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary flex items-center gap-1"><Hash className="w-3 h-3" /> Métrica</button>
                  <button type="button" onClick={() => addCard('group')} data-testid="qv-add-group" className="h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Distribuição</button>
                  <button type="button" onClick={() => addCard('chart')} data-testid="qv-add-chart" className="h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary flex items-center gap-1"><PieChart className="w-3 h-3" /> Gráfico</button>
                  <button type="button" onClick={() => addCard('text')} data-testid="qv-add-text" className="h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary flex items-center gap-1"><TypeIcon className="w-3 h-3" /> Nota</button>
                </div>
              </div>

              {objectType && (
                <ContourFilter objectType={objectType} value={filter}
                  onChange={(f) => { setFilter(f); setDirty(true); }} />
              )}

              {cards.length === 0 && <p className="text-[12px] text-muted-on-light italic">Escolha um Object Set e adicione cards de análise.</p>}
              <div className="grid grid-cols-2 gap-3">
                {cards.map((c) => (
                  <AnalysisCard key={c.id} card={c} objectType={objectType} filter={filter}
                    onChange={(p) => patchCard(c.id, p)} onRemove={() => removeCard(c.id)} />
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function AnalysisCard({ card, objectType, filter, onChange, onRemove }: {
  card: QuiverCell; objectType: string; filter: FilterPredicate | null; onChange: (p: Partial<QuiverCell>) => void; onRemove: () => void;
}) {
  return (
    <div className="border border-border-light bg-white p-2.5 flex flex-col gap-2" data-testid={`qv-card-${card.id}`}>
      <div className="flex items-center gap-1.5">
        <input type="text" value={card.title || ''} onChange={(e) => onChange({ title: e.target.value })}
          className="flex-1 text-[11px] font-semibold bg-transparent outline-none border-b border-transparent focus:border-border-light" placeholder="Título" />
        <button type="button" onClick={onRemove} aria-label="Remover card" data-testid="qv-card-remove" className="text-muted-on-light hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      {card.kind === 'text' ? (
        <textarea value={card.text || ''} onChange={(e) => onChange({ text: e.target.value })} data-testid="qv-card-text"
          className="w-full h-20 p-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary resize-none" placeholder="Anotação…" />
      ) : card.kind === 'chart' ? (
        <ChartCard card={card} objectType={objectType} filter={filter} onChange={onChange} />
      ) : (
        <AggCard card={card} objectType={objectType} filter={filter} onChange={onChange} />
      )}
    </div>
  );
}

type AggState = 'idle' | 'loading' | 'error';
type AggResult = number | Array<Record<string, unknown>> | null;

/* Hooks compartilhados pelos cards de agregação (Métrica · Distribuição · Gráfico). */
function useObjectTypeProperties(objectType: string): ObjectTypeProperty[] {
  const [props, setProps] = React.useState<ObjectTypeProperty[]>([]);
  React.useEffect(() => {
    if (!objectType) { setProps([]); return; }
    Ontology.objectTypeSchema(objectType).then((s) => setProps(s.properties)).catch(() => setProps([]));
  }, [objectType]);
  return props;
}

// Roda a agregação AO VIVO (motor da Onda 14) quando a config está completa.
// `field`/`groupBy` são chaves LÓGICAS; physField/physFilter traduzem p/ o path
// físico do JSONB na fronteira da API. filterSig serializa o predicado p/
// re-rodar quando o Contour muda. Reusado por AggCard e ChartCard.
function useObjectSetAggregation(p: {
  objectType: string; op: string; field?: string; groupBy?: string;
  isGroup: boolean; needsField: boolean; filter: FilterPredicate | null;
}): { result: AggResult; state: AggState } {
  const { objectType, op, field, groupBy, isGroup, needsField, filter } = p;
  const [result, setResult] = React.useState<AggResult>(null);
  const [state, setState] = React.useState<AggState>('idle');
  const filterSig = React.useMemo(() => JSON.stringify(filter ?? null), [filter]);
  React.useEffect(() => {
    if (!objectType) { setResult(null); setState('idle'); return; }
    if (needsField && !field) { setResult(null); setState('idle'); return; }
    if (isGroup && !groupBy) { setResult(null); setState('idle'); return; }
    let cancelled = false;
    setState('loading');
    Ontology.aggregateObjectSet(objectType, {
      op,
      field: field ? physField(field) : undefined,
      group_by: isGroup ? [physField(groupBy as string)] : undefined,
    }, physFilter(filter)).then((r) => { if (!cancelled) { setResult(r.result); setState('idle'); } })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [objectType, op, field, groupBy, isGroup, needsField, filterSig]);
  return { result, state };
}

function AggCard({ card, objectType, filter, onChange }: { card: QuiverCell; objectType: string; filter: FilterPredicate | null; onChange: (p: Partial<QuiverCell>) => void }) {
  const props = useObjectTypeProperties(objectType);
  const isGroup = card.kind === 'group';
  const op = card.op || 'count';
  const needsField = NEEDS_FIELD.has(op);
  const groupBy = (card.group_by || [])[0] || '';
  const { result, state } = useObjectSetAggregation({
    objectType, op, field: card.field || undefined, groupBy, isGroup, needsField, filter,
  });

  return (
    <>
      <div className="flex items-center gap-1.5">
        <select value={op} data-testid="qv-card-op" onChange={(e) => onChange({ op: e.target.value })} className={INP + ' w-28'}>
          {AGG_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {needsField && (
          <select value={card.field || ''} data-testid="qv-card-field" onChange={(e) => onChange({ field: e.target.value })} className={INP}>
            <option value="">— propriedade —</option>
            {props.map((p) => <option key={p.key} value={p.key}>{p.label || p.key} · {p.type}</option>)}
          </select>
        )}
      </div>
      {isGroup && (
        <select value={groupBy} data-testid="qv-card-groupby" onChange={(e) => onChange({ group_by: e.target.value ? [e.target.value] : [] })} className={INP}>
          <option value="">— agrupar por —</option>
          {props.map((p) => <option key={p.key} value={p.key}>{p.label || p.key}</option>)}
        </select>
      )}
      <div className="min-h-[2rem]" data-testid="qv-card-result">
        {state === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-muted-on-light" />}
        {state === 'error' && <span className="text-[11px] text-danger">erro ao agregar</span>}
        {state === 'idle' && result !== null && !Array.isArray(result) && (
          <p className="text-2xl font-semibold text-text-on-light tabular-nums">{typeof result === 'number' ? result.toLocaleString('pt-BR') : String(result)}</p>
        )}
        {state === 'idle' && Array.isArray(result) && (
          <table className="w-full text-[11px]">
            <tbody>
              {result.slice(0, 12).map((b, i) => (
                <tr key={i} className="border-b border-border-light/40">
                  <td className="py-0.5 truncate">{String((b.key as Record<string, unknown>) ? Object.values(b.key as Record<string, unknown>)[0] : '—')}</td>
                  <td className="py-0.5 text-right font-mono">{String(b[op] ?? b.count ?? '')}</td>
                </tr>
              ))}
              {result.length > 12 && <tr><td colSpan={2} className="text-[10px] text-muted-on-light pt-1">+{result.length - 12} grupos</td></tr>}
            </tbody>
          </table>
        )}
        {state === 'idle' && result === null && <span className="text-[11px] text-muted-on-light italic">configure op{needsField ? ' + propriedade' : ''}{isGroup ? ' + agrupar' : ''}.</span>}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Contour — builder de filtro (AND/OR + regras de leaf) que escopa o Object  */
/* Set de entrada dos cards. Produz o FilterPredicate canônico consumido por  */
/* _query_object_set (translate_predicate) no backend. Controlado-híbrido:    */
/* mantém linhas em branco em estado local, re-semeia ao abrir outra análise. */
type LeafRow = { field: string; op: LeafOp; rawValue: string };

function decompose(value: FilterPredicate | null): { combinator: 'and' | 'or'; rows: LeafRow[] } {
  const toRow = (leaf: Record<string, unknown>): LeafRow => ({
    field: (leaf.field as string) ?? '',
    op: ((leaf.op as LeafOp) ?? 'eq'),
    rawValue: Array.isArray(leaf.value) ? leaf.value.join(', ') : leaf.value == null ? '' : String(leaf.value),
  });
  if (!value) return { combinator: 'and', rows: [] };
  const v = value as unknown as Record<string, unknown>;
  if (v.op === 'and' || v.op === 'or') {
    const ops = (v.operands as Record<string, unknown>[] | undefined) || [];
    return { combinator: v.op as 'and' | 'or', rows: ops.filter((o) => o && o.field).map(toRow) };
  }
  if (v.field) return { combinator: 'and', rows: [toRow(v)] };
  return { combinator: 'and', rows: [] };
}

function ContourFilter({ objectType, value, onChange }: {
  objectType: string; value: FilterPredicate | null; onChange: (f: FilterPredicate | null) => void;
}) {
  const [props, setProps] = React.useState<ObjectTypeProperty[]>([]);
  const init = React.useMemo(() => decompose(value), [value]);
  const [rows, setRows] = React.useState<LeafRow[]>(init.rows);
  const [combinator, setCombinator] = React.useState<'and' | 'or'>(init.combinator);
  const lastEmitted = React.useRef<string>(JSON.stringify(value ?? null));

  React.useEffect(() => {
    if (!objectType) { setProps([]); return; }
    Ontology.objectTypeSchema(objectType).then((s) => setProps(s.properties)).catch(() => setProps([]));
  }, [objectType]);

  // Re-semeia quando o filtro externo muda (abrir outra análise / trocar de tipo).
  React.useEffect(() => {
    const sig = JSON.stringify(value ?? null);
    if (sig !== lastEmitted.current) {
      const d = decompose(value);
      setRows(d.rows); setCombinator(d.combinator);
      lastEmitted.current = sig;
    }
  }, [value]);

  const typeOf = (field: string) => props.find((p) => p.key === field)?.type || 'text';
  function coerce(field: string, op: LeafOp, raw: string): unknown {
    const t = typeOf(field);
    const one = (s: string) => {
      const x = s.trim();
      if (x === '') return x;
      if (t === 'number' || t === 'integer' || t === 'float') { const n = Number(x); return Number.isNaN(n) ? x : n; }
      if (t === 'boolean') return x === 'true';
      return x;
    };
    if (op === 'in' || op === 'not_in') return raw.split(',').map((s) => one(s)).filter((v) => v !== '');
    return one(raw);
  }
  function push(nextRows: LeafRow[], comb: 'and' | 'or') {
    setRows(nextRows); setCombinator(comb);
    const leaves = nextRows
      .filter((r) => r.field && r.op)
      .map((r) => ({ op: r.op, field: r.field, value: coerce(r.field, r.op, r.rawValue) }));
    const pred = leaves.length ? { op: comb, operands: leaves } : null;
    lastEmitted.current = JSON.stringify(pred);
    onChange(pred as FilterPredicate | null);
  }

  const update = (i: number, patch: Partial<LeafRow>) => push(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)), combinator);

  return (
    <div className="border border-border-light bg-canvas-light" data-testid="qv-contour">
      <div className="h-7 px-2.5 flex items-center gap-2 border-b border-border-light/70">
        <Filter className="w-3 h-3 text-muted-on-light" />
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">Filtro</span>
        {rows.length > 1 && (
          <select value={combinator} data-testid="ctr-combinator" onChange={(e) => push(rows, e.target.value as 'and' | 'or')}
            className="h-5 px-1 text-[10px] bg-white border border-border-light outline-none focus:border-primary ml-1">
            <option value="and">todas (E)</option>
            <option value="or">qualquer (OU)</option>
          </select>
        )}
        <button type="button" onClick={() => push([...rows, { field: '', op: 'eq', rawValue: '' }], combinator)}
          data-testid="ctr-add" className="ml-auto h-5 px-1.5 text-[10px] border border-border-light bg-white hover:border-primary flex items-center gap-1">
          <Plus className="w-3 h-3" /> Regra
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-2.5 py-1.5 text-[11px] text-muted-on-light italic">Sem filtro — o Object Set inteiro do tipo.</p>
      ) : (
        <div className="p-2 space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5" data-testid={`ctr-row-${i}`}>
              <select value={r.field} data-testid={`ctr-field-${i}`} onChange={(e) => update(i, { field: e.target.value })} className={INP + ' w-36'}>
                <option value="">— propriedade —</option>
                {props.map((p) => <option key={p.key} value={p.key}>{p.label || p.key}</option>)}
              </select>
              <select value={r.op} data-testid={`ctr-op-${i}`} onChange={(e) => update(i, { op: e.target.value as LeafOp })} className={INP + ' w-28'}>
                {LEAF_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input type="text" value={r.rawValue} data-testid={`ctr-value-${i}`} onChange={(e) => update(i, { rawValue: e.target.value })}
                placeholder={r.op === 'in' ? 'a, b, c' : 'valor'} className={INP} />
              <button type="button" onClick={() => push(rows.filter((_, idx) => idx !== i), combinator)}
                data-testid={`ctr-remove-${i}`} aria-label="Remover regra" className="text-muted-on-light hover:text-danger shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Card de Gráfico (Onda 19) — distribuição (group-by) renderizada como        */
/* barras/linha/pizza. REUSA o MESMO motor de agregação (hooks) do AggCard;    */
/* só a apresentação muda (gráfico vs tabela). Gráfico SEMPRE agrupa por uma    */
/* categoria (isGroup=true).                                                    */
function ChartCard({ card, objectType, filter, onChange }: {
  card: QuiverCell; objectType: string; filter: FilterPredicate | null; onChange: (p: Partial<QuiverCell>) => void;
}) {
  const props = useObjectTypeProperties(objectType);
  const op = card.op || 'count';
  const needsField = NEEDS_FIELD.has(op);
  const groupBy = (card.group_by || [])[0] || '';
  const chartType = card.chart_type || 'bar';
  const { result, state } = useObjectSetAggregation({
    objectType, op, field: card.field || undefined, groupBy, isGroup: true, needsField, filter,
  });

  // buckets canônicos [{key:{f:v}, <op>:N, count:N}] → série {label, value}.
  const series = React.useMemo<{ label: string; value: number }[]>(() => {
    if (!Array.isArray(result)) return [];
    return result.map((b) => {
      const key = b.key as Record<string, unknown> | undefined;
      const label = key ? String(Object.values(key)[0] ?? '—') : '—';
      const raw = Number((b[op] as number) ?? (b.count as number) ?? 0);
      return { label, value: Number.isFinite(raw) ? raw : 0 };
    });
  }, [result, op]);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <select value={op} data-testid="qv-card-op" onChange={(e) => onChange({ op: e.target.value })} className={INP + ' w-28'}>
          {AGG_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {needsField && (
          <select value={card.field || ''} data-testid="qv-card-field" onChange={(e) => onChange({ field: e.target.value })} className={INP}>
            <option value="">— propriedade —</option>
            {props.map((p) => <option key={p.key} value={p.key}>{p.label || p.key} · {p.type}</option>)}
          </select>
        )}
      </div>
      <select value={groupBy} data-testid="qv-card-groupby" onChange={(e) => onChange({ group_by: e.target.value ? [e.target.value] : [] })} className={INP}>
        <option value="">— agrupar por —</option>
        {props.map((p) => <option key={p.key} value={p.key}>{p.label || p.key}</option>)}
      </select>
      <div className="flex items-center gap-1" role="group" aria-label="Tipo de gráfico">
        {CHART_TYPES.map(({ value, label, Icon }) => (
          <button key={value} type="button" data-testid={`qv-chart-type-${value}`}
            onClick={() => onChange({ chart_type: value })} aria-pressed={chartType === value}
            className={'h-6 px-2 text-[10px] border flex items-center gap-1 ' + (chartType === value ? 'border-primary text-primary bg-primary/5' : 'border-border-light bg-white hover:border-primary')}>
            <Icon className="w-3 h-3" /> {label}
          </button>
        ))}
      </div>
      <div className="min-h-[8rem]" data-testid="qv-card-chart">
        {state === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-muted-on-light" />}
        {state === 'error' && <span className="text-[11px] text-danger">erro ao agregar</span>}
        {state === 'idle' && series.length > 0 && <SeriesChart type={chartType} series={series} />}
        {state === 'idle' && series.length === 0 && (
          <span className="text-[11px] text-muted-on-light italic">configure {needsField ? 'propriedade + ' : ''}agrupar por.</span>
        )}
      </div>
    </>
  );
}
