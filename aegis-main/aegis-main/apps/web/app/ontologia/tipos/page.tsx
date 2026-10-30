'use client';

/**
 * /ontologia/tipos — Catálogo de tipos de objeto da ontologia.
 *
 * Layout Palantir Foundry "Ontology Manager":
 * - KPI row no topo (4 stat cards densos).
 * - Tabela densa de tipos (esquerda, flex-1) ordenada por contagem.
 * - Inspector inline (direita, 360px) com sample de instâncias e
 *   propriedades mais comuns daquele tipo. CTA primário leva pra
 *   /ontologia/instancias?tipo=<name>.
 *
 * Operator-friendly: termos "tipo", "objetos", "instâncias" — nunca
 * `schema_definition` ou `node_type` crus na UI.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Box,
  Boxes,
  Database,
  DatabaseZap,
  Download,
  GitBranch,
  KeyRound,
  Loader2,
  Pencil,
  Search,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { OntologiaTabs } from '@/components/ontologia/ontologia-tabs';
import { RequirePerm } from '@/components/auth/require-perm';
import { useCan } from '@/lib/auth/useAuth';
import { Ontology, type OntologyNodeType, type ObjectTypeSchema } from '@/lib/api';
import type { OntologyNode } from '@/lib/api/types';
import { cn } from '@/lib/cn';

const INSPECTOR_SAMPLE_SIZE = 8;

// Verbo legível por rule de Action Type (Onda 3) — mesmo vocabulário do
// catálogo /painel-de-controle/acoes. Mantém "o que a ação faz" em pt-BR.
const RULE_VERB: Record<string, string> = {
  create_object: 'Cria',
  modify_object: 'Modifica',
  delete_object: 'Remove',
  create_link: 'Vincula',
  delete_link: 'Desvincula',
  notify: 'Notifica',
  insight: 'Analisa',
  guest: 'Compartilha',
  service: 'Executa',
  custom: 'Executa',
};

// Cardinalidade do Link Type (Onda 2) → rótulo curto.
const CARDINALITY_LABEL: Record<string, string> = {
  one_to_one: '1:1',
  one_to_many: '1:N',
  many_to_many: 'N:N',
};

export default function OntologiaTiposPage() {
  const [types, setTypes] = useState<OntologyNodeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [osdkBusy, setOsdkBusy] = useState(false);
  const [osdkLang, setOsdkLang] = useState<'python' | 'typescript'>('python');

  // Onda 6 — gera o OSDK tipado da ontologia e baixa (operador não roda shell: o
  // codegen é um botão). Reusa GET /ontology/osdk/generate (python ou typescript).
  const generateOsdk = async () => {
    setOsdkBusy(true);
    try {
      const out = await Ontology.osdkGenerate(osdkLang);
      const blob = new Blob([out.source], {
        type: osdkLang === 'typescript' ? 'text/typescript' : 'text/x-python',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = out.filename || (osdkLang === 'typescript' ? 'aegis_osdk.ts' : 'aegis_osdk.py');
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* silencioso: botão volta ao normal; erro de rede não trava o catálogo */
    } finally {
      setOsdkBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Ontology.listNodeTypes()
      .then((rows) => {
        if (cancelled) return;
        const sorted = [...rows].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
        setTypes(sorted);
        if (sorted.length > 0) setSelectedName(sorted[0].name);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Falha ao carregar tipos.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return types;
    return types.filter(
      (t) =>
        (t.label ?? '').toLowerCase().includes(q) ||
        (t.name ?? '').toLowerCase().includes(q),
    );
  }, [types, query]);

  const totalObjetos = useMemo(
    () => types.reduce((acc, t) => acc + (t.count ?? 0), 0),
    [types],
  );

  const maxCount = useMemo(
    () => filtered.reduce((acc, t) => Math.max(acc, t.count ?? 0), 0),
    [filtered],
  );

  const maisPopulado = useMemo(() => {
    if (types.length === 0) return null;
    return types.reduce((acc, t) => ((t.count ?? 0) > (acc.count ?? 0) ? t : acc), types[0]);
  }, [types]);

  const vazios = useMemo(
    () => types.filter((t) => (t.count ?? 0) === 0).length,
    [types],
  );

  const selectedType = useMemo(
    () => types.find((t) => t.name === selectedName) ?? null,
    [types, selectedName],
  );

  // Conjunto de tipos do catálogo — usado pelo inspetor para só tornar
  // navegável um Link Type cujo alvo existe como tipo selecionável.
  const availableNames = useMemo(
    () => new Set(types.map((t) => t.name)),
    [types],
  );

  const subtitle = loading
    ? 'Carregando catálogo de tipos…'
    : error
      ? 'Não foi possível carregar a ontologia.'
      : `${formatNumber(types.length)} tipo${types.length === 1 ? '' : 's'} · ${formatNumber(totalObjetos)} objeto${totalObjetos === 1 ? '' : 's'} catalogado${totalObjetos === 1 ? '' : 's'}`;

  return (
    <RequirePerm perm="security.ontologia.view">
      <PageShell
        title="Tipos de objeto"
        subtitle={subtitle}
        theme="light"
        subnav={<OntologiaTabs />}
        toolbar={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tipo…"
                data-testid="ontologia-tipos-search"
                className="w-64 h-7 pl-7 pr-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
              />
            </div>
            <select
              value={osdkLang}
              onChange={(e) => setOsdkLang(e.target.value as 'python' | 'typescript')}
              data-testid="ontologia-tipos-osdk-lang"
              title="Linguagem do SDK gerado"
              className="h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
            >
              <option value="python">Python</option>
              <option value="typescript">TypeScript</option>
            </select>
            <button
              type="button"
              onClick={generateOsdk}
              disabled={osdkBusy || types.length === 0}
              data-testid="ontologia-tipos-osdk"
              title="Gera um SDK tipado a partir do contrato da ontologia"
              className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50"
            >
              {osdkBusy
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                : <Download className="w-3.5 h-3.5" strokeWidth={1.5} />}
              Gerar OSDK
            </button>
          </div>
        }
      >
        <div className="h-full flex flex-col overflow-hidden">
          {/* KPI ROW */}
          <div className="shrink-0 px-4 pt-3 pb-3 border-b border-border-light bg-raised-light/20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <KpiCard
                icon={<Boxes className="w-3.5 h-3.5" strokeWidth={1.5} />}
                label="Total de tipos"
                value={formatNumber(types.length)}
                hint="Categorias na ontologia"
              />
              <KpiCard
                icon={<Database className="w-3.5 h-3.5" strokeWidth={1.5} />}
                label="Total de objetos"
                value={formatNumber(totalObjetos)}
                hint="Instâncias catalogadas"
              />
              <KpiCard
                icon={<TrendingUp className="w-3.5 h-3.5" strokeWidth={1.5} />}
                label="Mais populado"
                value={maisPopulado ? (maisPopulado.label || maisPopulado.name) : '—'}
                hint={
                  maisPopulado
                    ? `${formatNumber(maisPopulado.count ?? 0)} objetos`
                    : 'Sem dados'
                }
              />
              <KpiCard
                icon={<DatabaseZap className="w-3.5 h-3.5" strokeWidth={1.5} />}
                label="Tipos vazios"
                value={formatNumber(vazios)}
                hint="Sem instâncias registradas"
              />
            </div>
          </div>

          {/* BODY: dense table + inspector */}
          <div className="flex-1 flex overflow-hidden">
            <main className="flex-1 overflow-hidden flex flex-col">
              {error && (
                <div className="mx-4 mt-3 px-3 py-2 text-[11px] bg-danger/5 border border-danger/40 text-danger">
                  {error}
                </div>
              )}
              <div className="flex-1 overflow-auto p-4">
                <div className="bg-canvas-light border border-border-light">
                  {loading ? (
                    <div className="px-4 py-12 text-center text-[12px] text-muted-on-light">
                      Carregando tipos…
                    </div>
                  ) : filtered.length === 0 ? (
                    <EmptyTypes hasData={types.length > 0} />
                  ) : (
                    <table className="w-full text-[11px]">
                      <thead className="text-[10px] uppercase tracking-wider text-muted-on-light bg-raised-light/40 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold w-[34%]">Tipo</th>
                          <th className="px-3 py-2 text-left font-semibold w-[26%]">
                            Identificador interno
                          </th>
                          <th className="px-3 py-2 text-left font-semibold">Objetos</th>
                          <th className="px-3 py-2 text-right font-semibold w-[100px]">
                            Distribuição
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-light/60">
                        {filtered.map((t) => {
                          const pct =
                            maxCount > 0 ? Math.round(((t.count ?? 0) / maxCount) * 100) : 0;
                          const isSelected = t.name === selectedName;
                          return (
                            <tr
                              key={t.name}
                              data-testid={`ontologia-tipo-row-${t.name}`}
                              onClick={() => setSelectedName(t.name)}
                              className={cn(
                                'cursor-pointer transition-colors',
                                isSelected
                                  ? 'bg-primary/5 border-l-2 border-primary'
                                  : 'hover:bg-raised-light/30 border-l-2 border-transparent',
                              )}
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 shrink-0 bg-primary/5 border border-primary/30 flex items-center justify-center text-primary">
                                    <Boxes className="w-3 h-3" strokeWidth={1.5} />
                                  </div>
                                  <span className="font-medium text-text-on-light truncate">
                                    {t.label || t.name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <span className="font-mono text-[10px] text-muted-on-light">
                                  {t.name}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] text-text-on-light w-12 shrink-0 tabular-nums">
                                    {formatNumber(t.count ?? 0)}
                                  </span>
                                  <div className="flex-1 h-1.5 bg-raised-light/60 border border-border-light/60 overflow-hidden">
                                    <div
                                      className="h-full bg-primary"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className="font-mono text-[10px] text-muted-on-light tabular-nums">
                                  {pct}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </main>

            {/* INSPECTOR */}
            <aside className="w-[360px] shrink-0 border-l border-border-light bg-raised-light/20 flex flex-col overflow-hidden">
              {selectedType ? (
                <TypeInspector
                  type={selectedType}
                  availableNames={availableNames}
                  onSelectType={setSelectedName}
                />
              ) : (
                <InspectorEmpty />
              )}
            </aside>
          </div>
        </div>
      </PageShell>
    </RequirePerm>
  );
}

function TypeInspector({
  type,
  availableNames,
  onSelectType,
}: {
  type: OntologyNodeType;
  availableNames: Set<string>;
  onSelectType: (name: string) => void;
}) {
  const canEdit = useCan('ontology.types.write');
  const [sample, setSample] = useState<OntologyNode[]>([]);
  const [schema, setSchema] = useState<ObjectTypeSchema | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSample([]);
    setSchema(null);
    Promise.allSettled([
      // CONTRATO tipado do Object Type (Onda 4 / OSDK). Pode 404 para tipos
      // legados sem definição declarada → cai no fallback heurístico abaixo.
      Ontology.objectTypeSchema(type.name),
      Ontology.listNodes({ node_type: type.name, limit: INSPECTOR_SAMPLE_SIZE, offset: 0 }),
    ])
      .then(([schemaRes, sampleRes]) => {
        if (cancelled) return;
        if (schemaRes.status === 'fulfilled') setSchema(schemaRes.value);
        if (sampleRes.status === 'fulfilled') setSample(sampleRes.value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type.name]);

  // Fallback heurístico (tipos legados sem contrato): chaves mais frequentes
  // na amostra. Só é exibido quando o contrato não declara properties.
  const topProps = useMemo(() => {
    const freq = new Map<string, number>();
    for (const n of sample) {
      const schemaDef = n.schema_definition;
      if (schemaDef && typeof schemaDef === 'object') {
        for (const k of Object.keys(schemaDef)) {
          freq.set(k, (freq.get(k) ?? 0) + 1);
        }
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, c]) => ({ key: k, count: c }));
  }, [sample]);

  const displayName = schema?.display_name || type.label || type.name;
  const count = schema?.count ?? type.count ?? 0;
  const props = schema?.properties ?? [];
  const links = schema?.links ?? [];
  const actions = schema?.actions ?? [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="ontologia-tipo-inspector">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-light bg-canvas-light">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 bg-primary/5 border border-primary/30 flex items-center justify-center text-primary">
            <Boxes className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono">
              Tipo de objeto
            </p>
            <p className="text-[14px] font-semibold text-text-on-light truncate">
              {displayName}
            </p>
            <p className="text-[10px] font-mono text-muted-on-light truncate mt-0.5">
              {type.name}
            </p>
          </div>
        </div>
      </div>

      {/* Body scroll */}
      <div className="flex-1 overflow-y-auto">
        {/* Count + bar */}
        <section className="px-4 py-3 border-b border-border-light">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-1">
            Instâncias
          </p>
          <p className="text-[24px] font-semibold text-text-on-light tabular-nums leading-none">
            {formatNumber(count)}
          </p>
          <p className="text-[11px] text-muted-on-light mt-1">
            objeto{count === 1 ? '' : 's'} catalogado{count === 1 ? '' : 's'}
          </p>
        </section>

        {/* Propriedades — contrato tipado (Onda 1) com fallback heurístico */}
        <section className="px-4 py-3 border-b border-border-light">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-2 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
            Propriedades
          </p>
          {loading ? (
            <p className="text-[11px] text-muted-on-light">Lendo contrato…</p>
          ) : props.length > 0 ? (
            <ul className="space-y-1">
              {props.map((p) => (
                <li
                  key={p.key}
                  data-testid={`ontologia-tipo-prop-${p.key}`}
                  className="flex items-center gap-2 px-2 py-1.5 bg-canvas-light border border-border-light/70"
                >
                  {p.is_title ? (
                    <KeyRound className="w-3 h-3 text-primary shrink-0" strokeWidth={1.5} />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span className="text-[11px] font-mono text-text-on-light truncate flex-1">
                    {p.label || p.key}
                  </span>
                  {p.is_title ? (
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 bg-primary/10 text-primary border border-primary/30 shrink-0">
                      Título
                    </span>
                  ) : null}
                  <span className="text-[9px] font-mono text-muted-on-light shrink-0 tabular-nums">
                    {p.type}
                  </span>
                </li>
              ))}
            </ul>
          ) : topProps.length > 0 ? (
            <>
              <p className="text-[10px] text-muted-on-light/80 mb-1.5">
                Tipo sem contrato declarado — inferido da amostra:
              </p>
              <ul className="space-y-1.5">
                {topProps.map((p) => {
                  const pct = Math.round((p.count / Math.max(sample.length, 1)) * 100);
                  return (
                    <li key={p.key} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-text-on-light truncate flex-1">
                        {p.key}
                      </span>
                      <div className="w-16 h-1.5 bg-raised-light/60 border border-border-light/60 overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-muted-on-light tabular-nums w-8 text-right">
                        {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-[11px] text-muted-on-light">
              Nenhuma propriedade declarada.
            </p>
          )}
        </section>

        {/* Relações — Link Types navegáveis (Onda 2) */}
        {links.length > 0 ? (
          <section className="px-4 py-3 border-b border-border-light">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-2 flex items-center gap-1.5">
              <GitBranch className="w-3 h-3" strokeWidth={1.5} />
              Relações
            </p>
            <ul className="space-y-1">
              {links.map((l, i) => {
                const navigable = availableNames.has(l.target_kind);
                return (
                  <li key={`${l.relation}-${l.target_kind}-${i}`}>
                    <button
                      type="button"
                      data-testid={`ontologia-tipo-link-${l.relation}`}
                      disabled={!navigable}
                      onClick={() => navigable && onSelectType(l.target_kind)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 bg-canvas-light border border-border-light/70 text-left transition-colors',
                        navigable ? 'hover:bg-primary/5 hover:border-primary/40 cursor-pointer' : 'cursor-default',
                      )}
                    >
                      <span className="text-[10px] text-muted-on-light shrink-0">
                        {l.direction === 'outgoing' ? '→' : '←'}
                      </span>
                      <span className="text-[11px] font-mono text-text-on-light truncate">
                        {l.relation}
                      </span>
                      <span className="text-[11px] text-muted-on-light truncate flex-1">
                        {l.target_label}
                      </span>
                      <span className="text-[9px] font-mono px-1 py-0.5 bg-raised-light/60 text-muted-on-light border border-border-light/60 shrink-0">
                        {CARDINALITY_LABEL[l.cardinality] ?? l.cardinality}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Ações — Action Types ligadas a este tipo (Onda 3) */}
        {actions.length > 0 ? (
          <section className="px-4 py-3 border-b border-border-light">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-2 flex items-center gap-1.5">
              <Zap className="w-3 h-3" strokeWidth={1.5} />
              Ações
            </p>
            <ul className="space-y-1">
              {actions.map((a, i) => (
                <li
                  key={`${a.name}-${i}`}
                  data-testid={`ontologia-tipo-action-${a.name}`}
                  className="flex items-center gap-2 px-2 py-1.5 bg-canvas-light border border-border-light/70"
                >
                  <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 bg-primary/10 text-primary border border-primary/30 shrink-0">
                    {RULE_VERB[a.rule] ?? 'Executa'}
                  </span>
                  <span className="text-[11px] text-text-on-light truncate flex-1">
                    {a.name}
                  </span>
                  {a.parameters.length > 0 ? (
                    <span className="text-[9px] font-mono text-muted-on-light shrink-0 tabular-nums">
                      {a.parameters.length} param{a.parameters.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Sample */}
        <section className="px-4 py-3 border-b border-border-light">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-2">
            Amostra de instâncias
          </p>
          {loading ? (
            <p className="text-[11px] text-muted-on-light">Carregando…</p>
          ) : sample.length === 0 ? (
            <p className="text-[11px] text-muted-on-light">
              Nenhuma instância encontrada.
            </p>
          ) : (
            <ul className="space-y-1">
              {sample.slice(0, 5).map((n) => (
                <li
                  key={n.id}
                  className="flex items-center gap-2 px-2 py-1.5 bg-canvas-light border border-border-light/70"
                >
                  <Box className="w-3 h-3 text-primary shrink-0" strokeWidth={1.5} />
                  <span className="text-[11px] text-text-on-light truncate flex-1">
                    {n.name || n.id}
                  </span>
                  {n.version ? (
                    <span className="text-[9px] font-mono text-muted-on-light shrink-0">
                      v{n.version}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* CTA */}
      <div className="shrink-0 px-4 py-3 border-t border-border-light bg-canvas-light flex items-center gap-2">
        <Link
          href={`/ontologia/instancias?tipo=${encodeURIComponent(type.name)}`}
          data-testid="ontologia-tipo-inspector-cta"
          className="flex-1 h-8 inline-flex items-center justify-center gap-1.5 text-[11px] font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
        >
          Ver instâncias
          <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
        {canEdit && (
          <Link
            href={`/painel-de-controle/tipos-editor?kind=${encodeURIComponent(type.name)}&cp=1`}
            data-testid="ontologia-tipo-inspector-editar"
            title="Editar o contrato deste tipo"
            className="h-8 px-3 inline-flex items-center justify-center gap-1.5 text-[11px] font-medium border border-border-light text-text-on-light hover:border-primary transition-colors"
          >
            <Pencil className="w-3 h-3" strokeWidth={1.5} />
            Editar tipo
          </Link>
        )}
      </div>
    </div>
  );
}

function InspectorEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="h-10 w-10 bg-canvas-light border border-border-light flex items-center justify-center text-muted-on-light/60 mb-3">
        <Boxes className="w-5 h-5" strokeWidth={1.5} />
      </div>
      <p className="text-[12px] text-text-on-light font-medium">
        Selecione um tipo
      </p>
      <p className="text-[11px] text-muted-on-light mt-1 max-w-[220px]">
        Clique numa linha à esquerda para inspecionar contagem, amostra e propriedades.
      </p>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="bg-canvas-light border border-border-light px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-on-light">
        {icon}
        <p className="text-[9px] uppercase tracking-[0.14em] font-mono">{label}</p>
      </div>
      <p className="text-[20px] font-semibold text-text-on-light mt-0.5 truncate">
        {value}
      </p>
      {hint ? (
        <p className="text-[10px] text-muted-on-light/80 mt-0.5 truncate">{hint}</p>
      ) : null}
    </div>
  );
}

function EmptyTypes({ hasData }: { hasData: boolean }) {
  return (
    <div className="px-4 py-12 text-center">
      <Database
        className="w-6 h-6 text-muted-on-light/40 mx-auto mb-2"
        strokeWidth={1.5}
      />
      <p className="text-[12px] text-muted-on-light">
        {hasData
          ? 'Nenhum tipo de objeto casa com a busca.'
          : 'A ontologia ainda está vazia.'}
      </p>
      <p className="text-[11px] text-muted-on-light/70 mt-1 max-w-md mx-auto">
        {hasData
          ? 'Tente limpar a busca para ver todos os tipos.'
          : 'Use os agentes 24/7 ou a importação manual para começar a popular a ontologia.'}
      </p>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}
