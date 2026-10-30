'use client';

/**
 * Mapa do Workflow — Painel de Controle (M5-10 · 2026-05-23,
 * direção B "apoio à decisão" · 2026-06-28).
 *
 * Página UNIFICADA com DUAS abas: "Mapa" (diagrama de pipeline) e
 * "Eventos" (log de LineageEvent + proveniência de coluna). A antiga
 * terceira aba "Coluna" foi DISSOLVIDA dentro de Eventos como um
 * drill-down progressivo (ADD-alongside: a funcionalidade de
 * column-trace continua intacta, só muda de lugar). O deep-link
 * `?aba=coluna` abre Eventos com a seção de coluna já expandida.
 *
 * Direção B — o operador precisa DECIDIR, não admirar o grafo:
 *   1. MAPA LIMPO POR PADRÃO. O canvas renderiza só o SUBGRAFO CONECTADO
 *      (o pipeline). Os recursos sem vínculo (degree-0) — antes despejados
 *      num grid ruidoso — ficam numa lista colapsada ("N recursos sem
 *      conexão neste recorte"), expansível, com busca. Um toggle permite
 *      reincluí-los no diagrama (preserva o comportamento antigo).
 *   2. COR = SINAL DE DECISÃO. O eixo de cor padrão é RESTRIÇÃO
 *      (permissions), coerente com um produto de segurança. Frescor (usage)
 *      e os demais eixos seguem acessíveis na legenda — sempre com rótulo,
 *      nunca só cor.
 *   3. DETALHE HUMANO. Ao selecionar um nó: Nome, Última atualização
 *      (frescor), Restrição (marcações como rótulos), "Alimentado por"
 *      (upstream por LABEL) e "Afeta" (downstream por LABEL). O id cru, o
 *      tipo técnico e o JSON ficam atrás do expander "Detalhes técnicos".
 *
 * O grafo da ONTOLOGIA (`/ontologia/grafo`) é separado e NÃO é tocado.
 */
import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  GitBranch,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Zap,
  Brain,
  Workflow,
  Bot,
  Search,
  Activity,
  Network,
  Rows3,
  Rows4,
  Eye,
  EyeOff,
  X,
  Unlink,
  Clock,
  Wrench,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { TableCountBadge } from '@/components/data-table/table-count-badge';
import { TabsCompact } from '@/components/ui/tabs-compact';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n/provider';
import { labelLineageKind } from '@/lib/lineage-i18n';
import {
  LineageFlowCanvas,
  splitConnectivity,
  type ColorAxis,
  type CanvasDensity,
} from '@/components/grafo/lineage-flow-canvas';
import { ColorLegend } from '@/components/grafo/color-legend';
import {
  LineageGraph,
  Lineage,
  type LineageGraphOut,
  type LineageGraphNode,
  type LineageGraphEdge,
  type LineageEvent,
  type DataAssetLite,
  type ColumnTrace,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';

type Aba = 'mapa' | 'eventos';

type Tradutor = (k: string) => string;

const KIND_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: '', labelKey: 'grafo.kindAll' },
  { value: 'DataAsset', labelKey: 'grafo.kindDataAsset' },
  { value: 'ActionType', labelKey: 'grafo.kindActionType' },
  { value: 'LogicFunction', labelKey: 'grafo.kindLogicFunction' },
  { value: 'Workspace', labelKey: 'grafo.kindWorkspace' },
  { value: 'LanguageModel', labelKey: 'grafo.kindLanguageModel' },
  { value: 'OntologyNode', labelKey: 'grafo.kindOntologyNode' },
];

const KIND_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  DataAsset: Boxes,
  ActionType: Zap,
  LogicFunction: Brain,
  OntologyNode: GitBranch,
  Workspace: Workflow,
  LanguageModel: Bot,
};

/** Rótulo i18n por kind — derivado de KIND_OPTIONS (jamais o type cru). */
const KIND_LABEL_KEY: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.labelKey]),
);

/** Rótulo i18n do eixo de cor ativo — liga a legenda ao canvas (caption). */
const AXIS_LABEL_KEY: Record<ColorAxis, string> = {
  general: 'grafo.legendGeneral',
  permissions: 'grafo.legendPermissions',
  usage: 'grafo.legendUsage',
  organization: 'grafo.legendOrganization',
};

/** Rótulo humano por kind (meta.label), nunca o `kind` técnico cru na UI. */
function kindLabel(kind: string, t: Tradutor): string {
  return t(KIND_LABEL_KEY[kind] ?? 'grafo.kindAll');
}

/** Versão do recurso (frescor). extra.version ausente → 1 (atual). */
function nodeVersion(n: LineageGraphNode): number {
  const v = (n.extra ?? {})['version'];
  return typeof v === 'number' ? v : 1;
}

/** Chips pré-curados do log de eventos (vinham da página /lineage). */
const QUICK_FILTERS: { label: string; eventType: string }[] = [
  { label: 'Marcações', eventType: 'markings.apply' },
  { label: 'Marcações · property', eventType: 'markings.apply.property' },
  { label: 'Marcação · arquivar', eventType: 'markings.archive' },
  { label: 'Classificação', eventType: 'classification.set' },
  { label: 'Sala publish', eventType: 'workspace.publish' },
  { label: 'Sala promote', eventType: 'workspace.promote' },
  { label: 'Sala kiosk start', eventType: 'workspace.kiosk.session.start' },
  { label: 'Tour create', eventType: 'workspace.update.create' },
  { label: 'Restrição', eventType: 'project.constraints.set' },
  { label: 'Operação update', eventType: 'project.update' },
  { label: 'Organização update', eventType: 'organization.update' },
];

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export default function GrafoPage() {
  return (
    <RequirePerm perm="data.lineage.read">
      <React.Suspense fallback={null}>
        <GrafoInner />
      </React.Suspense>
    </RequirePerm>
  );
}

