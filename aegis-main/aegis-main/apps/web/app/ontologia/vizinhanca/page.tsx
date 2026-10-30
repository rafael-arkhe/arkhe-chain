'use client';

/**
 * /ontologia/vizinhanca — Explorador de vizinhança (search-around, Onda 10).
 *
 * A partir de um TIPO semente, o operador monta um caminho de relações (multi-hop)
 * e vê o conjunto de objetos relacionado. As relações de cada hop vêm do CONTRATO
 * do tipo atual (Ontology.objectTypeSchema — Onda 4): nunca texto livre, sempre o
 * link declarado, com a direção e o tipo-alvo embutidos. Consome
 * POST /workshop/object-set/search-around (governado: markings por hop).
 *
 * Horizontal: condomínio (Morador→possui_veiculo→Veículo), mineração
 * (Sensor→emite→Leitura) e saúde (Paciente→realiza→Exame) usam a MESMA tela.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Boxes, GitBranch, Loader2, Route, X } from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { OntologiaTabs } from '@/components/ontologia/ontologia-tabs';
import { RequirePerm } from '@/components/auth/require-perm';
import {
  Ontology,
  type OntologyNodeType,
  type ObjectTypeLink,
  type SearchAroundHop,
  type SearchAroundResult,
} from '@/lib/api';

const SELECT = 'h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary';
const CARD_VERB: Record<string, string> = { outgoing: '→', incoming: '←' };

export default function VizinhancaPage() {
  return (
    <RequirePerm perm="security.ontologia.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const [types, setTypes] = useState<OntologyNodeType[]>([]);
  const [seed, setSeed] = useState('');
  const [hops, setHops] = useState<Array<SearchAroundHop & { targetLabel: string }>>([]);
  const [links, setLinks] = useState<ObjectTypeLink[]>([]);
  const [result, setResult] = useState<SearchAroundResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Ontology.listNodeTypes().then((r) => setTypes([...r].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)))).catch(() => {});
  }, []);

  // Tipo "atual" = alvo do último hop, ou o seed se o caminho está vazio.
  const currentType = hops.length ? hops[hops.length - 1].target_kind ?? '' : seed;
  const labelOf = useMemo(() => {
    const m = new Map(types.map((t) => [t.name, t.label || t.name]));
    return (k: string | undefined) => (k ? m.get(k) || k : '');
  }, [types]);

  // Relações disponíveis no tipo atual (do contrato — Onda 4).
  useEffect(() => {
    if (!currentType) { setLinks([]); return; }
    let cancel = false;
    Ontology.objectTypeSchema(currentType)
      .then((s) => { if (!cancel) setLinks(s.links); })
      .catch(() => { if (!cancel) setLinks([]); });
    return () => { cancel = true; };
  }, [currentType]);

  const addHop = (idx: number) => {
    const l = links[idx];
    if (!l) return;
    setHops((h) => [...h, { relation: l.relation, direction: l.direction, target_kind: l.target_kind, targetLabel: l.target_label }]);
    setResult(null);
  };
  const reset = () => { setHops([]); setResult(null); setErr(null); };

  const run = async () => {
    if (!seed || hops.length === 0) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const path: SearchAroundHop[] = hops.map((h) => ({ relation: h.relation, direction: h.direction, target_kind: h.target_kind }));
      setResult(await Ontology.searchAround(seed, path));
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha no search-around');
    } finally { setBusy(false); }
  };

  return (
    <PageShell title="Vizinhança" subtitle="Siga as relações da ontologia, salto a salto, e veja os objetos relacionados." theme="light" subnav={<OntologiaTabs />}>
      <div className="p-6 max-w-3xl space-y-4">
        {/* Semente + caminho */}
        <div className="bg-canvas-light border border-border-light p-4 space-y-3" data-testid="vizinhanca-builder">
          <label className="flex items-center gap-2">
            <span className="text-[11px] text-muted-on-light w-20">Tipo inicial</span>
            <select
              data-testid="vizinhanca-seed"
              value={seed}
              onChange={(e) => { setSeed(e.target.value); reset(); }}
              className={SELECT + ' w-64'}
            >
              <option value="">— Escolha o tipo —</option>
              {types.map((t) => <option key={t.name} value={t.name}>{t.label || t.name}</option>)}
            </select>
          </label>

          {/* Caminho montado */}
          {seed ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]" data-testid="vizinhanca-path">
              <span className="px-2 py-1 bg-primary/5 border border-primary/30 text-primary font-medium">{labelOf(seed)}</span>
              {hops.map((h, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="text-muted-on-light font-mono text-[10px]" title={h.direction}>
                    {CARD_VERB[h.direction]} {h.relation}
                  </span>
                  <ArrowRight className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
                  <span className="px-2 py-1 bg-canvas-light border border-border-light" data-testid={`vizinhanca-hop-${i}`}>
                    {h.targetLabel || labelOf(h.target_kind)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}

          {/* Adicionar hop — relações do tipo atual (contrato) */}
          {seed ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-on-light w-20">Seguir</span>
              {links.length === 0 ? (
                <span className="text-[11px] text-muted-on-light italic">
                  {labelOf(currentType)} não declara relações navegáveis.
                </span>
              ) : (
                <select
                  data-testid="vizinhanca-add-hop"
                  value=""
                  onChange={(e) => { if (e.target.value !== '') addHop(Number(e.target.value)); }}
                  className={SELECT + ' w-80'}
                >
                  <option value="">+ adicionar salto…</option>
                  {links.map((l, i) => (
                    <option key={`${l.relation}-${i}`} value={i}>
                      {CARD_VERB[l.direction]} {l.relation} · {l.target_label} ({l.cardinality})
                    </option>
                  ))}
                </select>
              )}
              {hops.length ? (
                <button type="button" onClick={reset} data-testid="vizinhanca-reset"
                  className="h-8 px-2 text-[11px] border border-border-light hover:border-primary flex items-center gap-1">
                  <X className="w-3 h-3" strokeWidth={1.5} /> Limpar
                </button>
              ) : null}
              <button type="button" onClick={run} disabled={busy || hops.length === 0}
                data-testid="vizinhanca-run"
                className="h-8 px-3 text-[12px] bg-primary text-white hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50 ml-auto">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <Route className="w-3.5 h-3.5" strokeWidth={1.5} />}
                Explorar
              </button>
            </div>
          ) : null}
        </div>

        {err ? <p className="text-[12px] text-danger" data-testid="vizinhanca-error">{err}</p> : null}

        {/* Resultado */}
        {result ? (
          <div className="border border-border-light" data-testid="vizinhanca-result">
            <div className="px-3 py-2 border-b border-border-light bg-raised-light/30 text-[11px] text-muted-on-light flex items-center gap-2">
              <Boxes className="w-3.5 h-3.5" strokeWidth={1.5} />
              {result.result.length} objeto{result.result.length === 1 ? '' : 's'} relacionado{result.result.length === 1 ? '' : 's'}
              <span className="font-mono">· {result.seed_count} semente · {result.hops_executed} salto{result.hops_executed === 1 ? '' : 's'}</span>
              {result.truncated ? <span className="ml-auto text-warning">resultado truncado</span> : null}
            </div>
            {result.result.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-muted-on-light italic">Nenhum objeto relacionado por este caminho.</p>
            ) : (
              <ul className="divide-y divide-border-light/60">
                {result.result.slice(0, 50).map((o) => (
                  <li key={o.id} className="px-3 py-2 flex items-center gap-2 text-[12px]" data-testid={`vizinhanca-obj-${o.id}`}>
                    <GitBranch className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.5} />
                    <span className="font-medium text-text-on-light truncate">{o.name || o.id}</span>
                    <span className="text-[10px] font-mono text-muted-on-light truncate ml-auto">{labelOf(o.node_type)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
