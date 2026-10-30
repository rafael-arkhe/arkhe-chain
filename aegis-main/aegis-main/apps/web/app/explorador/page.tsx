'use client';

/**
 * /explorador — verificação EM CAMADAS da ontologia.
 *
 * Layout 3-col (superfície analítica clara):
 *   - Esquerda 260px: dimensões de drill-down (Tipos | Propriedades | Vínculos |
 *     Mapa | Linha do tempo | Buscar) + lista da dimensão ativa.
 *   - Centro: visão do conjunto com switch Distribuição · Tabela · Lista.
 *   - Direita 340px: pipeline de CAMADAS (antes→depois real por camada) +
 *     construtor de camada dinâmico + "Criar alerta deste conjunto".
 *
 * Dados: `GET /entities` do ontology-module via `Entities.list` (paginado por
 * offset, "Carregar mais") + `Entities.count` para o total. Agregação client-side
 * sobre o que está carregado. O alerta serializa as camadas e cria um SearchFeed
 * (`POST /alerts/feeds`) cujo worker honra TODAS as camadas (tipo/texto/
 * marcação/prop), aparecendo em /alertas.
 */

import * as React from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Bell,
  Filter,
  Layers,
  List,
  Network,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Tag,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { Entities, Alerts } from '@/lib/api';
import type { Entity } from '@/lib/api/types';
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_BG,
  CLASSIFICATION_TEXT,
  isClassificationLevel,
  type ClassificationLevel,
} from '@/lib/classification';
import { OBJECT_LABELS } from '@/lib/object-icons';
import type { ObjectType } from '@/lib/mock-data';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/* -------------------------------------------------------------------------- */
/* Tipos + serialização                                                        */
/* -------------------------------------------------------------------------- */
type Aba = 'tipos' | 'propriedades' | 'vinculos' | 'mapa' | 'tempo' | 'buscar';
type Vista = 'distribuicao' | 'tabela' | 'lista';

const ABAS: { id: Aba; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'tipos',         label: 'Tipos',          icon: Tag },
  { id: 'propriedades',  label: 'Propriedades',   icon: Layers },
  { id: 'vinculos',      label: 'Vínculos',       icon: Network },
  { id: 'mapa',          label: 'Mapa',           icon: Filter },
  { id: 'tempo',         label: 'Linha do tempo', icon: Timer },
  { id: 'buscar',        label: 'Buscar',         icon: Search },
];

const VISTAS: { id: Vista; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'distribuicao', label: 'Distribuição', icon: BarChart3 },
  { id: 'tabela',       label: 'Tabela',       icon: Table2 },
  { id: 'lista',        label: 'Lista',        icon: List },
];

/** Quantas entidades por página do "Carregar mais". Teto do backend = 500. */
const PAGE_SIZE = 500;

/** Cadências oferecidas ao criar a busca monitorada (piso backend = 60s). */
const CADENCIAS: { label: string; seconds: number }[] = [
  { label: 'A cada 5 minutos', seconds: 300 },
  { label: 'A cada 15 minutos', seconds: 900 },
  { label: 'A cada hora', seconds: 3600 },
  { label: 'A cada 6 horas', seconds: 21600 },
  { label: 'A cada 24 horas', seconds: 86400 },
];

/**
 * Nível de classificação → marcações que o representam. O backend casa a camada
 * por interseção de `markings` (a Entity não tem coluna `classification`; o nível
 * é derivado das marcações). Espelha `_MARK_TO_CLASS` em lib/api normalizeEntity.
 */
const LEVEL_TO_MARKINGS: Record<ClassificationLevel, string[]> = {
  publico: ['OFICIAL', 'publico'],
  restrito: ['OPERACIONAL', 'restrito'],
  confidencial: ['GABINETE_INTERNO', 'confidencial'],
  sigiloso: ['CHEFE_GABINETE', 'sigiloso'],
};

/** Camada do pipeline: aplica um filtro sobre o conjunto. */
export type Estagio =
  | { id: string; kind: 'tipo'; valor: string; antes: number; depois: number }
  | { id: string; kind: 'classificacao'; valor: string; antes: number; depois: number }
  | { id: string; kind: 'prop'; key: string; valor: string; antes: number; depois: number }
  | { id: string; kind: 'texto'; valor: string; antes: number; depois: number };

export function estagioLabel(s: Estagio): string {
  if (s.kind === 'tipo')
    return `Tipo é ${OBJECT_LABELS[s.valor as ObjectType] || s.valor}`;
  if (s.kind === 'classificacao')
    return `Classificação é ${CLASSIFICATION_LABEL[s.valor as ClassificationLevel] || s.valor}`;
  if (s.kind === 'prop') return `${s.key} contém "${s.valor}"`;
  return `Texto contém "${s.valor}"`;
}

/**
 * Serializa as camadas no shape que o worker `tick_feeds` do ontology-module
 * avalia (entity_matches_filters). PURO — testado em jest.
 */
export function estagiosToFilters(estagios: Estagio[]): Record<string, unknown> {
  return {
    stages: estagios.map((s) => {
      if (s.kind === 'tipo') return { kind: 'tipo', value: s.valor };
      if (s.kind === 'classificacao') {
        const lvl = s.valor as ClassificationLevel;
        return { kind: 'marcacao', markings: LEVEL_TO_MARKINGS[lvl] ?? [s.valor] };
      }
      if (s.kind === 'prop') return { kind: 'prop', path: s.key, op: 'contains', value: s.valor };
      return { kind: 'texto', value: s.valor };
    }),
  };
}