function GrafoInner() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // O deep-link legado `?aba=coluna` redireciona p/ Eventos (a proveniência
  // de coluna agora vive dentro da aba Eventos). Sem 404, sem perda.
  const abaParam = params?.get('aba');
  const abaFromQuery: Aba =
    abaParam === 'eventos' || abaParam === 'coluna' ? 'eventos' : 'mapa';
  const wantColumn = abaParam === 'coluna';
  const [aba, setAba] = React.useState<Aba>(abaFromQuery);

  // Mantém a aba sincronizada com a query (deep-link de /lineage → ?aba=eventos).
  React.useEffect(() => {
    setAba(abaFromQuery);
  }, [abaFromQuery]);

  const selectAba = React.useCallback(
    (next: Aba) => {
      setAba(next);
      const qs = new URLSearchParams(params?.toString() ?? '');
      if (next === 'mapa') qs.delete('aba');
      else qs.set('aba', next);
      const s = qs.toString();
      router.replace(`${pathname}${s ? `?${s}` : ''}`);
    },
    [params, pathname, router],
  );

  return (
    <div data-testid="grafo-page">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <Network className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
            {t('grafo.title')}
          </span>
        }
        subtitle={t('grafo.subtitle')}
      />

      <TabsCompact<Aba>
        items={[
          {
            value: 'mapa',
            label: t('grafo.tabMapa'),
            fullLabel: t('grafo.tabMapaFull'),
            icon: Network,
            testId: 'grafo-tab-mapa',
          },
          {
            value: 'eventos',
            label: t('grafo.tabEventos'),
            fullLabel: t('grafo.tabEventosFull'),
            icon: Activity,
            testId: 'grafo-tab-eventos',
          },
        ]}
        value={aba}
        onChange={selectAba}
        ariaLabel={t('grafo.title')}
      />

      {aba === 'mapa' ? (
        <MapaTab />
      ) : (
        <EventosTab initialColumnOpen={wantColumn} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba "Mapa" — diagrama de pipeline direcionado                              */
/* -------------------------------------------------------------------------- */
function MapaTab() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // O3b — foco por asset: ?asset=<uuid> filtra o grafo na sub-DAG de proveniência
  // do asset (backend) + centra/seleciona o nó. Alimenta os micro-links "ver
  // linhagem" do canvas de pipeline e o atalho "L".
  const assetParam = params?.get('asset') ?? null;
  const [kind, setKind] = React.useState('');
  const [marking, setMarking] = React.useState('');
  const [limit, setLimit] = React.useState(10);
  const [data, setData] = React.useState<LineageGraphOut | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<LineageGraphNode | null>(null);
  const [filter, setFilter] = React.useState('');
  // Cor padrão = SINAL DE DECISÃO: restrição (permissions), não 'general'.
  const [colorAxis, setColorAxis] = React.useState<ColorAxis>('permissions');
  const [density, setDensity] = React.useState<CanvasDensity>('comfortable');
  // Tipos OCULTOS do canvas (fold). Vazio → todos visíveis. Permite dobrar
  // blocos densos (ex.: centenas de DataAsset) p/ revelar o pipeline.
  const [foldedKinds, setFoldedKinds] = React.useState<Set<string>>(
    () => new Set(),
  );
  // Recursos sem vínculo: por padrão FORA do canvas (estado limpo). O toggle
  // os reinclui no diagrama (preserva o comportamento antigo do grid).
  const [showDisconnected, setShowDisconnected] = React.useState(false);
  const [discOpen, setDiscOpen] = React.useState(false);
  const [discFilter, setDiscFilter] = React.useState('');
  // Detalhe humano: o bloco técnico (id/tipo/JSON) começa recolhido.
  const [techOpen, setTechOpen] = React.useState(false);

  // Fix refresh: AbortController encadeado. Cada refetch cancela o anterior.
  const abortRef = React.useRef<AbortController | null>(null);

  const refresh = React.useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setErr(null);
    LineageGraph.get(
      {
        kind: kind || undefined,
        marking: marking || undefined,
        limit_events: limit,
        asset_id: assetParam || undefined,
      },
      ctrl.signal,
    )
      .then((out) => {
        if (ctrl.signal.aborted) return;
        setData(out);
      })
      .catch((e) => {
        if (isAbort(e) || ctrl.signal.aborted) return;
        setErr(humanise(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  }, [kind, marking, limit, assetParam]);

  // O3b — alterna o foco por asset na URL (deep-link, nunca localStorage).
  const focusAsset = React.useCallback((assetUuid: string | null) => {
    const qs = new URLSearchParams(params?.toString() ?? '');
    if (assetUuid) qs.set('asset', assetUuid);
    else qs.delete('asset');
    const s = qs.toString();
    router.replace(`${pathname}${s ? `?${s}` : ''}`);
  }, [params, pathname, router]);

  React.useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  // Mantém a seleção viva apenas se o nó ainda existe no snapshot atual.
  React.useEffect(() => {
    if (!data || !selected) return;
    const still = data.nodes.find((n) => n.id === selected.id);
    if (!still) setSelected(null);
  }, [data, selected]);

  // O3b — ao focar por ?asset, seleciona o nó do asset (o canvas auto-centra).
  React.useEffect(() => {
    if (!assetParam || !data) return;
    const node = data.nodes.find((n) => n.id === `asset:${assetParam}`);
    if (node) setSelected(node);
  }, [assetParam, data]);

  // O3b — atalho "L": foca/desfoca a linhagem do asset selecionado (overlay).
  // Ignorado em campos de texto p/ não atrapalhar a digitação.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if (e.key.toLowerCase() === 'l' && selected?.id?.startsWith('asset:')) {
        e.preventDefault();
        const uuid = selected.id.slice('asset:'.length);
        focusAsset(assetParam === uuid ? null : uuid);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, assetParam, focusAsset]);

  // Recolhe o bloco técnico ao trocar de nó selecionado.
  React.useEffect(() => {
    setTechOpen(false);
  }, [selected?.id]);

  const matchNode = React.useCallback(
    (n: LineageGraphNode, q: string) =>
      n.label.toLowerCase().includes(q) ||
      n.kind.toLowerCase().includes(q) ||
      n.id.toLowerCase().includes(q),
    [],
  );

  const filteredNodes = React.useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.nodes;
    return data.nodes.filter((n) => matchNode(n, q));
  }, [data, filter, matchNode]);

  // Mapa id → nó p/ resolver vizinhos por LABEL (nunca from_id/to_id cru).
  const nodeById = React.useMemo(() => {
    const m = new Map<string, LineageGraphNode>();
    if (data) for (const n of data.nodes) m.set(n.id, n);
    return m;
  }, [data]);

  // "Alimentado por" (upstream — arestas que chegam) e "Afeta" (downstream —
  // arestas que saem). Cada item resolve o nó da outra ponta por label.
  const upstream = React.useMemo(() => {
    if (!data || !selected) return [];
    return data.edges
      .filter((e) => e.to_id === selected.id)
      .map((e) => ({ edge: e, node: nodeById.get(e.from_id) ?? null }));
  }, [data, selected, nodeById]);

  const downstream = React.useMemo(() => {
    if (!data || !selected) return [];
    return data.edges
      .filter((e) => e.from_id === selected.id)
      .map((e) => ({ edge: e, node: nodeById.get(e.to_id) ?? null }));
  }, [data, selected, nodeById]);

  // Data do evento mais recente incidente ao nó (frescor "última atualização").
  const lastEventAt = React.useMemo(() => {
    if (!data || !selected) return null;
    let latest: number | null = null;
    for (const e of data.edges) {
      if (e.from_id !== selected.id && e.to_id !== selected.id) continue;
      if (!e.created_at) continue;
      const ts = Date.parse(e.created_at);
      if (Number.isNaN(ts)) continue;
      if (latest === null || ts > latest) latest = ts;
    }
    return latest;
  }, [data, selected]);

  // Split por conectividade (reusa o mesmo critério do computeLayout do canvas).
  const { connectedIds, disconnectedIds } = React.useMemo(
    () =>
      data
        ? splitConnectivity(data.nodes, data.edges)
        : { connectedIds: new Set<string>(), disconnectedIds: new Set<string>() },
    [data],
  );

  const disconnectedNodes = React.useMemo(
    () => (data ? data.nodes.filter((n) => disconnectedIds.has(n.id)) : []),
    [data, disconnectedIds],
  );

  const discFiltered = React.useMemo(() => {
    const q = discFilter.trim().toLowerCase();
    if (!q) return disconnectedNodes;
    return disconnectedNodes.filter((n) => matchNode(n, q));
  }, [disconnectedNodes, discFilter, matchNode]);

  // Contagem por tipo — alimenta os toggles de fold (mostrar/ocultar tipo).
  const kindCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const n of data.nodes) m.set(n.kind, (m.get(n.kind) ?? 0) + 1);
    return m;
  }, [data]);

  const toggleFold = React.useCallback((k: string) => {
    setFoldedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  // Nós ELEGÍVEIS ao canvas: por padrão só os conectados (pipeline limpo).
  // Com `showDisconnected`, os soltos voltam ao diagrama.
  const eligibleNodes = React.useMemo(() => {
    if (!data) return [];
    if (showDisconnected) return data.nodes;
    return data.nodes.filter((n) => connectedIds.has(n.id));
  }, [data, showDisconnected, connectedIds]);

  // Nós efetivamente DESENHADOS — após aplicar o fold por tipo.
  const canvasNodes = React.useMemo(() => {
    if (foldedKinds.size === 0) return eligibleNodes;
    return eligibleNodes.filter((n) => !foldedKinds.has(n.kind));
  }, [eligibleNodes, foldedKinds]);

  const canvasEdges = React.useMemo(() => {
    if (!data) return [];
    const visible = new Set(canvasNodes.map((n) => n.id));
    return data.edges.filter(
      (e) => visible.has(e.from_id) && visible.has(e.to_id),
    );
  }, [data, canvasNodes]);

  // Ocultos POR FOLD (não por conectividade — esses têm painel próprio).
  const hiddenCount = eligibleNodes.length - canvasNodes.length;

  // Busca → ids em destaque no canvas (esmaece os demais). Mínimo de 2 chars
  // p/ evitar esmaecer tudo a cada tecla. null quando sem busca ativa.
  const matchIds = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q.length < 2 || !data) return null;
    const s = new Set<string>();
    for (const n of canvasNodes) if (matchNode(n, q)) s.add(n.id);
    return s;
  }, [filter, data, canvasNodes, matchNode]);

  // Fix refresh: key derivada dos filtros força remount limpo do canvas.
  const foldKey = [...foldedKinds].sort().join(',');
  const canvasKey = `${kind}-${marking}-${limit}-${colorAxis}-${density}-${showDisconnected}-${foldKey}`;

  // Não há nenhum recurso conectado neste recorte (só soltos)?
  const noConnected = !!data && connectedIds.size === 0;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-4">
      {/* Filtros (esquerda) + busca + lista textual + legenda */}
      <section className="space-y-3" data-testid="grafo-filters">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
            {t('grafo.kindLabel')}
          </Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 bg-white border border-border-light px-2 text-[12px] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            data-testid="grafo-kind"
            aria-label={t('grafo.kindLabel')}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
            {t('grafo.markingLabel')}
          </Label>
          <Input
            value={marking}
            onChange={(e) => setMarking(e.target.value)}
            placeholder={t('grafo.markingPlaceholder')}
            className="h-9 text-[12px] font-mono"
            data-testid="grafo-marking"
            aria-label={t('grafo.markingLabel')}
          />
        </div>

        <div className="space-y-1">
          <Label
            htmlFor="grafo-limit-input"
            className="text-[10px] uppercase tracking-wider text-muted-on-light"
          >
            {t('grafo.limitLabel')}
          </Label>
          <Input
            id="grafo-limit-input"
            type="number"
            min={10}
            max={5000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="h-9 text-[12px]"
            aria-label={t('grafo.limitAria')}
          />
        </div>

        <div className="space-y-1 pt-2 border-t border-border-light">
          <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
            {t('grafo.searchLabel')}
          </Label>
          <div className="relative">
            <Search
              className="absolute left-2 top-2 w-3 h-3 text-muted-on-light"
              strokeWidth={1.5}
              aria-hidden
            />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('grafo.searchPlaceholder')}
              className="h-9 pl-7 text-[12px]"
              data-testid="grafo-filter"
              aria-label={t('grafo.searchLabel')}
            />
          </div>
        </div>

        {/* Lista textual — navegação assistiva + filtragem por texto. */}
        <div className="border border-border-light bg-white max-h-[260px] overflow-auto">
          {filteredNodes.length === 0 ? (
            <p className="text-[11px] text-muted-on-light px-3 py-2">
              {t('grafo.noNodeMatch')}
            </p>
          ) : (
            <ul className="divide-y divide-border-light" data-testid="grafo-nodes">
              {filteredNodes.map((n) => {
                const Icon = KIND_ICON[n.kind] ?? GitBranch;
                const sel = selected?.id === n.id;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(n)}
                      data-testid={`grafo-node-${n.id}`}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-canvas-light focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                        sel ? 'bg-primary/5 border-l-2 border-primary' : ''
                      }`}
                    >
                      <Icon
                        className="w-3.5 h-3.5 text-muted-on-light shrink-0 mt-0.5"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-text-on-light truncate">
                          {n.label}
                        </p>
                        <p className="text-[10px] text-muted-on-light truncate">
                          {kindLabel(n.kind, t)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Fold por tipo — mostra/oculta kinds densos do canvas. */}
        {data && data.nodes.length > 0 && (
          <div
            className="border border-border-light bg-white"
            data-testid="grafo-fold"
          >
            <header className="px-3 py-2 border-b border-border-light">
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                {t('grafo.foldLabel')}
              </p>
              <p className="text-[10px] text-muted-on-light mt-0.5 leading-tight">
                {t('grafo.foldHint')}
              </p>
            </header>
            <ul className="px-2 py-1.5 space-y-0.5">
              {[...kindCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([k, count]) => {
                  const Icon = KIND_ICON[k] ?? GitBranch;
                  const shown = !foldedKinds.has(k);
                  const ToggleIcon = shown ? Eye : EyeOff;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => toggleFold(k)}
                        data-testid={`grafo-fold-${k}`}
                        aria-pressed={shown}
                        aria-label={`${
                          shown ? t('grafo.foldHide') : t('grafo.foldShow')
                        } ${kindLabel(k, t)}`}
                        title={`${
                          shown ? t('grafo.foldHide') : t('grafo.foldShow')
                        } ${kindLabel(k, t)}`}
                        className={`w-full flex items-center gap-2 px-2 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary hover:bg-canvas-light ${
                          shown ? '' : 'opacity-50'
                        }`}
                      >
                        <Icon
                          className="w-3.5 h-3.5 shrink-0 text-muted-on-light"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        <span className="text-[11px] text-text-on-light flex-1 truncate">
                          {kindLabel(k, t)}
                        </span>
                        <span className="text-[10px] font-mono text-muted-on-light tabular-nums">
                          {count}
                        </span>
                        <ToggleIcon
                          className="w-3.5 h-3.5 shrink-0 text-muted-on-light"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        <ColorLegend axis={colorAxis} onAxisChange={setColorAxis} />
      </section>

      {/* Diagrama (centro) */}
      <section className="space-y-3" data-testid="grafo-canvas-section">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {data && (
              <TableCountBadge
                total={data.total_nodes}
                singular="nó"
                plural="nós"
                tone="primary"
              />
            )}
            {matchIds && (
              <span
                data-testid="grafo-match-count"
                className="text-[10px] uppercase tracking-wider font-semibold text-primary border border-primary px-2 h-6 inline-flex items-center gap-1.5 bg-white"
              >
                <Search className="w-3 h-3" strokeWidth={1.5} aria-hidden />
                {matchIds.size} {t('grafo.matchCount')}
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  data-testid="grafo-clear-search"
                  aria-label={t('grafo.clearSearch')}
                  title={t('grafo.clearSearch')}
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <X className="w-3 h-3" strokeWidth={2} aria-hidden />
                </button>
              </span>
            )}
            {hiddenCount > 0 && (
              <span
                data-testid="grafo-hidden-count"
                className="text-[10px] uppercase tracking-wider font-semibold text-muted-on-light border border-border-light px-2 h-6 inline-flex items-center bg-white"
              >
                {hiddenCount} {t('grafo.hiddenByFold')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Densidade — compacto/espaçado (recalcula o layout). */}
            <div
              className="inline-flex border border-border-light"
              role="group"
              aria-label={t('grafo.densityToggle')}
              data-testid="grafo-density"
            >
              <button
                type="button"
                onClick={() => setDensity('comfortable')}
                aria-pressed={density === 'comfortable'}
                data-testid="grafo-density-comfortable"
                title={t('grafo.densitySpacious')}
                className={`h-8 px-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                  density === 'comfortable'
                    ? 'bg-primary/5 text-primary'
                    : 'bg-white text-muted-on-light hover:text-text-on-light'
                }`}
              >
                <Rows3 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                {t('grafo.densitySpacious')}
              </button>
              <button
                type="button"
                onClick={() => setDensity('compact')}
                aria-pressed={density === 'compact'}
                data-testid="grafo-density-compact"
                title={t('grafo.densityCompact')}
                className={`h-8 px-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold border-l border-border-light focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                  density === 'compact'
                    ? 'bg-primary/5 text-primary'
                    : 'bg-white text-muted-on-light hover:text-text-on-light'
                }`}
              >
                <Rows4 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                {t('grafo.densityCompact')}
              </button>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              data-testid="grafo-refresh"
              className="h-8 px-3 text-[11px] uppercase tracking-wider font-semibold border border-border-light bg-white text-text-on-light hover:border-primary disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              {t('grafo.refresh')}
            </button>
          </div>
        </div>

        {/* Caption — liga a legenda (esquerda) ao diagrama: qual sinal a cor
            representa agora. aria-describedby informa o leitor de tela. */}
        <p
          id="grafo-color-caption"
          data-testid="grafo-color-caption"
          className="text-[10px] uppercase tracking-wider text-muted-on-light"
        >
          {t('grafo.colorCaptionPrefix')} {t(AXIS_LABEL_KEY[colorAxis])}
        </p>

        <div
          className="border border-border-light bg-white min-h-[540px]"
          aria-describedby="grafo-color-caption"
        >
          {loading && (
            <div className="p-4">
              <CpSkeleton rows={6} />
            </div>
          )}
          {err && (
            <div className="p-4">
              <CpErrorState
                title={t('grafo.canvasErrorTitle')}
                description={err}
                retry={refresh}
                diagnostic={{ path: '/platform/v23/lineage-graph', message: err }}
              />
            </div>
          )}
          {!loading && !err && data && data.nodes.length === 0 && (
            <div className="p-4">
              <CpEmptyState
                icon={GitBranch}
                title={t('grafo.emptyTitle')}
                description={t('grafo.emptyDesc')}
              />
            </div>
          )}
          {!loading && !err && data && data.nodes.length > 0 && canvasNodes.length === 0 && (
            <div className="p-4">
              <CpEmptyState
                icon={noConnected && !showDisconnected ? Unlink : EyeOff}
                title={
                  noConnected && !showDisconnected
                    ? t('grafo.emptyConnectedTitle')
                    : t('grafo.emptyTitle')
                }
                description={
                  noConnected && !showDisconnected
                    ? t('grafo.emptyConnectedDesc')
                    : t('grafo.foldHint')
                }
              />
            </div>
          )}
          {!loading && !err && data && canvasNodes.length > 0 && (
            <LineageFlowCanvas
              key={canvasKey}
              nodes={canvasNodes}
              edges={canvasEdges}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              colorAxis={colorAxis}
              density={density}
              matchIds={matchIds}
              height={540}
            />
          )}
        </div>

        {/* Recursos sem vínculo — fora do canvas por padrão; lista colapsada. */}
        {data && disconnectedNodes.length > 0 && (
          <section
            className="border border-border-light bg-white"
            data-testid="grafo-disconnected"
          >
            <div className="flex items-stretch">
              <button
                type="button"
                onClick={() => setDiscOpen((o) => !o)}
                aria-expanded={discOpen}
                data-testid="grafo-disconnected-toggle"
                className="flex-1 flex items-center gap-2 px-3 py-2 text-left hover:bg-canvas-light focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                {discOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} aria-hidden />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} aria-hidden />
                )}
                <Unlink className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="text-[11px] text-text-on-light">
                  <span className="font-mono tabular-nums">{disconnectedNodes.length}</span>{' '}
                  {t('grafo.disconnectedSummary')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowDisconnected((s) => !s)}
                aria-pressed={showDisconnected}
                data-testid="grafo-disconnected-show"
                title={t('grafo.disconnectedShowOnCanvas')}
                className={`px-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold border-l border-border-light focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                  showDisconnected
                    ? 'bg-primary/5 text-primary'
                    : 'bg-white text-muted-on-light hover:text-text-on-light'
                }`}
              >
                {showDisconnected ? (
                  <Eye className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                )}
                {t('grafo.disconnectedShowOnCanvas')}
              </button>
            </div>
            {discOpen && (
              <div
                className="border-t border-border-light"
                data-testid="grafo-disconnected-body"
              >
                <div className="p-2">
                  <div className="relative">
                    <Search
                      className="absolute left-2 top-2 w-3 h-3 text-muted-on-light"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <Input
                      value={discFilter}
                      onChange={(e) => setDiscFilter(e.target.value)}
                      placeholder={t('grafo.disconnectedSearch')}
                      className="h-8 pl-7 text-[12px]"
                      data-testid="grafo-disconnected-filter"
                      aria-label={t('grafo.disconnectedSearch')}
                    />
                  </div>
                </div>
                {discFiltered.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-muted-on-light">
                    {t('grafo.disconnectedEmpty')}
                  </p>
                ) : (
                  <ul
                    className="divide-y divide-border-light max-h-[280px] overflow-auto"
                    data-testid="grafo-disconnected-list"
                  >
                    {discFiltered.map((n) => {
                      const Icon = KIND_ICON[n.kind] ?? GitBranch;
                      const sel = selected?.id === n.id;
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(n)}
                            data-testid={`grafo-disc-node-${n.id}`}
                            className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-canvas-light focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                              sel ? 'bg-primary/5 border-l-2 border-primary' : ''
                            }`}
                          >
                            <Icon
                              className="w-3.5 h-3.5 text-muted-on-light shrink-0 mt-0.5"
                              strokeWidth={1.5}
                              aria-hidden
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold text-text-on-light truncate">
                                {n.label}
                              </p>
                              <p className="text-[10px] text-muted-on-light truncate">
                                {kindLabel(n.kind, t)}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {data?.truncated && (
          <p className="text-[10px] font-mono text-warning px-3 py-2 border border-border-light">
            {t('grafo.truncated')}
          </p>
        )}
      </section>

      {/* Selection details (direita) — linguagem de operação */}
      <section
        className="border border-border-light bg-white p-4"
        data-testid="grafo-selection-details"
      >
        {!selected ? (
          <p className="text-[12px] text-muted-on-light">{t('grafo.detailEmpty')}</p>
        ) : (
          <NodeDetail
            node={selected}
            upstream={upstream}
            downstream={downstream}
            lastEventAt={lastEventAt}
            techOpen={techOpen}
            onToggleTech={() => setTechOpen((o) => !o)}
            focused={!!assetParam && selected.id === `asset:${assetParam}`}
            onFocusAsset={focusAsset}
            t={t}
          />
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Painel de detalhe HUMANO — nome, frescor, restrição, vizinhos por label.   */
/* O id cru + tipo técnico + JSON ficam atrás do expander "Detalhes técnicos".*/
/* -------------------------------------------------------------------------- */
interface NeighborRel {
  edge: LineageGraphEdge;
  node: LineageGraphNode | null;
}

function NodeDetail({
  node,
  upstream,
  downstream,
  lastEventAt,
  techOpen,
  onToggleTech,
  focused,
  onFocusAsset,
  t,
}: {
  node: LineageGraphNode;
  upstream: NeighborRel[];
  downstream: NeighborRel[];
  lastEventAt: number | null;
  techOpen: boolean;
  onToggleTech: () => void;
  focused: boolean;
  onFocusAsset: (assetUuid: string | null) => void;
  t: Tradutor;
}) {
  const version = nodeVersion(node);
  const outdated = version > 1;
  const isAsset = node.id.startsWith('asset:');
  const assetUuid = isAsset ? node.id.slice('asset:'.length) : null;
  return (
    <div data-testid="grafo-detail" className="space-y-4">
      {/* Nome (humano) + tipo legível (meta.label, nunca o kind cru) */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {kindLabel(node.kind, t)}
        </p>
        <h3 className="text-[14px] font-semibold text-text-on-light leading-tight">
          {node.label}
        </h3>
      </div>

      {/* O3b — foco na linhagem (Produzido por/Usado em) do asset. Atalho "L". */}
      {isAsset && (
        <button
          type="button"
          data-testid="grafo-focus-lineage"
          aria-pressed={focused}
          onClick={() => onFocusAsset(focused ? null : assetUuid)}
          className={
            'inline-flex items-center gap-1.5 h-6 px-2 text-[11px] border ' +
            (focused ? 'border-primary text-primary bg-primary/5' : 'border-border-light text-text-on-light hover:border-primary')
          }
        >
          <GitBranch className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
          {focused ? t('grafo.clearLineageFocus') : t('grafo.viewLineage')}
          <kbd className="ml-1 text-[9px] text-muted-on-light font-mono">L</kbd>
        </button>
      )}

      {/* Última atualização (frescor) — rótulo + ícone, nunca só cor */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
          {t('grafo.detailUpdated')}
        </p>
        <span
          data-testid="grafo-detail-freshness"
          title={t('grafo.freshnessHint')}
          className={`inline-flex items-center gap-1 border px-1.5 h-5 text-[11px] bg-white ${
            outdated
              ? 'border-danger text-danger'
              : 'border-primary text-primary'
          }`}
        >
          <Clock className="w-3 h-3" strokeWidth={1.5} aria-hidden />
          {outdated ? t('grafo.detailOutdated') : t('grafo.detailCurrent')}
          <span className="font-mono">· v{version}</span>
        </span>
        {lastEventAt !== null && (
          <p className="text-[10px] text-muted-on-light mt-1">
            {t('grafo.detailLastEvent')}{' '}
            <span className="font-mono">
              {new Date(lastEventAt).toLocaleString('pt-BR')}
            </span>
          </p>
        )}
      </div>

      {/* Restrição — marcações como rótulos */}
      <div data-testid="grafo-detail-restriction">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
          {t('grafo.detailRestriction')}
        </p>
        {node.markings.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {node.markings.map((m) => (
              // FIX #11 (badges grafo, 2026-06-28): marcação gigante NUNCA quebra
              // o layout — `max-w-[140px]` + texto `truncate` (com `title` p/ o
              // valor completo). Regra universal AEGIS de badge.
              <span
                key={m}
                title={`${m} · ${t('grafo.markingTitleSuffix')}`}
                className="inline-flex items-center gap-1 border border-warning text-warning bg-white px-1.5 h-5 text-[10px] font-mono uppercase max-w-[140px] min-w-0"
              >
                <ShieldAlert className="w-3 h-3 shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="truncate min-w-0">{m}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 border border-success text-success bg-white px-1.5 h-5 text-[11px]">
            <ShieldCheck className="w-3 h-3" strokeWidth={1.5} aria-hidden />
            {t('grafo.detailNoRestriction')}
          </span>
        )}
      </div>

      {/* Operação / Espaço (Organization) */}
      {(node.org?.project_label || node.org?.space_label) && (
        <p className="text-[11px] text-muted-on-light" data-testid="grafo-detail-org">
          {t('grafo.detailOrg')}{' '}
          {[node.org?.space_label, node.org?.project_label]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {/* Alimentado por (upstream) */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1 flex items-center gap-1.5">
          <ArrowDownToLine className="w-3 h-3" strokeWidth={1.5} aria-hidden />
          {t('grafo.detailFedBy')} ({upstream.length})
        </p>
        {upstream.length === 0 ? (
          <p className="text-[11px] text-muted-on-light">
            {t('grafo.detailNoUpstream')}
          </p>
        ) : (
          <ul className="space-y-1" data-testid="grafo-detail-upstream">
            {upstream.map((r) => (
              <NeighborRow key={r.edge.id} rel={r} t={t} />
            ))}
          </ul>
        )}
      </div>

      {/* Afeta (downstream) */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1 flex items-center gap-1.5">
          <ArrowUpFromLine className="w-3 h-3" strokeWidth={1.5} aria-hidden />
          {t('grafo.detailAffects')} ({downstream.length})
        </p>
        {downstream.length === 0 ? (
          <p className="text-[11px] text-muted-on-light">
            {t('grafo.detailNoDownstream')}
          </p>
        ) : (
          <ul className="space-y-1" data-testid="grafo-detail-downstream">
            {downstream.map((r) => (
              <NeighborRow key={r.edge.id} rel={r} t={t} />
            ))}
          </ul>
        )}
      </div>

      {/* Detalhes técnicos (expander) — id cru + tipo técnico + JSON */}
      <div className="border-t border-border-light pt-3">
        <button
          type="button"
          onClick={onToggleTech}
          aria-expanded={techOpen}
          data-testid="grafo-detail-tech-toggle"
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-on-light hover:text-text-on-light focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          {techOpen ? (
            <ChevronDown className="w-3 h-3" strokeWidth={1.5} aria-hidden />
          ) : (
            <ChevronRight className="w-3 h-3" strokeWidth={1.5} aria-hidden />
          )}
          <Wrench className="w-3 h-3" strokeWidth={1.5} aria-hidden />
          {t('grafo.detailTech')}
        </button>
        {techOpen && (
          <div data-testid="grafo-detail-technical" className="mt-2 space-y-2">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-on-light">
                {t('grafo.detailTechType')}
              </p>
              <p className="text-[10px] font-mono text-text-on-light break-all">
                {node.kind}
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-on-light">
                {t('grafo.detailTechId')}
              </p>
              <p className="text-[10px] font-mono text-muted-on-light break-all">
                {node.id}
              </p>
            </div>
            {Object.keys(node.extra).length > 0 && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-on-light">
                  {t('grafo.detailProps')}
                </p>
                <pre className="text-[10px] font-mono bg-canvas-light p-2 whitespace-pre-wrap break-all">
                  {JSON.stringify(node.extra, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NeighborRow({ rel, t }: { rel: NeighborRel; t: Tradutor }) {
  const { edge, node } = rel;
  const Icon = node ? KIND_ICON[node.kind] ?? GitBranch : GitBranch;
  const label = node ? node.label : t('grafo.detailUnknownNode');
  const via = labelLineageKind(edge.kind);
  return (
    <li className="flex items-start gap-1.5">
      <Icon
        className="w-3.5 h-3.5 text-muted-on-light shrink-0 mt-0.5"
        strokeWidth={1.5}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-[12px] text-text-on-light truncate">{label}</p>
        <p className="text-[10px] text-muted-on-light truncate">
          {edge.actor ? `${t('grafo.detailVia')} ${via} · ${edge.actor}` : via}
        </p>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba "Eventos" — log de LineageEvent (vinha de /painel-de-controle/lineage) */
/* + drill-down de proveniência de coluna (antiga aba "Coluna").              */
/* -------------------------------------------------------------------------- */
function EventosTab({ initialColumnOpen = false }: { initialColumnOpen?: boolean }) {
  const t = useT();
  const [events, setEvents] = React.useState<LineageEvent[] | null>(null);
  const [eventType, setEventType] = React.useState<string>('');
  const [textFilter, setTextFilter] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const abortRef = React.useRef<AbortController | null>(null);

  const refresh = React.useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setErr(null);
    Lineage.listEvents(
      { limit: 200, event_type: eventType || undefined },
      ctrl.signal,
    )
      .then((out) => {
        if (ctrl.signal.aborted) return;
        setEvents(out);
      })
      .catch((e) => {
        if (isAbort(e) || ctrl.signal.aborted) return;
        setErr((e as Error)?.message ?? t('lineage.errorTitle'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  }, [eventType, t]);

  React.useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const filtered = React.useMemo(() => {
    if (!events) return [];
    if (!textFilter.trim()) return events;
    const q = textFilter.trim().toLowerCase();
    return events.filter((e) => {
      if (e.actor?.toLowerCase().includes(q)) return true;
      if (e.event_type.toLowerCase().includes(q)) return true;
      const meta = JSON.stringify(e.metadata_ ?? {}).toLowerCase();
      return meta.includes(q);
    });
  }, [events, textFilter]);

  return (
    <div className="p-6 max-w-5xl space-y-4">
      {/* Proveniência de coluna — drill-down progressivo (antiga aba Coluna). */}
      <ColumnProvenanceSection defaultOpen={initialColumnOpen} />

      <section className="bg-canvas-light border border-border-light p-3 space-y-3">
        <header className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" strokeWidth={1.5} aria-hidden />
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex-1">
            {t('lineage.filters')}
          </p>
        </header>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder={t('lineage.searchPlaceholder')}
            data-testid="lineage-text-filter"
            aria-label={t('lineage.searchPlaceholder')}
            className="flex-1 h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          />
          <input
            type="text"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            placeholder={t('lineage.eventTypePlaceholder')}
            data-testid="lineage-event-type"
            aria-label={t('lineage.eventTypePlaceholder')}
            className="w-[260px] h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="lineage-chips">
          <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mr-1">
            {t('lineage.shortcuts')}
          </span>
          <button
            type="button"
            onClick={() => setEventType('')}
            data-testid="lineage-chip-all"
            className={`h-6 px-2 text-[10.5px] font-mono border focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
              eventType === ''
                ? 'border-primary text-primary bg-white'
                : 'border-border-light text-muted-on-light bg-white hover:border-primary'
            }`}
          >
            {t('lineage.chipAll')}
          </button>
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.eventType}
              type="button"
              onClick={() => setEventType(f.eventType)}
              data-testid={`lineage-chip-${f.eventType}`}
              className={`h-6 px-2 text-[10.5px] font-mono border focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                eventType === f.eventType
                  ? 'border-primary text-primary bg-white'
                  : 'border-border-light text-muted-on-light bg-white hover:border-primary'
              }`}
              title={f.eventType}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {err && (
        <p className="text-[11px] text-danger font-mono" data-testid="lineage-error">
          {err}
        </p>
      )}

      {loading && (
        <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
      )}

      {!loading && events && filtered.length === 0 && (
        <CpEmptyState
          icon={Search}
          title={t('lineage.emptyTitle')}
          description={t('lineage.emptyDesc')}
          cta={{
            label: t('lineage.clearFilters'),
            onClick: () => {
              setEventType('');
              setTextFilter('');
            },
            testId: 'lineage-clear-filters',
          }}
        />
      )}

      {!loading && filtered.length > 0 && (
        <ul className="space-y-1" data-testid="lineage-list">
          {filtered.map((e) => (
            <li
              key={e.id}
              data-testid={`lineage-event-${e.id}`}
              className="bg-canvas-light border border-border-light p-3 grid grid-cols-[1fr_auto] gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono uppercase px-1.5 h-4 inline-flex items-center border ${
                      e.status === 'committed'
                        ? 'border-success text-success bg-white'
                        : e.status === 'failed'
                        ? 'border-danger text-danger bg-white'
                        : 'border-border-light text-muted-on-light bg-white'
                    }`}
                  >
                    {e.status}
                  </span>
                  <p className="text-[12px] font-mono font-semibold truncate">
                    {e.event_type}
                  </p>
                </div>
                <p className="text-[10.5px] font-mono text-muted-on-light mt-1 truncate">
                  {t('lineage.actor')} {e.actor ?? 'system'} ·{' '}
                  {new Date(e.timestamp).toLocaleString('pt-BR')}
                </p>
                {Object.keys(e.metadata_ ?? {}).length > 0 && (
                  <pre className="text-[10.5px] font-mono text-text-on-light mt-1 bg-white border border-border-light px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(e.metadata_, null, 0)}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Proveniência de coluna — drill-down dentro de Eventos (antiga aba Coluna). */
/* Funcionalidade 100% preservada: escolher dataset derivado + coluna →       */
/* Lineage.columnTrace → árvore recursiva ColumnTraceNode.                     */
/* -------------------------------------------------------------------------- */
function ColumnProvenanceSection({ defaultOpen }: { defaultOpen: boolean }) {
  const t = useT();
  const [open, setOpen] = React.useState(defaultOpen);
  const [assets, setAssets] = React.useState<DataAssetLite[] | null>(null);
  const [assetId, setAssetId] = React.useState('');
  const [column, setColumn] = React.useState('');
  const [trace, setTrace] = React.useState<ColumnTrace | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Carrega os derivados (única fonte de provenance de coluna) ao abrir.
  React.useEffect(() => {
    if (!open || assets) return;
    Lineage.assets('derived')
      .then((rows) => setAssets(rows))
      .catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [open, assets]);

  const selectedAsset = React.useMemo(
    () => (assets ?? []).find((a) => a.id === assetId) ?? null,
    [assets, assetId],
  );
  const columns = selectedAsset?.schema_snapshot?.columns ?? [];

  const runTrace = React.useCallback(() => {
    if (!assetId || !column) return;
    setBusy(true);
    setErr(null);
    setTrace(null);
    Lineage.columnTrace(assetId, column)
      .then((tr) => setTrace(tr))
      .catch((e) => setErr(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, [assetId, column]);

  return (
    <section
      className="border border-border-light bg-white"
      data-testid="grafo-coluna-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="grafo-coluna-section-toggle"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-canvas-light focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} aria-hidden />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} aria-hidden />
        )}
        <GitBranch className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} aria-hidden />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-text-on-light">
          {t('grafo.colunaSectionTitle')}
        </span>
      </button>

      {open && (
        <div className="border-t border-border-light p-4 space-y-4">
          <p className="text-[12px] text-muted-on-light">{t('grafo.colunaSubtitle')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-on-light">{t('grafo.colunaAsset')}</span>
              <select
                data-testid="grafo-coluna-asset"
                value={assetId}
                onChange={(e) => { setAssetId(e.target.value); setColumn(''); setTrace(null); }}
                className="w-72 h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              >
                <option value="">{t('grafo.colunaAssetPlaceholder')}</option>
                {(assets ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · v{a.version}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-on-light">{t('grafo.colunaColumn')}</span>
              <select
                data-testid="grafo-coluna-column"
                value={column}
                onChange={(e) => { setColumn(e.target.value); setTrace(null); }}
                disabled={!assetId}
                className="w-56 h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">{t('grafo.colunaColumnPlaceholder')}</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={runTrace}
              disabled={!assetId || !column || busy}
              data-testid="grafo-coluna-trace"
              className="h-8 px-3 text-[12px] bg-primary text-white hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50"
            >
              <GitBranch className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('grafo.colunaTrace')}
            </button>
          </div>

          {err ? (
            <p className="text-[12px] text-danger" data-testid="grafo-coluna-error">{err}</p>
          ) : null}

          {trace ? (
            <div className="border border-border-light bg-canvas-light p-3" data-testid="grafo-coluna-result">
              <ColumnTraceNode node={trace} depth={0} t={t} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ColumnTraceNode({
  node,
  depth,
  t,
}: {
  node: ColumnTrace;
  depth: number;
  t: Tradutor;
}) {
  return (
    <div style={{ paddingLeft: depth * 16 }} data-testid={`grafo-coluna-no-${node.asset_id}-${node.column}`}>
      <div className="flex items-center gap-1.5 text-[12px] py-0.5">
        {depth > 0 ? <ArrowRight className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} /> : null}
        <span className="font-mono text-primary">{node.column}</span>
        <span className="text-muted-on-light">·</span>
        <span className="text-text-on-light truncate">{node.asset_name}</span>
        {node.source ? (
          <span className="ml-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wide border bg-success/5 text-success border-success/40 shrink-0">
            {t('grafo.colunaOrigem')}
          </span>
        ) : null}
      </div>
      {node.upstream.map((u, i) => (
        <ColumnTraceNode key={`${u.asset_id}-${u.column}-${i}`} node={u} depth={depth + 1} t={t} />
      ))}
    </div>
  );
}
