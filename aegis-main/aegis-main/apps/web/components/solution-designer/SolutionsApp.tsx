'use client';
import { useSearchParams } from 'next/navigation';

/**
 * Desenho da Operação — AIP Architect diagram canvas (M4-REWORK).
 *
 *   - 3-pane shell (sharp): Node Toolbar + Biblioteca de referência (esquerda,
 *     3 categorias) · canvas reactflow interativo (centro) · inspector do nó
 *     (direita).
 *   - "Iniciar planejamento" → CHAT do AIP Arquiteto (plan-mode): o operador
 *     conversa com a IA, que coleta produto/fonte/build/requisitos uma
 *     pergunta por vez e, ao finalizar o plano (bloco aegis:plano), GERA o
 *     grafo de concept nodes nas fases Coleta → Processamento → Ontologia →
 *     Construção da aplicação. O diagrama aparece como ARTEFATO no canvas.
 *   - Toolbar de navegação: Novo diagrama, Carregar do histórico (lineage),
 *     Importar/Exportar (JSON), Desfazer/Refazer, descrição do diagrama.
 *   - Canvas interativo: drag-to-connect, resize, context-menu.
 *
 * UI nunca cita os nomes internos de produto; título via useT().
 */
import * as React from 'react';
import {
  Loader2,
  Save,
  ListChecks,
  FileStack,
  FilePlus2,
  History,
  Upload,
  Download,
  Undo2,
  Redo2,
  Hammer,
  ClipboardList,
  Boxes,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AppWindow,
} from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { Button } from '@/components/ui/button';
import { usePanelLayout } from '@/lib/layout/panel-layout';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/provider';
import {
  Solutions,
  Pages,
  type RegisteredPage,
  type SolutionBlueprint,
  type SolutionDiagram,
  type SolutionGraph,
  type SolutionMergeReport,
  type SolutionNode,
  type SolutionEdge,
  type SolutionPattern,
  type SolutionScope,
  type SolutionWizard,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { Workshop } from '@/lib/workshop/client';
import {
  SOLUTIONS_SLUG,
  SOLUTIONS_EXPERIENCE_KIND,
  SOLUTIONS_READ_PERM,
  readSolutionsExperienceParams,
} from '@/lib/solutions/experience-defaults';
import { registerAppRoute } from '@/lib/pages/app-route-registry';
import { readPageChrome } from '@/components/pages-editor/page-config-adapter';

import { SolutionCanvas } from '@/components/solution-designer/SolutionCanvas';
import {
  ProposedTypesProvider,
  proposedTypesFromGraph,
} from '@/components/solution-designer/proposed-types-context';
import { SampleProvider } from '@/components/solution-designer/sample-context';
import { useCpSidenav } from '@/lib/store';
import { LeftPane } from '@/components/solution-designer/LeftPane';
import { SavesMenu } from '@/components/solution-designer/SavesMenu';
import { OverflowMenu, type OverflowMenuItem } from '@/components/ui/overflow-menu';
import { NodeInspector } from '@/components/solution-designer/NodeInspector';
import { WalkthroughPanel } from '@/components/solution-designer/WalkthroughPanel';
import { HistoryPanel } from '@/components/solution-designer/HistoryPanel';
import { ArquitetoChat } from '@/components/solution-designer/ArquitetoChat';
import { MaterializeDialog } from '@/components/solution-designer/MaterializeDialog';
import { NodePlayModal, type PlayStatus } from '@/components/solution-designer/NodePlayModal';
import { kindLabel, type Phase } from '@/components/solution-designer/nodeMeta';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

function newId(): string {
  return Math.random().toString(36).slice(2, 14);
}

const EMPTY_GRAPH: SolutionGraph = { nodes: [], edges: [], wizard: {} };

/** Lados onde o painel do AIP Arquiteto pode ancorar (#3, feedback do operador). */
export type ChatDock = 'bottom' | 'top' | 'left' | 'right';
const DOCKS: readonly ChatDock[] = ['bottom', 'top', 'left', 'right'];
// Limites do resize do chat (px): altura quando bottom/top, largura quando left/right.
const CHAT_MIN = 220;
const CHAT_MAX = 720;
function clampChatSize(v: number): number {
  return Math.min(CHAT_MAX, Math.max(CHAT_MIN, Math.round(v)));
}

/**
 * Fallback local da Page `solutions` — espelha o seed do backend
 * (`DEFAULT_PAGES['solutions']` + `_DEFAULT_PAGE_LAYOUTS['solutions']`).
 * Usado só enquanto a leitura do registry não resolve (offline / sem registro)
 * para a rota nunca quebrar nem piscar skeleton. Status/perm/params editados
 * em Páginas passam a valer assim que `Pages.get` resolve.
 */
const SOLUTIONS_FALLBACK_PAGE: RegisteredPage = {
  slug: SOLUTIONS_SLUG,
  title: 'Soluções',
  route: '/paginas/solutions/view',
  status: 'published',
  workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
  marking_requirements: [],
  iam_perm_required: SOLUTIONS_READ_PERM,
  config: {
    mode: 'app_route',
    experience_kind: SOLUTIONS_EXPERIENCE_KIND,
    note: 'Desenho da Operação (AIP Arquiteto) — experiência em tempo real servida por código; não montável por widgets.',
  },
  last_edited_by: null,
  last_edited_at: null,
  created_at: null,
};

/**
 * W8 (2026-06-28) — corpo da Página "Soluções" (Desenho da Operação / AIP
 * Arquiteto). Extraído de ``app/painel-de-controle/solutions/page.tsx`` e
 * registrado como ROTA DE APLICAÇÃO (``app_route``) no registry de Páginas: a
 * Page ``solutions`` (slug salvo no banco) é servida por este componente. A
 * rota canônica passou a ser ``/paginas/solutions/view`` — renderiza no shell
 * do OPERADOR (AuthShell → Sidenav) via ``getAppRouteComponent``. Mantém a
 * resolução otimista da Page (status/perm/params) + RequirePerm + estado
 * arquivado, espelhando o que a rota canônica antiga fazia (a /paginas/[slug]/
 * view também gateia; redundância intencional, defesa em profundidade).
 */
export function SolutionsApp() {
  const t = useT();
  // Resolve OTIMISTA: parte do seed local (idêntico ao backend) e refina com a
  // Page salva quando ela chega — espelha aip-threads/page.tsx. Mantém a rota
  // funcional offline; status/perm/params editados em Páginas passam a valer
  // assim que o fetch resolve.
  const [page, setPage] = React.useState<RegisteredPage>(SOLUTIONS_FALLBACK_PAGE);

  React.useEffect(() => {
    let cancelled = false;
    Pages.get(SOLUTIONS_SLUG)
      .then((p) => {
        if (!cancelled && p) setPage(p);
      })
      // Offline / sem registro / sem perm de leitura do registry → mantém o
      // seed local. O RequirePerm abaixo ainda aplica a perm de leitura.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Page arquivada → operador não chega no canvas por esta rota.
  if (page.status === 'archived') {
    return (
      <CpEmptyState
        icon={AppWindow}
        title={t('solutions.unavailable.title')}
        description={t('solutions.unavailable.desc')}
      />
    );
  }

  // Perm da própria Page (editável em Páginas). Sem perm declarada → exige a
  // perm canônica de leitura do Desenho da Operação.
  const perm = page.iam_perm_required || SOLUTIONS_READ_PERM;
  return (
    <RequirePerm perm={perm}>
      <SolutionsInner page={page} />
    </RequirePerm>
  );
}

function SolutionsInner({ page }: { page: RegisteredPage }) {
  const t = useT();
  // W2 — defaults da experiência parametrizados em Páginas → "Configurar
  // experiência" (Page.config.params): profundidade, escopo e modelo AIP. A
  // /solutions LÊ esses defaults e os passa ao AIP Arquiteto (substituem os
  // literais internos do chat). Escopo 'full' = solução inteira (sem recorte).
  const experienceParams = React.useMemo(
    () => readSolutionsExperienceParams(page.config),
    [page.config],
  );
  // LOTE3 — chrome da página (params.chrome): quando o operador oculta o
  // cabeçalho em Páginas → "Moldura da página", recolhemos os campos de
  // título/descrição da toolbar (o "título próprio" da /solutions). Os
  // controles de edição (desfazer/refazer/menu/painéis) permanecem.
  const chrome = React.useMemo(
    () => readPageChrome(page.config),
    [page.config],
  );
  const designScope: SolutionScope | undefined = React.useMemo(
    () =>
      experienceParams.scope === 'full'
        ? undefined
        : { kind: experienceParams.scope, focus: '' },
    [experienceParams.scope],
  );
  // #4 — o Desenho da Operação precisa de espaço (canvas + chat): o sidenav do
  // Painel de Controle nasce RETRAÍDO aqui; restaura o estado anterior ao sair.
  const setSidenavCollapsed = useCpSidenav((s) => s.setCollapsed);
  React.useEffect(() => {
    const prev = useCpSidenav.getState().collapsed;
    setSidenavCollapsed(true);
    return () => setSidenavCollapsed(prev);
  }, [setSidenavCollapsed]);
  const [graph, setGraphState] = React.useState<SolutionGraph>(EMPTY_GRAPH);
  // ▶ play por nó: qual nó está aberto + status por nó (badge no ▶ do canvas).
  const [playNodeId, setPlayNodeId] = React.useState<string | null>(null);
  const [playStatus, setPlayStatus] = React.useState<Record<string, PlayStatus>>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [patterns, setPatterns] = React.useState<SolutionPattern[]>([]);
  const searchParams = useSearchParams();
  const [diagramId, setDiagramId] = React.useState<string | null>(null);
  const [diagramTitle, setDiagramTitle] = React.useState('Operação sem título');
  const [diagramDescription, setDiagramDescription] = React.useState('');
  // Modo-edição (F2): app-alvo quando o designer foi aberto por "Editar no AIP"
  // (?diagram=<id>&app=<id>). Salvar deve atualizar ESTE app (F3), não criar novo.
  const [editAppId, setEditAppId] = React.useState<string | null>(null);
  // F4 — nome do app em edição (alimenta o título + a copy do chat "Editando <app>").
  const [editingAppName, setEditingAppName] = React.useState<string | null>(null);
  // #3 (feedback do operador) — o chat nasce ABERTO: com o canvas escondido
  // por padrão, o AIP Arquiteto é o protagonista da página até existir diagrama.
  const [chatOpen, setChatOpen] = React.useState(true);
  // #4 (feedback do operador) — paleta "Componentes / Referências" vira painel
  // toggleável, DEFAULT ESCONDIDO: o protagonista da página é o chat + canvas.
  const [showLeftPane, setShowLeftPane] = React.useState(false);
  const [showWalkthrough, setShowWalkthrough] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  // #3 — layout de painéis com MEMORIZAÇÃO no backend (User.metadata_.context.
  // panel_layouts.solutions via /me/context — nunca localStorage): lado do dock
  // do chat, tamanho do chat (altura ou largura conforme o lado) e o colapso do
  // canvas (default ESCONDIDO; auto-expande quando o diagrama nasce).
  const { layout, setLayout } = usePanelLayout('solutions', {
    chat_dock: 'bottom' as string,
    chat_size: 340 as number,
    canvas_open: false as boolean,
  });
  const chatDock: ChatDock = DOCKS.includes(layout.chat_dock as ChatDock)
    ? (layout.chat_dock as ChatDock)
    : 'bottom';
  const chatSize = clampChatSize(Number(layout.chat_size) || 340);
  const canvasOpen = Boolean(layout.canvas_open);
  const dockHorizontal = chatDock === 'left' || chatDock === 'right';
  const [preview, setPreview] = React.useState<SolutionPattern | null>(null);
  const [buildOpen, setBuildOpen] = React.useState(false);
  const [buildDiagram, setBuildDiagram] = React.useState<SolutionDiagram | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [loadingLineage, setLoadingLineage] = React.useState(false);
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  // #10 — lista de diagramas salvos p/ o dropdown "Salvar ▾" (reabrir um save).
  const [diagrams, setDiagrams] = React.useState<SolutionDiagram[]>([]);

  // Undo/redo history (graph snapshots). `present` mirrors `graph`.
  const past = React.useRef<SolutionGraph[]>([]);
  const future = React.useRef<SolutionGraph[]>([]);
  const [canUndo, setCanUndo] = React.useState(false);
  const [canRedo, setCanRedo] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // Painel ancorado do AIP Arquiteto (abaixo do canvas). "Planejar" e o CTA do
  // canvas vazio EXPANDEM e rolam até ele — não há modal neste fluxo.
  const chatPanelRef = React.useRef<HTMLElement>(null);

  const wizard: SolutionWizard = (graph.wizard || {}) as SolutionWizard;

  // #3 — o canvas (default escondido) AUTO-EXPANDE quando o diagrama nasce:
  // transição 0 → N nós cobre TODOS os caminhos (geração pelo AIP, modo-edição,
  // histórico, importar, paleta) sem brigar com um colapso manual do operador
  // (colapsar com nós > 0 permanece colapsado).
  const hadNodes = React.useRef(false);
  React.useEffect(() => {
    const has = graph.nodes.length > 0;
    if (has && !hadNodes.current) setLayout({ canvas_open: true });
    hadNodes.current = has;
  }, [graph.nodes.length, setLayout]);

  /** #3 — alça de resize do chat: arrasto com pointer events (sem dependência
   *  nova). Direção/limite dependem do lado do dock; cada movimento aplica
   *  otimista e o hook debounça UM PUT de memorização. */
  const onChatResizeStart = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const horizontal = chatDock === 'left' || chatDock === 'right';
      const start = horizontal ? e.clientX : e.clientY;
      const startSize = chatSize;
      // bottom/right: arrastar PARA o chat aumenta (delta negativo no eixo).
      const sign = chatDock === 'bottom' || chatDock === 'right' ? -1 : 1;
      const move = (ev: PointerEvent | MouseEvent) => {
        const pos = horizontal
          ? (ev as MouseEvent).clientX
          : (ev as MouseEvent).clientY;
        setLayout({ chat_size: clampChatSize(startSize + sign * (pos - start)) });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [chatDock, chatSize, setLayout],
  );

  /** Expande o painel do AIP Arquiteto e rola a página até ele (sem modal). */
  const focusChat = React.useCallback(() => {
    setChatOpen(true);
    requestAnimationFrame(() => {
      try {
        chatPanelRef.current?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'nearest',
        });
      } catch {
        // scroll é QoL; jsdom não implementa scrollIntoView.
      }
    });
  }, []);

  /**
   * Seed the docked AIP Arquiteto composer with a ready-to-send question
   * WITHOUT touching ArquitetoChat internals: locate its (controlled)
   * ``textarea[data-testid="arquiteto-input"]`` inside the panel ref, set the
   * value via the native setter, and dispatch a React-compatible ``input``
   * event so the chat's own ``onChange`` picks it up. The operator reviews and
   * presses Enter/Send — we never auto-submit on their behalf.
   */
  const seedChatComposer = React.useCallback((text: string) => {
    requestAnimationFrame(() => {
      const root = chatPanelRef.current;
      const el = root?.querySelector<HTMLTextAreaElement>(
        'textarea[data-testid="arquiteto-input"]',
      );
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      try {
        setter ? setter.call(el, text) : (el.value = text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
      } catch {
        // Best-effort QoL — never break the inspector flow.
      }
    });
  }, []);

  // #4a — "Perguntar à IA" (NodeInspector) dispatches ``aegis:aip-assist`` with
  // the selected node's context. Open + scroll to the docked chat, then seed
  // the composer with the node-grounded question so the operator can ask the
  // AIP Arquiteto about that node.
  React.useEffect(() => {
    function onAssist(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { prompt?: string; context?: string }
        | undefined;
      focusChat();
      const text = detail?.prompt || detail?.context;
      if (text) seedChatComposer(text);
    }
    window.addEventListener('aegis:aip-assist', onAssist as EventListener);
    return () =>
      window.removeEventListener('aegis:aip-assist', onAssist as EventListener);
  }, [focusChat, seedChatComposer]);

  React.useEffect(() => {
    Solutions.listPatterns()
      .then(setPatterns)
      .catch(() => setPatterns([]));
  }, []);

  // #10 — lista de saves p/ o dropdown "Salvar ▾"; recarregada após cada save.
  const refreshDiagrams = React.useCallback(() => {
    Solutions.listDiagrams()
      .then(setDiagrams)
      .catch(() => setDiagrams([]));
  }, []);
  React.useEffect(() => {
    refreshDiagrams();
  }, [refreshDiagrams]);

  const syncHistoryFlags = React.useCallback(() => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }, []);

  /** Apply a graph change while recording the previous state for undo.
   *  History refs are mutated OUTSIDE the setState updater: React StrictMode
   *  invokes updaters twice in dev, so pushing to `past` inside the updater
   *  double-records and corrupts the undo/redo stacks (and breaks "volta como
   *  estava"). Using the current `graph` as the previous state keeps it
   *  deterministic in dev and prod. */
  const commitGraph = React.useCallback(
    (next: SolutionGraph | ((g: SolutionGraph) => SolutionGraph)) => {
      const resolved = typeof next === 'function' ? next(graph) : next;
      past.current.push(graph);
      if (past.current.length > 50) past.current.shift();
      future.current = [];
      setGraphState(resolved);
      setSavedMsg(null);
      syncHistoryFlags();
    },
    [graph, syncHistoryFlags],
  );

  /** Replace the graph WITHOUT recording history (load/new/import resets). */
  const resetGraph = React.useCallback(
    (next: SolutionGraph) => {
      past.current = [];
      future.current = [];
      setGraphState(next);
      setSelectedId(null);
      setSavedMsg(null);
      syncHistoryFlags();
    },
    [syncHistoryFlags],
  );

  // Modo-edição (F2): aberto por "Editar no AIP" (?diagram=<id>&app=<id>) → carrega o
  // diagrama de origem do app no canvas (não vazio) e guarda o app-alvo p/ o Salvar (F3).
  const editLoadedRef = React.useRef(false);
  React.useEffect(() => {
    if (editLoadedRef.current) return;
    const did = searchParams?.get('diagram');
    const aid = searchParams?.get('app');
    if (!did) return;
    editLoadedRef.current = true;
    (async () => {
      try {
        const d = await Solutions.getDiagram(did);
        resetGraph({ nodes: d.nodes, edges: d.edges, wizard: d.wizard || {} });
        setDiagramId(did);
        setEditAppId(aid || null);
        // F4 — nome do app no título (busca leve; cai no genérico se indisponível).
        let name = '';
        if (aid) {
          try {
            name = (await Workshop.get(aid))?.display || '';
          } catch {
            /* sem nome → título genérico */
          }
        }
        setDiagramTitle(name ? `Editando: ${name}` : 'Editando operação');
        setEditingAppName(name || null);
      } catch {
        // F4 — sem jargão: diagrama inexistente/indisponível vira mensagem amigável.
        setErr('Não consegui carregar este app para edição. Abra de novo a partir de "Meus apps".');
      }
    })();
    // só na montagem (entrada por link); resetGraph é estável (useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Update the graph WITHOUT recording an undo step. For layout noise that is
   *  NOT a user action — chiefly ReactFlow's automatic node measurement, which
   *  fires `dimensions` changes on mount/fitView. Recording those would pollute
   *  the undo stack with no-op duplicates and make "Desfazer" stutter on
   *  identical states instead of reverting the operator's real action. */
  const updateGraphSilent = React.useCallback(
    (next: (g: SolutionGraph) => SolutionGraph) => {
      setGraphState((prev) => next(prev));
    },
    [],
  );

  const undo = React.useCallback(() => {
    if (!past.current.length) return;
    const prev = past.current.pop() as SolutionGraph;
    future.current.push(graph);
    setGraphState(prev);
    setSelectedId(null);
    syncHistoryFlags();
  }, [graph, syncHistoryFlags]);

  const redo = React.useCallback(() => {
    if (!future.current.length) return;
    const nxt = future.current.pop() as SolutionGraph;
    past.current.push(graph);
    setGraphState(nxt);
    setSelectedId(null);
    syncHistoryFlags();
  }, [graph, syncHistoryFlags]);

  const selectedNode: SolutionNode | null = React.useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  function addComponent(kind: string, phase: Phase) {
    const id = newId();
    const colIdx = ['coleta', 'processamento', 'ontologia', 'aplicacao'].indexOf(phase);
    const node: SolutionNode = {
      id,
      kind,
      phase,
      title: kindLabel(kind),
      position: { x: 80 + colIdx * 280, y: 120 + graph.nodes.length * 20 },
      config: {},
    };
    commitGraph((g) => ({ ...g, nodes: [...g.nodes, node] }));
    setSelectedId(id);
  }

  function loadPattern(p: SolutionPattern) {
    resetGraph({ nodes: p.nodes, edges: p.edges, wizard: { domain: p.vertical } });
    setDiagramId(null);
    setDiagramTitle(p.title);
    setDiagramDescription(p.description || '');
  }

  // #10 — reabre um diagrama salvo escolhido no dropdown "Salvar ▾".
  function loadDiagram(d: SolutionDiagram) {
    resetGraph({ nodes: d.nodes, edges: d.edges, wizard: d.wizard || {} });
    setDiagramId(d.id ?? null);
    setDiagramTitle(d.title || 'Operação sem título');
    setDiagramDescription(d.description || '');
    setErr(null);
  }

  function deleteNode(id: string) {
    commitGraph((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      edges: g.edges.filter((e) => e.source !== id && e.target !== id),
      wizard: g.wizard,
    }));
    if (selectedId === id) setSelectedId(null);
  }

  function patchNode(id: string, patch: Partial<SolutionNode>) {
    commitGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }

  /** Drag-to-connect: cria a aresta dirigida E, quando é Coleta→Ontologia, GRAVA a
   *  ROTA real no `config.linked_sources` do nó de Coleta (o campo que o materialize
   *  consome). Antes a aresta era só visual (linha verde sem vínculo) — o operador
   *  conectava e nada acontecia. Agora a aresta vira uma rota `target_node_type` com
   *  origem 'manual' (placeholder), que o inspetor mostra como "sem fonte" até o
   *  operador escolher a fonte real (vincular existente / criar / subir). Visual = realidade. */
  function connectNodes({ source, target }: { source: string; target: string }) {
    commitGraph((g) => {
      const exists = g.edges.some(
        (e) => e.source === source && e.target === target,
      );
      if (exists) return g;
      const sourceNode = g.nodes.find((n) => n.id === source);
      const targetNode = g.nodes.find((n) => n.id === target);
      const targetKind = String(
        (targetNode?.config?.object_kind as string) ||
          (targetNode?.config?.kind as string) ||
          targetNode?.title ||
          '',
      ).trim();
      const edge: SolutionEdge = { id: newId(), source, target, label: targetKind };
      let nodes = g.nodes;
      if (sourceNode?.phase === 'coleta' && targetKind) {
        const cfg = (sourceNode.config || {}) as Record<string, unknown>;
        const cur = Array.isArray(cfg.linked_sources)
          ? (cfg.linked_sources as Array<Record<string, unknown>>)
          : [];
        if (!cur.some((s) => s?.target_node_type === targetKind)) {
          const linked = [
            ...cur,
            { kind: 'manual', id: edge.id, label: targetKind, target_node_type: targetKind },
          ];
          nodes = g.nodes.map((n) =>
            n.id === source ? { ...n, config: { ...cfg, linked_sources: linked } } : n,
          );
        }
      }
      return { ...g, nodes, edges: [...g.edges, edge] };
    });
  }

  /** Persist node position/size after a drag or resize. A real drag (carries
   *  `pos`) is a user action → recorded for undo. A bare `size` change is
   *  ReactFlow's automatic measurement (fires on mount/fitView) → applied
   *  silently so it never pollutes the undo stack. */
  function moveOrResizeNode(
    id: string,
    pos?: { x: number; y: number },
    size?: { width?: number; height?: number },
  ) {
    const apply = (g: SolutionGraph) => ({
      ...g,
      nodes: g.nodes.map((n) => {
        if (n.id !== id) return n;
        const next: SolutionNode = { ...n };
        if (pos) next.position = pos;
        if (size) {
          next.config = {
            ...(n.config || {}),
            ...(size.width != null ? { width: Math.round(size.width) } : {}),
            ...(size.height != null ? { height: Math.round(size.height) } : {}),
          };
        }
        return next;
      }),
    });
    if (pos) commitGraph(apply);
    else updateGraphSilent(apply);
  }

  /** #17b — única ação de contexto: excluir o nó (forward/back/group removidos,
   *  não tinham efeito visível / eram dead code que confundiam o operador). */
  function nodeContextAction(id: string, action: 'delete') {
    if (action === 'delete') deleteNode(id);
  }

  function newDiagram() {
    resetGraph(EMPTY_GRAPH);
    setDiagramId(null);
    setDiagramTitle('Operação sem título');
    setDiagramDescription('');
    setErr(null);
  }

  async function loadFromLineage() {
    setErr(null);
    setLoadingLineage(true);
    try {
      const g = await Solutions.fromLineage();
      resetGraph({ nodes: g.nodes, edges: g.edges, wizard: g.wizard || {} });
      setDiagramId(null);
      setDiagramTitle('Operação do histórico');
      if (!g.nodes.length) {
        setErr('Nenhum evento de histórico disponível para gerar o diagrama.');
      }
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setLoadingLineage(false);
    }
  }

  function exportJson() {
    const payload = JSON.stringify(
      {
        title: diagramTitle,
        description: diagramDescription,
        nodes: graph.nodes,
        edges: graph.edges,
        wizard: graph.wizard || {},
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(diagramTitle || 'operacao')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error('Arquivo inválido: faltam nós ou conexões.');
        }
        resetGraph({
          nodes: parsed.nodes,
          edges: parsed.edges,
          wizard: parsed.wizard || {},
        });
        setDiagramId(null);
        if (typeof parsed.title === 'string') setDiagramTitle(parsed.title);
        if (typeof parsed.description === 'string')
          setDiagramDescription(parsed.description);
      } catch (e) {
        setErr(humanise(e));
      }
    };
    reader.readAsText(file);
  }

  /**
   * Persist the current graph (create or save). Returns the persisted diagram
   * so callers ("Salvar e Construir") can chain off it. The graph's wizard
   * carries `_blueprint`, so the persisted wizard round-trips the blueprint.
   */
  async function persist(): Promise<SolutionDiagram | null> {
    if (!graph.nodes.length) {
      setErr('O diagrama está vazio. Inicie o planejamento ou adicione componentes.');
      return null;
    }
    if (diagramId) {
      const d = await Solutions.saveDiagram(diagramId, {
        nodes: graph.nodes,
        edges: graph.edges,
        wizard: graph.wizard,
        message: diagramDescription || undefined,
      });
      setSavedMsg(`${t('solutions.saved')} · v${d.version}`);
      return d;
    }
    const slug = `${(diagramTitle || 'operacao')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}-${newId().slice(0, 6)}`;
    const d = await Solutions.createDiagram({
      slug,
      title: diagramTitle || 'Operação sem título',
      description: diagramDescription || undefined,
      nodes: graph.nodes,
      edges: graph.edges,
      wizard: graph.wizard,
    });
    setDiagramId(d.id ?? null);
    setSavedMsg(`${t('solutions.saved')} · v${d.version}`);
    return d;
  }

  async function save() {
    setErr(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      await persist();
      refreshDiagrams(); // #10 — mantém o dropdown "Salvar ▾" atualizado
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setSaving(false);
    }
  }

  /**
   * "Salvar e Construir": persist the diagram, then open the build dialog
   * seeded with the blueprint that generated this graph. The blueprint is
   * carried in `graph.wizard._blueprint` (set by designGraph / onGenerated and
   * round-tripped on save). When absent (older diagram) the dialog falls back
   * to `Solutions.design(...)`.
   */
  async function saveAndBuild() {
    setErr(null);
    setSavedMsg(null);
    if (!graph.nodes.length) {
      setErr('O diagrama está vazio. Inicie o planejamento ou adicione componentes.');
      return;
    }
    setSaving(true);
    try {
      const d = await persist();
      refreshDiagrams(); // #10 — atualiza a lista de saves após construir
      const wizard = (graph.wizard || {}) as Record<string, unknown>;
      const embedded = wizard._blueprint as SolutionBlueprint | undefined;
      const target: SolutionDiagram = {
        ...(d || {}),
        id: d?.id ?? diagramId ?? undefined,
        title: diagramTitle,
        nodes: graph.nodes,
        edges: graph.edges,
        wizard: graph.wizard,
        blueprint: embedded ?? d?.blueprint ?? null,
        domain: (wizard.domain as string) || d?.domain,
        project_id: d?.project_id ?? null,
      };
      setBuildDiagram(target);
      setBuildOpen(true);
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setSaving(false);
    }
  }

  // O canvas carrega o blueprint que o gerou em wizard["_blueprint"]. Só com ele
  // dá para mesclar (dedupe-union no backend); sem ele, a guarda oferece apenas
  // [Sobrepor]/[Manter].
  const hasCanvasBlueprint = Boolean(
    (graph.wizard as Record<string, unknown> | undefined)?._blueprint,
  );

  /** [Mesclar] — incrementa a proposta no plano atual. Envia o grafo ATUAL
   *  (com posições + nós manuais) + os dois blueprints; o backend dedupa por
   *  chave natural e reconcilia in-place. Aplica via commitGraph (Desfazer
   *  reverte a mescla) e devolve o relatório do que foi somado. */
  const handleMerge = React.useCallback(
    async (incoming: SolutionDiagram): Promise<SolutionMergeReport | void> => {
      const base = (graph.wizard as Record<string, unknown> | undefined)
        ?._blueprint as SolutionBlueprint | undefined;
      if (!base) throw new Error('O plano atual não tem blueprint para mesclar.');
      if (!incoming.blueprint) {
        throw new Error('A nova proposta não trouxe blueprint para mesclar.');
      }
      const res = await Solutions.mergeGraph(graph, base, incoming.blueprint);
      const wizard: SolutionWizard & Record<string, unknown> = { ...(res.wizard || {}) };
      if (res.blueprint) wizard._blueprint = res.blueprint;
      commitGraph(() => ({ nodes: res.nodes, edges: res.edges, wizard }));
      setDiagramId(null);
      return res.merge_report;
    },
    [graph, commitGraph],
  );

  /** #3 — alça de resize entre canvas e chat (só quando ambos abertos). */
  const renderChatResizer = (order: number) => (
    <div
      role="separator"
      aria-orientation={dockHorizontal ? 'vertical' : 'horizontal'}
      data-testid="solutions-chat-resize"
      onPointerDown={onChatResizeStart}
      className={
        dockHorizontal
          ? 'w-1 shrink-0 cursor-col-resize bg-border-light hover:bg-primary'
          : 'h-1 shrink-0 cursor-row-resize bg-border-light hover:bg-primary'
      }
      style={{ touchAction: 'none', order }}
    />
  );

  // #3 (fix do operador) — o chat é montado UMA vez e posicionado por CSS `order`
  // (antes era chamado em 2 branches por dock → trocar a âncora REMONTAVA o chat
  // e ZERAVA o histórico). chatBefore = dock antes do canvas (top/left).
  const chatBefore = chatDock === 'top' || chatDock === 'left';

  /** #3 — wrapper dimensionado do chat: altura (bottom/top) ou largura
   *  (left/right) vem do layout memorizado; com o canvas colapsado o chat
   *  ocupa o centro inteiro. */
  const renderChatWrap = (order: number) => (
    <div
      className={
        'min-h-0 min-w-0 flex flex-col ' +
        (chatOpen && !canvasOpen ? 'flex-1' : 'shrink-0')
      }
      style={{
        order,
        ...(chatOpen && canvasOpen
          ? dockHorizontal
            ? { width: chatSize }
            : { height: chatSize }
          : {}),
      }}
      data-testid="solutions-chat-wrap"
    >
      <ArquitetoChat
        panelRef={chatPanelRef}
        open={chatOpen}
        onOpenChange={setChatOpen}
        dock={chatDock}
        onDockChange={(d) => setLayout({ chat_dock: d })}
        fill
        editingAppName={editingAppName}
        hasCurrentDiagram={graph.nodes.length > 0}
        defaultDepth={experienceParams.depth}
        defaultScope={designScope}
        defaultModel={experienceParams.model}
        defaultProvider={experienceParams.provider}
        onGenerated={(d: SolutionDiagram) => {
          // Carry the generated blueprint inside the wizard so it persists
          // on save and "Salvar e Construir" can materialize the stack.
          const wizard: SolutionWizard & Record<string, unknown> = {
            ...(d.wizard || {}),
          };
          if (d.blueprint) wizard._blueprint = d.blueprint;
          // commitGraph (não resetGraph): grava o estado anterior na pilha de
          // Desfazer — assim o operador "volta como estava" se errou um passo.
          commitGraph(() => ({ nodes: d.nodes, edges: d.edges, wizard }));
          setDiagramId(null);
          if (typeof d.title === 'string' && d.title) setDiagramTitle(d.title);
          if (typeof d.description === 'string' && d.description) {
            setDiagramDescription(d.description);
          }
        }}
        onMerge={hasCanvasBlueprint ? handleMerge : undefined}
      />
    </div>
  );

  return (
    <ProposedTypesProvider types={proposedTypesFromGraph(graph)}>
    <SampleProvider>
    {/* #20 — cabeçalho (título "Desenho da Operação" + subtítulo) REMOVIDO: o
        protagonista é o canvas+chat; o contexto já vem do sidenav. Ganha altura. */}
    <div data-testid="solutions-page" className="h-full flex flex-col">
      <div className="px-6 py-2 flex items-center gap-1.5 border-b border-border-light bg-canvas-light flex-wrap">
        {/* LOTE3 — "título próprio" da /solutions: oculto quando o chrome
            esconde o cabeçalho da página (params.chrome.hide_page_header). */}
        {!chrome.hidePageHeader && (
          <>
            <input
              value={diagramTitle}
              onChange={(e) => setDiagramTitle(e.target.value)}
              aria-label={t('solutions.nodeTitle')}
              className="h-8 px-2 text-[12px] text-left bg-white border border-border-light max-w-[200px] focus:border-primary outline-none"
              data-testid="solutions-diagram-title"
            />
            <input
              value={diagramDescription}
              onChange={(e) => setDiagramDescription(e.target.value)}
              aria-label={t('solutions.diagramDescription')}
              placeholder={t('solutions.diagramDescription')}
              className="h-8 px-2 text-[12px] bg-white border border-border-light max-w-[220px] focus:border-primary outline-none"
              data-testid="solutions-diagram-description"
            />

            <span className="w-px h-5 bg-border-light mx-1" />
          </>
        )}

        {/* Edit affordances (alta frequência) — ícone-apenas. */}
        <Button
          variant="ghost"
          className="h-8 text-[11px] px-2"
          onClick={undo}
          disabled={!canUndo}
          aria-label={t('solutions.undo')}
          title={t('solutions.undo')}
          data-testid="solutions-undo"
        >
          <Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          className="h-8 text-[11px] px-2"
          onClick={redo}
          disabled={!canRedo}
          aria-label={t('solutions.redo')}
          title={t('solutions.redo')}
          data-testid="solutions-redo"
        >
          <Redo2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>

        <span className="w-px h-5 bg-border-light mx-1" />

        <OverflowMenu
          ariaLabel={t('solutions.moreActions')}
          testIdPrefix="solutions-more"
          size="md"
          items={[
            { key: 'new-diagram', label: t('solutions.newDiagram'), icon: FilePlus2, onSelect: newDiagram },
            { key: 'from-lineage', label: t('solutions.fromLineage'), icon: History, onSelect: loadFromLineage, disabled: loadingLineage },
            { key: 'import', label: t('solutions.import'), icon: Upload, onSelect: () => fileInputRef.current?.click() },
            { key: 'export', label: t('solutions.export'), icon: Download, onSelect: exportJson },
          ] as OverflowMenuItem[]}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="solutions-import-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.currentTarget.value = '';
          }}
        />

        <span className="w-px h-5 bg-border-light mx-1" />

        {/* Toggles de painel (Diagrama/AIP coexistem) — afordâncias de visão. */}
        <Button
          variant="outline"
          className="h-8 text-[11px]"
          onClick={() => setShowLeftPane((v) => !v)}
          aria-pressed={showLeftPane}
          data-testid="solutions-toggle-left"
        >
          <Boxes className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t('solutions.leftPaneToggle')}
        </Button>
        <Button
          variant="outline"
          className="h-8 text-[11px]"
          onClick={() => setShowWalkthrough((v) => !v)}
          data-testid="solutions-toggle-walkthrough"
        >
          <ListChecks className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t('solutions.walkthroughShort')}
        </Button>
        <Button
          variant="outline"
          className="h-8 text-[11px]"
          onClick={() => setShowHistory((v) => !v)}
          aria-pressed={showHistory}
          data-testid="solutions-toggle-history"
        >
          <ClipboardList className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t('solutions.history')}
        </Button>
        {/* #9/#10 — "Carregar do histórico" foi pro kebab (fecha ao clicar), então
            o feedback de progresso vive aqui na faixa de status da toolbar. */}
        {loadingLineage && (
          <span
            className="flex items-center gap-1 text-[10.5px] font-mono text-muted-on-light"
            data-testid="solutions-loading-lineage"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            {t('solutions.fromLineage')}…
          </span>
        )}
        {savedMsg && (
          <span
            className="text-[10.5px] font-mono text-success"
            data-testid="solutions-saved-msg"
          >
            {savedMsg}
          </span>
        )}
        {err && (
          <span
            className="text-[10.5px] font-mono text-danger"
            data-testid="solutions-error"
          >
            {err}
          </span>
        )}

        {/* #9/#10 — PRIMÁRIOS no FIM da barra (direita): só "Construir" e
            "Salvar ▾". ml-auto empurra o grupo pra direita; o resto fica à
            esquerda. O "▾" abre a lista de saves (reabrir um diagrama). */}
        <div className="ml-auto flex items-center gap-1.5">
          {graph.nodes.length > 0 && (
            <Button
              variant="default"
              className="h-8 text-[11px]"
              onClick={saveAndBuild}
              disabled={saving}
              data-testid="solutions-save-build"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <Hammer className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              {t('solutions.saveBuild')}
            </Button>
          )}
          <div className="flex items-center">
            <Button
              variant="outline"
              className="h-8 text-[11px] border-r-0"
              onClick={save}
              disabled={saving}
              data-testid="solutions-save"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              {t('solutions.save')}
            </Button>
            <SavesMenu
              diagrams={diagrams}
              currentId={diagramId}
              onSelect={loadDiagram}
              onCreateNew={newDiagram}
              onOpen={refreshDiagrams}
            />
          </div>
        </div>
      </div>

      <div
        className="flex-1 grid min-h-0"
        style={{
          // [paleta] · canvas · [inspetor]; TODO painel lateral é opcional e
          // fechado por padrão — paleta (240px) e inspetor/plano guiado/
          // histórico (300px) só ocupam coluna quando ativos.
          // Task 3: inspector panel uses minmax(280px,420px) so content drives
          // width within a sensible range instead of a hard 300px column.
          gridTemplateColumns: [
            showLeftPane ? '240px' : null,
            '1fr',
            selectedNode ? 'minmax(280px,420px)' : null,
            showWalkthrough ? '300px' : null,
            showHistory ? '300px' : null,
          ]
            .filter(Boolean)
            .join(' '),
        }}
        data-testid="solutions-3pane"
      >
        {showLeftPane && (
          <LeftPane
            patterns={patterns}
            onAddComponent={addComponent}
            onLoadPattern={loadPattern}
            onPreviewPattern={setPreview}
            onClose={() => setShowLeftPane(false)}
          />
        )}

        {/* #3 (feedback do operador) — centro MODULAR: o chat do AIP Arquiteto
            ancora em qualquer um dos 4 lados (chat_dock) com tamanho
            redimensionável e MEMORIZADO; o canvas é um painel colapsável
            (default escondido; auto-expande quando o diagrama nasce). */}
        <div
          className={`min-w-0 bg-white flex ${dockHorizontal ? 'flex-row' : 'flex-col'}`}
          data-testid="solutions-center"
          data-dock={chatDock}
        >
          {/* #3 — chat + alça montados UMA vez; o CSS `order` os posiciona
              antes (top/left) ou depois (bottom/right) do canvas, sem remontar. */}
          {renderChatWrap(chatBefore ? 0 : 2)}
          {chatOpen && canvasOpen && renderChatResizer(1)}

          {/* Painel do canvas — colapsável, com cabeçalho persistente. Em dock
              LATERAL e colapsado, vira TIRA VERTICAL (fix do operador): ícone +
              título em writing-mode vertical + borda cinza, nunca uma coluna
              larga com vazio em branco. */}
          {!canvasOpen && dockHorizontal ? (
            <div
              className={
                'h-full w-9 shrink-0 flex flex-col bg-canvas-light border-border-light ' +
                (chatDock === 'left' ? 'border-l' : 'border-r')
              }
              data-testid="solutions-canvas-panel"
              data-open="false"
              data-orientation="vertical"
              style={{ order: chatBefore ? 2 : 0 }}
            >
              <button
                type="button"
                onClick={() => setLayout({ canvas_open: true })}
                aria-expanded={false}
                data-testid="solutions-canvas-toggle"
                className="flex-1 flex flex-col items-center gap-2 py-3 hover:bg-panel-light min-h-0"
              >
                <FileStack
                  className="w-3.5 h-3.5 text-text-on-light shrink-0"
                  strokeWidth={1.5}
                />
                <span className="text-[11px] font-semibold text-text-on-light [writing-mode:vertical-rl] truncate min-h-0">
                  {t('solutions.canvasPanel')}
                  {' · '}
                  {graph.nodes.length > 0
                    ? `${graph.nodes.length} ${t('solutions.histNodes')}`
                    : t('solutions.canvasPanelEmpty')}
                </span>
                {chatDock === 'left' ? (
                  <ChevronLeft
                    className="w-4 h-4 text-muted-on-light shrink-0 mt-auto"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                ) : (
                  <ChevronRight
                    className="w-4 h-4 text-muted-on-light shrink-0 mt-auto"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                )}
              </button>
            </div>
          ) : (
          <div
            className={
              canvasOpen
                ? 'min-w-0 min-h-0 flex-1 flex flex-col'
                : 'shrink-0 flex flex-col'
            }
            data-testid="solutions-canvas-panel"
            data-open={canvasOpen ? 'true' : 'false'}
            data-orientation="horizontal"
            style={{ order: chatBefore ? 2 : 0 }}
          >
            <button
              type="button"
              onClick={() => setLayout({ canvas_open: !canvasOpen })}
              aria-expanded={canvasOpen}
              data-testid="solutions-canvas-toggle"
              className="flex items-center justify-between gap-2 px-4 py-1.5 text-left border-b border-border-light bg-canvas-light hover:bg-panel-light"
            >
              <span className="flex items-center gap-2 min-w-0">
                <FileStack
                  className="w-3.5 h-3.5 text-text-on-light shrink-0"
                  strokeWidth={1.5}
                />
                <span className="text-[11px] font-semibold text-text-on-light">
                  {t('solutions.canvasPanel')}
                </span>
                <span className="text-[10px] font-mono text-muted-on-light truncate">
                  {graph.nodes.length > 0
                    ? `${graph.nodes.length} ${t('solutions.histNodes')}`
                    : t('solutions.canvasPanelEmpty')}
                </span>
              </span>
              {canvasOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
              )}
            </button>
            {canvasOpen && (
              <div className="relative flex-1 min-h-0">
                {graph.nodes.length === 0 ? (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center max-w-sm">
                      <FileStack
                        className="w-8 h-8 text-muted-on-light mx-auto"
                        strokeWidth={1.25}
                      />
                      <p className="text-[12px] text-muted-on-light mt-3">
                        {t('solutions.canvasEmpty')}
                      </p>
                      <Button
                        variant="default"
                        className="h-8 text-[11px] mt-3"
                        onClick={focusChat}
                        data-testid="solutions-canvas-empty-cta"
                      >
                        {t('solutions.startPlanning')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <SolutionCanvas
                    graph={graph}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onConnect={connectNodes}
                    onNodePositionChange={moveOrResizeNode}
                    onNodeContextAction={nodeContextAction}
                    onNodePlay={setPlayNodeId}
                    playStatus={playStatus}
                  />
                )}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Inspetor "Configuração do nó" — fechado por padrão; só renderiza
            (e ocupa coluna) quando há nó selecionado. "Fechar" desseleciona. */}
        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            graph={graph}
            wizard={wizard}
            onGraphChange={(g) => {
              commitGraph(g);
              setSelectedId(null);
            }}
            onDeleteNode={deleteNode}
            onPatchNode={patchNode}
            onClose={() => setSelectedId(null)}
          />
        )}

        {showWalkthrough && (
          <WalkthroughPanel
            diagramId={diagramId}
            onClose={() => setShowWalkthrough(false)}
          />
        )}

        {showHistory && (
          <HistoryPanel
            onClose={() => setShowHistory(false)}
            onReopen={(brief) => {
              // #12 — reabre a INTENÇÃO da geração: foca o chat + semeia o briefing.
              focusChat();
              seedChatComposer(brief);
            }}
          />
        )}
      </div>

      <MaterializeDialog
        open={buildOpen}
        onOpenChange={setBuildOpen}
        diagram={buildDiagram}
        diagramId={diagramId}
        appId={editAppId}
      />

      {/* ▶ Play por nó — valida o nó (output/erro) + preview fullscreen da Construção. */}
      <NodePlayModal
        open={!!playNodeId}
        node={graph.nodes.find((n) => n.id === playNodeId) ?? null}
        blueprint={(((wizard as Record<string, unknown>)?._blueprint) ?? null) as never}
        graph={graph}
        playStatus={playStatus}
        onClose={() => setPlayNodeId(null)}
        onStatus={(id, s) => setPlayStatus((p) => ({ ...p, [id]: s }))}
      />

      {/* Reference pattern preview (read-only) */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-3xl h-[70vh] flex flex-col" data-testid="pattern-preview-modal">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 border border-border-light">
            {preview && (
              <SolutionCanvas
                graph={{ nodes: preview.nodes, edges: preview.edges }}
                readonly
              />
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              className="h-8 text-[11px]"
              onClick={() => setPreview(null)}
            >
              {t('common.close')}
            </Button>
            <Button
              variant="default"
              className="h-8 text-[11px]"
              data-testid="pattern-preview-use"
              onClick={() => {
                if (preview) loadPattern(preview);
                setPreview(null);
              }}
            >
              {t('solutions.useAsBase')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </SampleProvider>
    </ProposedTypesProvider>
  );
}

// Auto-registro: importar este módulo torna o slug ``solutions`` resolvível
// como rota de aplicação (igual ao auto-registro do AipThreadsApp). A view
// canônica ``/paginas/solutions/view`` resolve por aqui via getAppRouteComponent.
registerAppRoute(SOLUTIONS_SLUG, SolutionsApp);