/** Resolve path aninhado (`correlations.youtube.count`) num dict. */
function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Aplica uma seq de camadas e retorna o subset resultante por etapa. */
function aplicarPipeline(base: Entity[], estagios: Estagio[]): Entity[][] {
  const out: Entity[][] = [base];
  let curr = base;
  for (const s of estagios) {
    curr = curr.filter((e) => {
      if (s.kind === 'tipo') return e.entity_type === s.valor;
      if (s.kind === 'classificacao') return e.classification === s.valor;
      if (s.kind === 'prop') {
        const v = resolvePath(e.properties, s.key);
        if (v == null) return false;
        if (Array.isArray(v)) return v.length > 0;
        return String(v).toLowerCase().includes(s.valor.toLowerCase());
      }
      const hay = `${e.name} ${Object.values(e.properties || {}).join(' ')}`.toLowerCase();
      return hay.includes(s.valor.toLowerCase());
    });
    out.push(curr);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */
export default function ExploradorPage() {
  const [rows, setRows] = React.useState<Entity[]>([]);
  const [total, setTotal] = React.useState<number | null>(null);
  const [nextOffset, setNextOffset] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [live, setLive] = React.useState(false);

  const [aba, setAba] = React.useState<Aba>('propriedades');
  const [vista, setVista] = React.useState<Vista>('distribuicao');
  const [propAtiva, setPropAtiva] = React.useState<string>('');
  const [tipoAtivo, setTipoAtivo] = React.useState<string>('');
  const [textoBusca, setTextoBusca] = React.useState('');

  const [estagios, setEstagios] = React.useState<Estagio[]>([]);
  const [alertaOpen, setAlertaOpen] = React.useState(false);

  /* ---- Carga paginada ---- */
  const refetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const [page, t] = await Promise.all([
        Entities.list({ limit: String(PAGE_SIZE), offset: '0' }),
        Entities.count().catch(() => null),
      ]);
      setRows(page);
      setTotal(t);
      setNextOffset(PAGE_SIZE);
      setLive(true);
    } catch {
      // SHELL HONESTO: offline mostra estado vazio honesto, nunca corpus demo.
      setRows([]);
      setTotal(null);
      setNextOffset(0);
      setLive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = React.useCallback(async () => {
    setLoadingMore(true);
    try {
      const page = await Entities.list({
        limit: String(PAGE_SIZE),
        offset: String(nextOffset),
      });
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.filter((r) => !seen.has(r.id))];
      });
      setNextOffset((o) => o + PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [nextOffset]);

  React.useEffect(() => {
    void refetch();
  }, [refetch]);

  // total é pré-ABAC (limite superior). hasMore: ainda há páginas no backend.
  const hasMore = total != null && nextOffset < total;

  /* ---- Pipeline aplicado ---- */
  const pipelineSnapshots = React.useMemo(
    () => aplicarPipeline(rows, estagios),
    [rows, estagios],
  );
  const conjuntoAtual = pipelineSnapshots[pipelineSnapshots.length - 1];

  /* ---- Agregados ---- */
  const propCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    const collect = (obj: unknown, prefix: string, depth: number) => {
      if (depth > 2 || !obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v == null) continue;
        m.set(path, (m.get(path) ?? 0) + 1);
        if (typeof v === 'object' && !Array.isArray(v)) collect(v, path, depth + 1);
      }
    };
    for (const r of conjuntoAtual) collect(r.properties, '', 0);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [conjuntoAtual]);

  React.useEffect(() => {
    if (!propAtiva && propCounts.length > 0) setPropAtiva(propCounts[0][0]);
  }, [propAtiva, propCounts]);

  const tipoCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of conjuntoAtual) m.set(r.entity_type, (m.get(r.entity_type) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [conjuntoAtual]);

  React.useEffect(() => {
    if (!tipoAtivo && tipoCounts.length > 0) setTipoAtivo(tipoCounts[0][0]);
  }, [tipoAtivo, tipoCounts]);

  const distribProp = React.useMemo(() => {
    if (!propAtiva) return [] as { valor: string; total: number }[];
    const m = new Map<string, number>();
    for (const r of conjuntoAtual) {
      const v = resolvePath(r.properties, propAtiva);
      if (v == null || v === '') continue;
      const k = Array.isArray(v) ? `[${v.length} itens]` : String(v).slice(0, 80);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([valor, total]) => ({ valor, total }))
      .sort((a, b) => b.total - a.total);
  }, [conjuntoAtual, propAtiva]);

  const crossTipoClass = React.useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    const classSet = new Set<string>();
    for (const r of conjuntoAtual) {
      const t = r.entity_type;
      const c = r.classification || '—';
      classSet.add(c);
      if (!m.has(t)) m.set(t, new Map());
      const inner = m.get(t)!;
      inner.set(c, (inner.get(c) ?? 0) + 1);
    }
    const tipos = Array.from(m.keys()).sort();
    const classes = Array.from(classSet).sort();
    const matrix = tipos.map((t) => classes.map((c) => m.get(t)?.get(c) ?? 0));
    const max = Math.max(1, ...matrix.flat());
    return { tipos, classes, matrix, max };
  }, [conjuntoAtual]);

  const distribClass = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of conjuntoAtual) {
      const k = r.classification || '—';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([valor, total]) => ({ valor, total }))
      .sort((a, b) => b.total - a.total);
  }, [conjuntoAtual]);

  const linhaTempo = React.useMemo(() => {
    return [...conjuntoAtual]
      .filter((r) => r.updated_at || r.created_at)
      .sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || 0).getTime();
        const tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      });
  }, [conjuntoAtual]);

  const buscaResultados = React.useMemo(() => {
    if (!textoBusca.trim()) return conjuntoAtual;
    const q = textoBusca.toLowerCase();
    return conjuntoAtual.filter((r) =>
      `${r.name} ${Object.values(r.properties || {}).join(' ')}`.toLowerCase().includes(q),
    );
  }, [conjuntoAtual, textoBusca]);

  /* ---- Camadas ---- */
  function addEstagioTipo(tipo: string) {
    const antes = conjuntoAtual.length;
    const depois = conjuntoAtual.filter((e) => e.entity_type === tipo).length;
    setEstagios((arr) => [...arr, { id: `s${Date.now()}`, kind: 'tipo', valor: tipo, antes, depois }]);
  }
  function addEstagioClass(cl: string) {
    const antes = conjuntoAtual.length;
    const depois = conjuntoAtual.filter((e) => e.classification === cl).length;
    setEstagios((arr) => [...arr, { id: `s${Date.now()}`, kind: 'classificacao', valor: cl, antes, depois }]);
  }
  function addEstagioProp(key: string, valor: string) {
    const antes = conjuntoAtual.length;
    const depois = conjuntoAtual.filter((e) => {
      const v = resolvePath(e.properties, key);
      return v != null && String(v).toLowerCase().includes(valor.toLowerCase());
    }).length;
    setEstagios((arr) => [...arr, { id: `s${Date.now()}`, kind: 'prop', key, valor, antes, depois }]);
  }
  function addEstagioTexto(valor: string) {
    const v = valor.trim();
    if (!v) return;
    const antes = conjuntoAtual.length;
    const depois = conjuntoAtual.filter((e) =>
      `${e.name} ${Object.values(e.properties || {}).join(' ')}`.toLowerCase().includes(v.toLowerCase()),
    ).length;
    setEstagios((arr) => [...arr, { id: `s${Date.now()}`, kind: 'texto', valor: v, antes, depois }]);
  }
  function removerEstagio(id: string) {
    setEstagios((arr) => arr.filter((s) => s.id !== id));
  }

  const maxDistribProp = Math.max(1, ...distribProp.map((d) => d.total));
  const maxDistribClass = Math.max(1, ...distribClass.map((d) => d.total));

  const defaultAlertName = React.useMemo(() => {
    const tipoSt = estagios.find((s) => s.kind === 'tipo') as
      | Extract<Estagio, { kind: 'tipo' }>
      | undefined;
    const base = tipoSt
      ? OBJECT_LABELS[tipoSt.valor as ObjectType] || tipoSt.valor
      : 'Exploração';
    return `${base} · ${conjuntoAtual.length} objeto${conjuntoAtual.length === 1 ? '' : 's'}`;
  }, [estagios, conjuntoAtual.length]);

  return (
    <RequirePerm perm="security.explorador.view">
      <PageShell
        title="Explorador"
        subtitle={
          loading
            ? 'Carregando…'
            : `${conjuntoAtual.length.toLocaleString('pt-BR')} no conjunto · ${rows.length.toLocaleString('pt-BR')}${
                total != null ? ` de ${total.toLocaleString('pt-BR')}` : ''
              } carregados${live ? '' : ' · offline'}${
                estagios.length ? ` · ${estagios.length} camada${estagios.length === 1 ? '' : 's'}` : ''
              }`
        }
        classification="restrito"
        classificationLabel="EXPLORAÇÃO ATIVA"
        theme="light"
        toolbar={
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} strokeWidth={1.5} />
            Recarregar
          </button>
        }
      >
        <div className="h-full flex overflow-hidden">
          {/* ─── Esquerda: dimensões de drill-down ───────────── */}
          <aside
            data-testid="explorador-propriedades"
            className="w-[260px] bg-panel-light border-r border-border-light flex flex-col shrink-0 overflow-hidden"
          >
            <div className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light">
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold">Drill-down</p>
            </div>
            <div className="h-8 flex items-stretch border-b border-border-light text-[10px] uppercase tracking-[0.14em] overflow-x-auto scrollbar-hide shrink-0">
              {ABAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAba(a.id)}
                  data-testid={`explorador-aba-${a.id}`}
                  className={cn(
                    'px-2.5 whitespace-nowrap transition-colors relative flex items-center gap-1',
                    aba === a.id
                      ? 'text-text-on-light font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary'
                      : 'text-muted-on-light hover:text-text-on-light',
                  )}
                >
                  <a.icon className="w-3 h-3" />
                  {a.label}
                </button>
              ))}
            </div>

            <ul className="flex-1 overflow-y-auto scrollbar-hide">
              {aba === 'propriedades' && (
                <>
                  {propCounts.map(([k, n]) => (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => setPropAtiva(k)}
                        data-testid={`explorador-prop-${k}`}
                        className={cn(
                          'w-full flex items-center px-3 h-7 text-[11px] transition-colors',
                          propAtiva === k
                            ? 'bg-raised-light text-text-on-light'
                            : 'text-muted-on-light hover:bg-raised-light/50',
                        )}
                      >
                        <span className="flex-1 text-left truncate font-mono">{k}</span>
                        <span className="font-mono text-[10px]">{n}</span>
                      </button>
                    </li>
                  ))}
                  {propCounts.length === 0 && (
                    <li className="px-3 py-3 text-[11px] text-muted-on-light italic">
                      Nenhuma propriedade no conjunto atual.
                    </li>
                  )}
                </>
              )}

              {aba === 'tipos' && (
                <>
                  {tipoCounts.map(([t, n]) => (
                    <li key={t}>
                      <button
                        type="button"
                        onClick={() => setTipoAtivo(t)}
                        data-testid={`explorador-tipo-${t}`}
                        className={cn(
                          'w-full flex items-center px-3 h-7 text-[11px] transition-colors',
                          tipoAtivo === t
                            ? 'bg-raised-light text-text-on-light'
                            : 'text-muted-on-light hover:bg-raised-light/50',
                        )}
                      >
                        <span className="flex-1 text-left truncate">
                          {OBJECT_LABELS[t as ObjectType] || t}
                        </span>
                        <span className="font-mono text-[10px]">{n}</span>
                      </button>
                    </li>
                  ))}
                  {tipoCounts.length === 0 && (
                    <li className="px-3 py-3 text-[11px] text-muted-on-light italic">
                      Nenhum tipo no conjunto atual.
                    </li>
                  )}
                </>
              )}

              {aba === 'tempo' &&
                linhaTempo.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/ficha/${r.id}`}
                      className="block px-3 py-1.5 text-[11px] hover:bg-raised-light border-b border-border-light/40"
                    >
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="font-mono text-[10px] text-muted-on-light truncate">
                        {(r.updated_at || r.created_at || '').slice(0, 16).replace('T', ' ')} ·{' '}
                        {OBJECT_LABELS[r.entity_type as ObjectType] || r.entity_type}
                      </p>
                    </Link>
                  </li>
                ))}

              {aba === 'buscar' && (
                <li className="px-3 py-2 border-b border-border-light flex gap-1.5">
                  <input
                    type="text"
                    placeholder="texto, propriedade…"
                    value={textoBusca}
                    onChange={(e) => setTextoBusca(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addEstagioTexto(textoBusca);
                    }}
                    data-testid="explorador-buscar-input"
                    className="flex-1 h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => addEstagioTexto(textoBusca)}
                    disabled={!textoBusca.trim()}
                    data-testid="explorador-buscar-add"
                    title="Adicionar este texto como camada do pipeline"
                    className="h-7 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary disabled:opacity-40 flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </li>
              )}
              {aba === 'buscar' &&
                buscaResultados.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/ficha/${r.id}`}
                      className="block px-3 py-1.5 text-[11px] hover:bg-raised-light border-b border-border-light/40"
                    >
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="font-mono text-[10px] text-muted-on-light truncate">
                        {OBJECT_LABELS[r.entity_type as ObjectType] || r.entity_type}
                      </p>
                    </Link>
                  </li>
                ))}

              {aba === 'vinculos' && (
                <li className="px-3 py-3 text-[11px] text-muted-on-light leading-relaxed">
                  <p className="mb-2">
                    Os {conjuntoAtual.length.toLocaleString('pt-BR')} objetos do conjunto atual como
                    grafo de vínculos.
                  </p>
                  <Link
                    href="/rede"
                    className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover inline-flex items-center gap-1.5"
                  >
                    <Network className="w-3 h-3" strokeWidth={1.5} /> Abrir em /rede
                  </Link>
                </li>
              )}

              {aba === 'mapa' && (
                <li className="px-3 py-3 text-[11px] text-muted-on-light leading-relaxed">
                  <p className="mb-2">
                    Os {conjuntoAtual.length.toLocaleString('pt-BR')} objetos atuais como camada em
                    /geo.
                  </p>
                  <Link
                    href="/geo"
                    className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover inline-flex items-center gap-1.5"
                  >
                    <Filter className="w-3 h-3" strokeWidth={1.5} /> Abrir em /geo
                  </Link>
                </li>
              )}
            </ul>
          </aside>

          {/* ─── Centro: visão do conjunto ────────────────────── */}
          <section
            data-testid="explorador-visualizacao"
            className="flex-1 bg-canvas-light flex flex-col overflow-hidden border-r border-border-light min-w-0"
          >
            <div className="h-10 px-4 border-b border-border-light flex items-center gap-3 bg-panel-light shrink-0">
              <p className="text-[12px] font-semibold truncate">
                {vista !== 'distribuicao'
                  ? `Conjunto atual · ${conjuntoAtual.length.toLocaleString('pt-BR')} objetos`
                  : aba === 'propriedades'
                    ? propAtiva || '—'
                    : aba === 'tipos'
                      ? OBJECT_LABELS[tipoAtivo as ObjectType] || tipoAtivo || '—'
                      : `Conjunto atual · ${conjuntoAtual.length.toLocaleString('pt-BR')} objetos`}
              </p>
              {vista === 'distribuicao' && aba === 'propriedades' && (
                <span className="text-[11px] text-muted-on-light shrink-0">
                  {distribProp.length} valor{distribProp.length === 1 ? '' : 'es'} único
                  {distribProp.length === 1 ? '' : 's'}
                </span>
              )}
              {/* Switch de visão */}
              <div className="ml-auto flex items-stretch border border-border-light shrink-0">
                {VISTAS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVista(v.id)}
                    data-testid={`explorador-vista-${v.id}`}
                    className={cn(
                      'h-6 px-2 text-[10px] flex items-center gap-1 transition-colors',
                      vista === v.id
                        ? 'bg-primary text-white'
                        : 'bg-canvas-light text-muted-on-light hover:text-text-on-light',
                    )}
                  >
                    <v.icon className="w-3 h-3" />
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {/* VISÃO: TABELA */}
              {vista === 'tabela' && (
                <ConjuntoTable rows={conjuntoAtual} />
              )}

              {/* VISÃO: LISTA */}
              {vista === 'lista' && (
                <ul className="divide-y divide-border-light/50">
                  {conjuntoAtual.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/ficha/${r.id}`}
                        className="flex items-center gap-3 px-4 py-2 text-[12px] hover:bg-raised-light/50"
                      >
                        <span className="flex-1 truncate font-medium">{r.name || '—'}</span>
                        <span className="text-[10px] font-mono text-muted-on-light shrink-0">
                          {OBJECT_LABELS[r.entity_type as ObjectType] || r.entity_type}
                        </span>
                        <ClassPill value={r.classification} />
                      </Link>
                    </li>
                  ))}
                  {conjuntoAtual.length === 0 && (
                    <li className="px-4 py-6 text-[11px] text-muted-on-light italic">
                      Conjunto vazio.
                    </li>
                  )}
                </ul>
              )}

              {/* VISÃO: DISTRIBUIÇÃO (por dimensão ativa) */}
              {vista === 'distribuicao' && (
                <div className="p-4 space-y-2.5">
                  {aba === 'propriedades' && propAtiva && distribProp.length > 0 && (
                    <>
                      {distribProp.slice(0, 60).map((d) => (
                        <div key={d.valor} className="flex items-center gap-3 text-[12px]">
                          <span className="w-40 truncate" title={d.valor}>
                            {d.valor}
                          </span>
                          <div className="flex-1 h-5 bg-raised-light relative">
                            <div
                              className="absolute inset-y-0 left-0 bg-primary"
                              style={{ width: `${(d.total / maxDistribProp) * 100}%` }}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-text-on-light">
                              {d.total}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => addEstagioProp(propAtiva, d.valor)}
                            data-testid={`explorador-add-prop-${d.valor}`}
                            className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1"
                            title="Adicionar como camada ao pipeline"
                          >
                            <Plus className="w-3 h-3" strokeWidth={1.5} />
                          </button>
                        </div>
                      ))}
                      {distribProp.length > 60 && (
                        <p className="text-[10px] text-muted-on-light italic pt-1">
                          Mostrando os 60 valores mais frequentes de {distribProp.length}.
                        </p>
                      )}
                    </>
                  )}
                  {aba === 'propriedades' && (!propAtiva || distribProp.length === 0) && (
                    <p className="text-[11px] text-muted-on-light italic">
                      Selecione uma propriedade à esquerda para ver a distribuição de valores.
                    </p>
                  )}

                  {aba === 'tipos' && distribClass.length > 0 && (
                    <>
                      {distribClass.map((d) => (
                        <div key={d.valor} className="flex items-center gap-3 text-[12px]">
                          <span className="w-32 truncate">
                            {CLASSIFICATION_LABEL[d.valor as ClassificationLevel] || d.valor}
                          </span>
                          <div className="flex-1 h-5 bg-raised-light relative">
                            <div
                              className="absolute inset-y-0 left-0 bg-primary"
                              style={{ width: `${(d.total / maxDistribClass) * 100}%` }}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-text-on-light">
                              {d.total}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => addEstagioClass(d.valor)}
                            data-testid={`explorador-add-class-${d.valor}`}
                            className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1"
                            title="Adicionar classificação como camada"
                          >
                            <Plus className="w-3 h-3" strokeWidth={1.5} />
                          </button>
                        </div>
                      ))}
                      {tipoAtivo && (
                        <div className="pt-3 mt-3 border-t border-border-light">
                          <button
                            type="button"
                            onClick={() => addEstagioTipo(tipoAtivo)}
                            data-testid="explorador-add-tipo"
                            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
                          >
                            <Plus className="w-3 h-3" strokeWidth={1.5} /> Filtrar pelo tipo &quot;
                            {OBJECT_LABELS[tipoAtivo as ObjectType] || tipoAtivo}&quot;
                          </button>
                        </div>
                      )}

                      {crossTipoClass.tipos.length > 1 && (
                        <div className="pt-4 mt-4 border-t border-border-light">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-2">
                            Tipo × Classificação · heatmap
                          </p>
                          <div className="overflow-x-auto scrollbar-hide">
                            <table className="text-[11px] border-collapse">
                              <thead>
                                <tr>
                                  <th className="text-left p-1 font-mono text-[10px] text-muted-on-light"></th>
                                  {crossTipoClass.classes.map((c) => (
                                    <th
                                      key={c}
                                      className="p-1 font-mono text-[9px] text-muted-on-light uppercase tracking-wider"
                                    >
                                      {CLASSIFICATION_LABEL[c as ClassificationLevel] || c}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {crossTipoClass.tipos.map((t, ti) => (
                                  <tr key={t}>
                                    <td className="p-1 pr-2 font-medium text-[11px] whitespace-nowrap">
                                      {OBJECT_LABELS[t as ObjectType] || t}
                                    </td>
                                    {crossTipoClass.matrix[ti].map((cnt, ci) => {
                                      const opacity = cnt / crossTipoClass.max;
                                      return (
                                        <td key={ci} className="p-0.5">
                                          <div
                                            className="w-10 h-7 flex items-center justify-center font-mono text-[10px] border border-border-light"
                                            style={{
                                              backgroundColor:
                                                cnt > 0
                                                  ? `rgba(45, 119, 190, ${0.15 + opacity * 0.7})`
                                                  : 'transparent',
                                              color: opacity > 0.5 ? '#FFF' : '#14181E',
                                            }}
                                            title={`${t} × ${crossTipoClass.classes[ci]} = ${cnt}`}
                                          >
                                            {cnt > 0 ? cnt : '—'}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {aba === 'tempo' && (
                    <ul className="space-y-1.5">
                      {linhaTempo.slice(0, 120).map((r) => (
                        <li key={r.id} className="flex items-center gap-3 text-[12px] py-1">
                          <span className="w-1.5 h-1.5 bg-primary shrink-0" aria-hidden />
                          <span className="font-mono text-[10px] text-muted-on-light w-32 shrink-0">
                            {(r.updated_at || r.created_at || '').slice(0, 16).replace('T', ' ')}
                          </span>
                          <Link href={`/ficha/${r.id}`} className="flex-1 truncate hover:text-primary">
                            {r.name}
                          </Link>
                          <span className="text-[10px] font-mono text-muted-on-light">
                            {OBJECT_LABELS[r.entity_type as ObjectType] || r.entity_type}
                          </span>
                        </li>
                      ))}
                      {linhaTempo.length === 0 && (
                        <li className="text-[11px] text-muted-on-light italic">
                          Sem timestamps no conjunto atual.
                        </li>
                      )}
                      {linhaTempo.length > 120 && (
                        <li className="text-[10px] text-muted-on-light italic pt-1">
                          Mostrando os 120 mais recentes de {linhaTempo.length}. Use a visão Tabela
                          para o conjunto completo.
                        </li>
                      )}
                    </ul>
                  )}

                  {(aba === 'buscar' || aba === 'vinculos' || aba === 'mapa') && (
                    <p className="text-[11px] text-muted-on-light italic">
                      Use o painel à esquerda, ou troque para a visão Tabela/Lista para ver os
                      objetos do conjunto.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ─── Direita: pipeline de camadas ─────────────────── */}
          <aside
            data-testid="explorador-pipeline"
            className="w-[340px] bg-panel-light flex flex-col shrink-0 overflow-hidden"
          >
            <div className="h-10 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light">
              <p className="text-[11px] uppercase tracking-[0.18em] font-semibold flex-1">
                Camadas · {estagios.length}
              </p>
            </div>

            {/* Fonte + carregar mais */}
            <div className="px-3 py-2 border-b border-border-light">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1 font-mono">
                Fonte
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px]">
                  <span className="font-mono">{rows.length.toLocaleString('pt-BR')}</span>
                  {total != null && (
                    <span className="text-muted-on-light">
                      {' '}
                      de <span className="font-mono">{total.toLocaleString('pt-BR')}</span>
                    </span>
                  )}{' '}
                  objetos{!live && ' · offline'}
                </p>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    data-testid="explorador-carregar-mais"
                    className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary disabled:opacity-50 flex items-center gap-1 shrink-0"
                  >
                    <RefreshCw className={cn('w-3 h-3', loadingMore && 'animate-spin')} strokeWidth={1.5} />
                    {loadingMore ? 'Carregando…' : 'Carregar mais'}
                  </button>
                )}
              </div>
            </div>

            {/* Construtor de camada dinâmico */}
            <FilterBuilder
              propPaths={propCounts.map(([k]) => k)}
              tipos={tipoCounts.map(([t]) => t)}
              onAddTipo={addEstagioTipo}
              onAddClass={addEstagioClass}
              onAddTexto={addEstagioTexto}
              onAddProp={addEstagioProp}
            />

            {/* Lista de camadas */}
            <ul className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2.5">
              {estagios.length === 0 && (
                <li className="text-[11px] text-muted-on-light italic leading-relaxed">
                  Nenhuma camada ainda. Use o construtor acima, o <strong>+</strong> nas barras de
                  distribuição, ou o <strong>Filtrar pelo tipo</strong> para começar a verificar a
                  ontologia em camadas.
                </li>
              )}
              {estagios.map((s, i) => (
                <li key={s.id} className="border border-border-light bg-canvas-light p-2.5">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-[10px] text-muted-on-light mt-0.5">{i + 1}</span>
                    <p className="text-[11px] flex-1">{estagioLabel(s)}</p>
                    <button
                      type="button"
                      aria-label={`Remover camada ${i + 1}`}
                      onClick={() => removerEstagio(s.id)}
                      data-testid={`explorador-remove-estagio-${i + 1}`}
                      className="text-muted-on-light hover:text-danger"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-muted-on-light">{s.antes.toLocaleString('pt-BR')}</span>
                    <span className="text-muted-on-light">→</span>
                    <span className="text-success">{s.depois.toLocaleString('pt-BR')}</span>
                    <span className="ml-auto text-muted-on-light">
                      {s.antes > 0
                        ? `${(((s.antes - s.depois) / s.antes) * 100).toFixed(0)}% filtrado`
                        : '—'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {/* Ações do conjunto */}
            <div className="border-t border-border-light p-3 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-on-light">Conjunto</span>
                <span className="font-mono font-semibold">
                  {conjuntoAtual.length.toLocaleString('pt-BR')} objetos
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAlertaOpen(true)}
                data-testid="criar-alerta-pipeline"
                disabled={estagios.length === 0}
                title={
                  estagios.length === 0
                    ? 'Adicione pelo menos uma camada'
                    : 'Cria uma busca monitorada sobre este conjunto'
                }
                className="w-full h-8 bg-primary text-white text-[12px] hover:bg-primary-hover flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Bell className="w-3.5 h-3.5" strokeWidth={1.5} /> Criar alerta deste conjunto
              </button>
              <button
                type="button"
                onClick={() => setEstagios([])}
                disabled={estagios.length === 0}
                className="w-full h-8 text-[11px] border border-border-light hover:border-danger hover:text-danger flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} /> Limpar camadas
              </button>
            </div>
          </aside>
        </div>
      </PageShell>

      <CriarAlertaModal
        open={alertaOpen}
        onClose={() => setAlertaOpen(false)}
        estagios={estagios}
        defaultName={defaultAlertName}
        conjuntoSize={conjuntoAtual.length}
      />
    </RequirePerm>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponentes                                                              */
/* -------------------------------------------------------------------------- */
function ClassPill({ value }: { value: string | null | undefined }) {
  if (!isClassificationLevel(value)) {
    return <span className="text-[10px] font-mono text-muted-on-light shrink-0">—</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 h-4 text-[9px] font-semibold uppercase tracking-wider shrink-0',
        CLASSIFICATION_BG[value],
        CLASSIFICATION_TEXT[value],
      )}
    >
      <span className="w-1 h-1 bg-current opacity-80" aria-hidden />
      {CLASSIFICATION_LABEL[value]}
    </span>
  );
}

function ConjuntoTable({ rows }: { rows: Entity[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-[11px] text-muted-on-light italic">Conjunto vazio.</p>
    );
  }
  return (
    <table className="w-full text-[12px] border-collapse">
      <thead className="sticky top-0 bg-panel-light z-10">
        <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light">
          <th className="text-left font-semibold px-4 py-2 border-b border-border-light">Nome</th>
          <th className="text-left font-semibold px-2 py-2 border-b border-border-light">Tipo</th>
          <th className="text-left font-semibold px-2 py-2 border-b border-border-light">
            Classificação
          </th>
          <th className="text-left font-semibold px-2 py-2 border-b border-border-light">
            Atualizado
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-raised-light/50 border-b border-border-light/40">
            <td className="px-4 py-1.5 max-w-0">
              <Link href={`/ficha/${r.id}`} className="block truncate font-medium hover:text-primary">
                {r.name || '—'}
              </Link>
            </td>
            <td className="px-2 py-1.5 whitespace-nowrap text-muted-on-light">
              {OBJECT_LABELS[r.entity_type as ObjectType] || r.entity_type}
            </td>
            <td className="px-2 py-1.5">
              <ClassPill value={r.classification} />
            </td>
            <td className="px-2 py-1.5 whitespace-nowrap font-mono text-[10px] text-muted-on-light">
              {(r.updated_at || r.created_at || '').slice(0, 16).replace('T', ' ') || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Construtor de camada dinâmico: campo → operador → valor → adicionar. */
function FilterBuilder({
  propPaths,
  tipos,
  onAddTipo,
  onAddClass,
  onAddTexto,
  onAddProp,
}: {
  propPaths: string[];
  tipos: string[];
  onAddTipo: (v: string) => void;
  onAddClass: (v: string) => void;
  onAddTexto: (v: string) => void;
  onAddProp: (key: string, v: string) => void;
}) {
  const [campo, setCampo] = React.useState('__texto');
  const [valor, setValor] = React.useState('');

  const tipo = campo === '__tipo';
  const classe = campo === '__classificacao';
  const texto = campo === '__texto';
  const isProp = !tipo && !classe && !texto;

  // valor selecionado precisa ser válido quando o campo é dropdown
  React.useEffect(() => {
    if (tipo) setValor(tipos[0] ?? '');
    else if (classe) setValor('restrito');
    else setValor('');
  }, [campo, tipo, classe, tipos]);

  const op = tipo || classe ? 'é' : 'contém';

  function add() {
    if (tipo) {
      if (valor) onAddTipo(valor);
    } else if (classe) {
      if (valor) onAddClass(valor);
    } else if (texto) {
      if (valor.trim()) onAddTexto(valor.trim());
    } else if (valor.trim()) {
      onAddProp(campo, valor.trim());
    }
    setValor(texto || isProp ? '' : valor);
  }

  const canAdd = tipo || classe ? !!valor : !!valor.trim();

  return (
    <div className="px-3 py-2.5 border-b border-border-light bg-canvas-light/40 space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold font-mono">
        Nova camada
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <select
            value={campo}
            onChange={(e) => setCampo(e.target.value)}
            data-testid="explorador-builder-campo"
            className="flex-1 h-7 px-1.5 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
          >
            <option value="__texto">Texto livre</option>
            <option value="__tipo">Tipo</option>
            <option value="__classificacao">Classificação</option>
            {propPaths.length > 0 && (
              <optgroup label="Propriedades">
                {propPaths.slice(0, 80).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="text-[10px] text-muted-on-light font-mono shrink-0 w-10 text-center">
            {op}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {tipo ? (
            <select
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              data-testid="explorador-builder-valor"
              className="flex-1 h-7 px-1.5 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
            >
              {tipos.length === 0 && <option value="">—</option>}
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {OBJECT_LABELS[t as ObjectType] || t}
                </option>
              ))}
            </select>
          ) : classe ? (
            <select
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              data-testid="explorador-builder-valor"
              className="flex-1 h-7 px-1.5 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
            >
              <option value="publico">{CLASSIFICATION_LABEL.publico}</option>
              <option value="restrito">{CLASSIFICATION_LABEL.restrito}</option>
              <option value="confidencial">{CLASSIFICATION_LABEL.confidencial}</option>
              <option value="sigiloso">{CLASSIFICATION_LABEL.sigiloso}</option>
            </select>
          ) : (
            <input
              type="text"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAdd) add();
              }}
              placeholder={texto ? 'texto a conter…' : 'valor a conter…'}
              data-testid="explorador-builder-valor"
              className="flex-1 h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
            />
          )}
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            data-testid="explorador-builder-add"
            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-40 flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3 h-3" strokeWidth={1.5} /> Camada
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal "Criar alerta deste conjunto" → SearchFeed (POST /alerts/feeds). */
function CriarAlertaModal({
  open,
  onClose,
  estagios,
  defaultName,
  conjuntoSize,
}: {
  open: boolean;
  onClose: () => void;
  estagios: Estagio[];
  defaultName: string;
  conjuntoSize: number;
}) {
  const [name, setName] = React.useState(defaultName);
  const [cadence, setCadence] = React.useState(300);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(defaultName);
      setCadence(300);
      setBusy(false);
    }
  }, [open, defaultName]);

  if (!open) return null;

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await Alerts.feeds.create({
        name: name.trim(),
        filters: estagiosToFilters(estagios),
        cadence_seconds: cadence,
      });
      toast.success('Busca monitorada criada. Acompanhe em /alertas.');
      onClose();
    } catch (e) {
      toast.error(`Falha ao criar alerta: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 ds-overlay flex items-center justify-center p-4"
        onClick={onClose}
        data-testid="criar-alerta-modal"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-canvas-light border border-border-light text-text-on-light"
        >
          <header className="h-10 px-3 border-b border-border-light flex items-center bg-raised-light/40">
            <Bell className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />
            <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1">
              Criar alerta deste conjunto
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="h-7 w-7 flex items-center justify-center hover:bg-raised-light"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </header>

          <div className="p-4 space-y-3">
            <div>
              <label
                htmlFor="alerta-nome"
                className="block text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-1"
              >
                Nome
              </label>
              <input
                id="alerta-nome"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="criar-alerta-nome"
                className="w-full h-9 px-2.5 text-[12px] text-text-on-light bg-canvas-light border border-border-light outline-none focus:border-primary"
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="alerta-cadencia"
                className="block text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-1"
              >
                Verificar
              </label>
              <select
                id="alerta-cadencia"
                value={cadence}
                onChange={(e) => setCadence(Number(e.target.value))}
                data-testid="criar-alerta-cadencia"
                className="w-full h-9 px-2 text-[12px] text-text-on-light bg-canvas-light border border-border-light outline-none focus:border-primary"
              >
                {CADENCIAS.map((c) => (
                  <option key={c.seconds} value={c.seconds}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="border border-border-light bg-raised-light/30 p-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-1.5">
                {estagios.length} camada{estagios.length === 1 ? '' : 's'} · ~
                {conjuntoSize.toLocaleString('pt-BR')} objetos hoje
              </p>
              <ul className="space-y-1">
                {estagios.map((s, i) => (
                  <li key={s.id} className="text-[11px] flex gap-2">
                    <span className="font-mono text-[10px] text-muted-on-light">{i + 1}</span>
                    <span>{estagioLabel(s)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-on-light mt-2 leading-relaxed">
                Você será alertado quando NOVOS objetos passarem a casar com estas camadas.
              </p>
            </div>
          </div>

          <footer className="px-3 py-2 border-t border-border-light bg-raised-light/30 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !name.trim()}
              data-testid="criar-alerta-confirm"
              className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
            >
              <Bell className="w-3 h-3" strokeWidth={1.5} />
              {busy ? 'Criando…' : 'Criar busca monitorada'}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
