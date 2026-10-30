'use client';

/**
 * Editor 3-pane (paleta / canvas / inspetor) pra Workshop apps.
 *
 *  - Paleta:  agrupada por `group` (data/viz/content/agent), com busca, seções
 *             colapsáveis, ícone+label+descrição por widget. Espelha o
 *             `EditPalette.tsx` do web-app.
 *  - Canvas:  preview live; cada bloco tem toolbar com chip do tipo, mover
 *             ↑/↓, dropdown de col_span e excluir.
 *  - Inspetor: default colapsado; abre ao selecionar um widget. 4 abas —
 *              Propriedades (form schema-driven via `config_schema`/PropFieldEditor:
 *              dropdowns, pickers de property/ação, editor visual de botões e
 *              opções; JSON cru só em widget legado sem schema), Eventos
 *              (EventsPanel executável sobre `node.events` — gatilhos REAIS do
 *              widget + seletores populados), Estilos e Dependências.
 *
 * Os dois painéis laterais têm botão de colapso/expansão.
 *
 * Persistência: gravação SEMPRE em localStorage (cache offline) +
 *   chamada ao backend (PUT se existe, POST senão). Cookies httpOnly +
 *   proxy Next.js cuidam da auth (ver `app/api/[...path]/route.ts`).
 */

import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { confirmModal, promptModal } from '@/components/dialog/confirm-dialog';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cog,
  Copy,
  Database,
  Download,
  Eye,
  MessageSquare,
  PanelRight,
  Plus,
  RotateCcw,
  Save,
  Search as SearchIcon,
  Trash2,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { WidgetErrorBoundary } from './WidgetErrorBoundary';
import { iconByName } from '@/lib/icon-by-name';
import {
  getRegisteredWidgets,
  getWidgetComponent,
  getWidgetMeta,
  type PropFieldDef,
  type WidgetGroup,
} from './WorkshopV2Renderer';
import './widgets'; // garante registry populado
import { MiniWidgetPreview } from './widget-mini-preview';
import { VariablesPanel } from './variables-panel';
import { VersionsDialog } from './versions-dialog';
import { MetricsDialog } from './metrics-dialog';
import { CommentsDrawer } from './comments-drawer';
import { EventsPanel } from './events-panel';
import { InspectorStylesTab } from './inspector-styles-tab';
import { InspectorDepsTab } from './inspector-deps-tab';
import { UsedColorsButton } from './used-colors-button';
import { EditorCommandPalette } from './editor-command-palette';
import {
  ScreenSizeSelector,
  widthForScreenSize,
  type ScreenSizeValue,
} from './screen-size-selector';
// Onda L.3 (2026-05-23): renderer compartilhado de FieldKinds (string/number/
// boolean/select/lat-lng/variable-ref/variable-path/node-type/format-rules/
// form-fields/perm-key/action-type). Extraído pra ser reusado pelo editor de
// Páginas — nenhum FieldKind cai em texto cru.
import { PropFieldEditor } from './prop-field-editor';
import { ApiError } from '@/lib/api/client';
import type {
  LayoutNode,
  WorkshopApp,
  WorkshopOverlay,
  WorkshopPage,
  WorkshopVariable,
} from '@/lib/workshop/types';
import { Workshop } from '@/lib/workshop/client';
import { getSeed } from '@/lib/workshop/seeds';
import { useT } from '@/lib/i18n/provider';

const LOCAL_KEY = (id: string) => `workshop.app.${id}`;

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved_server'; at: number }
  | { kind: 'saved_local_only'; reason: string; at: number };

const GROUP_ORDER: readonly WidgetGroup[] = [
  'home',
  'ficha',
  'parlamentar',
  'detalhe',
  'data',
  'viz',
  'content',
  'agent',
] as const;
const GROUP_LABEL: Record<WidgetGroup, string> = {
  home: 'Dashboard',
  ficha: 'Ficha de entidade',
  parlamentar: 'Dossiê parlamentar',
  detalhe: 'Detalhe de busca',
  data: 'Dados (genérico)',
  viz: 'Visualização (genérico)',
  content: 'Conteúdo',
  agent: 'Agentes (LLM)',
};

const COL_SPAN_OPTIONS = [1, 2, 4, 5, 10, 20] as const;

function emptyApp(id: string): WorkshopApp {
  return {
    id,
    external_id: id,
    display: 'Nova app',
    schema_version: 2,
    variables: [],
    layout: { columns: 20, root: [] },
  };
}

function fmtClock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/* ── Sprint 3 + 4: helpers multi-page + draft/publish ──────────────── */

/**
 * Sprint 4: editor SEMPRE trabalha no draft. Se app tem `draft_layout`
 * (ou `draft_pages` em multi-page), lê desses; senão cai pra
 * `layout`/`pages` published.
 *
 * Helpers abaixo abstraem essa lógica de leitura. Escrita sempre mira
 * o draft (cria se não existir).
 */
function effectivePages(app: WorkshopApp): WorkshopPage[] | undefined {
  if (app.draft_pages && app.draft_pages.length > 0) return app.draft_pages;
  if (app.pages && app.pages.length > 0) return app.pages;
  return undefined;
}

function effectiveLayout(app: WorkshopApp): WorkshopApp['layout'] {
  return app.draft_layout ?? app.layout;
}

/** Retorna o layout da página ativa OU o layout flat (single-page). */
function getActiveLayout(
  app: WorkshopApp,
  activePageId: string,
): WorkshopApp['layout'] {
  const pages = effectivePages(app);
  if (pages && pages.length > 0) {
    const p = pages.find((x) => x.id === activePageId) ?? pages[0];
    return p.layout;
  }
  return effectiveLayout(app);
}

/**
 * Reescreve o layout ativo no shape correto (pages[] OU layout flat).
 * SEMPRE escreve no DRAFT — `layout`/`pages` published só mudam ao
 * "Publicar".
 */
function withActiveLayout(
  app: WorkshopApp,
  activePageId: string,
  layout: WorkshopApp['layout'],
): WorkshopApp {
  const pages = effectivePages(app);
  if (pages && pages.length > 0) {
    return {
      ...app,
      draft_pages: pages.map((p) =>
        p.id === activePageId ? { ...p, layout } : p,
      ),
    };
  }
  return { ...app, draft_layout: layout };
}

/** Publica o draft: copia draft → published e limpa o draft. */
function publishDraft(app: WorkshopApp): WorkshopApp {
  return {
    ...app,
    layout: app.draft_layout ?? app.layout,
    pages: app.draft_pages ?? app.pages,
    draft_layout: undefined,
    draft_pages: undefined,
  };
}

/** Descarta o draft: volta pro published. */
function discardDraft(app: WorkshopApp): WorkshopApp {
  return { ...app, draft_layout: undefined, draft_pages: undefined };
}

/** True se existem mudanças não-publicadas. */
function hasDraft(app: WorkshopApp): boolean {
  return !!(app.draft_layout || (app.draft_pages && app.draft_pages.length > 0));
}

export function WorkshopEditor({ appId }: { appId: string }) {
  const t = useT();
  const [app, setApp] = useState<WorkshopApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [backendExists, setBackendExists] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  // Inspetor inicia colapsado — abre quando operador seleciona um widget.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // Wave D.4 (2026-05-23): tab ativo do inspector.
  // 'props' = propriedades clássicas; 'events' = EventsPanel 3-col.
  // Wave F.2 (2026-05-23) — slate-parity: 4 tabs (Propriedades · Eventos ·
  // Estilos · Dependências). As duas últimas referenciam configurador
  // global / grafo de lineage existente (não duplicam UI).
  const [inspectorTab, setInspectorTab] = useState<
    'props' | 'events' | 'styles' | 'deps'
  >('props');
  const [paletteQuery, setPaletteQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  // Filtro ativo de grupo na paleta. `null` = "Todos" (sem filtro).
  const [paletteGroup, setPaletteGroup] = useState<WidgetGroup | null>(null);
  // Sprint 3: id da página ativa no editor (multi-page). Apps single-page
  // usam o pseudo-id '__main__'.
  const [activePageId, setActivePageId] = useState<string>('__main__');
  // Tier A: variables panel modal toggle.
  const [variablesPanelOpen, setVariablesPanelOpen] = useState(false);
  // Sprint A1: versions dialog toggle.
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);
  // Sprint E3: metrics dialog toggle.
  const [metricsDialogOpen, setMetricsDialogOpen] = useState(false);
  // Sprint F1: comments drawer toggle.
  const [commentsDrawerOpen, setCommentsDrawerOpen] = useState(false);
  // Onda M1.d: busca global do editor (Ctrl/Cmd+K) + tamanho de tela do canvas.
  const [commandOpen, setCommandOpen] = useState(false);
  const [screenSize, setScreenSize] = useState<ScreenSizeValue>('full');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const local =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(LOCAL_KEY(appId))
        : null;
    const parseLocal = (): WorkshopApp | null => {
      if (!local) return null;
      try {
        return JSON.parse(local) as WorkshopApp;
      } catch {
        return null;
      }
    };

    Workshop.get(appId)
      .then((a) => {
        if (cancelled) return;
        setApp(a);
        setBackendExists(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const httpStatus = err instanceof ApiError ? err.status : 0;
        if (httpStatus !== 404) {
          const cached = parseLocal();
          if (cached) {
            setApp(cached);
            setBackendExists(false);
            setError(
              'Servidor indisponível — editando cópia local do último cache.',
            );
            return;
          }
        }
        if (appId.startsWith('seed.')) {
          const seed = getSeed(appId);
          if (seed) {
            setApp(JSON.parse(JSON.stringify(seed)));
            setBackendExists(false);
            setError(null);
            return;
          }
        }
        const cached = parseLocal();
        if (cached) {
          setApp(cached);
          setBackendExists(false);
          setError(null);
          return;
        }
        setApp(emptyApp(appId));
        setBackendExists(false);
        setError(null);
      });

    return () => {
      cancelled = true;
    };
  }, [appId]);

  // Onda M1.d — atalho Ctrl/Cmd+K abre a busca global DO EDITOR.
  // Registrado em capture-phase e com stopImmediatePropagation pra ter
  // precedência sobre a paleta de comandos global (que também escuta
  // Ctrl+K em `window`, bubble-phase, via AuthShell). Sem isso, as duas
  // abririam ao mesmo tempo. O listener só existe enquanto o editor está
  // montado, então fora do editor a paleta global volta a responder.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Agrupa widgets registrados por `group`, filtrando pela busca.
  // Widgets marcados `hidden` (aliases legados) não aparecem na paleta.
  const groupedWidgets = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    const out: Record<WidgetGroup, { type: string; meta: ReturnType<typeof getWidgetMeta> }[]> = {
      home: [],
      ficha: [],
      parlamentar: [],
      detalhe: [],
      data: [],
      viz: [],
      content: [],
      agent: [],
    };
    for (const w of getRegisteredWidgets()) {
      if (w.meta.hidden) continue;
      if (paletteGroup && w.meta.group !== paletteGroup) continue;
      const hay = [
        w.type,
        w.meta.label ?? '',
        w.meta.description ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (q && !hay.includes(q)) continue;
      out[w.meta.group].push(w);
    }
    for (const g of GROUP_ORDER) {
      out[g].sort((a, b) =>
        (a.meta?.label ?? a.type).localeCompare(b.meta?.label ?? b.type, 'pt-BR'),
      );
    }
    return out;
  }, [paletteQuery, paletteGroup, app]);

  // Onda M1.d — lista plana de widgets pra busca global do editor (Ctrl+K).
  // Independe dos filtros visuais da paleta (busca/grupo); a paleta de
  // comandos faz a própria busca. Cada item carrega `meta.label` legível —
  // o `type` cru jamais aparece na UI (feedback_widget_type_never_raw_in_ui),
  // só serve como id interno pra adicionar o widget.
  const commandWidgets = useMemo(
    () =>
      getRegisteredWidgets()
        .filter((w) => !w.meta.hidden)
        .map((w) => ({
          type: w.type,
          label: w.meta.label ?? w.type,
          description: w.meta.description,
          icon: w.meta.icon,
          group: GROUP_LABEL[w.meta.group] ?? w.meta.group,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [],
  );

  // Variáveis do app expostas na busca global.
  const commandVariables = useMemo(
    () =>
      (app?.variables ?? []).map((v) => ({
        id: v.id,
        label: v.label?.trim() || v.external_id,
        externalId: v.external_id,
      })),
    [app],
  );

  const selectedNode = useMemo(() => {
    if (!app || !selectedNodeId) return null;
    // Procura o nó em TODAS as superfícies possíveis: layout flat,
    // draft_layout, cada page do array (published OU draft) e cada overlay.
    // Sem isso, o inspetor vira null pra apps com pages[] ou draft_layout
    // (operador clica → handleSelect grava id → busca no lugar errado → null).
    const candidates: WorkshopApp['layout'][] = [];
    // F2 fix: o layout ATIVO (= onde `updateNode`/`withActiveLayout` escrevem,
    // o DRAFT inclusive) vem PRIMEIRO. Antes `app.layout` (published) era
    // buscado antes do draft → o inspetor lia a versão stale e as edições
    // (col_span, props, node.events…) "sumiam" da UI até publicar/recarregar.
    candidates.push(getActiveLayout(app, activePageId));
    if (app.draft_layout) candidates.push(app.draft_layout);
    if (app.layout) candidates.push(app.layout);
    for (const p of app.draft_pages ?? []) if (p.layout) candidates.push(p.layout);
    for (const p of app.pages ?? []) if (p.layout) candidates.push(p.layout);
    for (const o of app.overlays ?? []) if (o.layout) candidates.push(o.layout);
    for (const layout of candidates) {
      const hit = layout?.root?.find((n) => n.id === selectedNodeId);
      if (hit) return hit;
    }
    return null;
  }, [app, selectedNodeId, activePageId]);

  // Set de abas declaradas pelos nodes do app — usado pelo TabPicker
  // como autocomplete. Vazio quando nenhum nó usa `layout.tab` (ex.:
  // apps que não são de ficha). Convenções da ficha (identidade /
  // historico / atividade) são adicionadas como sugestão sempre.
  const tabsKnownInApp = useMemo(() => {
    const s = new Set<string>();
    for (const n of app?.layout?.root ?? []) {
      const t = n.layout?.tab?.trim();
      if (t) s.add(t);
    }
    return Array.from(s);
  }, [app]);

  const updateApp = (next: WorkshopApp) => {
    setApp(next);
    setDirty(true);
  };

  const addWidget = (type: string) => {
    if (!app) return;
    const meta = getWidgetMeta(type);
    const newNode: LayoutNode = {
      id: `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      widget: { type, props: {} },
      layout: meta?.defaultColSpan ? { col_span: meta.defaultColSpan } : undefined,
    };
    const cur = getActiveLayout(app, activePageId);
    updateApp(
      withActiveLayout(app, activePageId, {
        ...cur,
        root: [...cur.root, newNode],
      }),
    );
    setSelectedNodeId(newNode.id);
    setInspectorOpen(true);
  };

  const removeNode = (id: string) => {
    if (!app) return;
    const cur = getActiveLayout(app, activePageId);
    updateApp(
      withActiveLayout(app, activePageId, {
        ...cur,
        root: cur.root.filter((n) => n.id !== id),
      }),
    );
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
      setInspectorOpen(false);
    }
  };

  /**
   * Duplica um node — copia layout + props com novo id e insere logo
   * abaixo do original. Sprint 1 do Workshop parity roadmap.
   */
  const duplicateNode = (id: string) => {
    if (!app) return;
    const cur = getActiveLayout(app, activePageId);
    const idx = cur.root.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const src = cur.root[idx];
    const copy: LayoutNode = {
      ...JSON.parse(JSON.stringify(src)),
      id: `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    };
    const next = [...cur.root];
    next.splice(idx + 1, 0, copy);
    updateApp(withActiveLayout(app, activePageId, { ...cur, root: next }));
    setSelectedNodeId(copy.id);
    setInspectorOpen(true);
  };

  const moveNode = (id: string, direction: -1 | 1) => {
    if (!app) return;
    const cur = getActiveLayout(app, activePageId);
    const list = cur.root;
    const idx = list.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    updateApp(withActiveLayout(app, activePageId, { ...cur, root: next }));
  };

  const updateNode = (id: string, patch: Partial<LayoutNode>) => {
    if (!app) return;
    const cur = getActiveLayout(app, activePageId);
    updateApp(
      withActiveLayout(app, activePageId, {
        ...cur,
        root: cur.root.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      }),
    );
  };

  const setColSpan = (id: string, span: number) => {
    if (!app) return;
    const cur = getActiveLayout(app, activePageId);
    const node = cur.root.find((n) => n.id === id);
    if (!node) return;
    const totalCols = cur.columns ?? 20;
    const clamped = Math.max(1, Math.min(totalCols, span));
    updateNode(id, {
      ...node,
      layout: { ...(node.layout ?? {}), col_span: clamped },
    });
  };

  const handleSelect = (id: string) => {
    setSelectedNodeId(id);
    setInspectorOpen(true);
  };

  const save = async () => {
    if (!app) return;
    window.localStorage.setItem(LOCAL_KEY(appId), JSON.stringify(app));
    setStatus({ kind: 'saving' });

    // Refactor Fase A: drafts não persistem mais como coluna do app.
    // O "Salvar rascunho" agora:
    //   1. Atualiza o WorkshopApp com o layout corrente do editor
    //      (que pode ser draft_layout em memória ou layout publicado)
    //   2. Cria WorkshopAppVersion SEM semver_tag (snapshot dedupado
    //      por content_hash)
    // "Publicar" via publishViaBackend() faz o mesmo + adiciona
    // semver_tag pra marcar o snapshot como release público.
    const layoutToSave = app.draft_layout ?? app.layout;
    const pagesToSave = app.draft_pages ?? app.pages;
    const payload: Partial<WorkshopApp> = {
      external_id: app.external_id ?? app.id,
      display: app.display,
      description: app.description,
      schema_version: app.schema_version,
      variables: app.variables,
      layout: layoutToSave,
      actions: app.actions,
      markings: app.markings,
      overlays: app.overlays,
      pages: pagesToSave,
      header_config: app.header_config,
      draft_layout: undefined,
      draft_pages: app.draft_pages,
    };

    try {
      const saved = backendExists
        ? await Workshop.update(app.id, payload)
        : await Workshop.create({
            ...payload,
            external_id: app.external_id ?? app.id,
            display: app.display,
          });
      setApp(saved);
      setBackendExists(true);
      setDirty(false);
      setStatus({ kind: 'saved_server', at: Date.now() });
      setError(null);

      // Fase A: snapshot do estado salvo como WorkshopAppVersion sem
      // semver_tag (=draft commit dedupado por content_hash). Erro aqui
      // não invalida o save — só perde o ponto no histórico.
      if (!appId.startsWith('local.app.') && !appId.startsWith('seed.')) {
        try {
          await Workshop.createVersion(saved.id, {
            commit_message: 'editor save',
          });
        } catch {
          /* ignore — snapshot é cherry on top */
        }
      }
    } catch (e) {
      const reason =
        e instanceof ApiError
          ? e.status === 401
            ? 'sessão não autenticada no servidor — refaça o login'
            : e.status === 403
              ? 'sua conta não tem workshop.apps.write (peça ao admin)'
              : `servidor recusou (${e.status})`
          : 'rede indisponível';
      setStatus({ kind: 'saved_local_only', reason, at: Date.now() });
      setDirty(false);
    }
  };

  const exportJson = () => {
    if (!app) return;
    const blob = new Blob([JSON.stringify(app, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${app.external_id ?? app.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as WorkshopApp;
        updateApp({ ...parsed, id: appId });
      } catch (e) {
        setError(
          'JSON inválido: ' + (e instanceof Error ? e.message : String(e)),
        );
      }
    };
    reader.readAsText(file);
  };

  if (!app) {
    return (
      <div className="h-full flex items-center justify-center text-[12px] text-muted-on-light">
        Carregando…
      </div>
    );
  }

  const activeLayout = getActiveLayout(app, activePageId);
  const totalCols = activeLayout.columns ?? 20;
  // Onda M1.d — largura simulada do canvas (null = tela cheia, sem limite).
  const canvasWidth = widthForScreenSize(screenSize);

  return (
    <div className="h-full flex overflow-hidden">
      {/* PALETA ─────────────────────────────────────────────────── */}
      {paletteOpen ? (
        <aside className="w-[280px] bg-panel-light border-r border-border-light flex flex-col shrink-0 overflow-hidden">
          <div className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light gap-2">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold flex-1">
              Paleta
            </p>
            <button
              type="button"
              onClick={() => setPaletteOpen(false)}
              aria-label="Esconder paleta"
              title="Esconder paleta"
              className="h-5 w-5 flex items-center justify-center hover:bg-border-light/40"
            >
              <ChevronLeft className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
          <div className="px-2 py-2 border-b border-border-light space-y-2">
            <div className="relative">
              <SearchIcon
                className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Buscar widget…"
                className="w-full h-7 pl-7 pr-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
              />
            </div>
            {/* Filter chips por grupo — clique filtra a paleta pro grupo;
                "Todos" volta ao estado natural com todas as seções. */}
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar paleta por grupo">
              <PaletteChip
                label="Todos"
                active={paletteGroup === null}
                onClick={() => setPaletteGroup(null)}
              />
              {GROUP_ORDER.map((g) => (
                <PaletteChip
                  key={g}
                  label={GROUP_LABEL[g]}
                  active={paletteGroup === g}
                  onClick={() => setPaletteGroup(g)}
                />
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {GROUP_ORDER.map((g) => {
              const items = groupedWidgets[g];
              if (items.length === 0) return null;
              const collapsed = collapsedGroups[g] ?? false;
              return (
                <section key={g}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedGroups((s) => ({ ...s, [g]: !collapsed }))
                    }
                    className="w-full px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold bg-raised-light border-b border-border-light flex items-center gap-2 hover:bg-border-light/40"
                  >
                    <span className="flex-1">
                      {GROUP_LABEL[g]} · {items.length}
                    </span>
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 transition-transform',
                        !collapsed && 'rotate-90',
                      )}
                      strokeWidth={1.5}
                    />
                  </button>
                  {!collapsed && (
                    <ul>
                      {items.map((w) => (
                        <PaletteItem
                          key={w.type}
                          type={w.type}
                          meta={w.meta}
                          onAdd={() => addWidget(w.type)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Mostrar paleta"
          title="Mostrar paleta"
          className="w-6 bg-panel-light border-r border-border-light flex items-start justify-center pt-2 hover:bg-raised-light shrink-0"
        >
          <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        </button>
      )}

      {/* CANVAS ────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col overflow-hidden bg-canvas-light">
        <header className="h-10 px-3 border-b border-border-light flex items-center gap-2 bg-panel-light">
          <input
            type="text"
            value={app.display}
            onChange={(e) => updateApp({ ...app, display: e.target.value })}
            className="flex-1 max-w-md h-7 bg-raised-light border border-border-light px-2 text-[12px] outline-none focus:border-primary"
            placeholder="Nome da app"
          />
          <SaveStatusChip dirty={dirty} status={status} />
          {hasDraft(app) && (
            <span
              data-testid="draft-badge"
              className="h-7 px-2 text-[10px] font-mono uppercase tracking-wider border bg-warning/10 text-warning border-warning/40 flex items-center gap-1"
              title="Há mudanças não publicadas (rascunho)"
            >
              draft
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || status.kind === 'saving'}
            className={cn(
              'h-7 px-2.5 text-[11px] border flex items-center gap-1.5',
              dirty && status.kind !== 'saving'
                ? 'bg-canvas-light text-text-on-light border-border-light hover:border-primary'
                : 'bg-raised-light border-border-light text-muted-on-light cursor-not-allowed',
            )}
            title="Salva o rascunho — não publica."
          >
            <Save className="w-3 h-3" strokeWidth={1.5} />
            {status.kind === 'saving' ? 'Salvando…' : 'Salvar rascunho'}
          </button>
          {hasDraft(app) && (
            <>
              <button
                type="button"
                onClick={async () => {
                  // 1. Promove draft → published em memória
                  const promoted = publishDraft(app);
                  updateApp(promoted);
                  // 2. Save (atualiza coluna `layout` no backend +
                  //    snapshot sem tag)
                  await save();
                  // 3. Tag a versão recém-salva como release público.
                  //    Operador pode informar semver via prompt; fica
                  //    auto-incrementado por timestamp se em branco.
                  if (!appId.startsWith('local.app.') && !appId.startsWith('seed.')) {
                    const semver = await promptModal({
                      title: 'Tag desta release',
                      description: 'Ex: 1.0.0, 1.2.3-beta — vazio = sem tag.',
                      defaultValue: `v${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`,
                      required: false,
                      confirmLabel: 'Publicar',
                    });
                    try {
                      await Workshop.createVersion(promoted.id, {
                        semver_tag: semver?.trim() || undefined,
                        commit_message: 'publish',
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }
                }}
                data-testid="workshop-publish"
                className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
                title="Atualiza o layout publicado e marca esta versão como release."
              >
                Publicar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (
                    await confirmModal({
                      title: 'Descartar o rascunho?',
                      description: 'Mudanças não publicadas serão perdidas.',
                      tone: 'danger',
                      confirmLabel: 'Descartar',
                    })
                  ) {
                    updateApp(discardDraft(app));
                  }
                }}
                data-testid="workshop-discard-draft"
                className="h-7 px-2.5 text-[11px] bg-canvas-light text-muted-on-light border border-border-light hover:border-danger hover:text-danger flex items-center gap-1.5"
                title="Volta pro layout publicado, descartando edições."
              >
                Descartar
              </button>
            </>
          )}
          <a
            href={`/workshop/view/${encodeURIComponent(appId)}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="workshop-editor-preview"
            title={
              dirty
                ? 'Visualizar — abre em nova aba. Edições não salvas NÃO aparecem.'
                : 'Visualizar — abre em nova aba'
            }
            className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <Eye className="w-3 h-3" strokeWidth={1.5} /> Visualizar
          </a>
          {/* Missão #17 — toolbar reorganizado em 3 categorias. Cada item
              dentro do dropdown é o MESMO botão/componente de antes; só muda
              como é alcançado. Os 5 componentes auto-contidos (Cabeçalho/
              Cores/Páginas/Janelas/Estados) mantêm seu popover ancorado ao
              próprio item — por isso NÃO chamam close(). Os botões/links de
              estado (Dados/Versões/Comentários/Métricas/Dependências/
              Histórico) fecham o dropdown ao acionar. */}
          {/* Conteúdo: Dados, Cabeçalho, Páginas, Janelas, Estados */}
          <ToolbarDropdown
            label={t('workshop.toolbar.content')}
            testId="workshop-toolbar-content"
          >
            {(close) => (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setVariablesPanelOpen(true);
                    close();
                  }}
                  data-testid="workshop-open-variables-panel"
                  className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
                  title="Dados disponíveis neste painel e onde são usados"
                >
                  <Database className="w-3 h-3" strokeWidth={1.5} /> Dados
                  {(app.variables ?? []).length > 0 && (
                    <span className="px-1 text-[9px] font-mono bg-primary/15 text-primary border border-primary/30">
                      {(app.variables ?? []).length}
                    </span>
                  )}
                </button>
                <HeaderConfigButton app={app} onChange={(next) => updateApp(next)} />
                <PageRoutingButton app={app} onChange={(next) => updateApp(next)} />
                <OverlaysConfigButton app={app} onChange={(next) => updateApp(next)} />
                <StateSavingConfigButton app={app} onChange={(next) => updateApp(next)} />
              </>
            )}
          </ToolbarDropdown>
          {/* Aparência: Cores */}
          <ToolbarDropdown
            label={t('workshop.toolbar.appearance')}
            testId="workshop-toolbar-appearance"
          >
            {() => <UsedColorsButton app={app} onChange={(next) => updateApp(next)} />}
          </ToolbarDropdown>
          {/* Gerenciar: Versões, Comentários, Métricas, Dependências, Histórico */}
          <ToolbarDropdown
            label={t('workshop.toolbar.manage')}
            testId="workshop-toolbar-manage"
          >
            {(close) => (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setVersionsDialogOpen(true);
                    close();
                  }}
                  data-testid="workshop-open-versions"
                  className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
                  title="Histórico de versões deste painel"
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> Versões
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCommentsDrawerOpen(true);
                    close();
                  }}
                  data-testid="workshop-open-comments"
                  className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
                  title="Comentários deste painel — discuta com colegas sem sair do editor"
                >
                  <MessageSquare className="w-3 h-3" strokeWidth={1.5} /> Comentários
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMetricsDialogOpen(true);
                    close();
                  }}
                  data-testid="workshop-open-metrics"
                  className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
                  title="Métricas de uso deste painel (eventos de acesso e ações)"
                >
                  <BarChart3 className="w-3 h-3" strokeWidth={1.5} /> Métricas
                </button>
                <a
                  href={`/painel-de-controle/dependencies/${encodeURIComponent(app.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => close()}
                  data-testid="workshop-open-dependencies"
                  className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
                  title="Ver grafo de dependências entre widgets, dados e consultas"
                >
                  <Workflow className="w-3 h-3" strokeWidth={1.5} /> Dependências
                </a>
                {/* Wave G.2 — link contextual pra changelog do painel. NÃO aparece
                    na sidenav global (memory feedback_new_pages_link_iam reservado
                    pra páginas independentes; aqui é página derivada do painel). */}
                <a
                  href={`/painel-de-controle/changelog/${encodeURIComponent(app.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => close()}
                  data-testid="workshop-open-changelog"
                  className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
                  title="Histórico de mudanças deste painel (LineageEvents)"
                >
                  <Bookmark className="w-3 h-3" strokeWidth={1.5} /> Histórico
                </a>
              </>
            )}
          </ToolbarDropdown>
          <button
            type="button"
            onClick={exportJson}
            className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
            title="Exportar definição em JSON"
          >
            <Download className="w-3 h-3" strokeWidth={1.5} /> Exportar
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
            title="Importar definição em JSON"
          >
            <Upload className="w-3 h-3" strokeWidth={1.5} /> Importar
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </header>
        {error && (
          <p className="px-3 py-2 text-[11px] text-warning bg-warning/10 border-b border-warning/30">
            {error}
          </p>
        )}
        {/* Tier A: lint warnings — best-practices guard-rails. */}
        <LintWarnings app={app} activePageId={activePageId} />
        {/* Sprint 3: barra de páginas multi-page do editor. */}
        <PagesBar
          app={app}
          activePageId={activePageId}
          onSelect={setActivePageId}
          onChange={(next) => {
            updateApp(next);
            // Se a página ativa sumiu, cai pra primeira disponível.
            if (next.pages && !next.pages.find((p) => p.id === activePageId)) {
              setActivePageId(next.pages[0]?.id ?? '__main__');
            }
          }}
        />
        {/* Onda M1.d — barra do canvas: busca global (Ctrl+K) à esquerda +
            seletor de tamanho de tela à direita (espelho do canto sup. dir.
            do canvas do Foundry). */}
        <div className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-canvas-light">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            data-testid="workshop-open-command-palette"
            aria-label="Buscar no editor"
            title="Buscar widgets, dados e ações (Ctrl+K)"
            className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <SearchIcon className="w-3 h-3" strokeWidth={1.5} />
            <span>Buscar</span>
            <kbd className="font-mono text-[10px] text-muted-on-light">Ctrl K</kbd>
          </button>
          <div className="flex-1" />
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light">
            Tela
          </span>
          <ScreenSizeSelector value={screenSize} onChange={setScreenSize} />
        </div>
        <div className="flex-1 overflow-y-auto relative p-4">
          <div
            className={cn('grid gap-3', canvasWidth !== null && 'mx-auto')}
            data-testid="workshop-canvas-grid"
            data-screen-size={screenSize}
            style={{
              gridTemplateColumns: `repeat(${totalCols}, minmax(0,1fr))`,
              ...(canvasWidth !== null
                ? { width: '100%', maxWidth: `${canvasWidth}px` }
                : null),
            }}
          >
            {activeLayout.root.length === 0 && (
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                data-testid="canvas-empty-cta"
                className="col-span-full p-8 text-center text-[12px] text-muted-on-light italic border-2 border-dashed border-border-light hover:border-primary hover:text-text-on-light transition-colors flex flex-col items-center gap-2"
              >
                <Plus className="w-5 h-5" strokeWidth={1.5} />
                <span>Canvas vazio</span>
                <span className="text-[11px] text-muted-on-light/80 not-italic">
                  Clique aqui pra abrir a paleta e escolher seu primeiro widget
                </span>
              </button>
            )}
            {activeLayout.root.map((n, i) => (
              <NodeBlock
                key={n.id}
                node={n}
                selected={selectedNodeId === n.id}
                onSelect={() => handleSelect(n.id)}
                onRemove={() => removeNode(n.id)}
                onDuplicate={() => duplicateNode(n.id)}
                onMoveUp={i > 0 ? () => moveNode(n.id, -1) : undefined}
                onMoveDown={
                  i < activeLayout.root.length - 1
                    ? () => moveNode(n.id, 1)
                    : undefined
                }
                onColSpanChange={(span) => setColSpan(n.id, span)}
                totalCols={totalCols}
              />
            ))}
            {/* CTA "Adicionar widget" no fim do canvas — sempre visível,
                não-flutuante, com mesma densidade dos blocos. Sprint 1. */}
            {activeLayout.root.length > 0 && (
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                data-testid="canvas-append-cta"
                className="col-span-full p-4 text-[11px] text-muted-on-light hover:text-text-on-light border border-dashed border-border-light hover:border-primary transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                Adicionar widget · escolha da paleta à esquerda
              </button>
            )}
          </div>
        </div>
      </section>

      {/* INSPETOR ──────────────────────────────────────────────── */}
      {inspectorOpen ? (
        <aside
          className={cn(
            'bg-panel-light border-l border-border-light flex flex-col shrink-0 overflow-hidden',
            inspectorTab === 'events' ? 'w-[680px]' : 'w-[340px]',
          )}
          data-testid="inspector-aside"
        >
          <div className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light gap-2">
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              aria-label="Esconder inspetor"
              title="Esconder inspetor"
              className="h-5 w-5 flex items-center justify-center hover:bg-border-light/40"
            >
              <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
            </button>
            <div className="flex-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setInspectorTab('props')}
                data-testid="inspector-tab-props"
                aria-pressed={inspectorTab === 'props'}
                className={cn(
                  'h-6 px-2 text-caption uppercase tracking-[0.16em] font-semibold border',
                  inspectorTab === 'props'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-canvas-light border-border-light hover:border-primary text-text-on-light',
                )}
              >
                Propriedades
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('events')}
                data-testid="inspector-tab-events"
                aria-pressed={inspectorTab === 'events'}
                className={cn(
                  'h-6 px-2 text-caption uppercase tracking-[0.16em] font-semibold border',
                  inspectorTab === 'events'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-canvas-light border-border-light hover:border-primary text-text-on-light',
                )}
              >
                Eventos
              </button>
              {/* Wave F.2 — slate-parity tabs (placeholders honestos). */}
              <button
                type="button"
                onClick={() => setInspectorTab('styles')}
                data-testid="inspector-tab-styles"
                aria-pressed={inspectorTab === 'styles'}
                className={cn(
                  'h-6 px-2 text-caption uppercase tracking-[0.16em] font-semibold border',
                  inspectorTab === 'styles'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-canvas-light border-border-light hover:border-primary text-text-on-light',
                )}
              >
                Estilos
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('deps')}
                data-testid="inspector-tab-deps"
                aria-pressed={inspectorTab === 'deps'}
                className={cn(
                  'h-6 px-2 text-caption uppercase tracking-[0.16em] font-semibold border',
                  inspectorTab === 'deps'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-canvas-light border-border-light hover:border-primary text-text-on-light',
                )}
              >
                Dependências
              </button>
            </div>
          </div>
          {!selectedNode && (
            <p className="px-3 py-3 text-[11px] text-muted-on-light italic">
              Selecione um widget no canvas (clique no chip do id) pra editar
              props.
            </p>
          )}
          {selectedNode && inspectorTab === 'props' && (
            <NodeInspector
              key={selectedNode.id}
              node={selectedNode}
              totalCols={totalCols}
              tabsKnownInApp={tabsKnownInApp}
              appVariables={app.variables ?? []}
              onOpenVariablesPanel={() => setVariablesPanelOpen(true)}
              onChange={(patch) => updateNode(selectedNode.id, patch)}
            />
          )}
          {selectedNode && inspectorTab === 'events' && (
            <EventsPanel
              selectedNode={selectedNode}
              variables={app.variables ?? []}
              overlays={app.overlays ?? []}
              pages={app.pages ?? []}
              onChangeNode={(events) =>
                updateNode(selectedNode.id, { events })
              }
            />
          )}
          {/* Wave G.2 — Estilos: override real por-widget. */}
          {selectedNode && inspectorTab === 'styles' && (
            <InspectorStylesTab
              key={`styles-${selectedNode.id}`}
              node={selectedNode}
              onChange={(next) =>
                updateNode(selectedNode.id, { widget: next.widget })
              }
            />
          )}
          {/* Wave G.2 — Dependências: vista interativa upstream + downstream. */}
          {selectedNode && inspectorTab === 'deps' && (
            <InspectorDepsTab
              key={`deps-${selectedNode.id}`}
              app={app}
              widgetId={selectedNode.id}
              onNavigateWidget={(wid) => setSelectedNodeId(wid)}
              onNavigateVariable={() => setVariablesPanelOpen(true)}
            />
          )}
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setInspectorOpen(true)}
          aria-label="Mostrar inspetor"
          title={selectedNode ? `Mostrar inspetor (${selectedNode.widget.type})` : 'Mostrar inspetor'}
          className="w-6 bg-panel-light border-l border-border-light flex items-start justify-center pt-2 hover:bg-raised-light shrink-0"
        >
          <ChevronLeft className="w-3 h-3" strokeWidth={1.5} />
        </button>
      )}
      <VariablesPanel
        app={app}
        open={variablesPanelOpen}
        onClose={() => setVariablesPanelOpen(false)}
        onChange={(next) => updateApp(next)}
      />
      <VersionsDialog
        app={app}
        open={versionsDialogOpen}
        onClose={() => setVersionsDialogOpen(false)}
        onAppReloaded={(reloaded) => updateApp(reloaded)}
      />
      <MetricsDialog
        app={app}
        open={metricsDialogOpen}
        onClose={() => setMetricsDialogOpen(false)}
        onAppChange={(next) => updateApp(next)}
      />
      <CommentsDrawer
        app={app}
        open={commentsDrawerOpen}
        onClose={() => setCommentsDrawerOpen(false)}
      />
      {/* Onda M1.d — busca global do editor (Ctrl/Cmd+K). Adiciona widgets
          pela paleta, salta pro painel de Dados de uma variável, ou abre os
          painéis do editor (Dados/Eventos/Estilos/Dependências/Versões/
          Comentários/Métricas). */}
      <EditorCommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        widgets={commandWidgets}
        variables={commandVariables}
        actions={[
          { key: 'variables', label: 'Abrir painel de Dados', run: () => setVariablesPanelOpen(true) },
          {
            key: 'events',
            label: 'Abrir Eventos do widget',
            run: () => {
              setInspectorTab('events');
              setInspectorOpen(true);
            },
          },
          {
            key: 'styles',
            label: 'Abrir Estilos do widget',
            run: () => {
              setInspectorTab('styles');
              setInspectorOpen(true);
            },
          },
          {
            key: 'deps',
            label: 'Abrir Dependências do widget',
            run: () => {
              setInspectorTab('deps');
              setInspectorOpen(true);
            },
          },
          { key: 'versions', label: 'Abrir Versões', run: () => setVersionsDialogOpen(true) },
          { key: 'comments', label: 'Abrir Comentários', run: () => setCommentsDrawerOpen(true) },
          { key: 'metrics', label: 'Abrir Métricas', run: () => setMetricsDialogOpen(true) },
        ]}
        onAddWidget={(type) => addWidget(type)}
        onOpenVariables={() => setVariablesPanelOpen(true)}
      />
    </div>
  );
}

/**
 * ToolbarDropdown — Missão #17 (2026-05-24).
 *
 * Agrupa botões do toolbar do editor em categorias ("Conteúdo", "Aparência",
 * "Gerenciar") pra desafogar a fileira densa. Cada item dentro do dropdown é
 * EXATAMENTE o botão/componente que existia inline antes — clicar nele faz
 * exatamente o que fazia (abre seu popover ancorado, alterna estado de
 * diálogo/drawer, ou navega). Este wrapper só muda COMO o item é alcançado,
 * nunca o que ele faz.
 *
 * Estilo Palantir-sharp: ZERO rounded-*, sem emoji, sem Sparkles. Fecha no
 * ESC e no click-outside. O painel é renderizado dentro do mesmo `relative`
 * do trigger, então os popovers internos dos itens (que ancoram em
 * `top-full right-0`) continuam ancorando corretamente ao próprio item.
 */
function ToolbarDropdown({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`${testId}-trigger`}
        className={cn(
          'h-7 px-2.5 text-[11px] border flex items-center gap-1.5',
          open
            ? 'bg-canvas-light border-primary text-text-on-light'
            : 'bg-raised-light border-border-light hover:border-primary text-text-on-light',
        )}
      >
        {label}
        <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          role="menu"
          data-testid={`${testId}-menu`}
          /* Larguras forçadas APENAS nos triggers diretos do menu:
             - `[&>button]` / `[&>a]`: itens que são botão/link direto
             - `[&>div>button]`: trigger dos componentes auto-contidos
               (HeaderConfigButton etc.) — é o 1º filho do `div.relative`.
             Os botões DENTRO dos popovers ficam sob `div.relative > div.absolute`
             (`[&>div>div ...]`) e NÃO são alcançados — preserva o layout interno
             de cada popover (swatches de cor, linhas de janela, etc.). */
          className="absolute top-full right-0 mt-1 bg-canvas-light border border-border-light shadow-xl z-40 min-w-[200px] p-1 flex flex-col gap-1 surface-light [&>button]:w-full [&>button]:justify-start [&>a]:w-full [&>a]:justify-start [&>div]:w-full [&>div>button]:w-full [&>div>button]:justify-start"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function SaveStatusChip({
  dirty,
  status,
}: {
  dirty: boolean;
  status: SaveStatus;
}) {
  if (dirty && status.kind !== 'saving') {
    return <span className="text-[10px] text-warning font-mono">não salvo</span>;
  }
  if (status.kind === 'saving') {
    return (
      <span className="text-[10px] text-muted-on-light font-mono">salvando…</span>
    );
  }
  if (status.kind === 'saved_server') {
    return (
      <span
        className="text-[10px] text-success font-mono"
        title={`em ${fmtClock(status.at)}`}
      >
        salvo no servidor · {fmtClock(status.at)}
      </span>
    );
  }
  if (status.kind === 'saved_local_only') {
    return (
      <span
        className="text-[10px] text-warning font-mono"
        title={`Servidor: ${status.reason}. Local em ${fmtClock(status.at)}.`}
      >
        só local · {status.reason}
      </span>
    );
  }
  return null;
}

function NodeInspector({
  node,
  totalCols,
  tabsKnownInApp,
  appVariables,
  onOpenVariablesPanel,
  onChange,
}: {
  node: LayoutNode;
  totalCols: number;
  tabsKnownInApp: string[];
  appVariables: WorkshopVariable[];
  onOpenVariablesPanel: () => void;
  onChange: (patch: Partial<LayoutNode>) => void;
}) {
  const meta = getWidgetMeta(node.widget.type);
  const schema = meta?.config_schema;
  const props = (node.widget.props as Record<string, unknown>) ?? {};

  // Aplica IMEDIATAMENTE quando um field muda — sem botão "Aplicar".
  const updateProp = (key: string, value: unknown) => {
    const nextProps = { ...props };
    if (value === undefined || value === null || value === '') {
      delete nextProps[key];
    } else {
      nextProps[key] = value;
    }
    onChange({ widget: { ...node.widget, props: nextProps } });
  };

  const setColSpan = (span: number) => {
    const clamped = Math.max(1, Math.min(totalCols, span));
    onChange({
      ...node,
      layout: { ...(node.layout ?? {}), col_span: clamped },
    });
  };

  const setTab = (tab: string) => {
    const clean = tab.trim();
    onChange({
      ...node,
      layout: clean
        ? { ...(node.layout ?? {}), tab: clean }
        : (() => {
            const { tab: _drop, ...rest } = node.layout ?? {};
            return rest;
          })(),
    });
  };

  const setSlot = (slot: string) => {
    const clean = slot.trim();
    onChange({
      ...node,
      layout:
        clean && clean !== 'canvas'
          ? { ...(node.layout ?? {}), slot: clean }
          : (() => {
              const { slot: _drop, ...rest } = node.layout ?? {};
              return rest;
            })(),
    });
  };

  const currentSpan = node.layout?.col_span ?? totalCols;
  const currentTab = node.layout?.tab ?? '';
  const currentSlot = node.layout?.slot ?? 'canvas';

  return (
    <div className="flex-1 overflow-y-auto text-[11px]">
      {/* ─── Cabeçalho do widget ──────────────────────────── */}
      <div className="px-3 py-3 border-b border-border-light bg-canvas-light">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
          Widget
        </p>
        <p className="font-medium text-text-on-light">
          {meta?.label ?? node.widget.type}
        </p>
        <p className="font-mono text-[10px] text-muted-on-light mt-0.5 truncate">
          {node.widget.type}
        </p>
        {meta?.description && (
          <p className="text-[10px] text-muted-on-light mt-1 leading-snug">
            {meta.description}
          </p>
        )}
      </div>

      {/* ─── ID + Largura ──────────────────────────────────── */}
      <div className="px-3 py-3 border-b border-border-light space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
            ID
          </p>
          <p className="font-mono text-[10px] truncate">{node.id}</p>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1.5">
            Largura · {currentSpan} / {totalCols} colunas
          </label>
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {COL_SPAN_OPTIONS.filter((s) => s <= totalCols).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setColSpan(s)}
                className={cn(
                  'h-6 px-2 text-[10px] border font-mono',
                  currentSpan === s
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white border-border-light hover:border-primary',
                )}
                title={`col_span = ${s}`}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setColSpan(totalCols)}
              className={cn(
                'h-6 px-2 text-[10px] border font-mono',
                currentSpan === totalCols
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white border-border-light hover:border-primary',
              )}
              title="Linha toda"
            >
              linha
            </button>
          </div>
          <input
            type="range"
            min={1}
            max={totalCols}
            step={1}
            value={currentSpan}
            onChange={(e) => setColSpan(parseInt(e.target.value, 10) || 1)}
            className="w-full h-1 bg-border-light appearance-none accent-primary cursor-pointer"
          />
        </div>
        <SlotPicker value={currentSlot} onChange={setSlot} />
        <TabPicker
          allKnown={tabsKnownInApp}
          value={currentTab}
          onChange={setTab}
        />
      </div>

      {/* ─── Auto-refresh + Variables usadas (Sprint 1) ────── */}
      <AutoRefreshSection
        node={node}
        metaDefault={meta?.autoRefresh?.intervalSeconds ?? 0}
        onChange={(secs) =>
          onChange({
            ...node,
            layout:
              secs == null
                ? (() => {
                    const { refresh_seconds: _drop, ...rest } = node.layout ?? {};
                    return rest;
                  })()
                : { ...(node.layout ?? {}), refresh_seconds: secs },
          })
        }
      />
      <VariablesUsedSection node={node} />
      {/* F2: a edição de eventos vive AGORA só na aba "Eventos" (EventsPanel
          sobre node.events, com triggers reais + seletores populados). O
          EventsSection inline foi removido pra não haver dois editores. */}

      {/* ─── Propriedades (form nativo OU fallback JSON) ───── */}
      {schema && schema.length > 0 ? (
        <div className="px-3 py-3 border-b border-border-light space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            Configuração
          </p>
          {schema.map((f) => (
            <PropFieldEditor
              key={f.name}
              field={f}
              value={props[f.name] ?? f.default}
              appVariables={appVariables}
              siblingConfig={props}
              onOpenVariablesPanel={onOpenVariablesPanel}
              onChange={(v) => updateProp(f.name, v)}
            />
          ))}
        </div>
      ) : (
        <PropsRawEditor
          node={node}
          onChange={(p) => onChange({ widget: { ...node.widget, props: p } })}
        />
      )}

      {/* ─── Avançado — JSON cru (sempre disponível) ───────── */}
      <AdvancedJsonEditor node={node} onChange={onChange} hasSchema={!!schema} />
    </div>
  );
}

/**
 * Auto-refresh section — override por instância do `meta.autoRefresh`.
 * `null` = usa default do widget; `0` = sem refresh; `>0` = segundos.
 * Adicionado em Sprint 1 do Workshop parity roadmap.
 */
function AutoRefreshSection({
  node,
  metaDefault,
  onChange,
}: {
  node: LayoutNode;
  metaDefault: number;
  onChange: (secs: number | null) => void;
}) {
  const override = node.layout?.refresh_seconds;
  const current = typeof override === 'number' ? override : null;
  const effective = current ?? metaDefault;
  return (
    <div className="px-3 py-3 border-b border-border-light space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Auto-refresh
      </p>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          step={1}
          value={effective}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="w-20 h-6 px-2 text-[11px] font-mono border border-border-light bg-white outline-none focus:border-primary"
          aria-label="Intervalo em segundos"
        />
        <span className="text-[10px] text-muted-on-light font-mono">
          segundos
        </span>
        {current !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-auto text-[10px] font-mono text-muted-on-light hover:text-text-on-light underline"
            title="Voltar pro default do widget"
          >
            resetar
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-on-light leading-snug">
        {effective === 0
          ? 'Sem refresh — widget renderiza 1x e fica estático.'
          : `Remount automático a cada ${effective}s. Default do widget: ${metaDefault}s.`}
      </p>
    </div>
  );
}

/**
 * Variables usadas pelo widget — dependency graph read-only. Lê:
 *   - `config_schema` com `field === 'variable-ref'` apontando pra variable
 *   - `mockVariables` (chaves esperadas em runtime)
 *   - `node.widget.bindings` (override de variable por instância)
 *
 * Útil pra debug: "por que esse widget não tá renderizando? Ah, ele
 * espera `eventos` mas eu setei `events`".
 *
 * Adicionado em Sprint 1 do Workshop parity roadmap.
 */
function VariablesUsedSection({ node }: { node: LayoutNode }) {
  const meta = getWidgetMeta(node.widget.type);
  const props = (node.widget.props as Record<string, unknown>) ?? {};

  // Variables que o widget DECLARA esperar (via mockVariables ou config_schema).
  const expected = new Set<string>();
  if (meta?.mockVariables) {
    Object.keys(meta.mockVariables).forEach((k) => expected.add(k));
  }
  // Variables que o operador BINDOU via config (campos variable-ref).
  const bound: { configField: string; varRef: string }[] = [];
  if (meta?.config_schema) {
    for (const f of meta.config_schema) {
      if (f.field !== 'variable-ref') continue;
      const v = props[f.name];
      if (typeof v === 'string' && v) {
        bound.push({ configField: f.name, varRef: v });
      }
    }
  }
  // Bindings explícitos (widget output → variable).
  const explicitBindings = node.widget.bindings ?? {};

  if (expected.size === 0 && bound.length === 0 && Object.keys(explicitBindings).length === 0) {
    return null;
  }

  return (
    <div className="px-3 py-3 border-b border-border-light space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Variables · dependency graph
      </p>
      {expected.size > 0 && (
        <div>
          <p className="text-[10px] text-muted-on-light mb-1">Lê de runtime</p>
          <div className="flex flex-wrap gap-1">
            {Array.from(expected).map((k) => (
              <code
                key={k}
                className="px-1.5 py-0.5 bg-canvas-light border border-border-light text-[10px] font-mono text-primary"
              >
                variables.{k}
              </code>
            ))}
          </div>
        </div>
      )}
      {bound.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-on-light mb-1">Bindings de config</p>
          <ul className="space-y-0.5">
            {bound.map((b) => (
              <li
                key={b.configField}
                className="text-[10px] font-mono flex items-center gap-1.5"
              >
                <span className="text-muted-on-light">{b.configField}</span>
                <span className="text-muted-on-light/60">→</span>
                <span className="text-primary">{b.varRef}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {Object.keys(explicitBindings).length > 0 && (
        <div>
          <p className="text-[10px] text-muted-on-light mb-1">Escreve em</p>
          <ul className="space-y-0.5">
            {Object.entries(explicitBindings).map(([varExt, srcWidget]) => (
              <li
                key={varExt}
                className="text-[10px] font-mono flex items-center gap-1.5"
              >
                <span className="text-primary">{varExt}</span>
                <span className="text-muted-on-light/60">←</span>
                <span className="text-muted-on-light truncate">{srcWidget}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


/**
 * Picker do slot (`layout.slot`) — escolhe a região onde o widget
 * aparece na view final (header / sidebar esquerda / sidebar direita /
 * canvas central). Ignorado no canvas do editor.
 */
const SLOT_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'canvas', label: 'canvas', hint: 'grid central (default)' },
  { value: 'top', label: 'top', hint: 'header full-width' },
  { value: 'left', label: 'left', hint: 'sidebar esquerda' },
  { value: 'right', label: 'right', hint: 'sidebar direita' },
];

function SlotPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (slot: string) => void;
}) {
  const current = value || 'canvas';
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1.5">
        Slot (view final){' '}
        <span className="text-muted-on-light/70 normal-case tracking-normal">
          — região do layout
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-1">
        {SLOT_OPTIONS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            title={s.hint}
            className={cn(
              'h-6 px-2 text-[10px] border font-mono',
              current === s.value
                ? 'bg-primary text-white border-primary'
                : 'bg-white border-border-light hover:border-primary',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Picker da aba (`layout.tab`) — chips clicáveis com as abas conhecidas
 * do app + as convencionadas pra ficha + input livre pra criar nova.
 *
 * Tabs são propriedade do LAYOUT (não do widget), então o operador
 * pode mover o widget entre abas sem afetar o registry. View final
 * (/ficha/{id}) lê isso pra agrupar.
 */
const FICHA_TAB_SUGGESTIONS = ['identidade', 'historico', 'atividade'];

function TabPicker({
  allKnown,
  value,
  onChange,
}: {
  allKnown: string[];
  value: string;
  onChange: (tab: string) => void;
}) {
  const suggestions = React.useMemo(() => {
    const s = new Set<string>(FICHA_TAB_SUGGESTIONS);
    for (const t of allKnown) s.add(t);
    return Array.from(s);
  }, [allKnown]);

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1.5">
        Aba (view final){' '}
        <span className="text-muted-on-light/70 normal-case tracking-normal">
          — usada pela /ficha pra agrupar widgets
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'h-6 px-2 text-[10px] border font-mono',
            value === ''
              ? 'bg-primary text-white border-primary'
              : 'bg-white border-border-light hover:border-primary',
          )}
          title="Widget cai na aba 'Outros' na view final"
        >
          (nenhuma)
        </button>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              'h-6 px-2 text-[10px] border font-mono',
              value === s
                ? 'bg-primary text-white border-primary'
                : 'bg-white border-border-light hover:border-primary',
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="nova aba (texto livre)"
        className="w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono"
      />
    </div>
  );
}

/* PropFieldEditor + VariableRefPicker / VariablePathPicker /
 * NodeTypeFieldPicker foram extraídos para `./prop-field-editor` (Onda L.3,
 * 2026-05-23) pra serem reusados também pelo editor de Páginas — DRY: um
 * único renderer cobre TODOS os FieldKinds, sem texto cru. Ver import no topo. */

function PropsRawEditor({
  node,
  onChange,
}: {
  node: LayoutNode;
  onChange: (props: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(JSON.stringify(node.widget.props ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setText(JSON.stringify(node.widget.props ?? {}, null, 2));
    setErr(null);
  }, [node.id, node.widget.props]);
  return (
    <div className="px-3 py-3 border-b border-border-light space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          Configuração · JSON
        </p>
        <p className="text-[10px] text-muted-on-light italic">
          widget sem schema
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="w-full text-[10px] font-mono bg-white border border-border-light p-2 outline-none focus:border-primary"
      />
      {err && <p className="text-[10px] text-danger">{err}</p>}
      <button
        type="button"
        onClick={() => {
          try {
            onChange(JSON.parse(text) as Record<string, unknown>);
            setErr(null);
          } catch (e) {
            setErr('JSON inválido: ' + (e instanceof Error ? e.message : String(e)));
          }
        }}
        className="w-full h-7 bg-primary text-white text-[11px] hover:bg-primary-hover"
      >
        Aplicar JSON
      </button>
    </div>
  );
}

/**
 * Accordion "Avançado" colapsado por padrão — expõe props + layout
 * como JSON cru pra power users (mesmo quando há schema visual acima).
 */
function AdvancedJsonEditor({
  node,
  onChange,
  hasSchema,
}: {
  node: LayoutNode;
  onChange: (patch: Partial<LayoutNode>) => void;
  hasSchema: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [propsText, setPropsText] = useState(
    JSON.stringify(node.widget.props ?? {}, null, 2),
  );
  const [layoutText, setLayoutText] = useState(
    JSON.stringify(node.layout ?? {}, null, 2),
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setPropsText(JSON.stringify(node.widget.props ?? {}, null, 2));
    setLayoutText(JSON.stringify(node.layout ?? {}, null, 2));
    setErr(null);
  }, [node.id, node.layout, node.widget.props]);

  const apply = () => {
    try {
      const props = JSON.parse(propsText);
      const layout = layoutText.trim() ? JSON.parse(layoutText) : undefined;
      onChange({ widget: { ...node.widget, props }, layout });
      setErr(null);
    } catch (e) {
      setErr('JSON inválido: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="px-3 py-3">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-on-light font-semibold hover:text-text-on-light"
      >
        <ChevronDown
          className={cn('w-3 h-3 transition-transform', open ? '' : '-rotate-90')}
          strokeWidth={1.5}
        />
        Avançado · JSON
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {hasSchema && (
            <p className="text-[10px] text-muted-on-light italic leading-snug">
              Editar JSON aqui sobrescreve o que você configurou nos
              campos acima.
            </p>
          )}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
              props
            </label>
            <textarea
              value={propsText}
              onChange={(e) => setPropsText(e.target.value)}
              rows={8}
              className="w-full text-[10px] font-mono bg-white border border-border-light p-2 outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
              layout
            </label>
            <textarea
              value={layoutText}
              onChange={(e) => setLayoutText(e.target.value)}
              rows={4}
              className="w-full text-[10px] font-mono bg-white border border-border-light p-2 outline-none focus:border-primary"
              placeholder='{"col_span": 2, "min_height": "300px"}'
            />
          </div>
          {err && <p className="text-[10px] text-danger">{err}</p>}
          <button
            type="button"
            onClick={apply}
            className="w-full h-7 bg-primary text-white text-[11px] hover:bg-primary-hover"
          >
            Aplicar JSON
          </button>
        </div>
      )}
    </div>
  );
}

function NodeBlock({
  node,
  selected,
  onSelect,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onColSpanChange,
  totalCols,
}: {
  node: LayoutNode;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onColSpanChange: (span: number) => void;
  totalCols: number;
}) {
  const Component = getWidgetComponent(node.widget.type);
  const meta = getWidgetMeta(node.widget.type);
  const colSpan = node.layout?.col_span ?? totalCols;
  const rowSpan = node.layout?.row_span;
  const minHeight = node.layout?.min_height;
  const style: React.CSSProperties = { gridColumn: `span ${colSpan}` };
  if (rowSpan) style.gridRow = `span ${rowSpan}`;
  if (minHeight) style.minHeight = minHeight;

  // Hover-reveal: toolbar fica invisível em idle, aparece em hover OU
  // quando o bloco está selected. O bloco inteiro vira clicável pra
  // selecionar — sem precisar mirar no chip. Botões internos da
  // toolbar param a propagação pra não disparar select acidentalmente.
  const stop = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn?.();
  };

  return (
    <div
      data-testid={`editor-node-${node.id}`}
      style={style}
      onClick={onSelect}
      className={cn(
        'group relative border-2 transition-colors cursor-pointer',
        selected
          ? 'border-primary'
          : 'border-transparent hover:border-border-light',
      )}
    >
      <div
        className={cn(
          'absolute -top-3 left-3 z-20 flex items-center gap-1 transition-opacity',
          selected
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
        )}
      >
        <span
          className={cn(
            'h-6 px-2 text-[10px] font-mono border bg-white shadow-sm flex items-center',
            selected
              ? 'border-primary text-primary'
              : 'border-border-light text-muted-on-light',
          )}
          title={`${meta?.label ?? node.widget.type} · ${node.id}`}
        >
          <span className="text-muted-on-light mr-1">{node.widget.type}</span>
          {node.id.slice(-6)}
        </span>
        <button
          type="button"
          onClick={stop(onMoveUp)}
          disabled={!onMoveUp}
          aria-label="Mover acima"
          title="Mover bloco acima"
          className={cn(
            'h-6 w-6 flex items-center justify-center bg-white border shadow-sm',
            onMoveUp
              ? 'border-border-light hover:border-primary'
              : 'border-border-light/40 text-muted-on-light/40 cursor-not-allowed',
          )}
        >
          <ArrowUp className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={stop(onMoveDown)}
          disabled={!onMoveDown}
          aria-label="Mover abaixo"
          title="Mover bloco abaixo"
          className={cn(
            'h-6 w-6 flex items-center justify-center bg-white border shadow-sm',
            onMoveDown
              ? 'border-border-light hover:border-primary'
              : 'border-border-light/40 text-muted-on-light/40 cursor-not-allowed',
          )}
        >
          <ArrowDown className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <select
          value={colSpan}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onColSpanChange(parseInt(e.target.value, 10));
          }}
          className="h-6 text-[10px] font-mono border border-border-light bg-white shadow-sm px-1 outline-none focus:border-primary"
          title="Largura (col_span)"
          aria-label="Largura (col_span)"
        >
          {COL_SPAN_OPTIONS.filter((s) => s <= totalCols).map((s) => (
            <option key={s} value={s}>
              {s} col
            </option>
          ))}
          {!COL_SPAN_OPTIONS.includes(colSpan as (typeof COL_SPAN_OPTIONS)[number]) && (
            <option value={colSpan}>{colSpan} col</option>
          )}
          {totalCols > 0 &&
            !COL_SPAN_OPTIONS.includes(totalCols as (typeof COL_SPAN_OPTIONS)[number]) && (
              <option value={totalCols}>{totalCols} col (linha)</option>
            )}
        </select>
        <button
          type="button"
          onClick={stop(onDuplicate)}
          aria-label="Duplicar bloco"
          title="Duplicar bloco logo abaixo"
          className="h-6 w-6 flex items-center justify-center bg-white border border-border-light hover:border-primary shadow-sm"
        >
          <Copy className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={stop(onRemove)}
          aria-label="Excluir bloco"
          title="Excluir bloco do template"
          className="h-6 w-6 flex items-center justify-center bg-white border border-border-light hover:border-danger hover:text-danger shadow-sm"
        >
          <Trash2 className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>
      <div className="mt-2 relative">
        {Component ? (
          <EditorPreviewFrame
            type={node.widget.type}
            meta={meta}
            minHeight={minHeight}
            hasMock={!!(meta?.mockVariables || meta?.mockConfig)}
          >
            <WidgetErrorBoundary widgetType={node.widget.type} nodeId={node.id}>
              <Component
                appId="editor"
                config={{
                  ...(meta?.mockConfig ?? {}),
                  ...((node.widget.props as Record<string, unknown>) ?? {}),
                }}
                variables={meta?.mockVariables ?? {}}
                bindings={{}}
                setBinding={() => {}}
              />
            </WidgetErrorBoundary>
          </EditorPreviewFrame>
        ) : (
          <div className="p-3 border border-dashed border-warning bg-warning/5 text-[11px] font-mono text-warning">
            Widget não registrado: <strong>{node.widget.type}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Frame de preview pra cada widget no canvas do editor. Mostra ÁGUA
 * (fundo placeholder + ícone + label + descrição) ATRÁS do componente
 * real. Quando o componente renderiza pixels, a água é coberta; quando
 * o componente é vazio/loading, o frame elimina o gap visual de
 * "quadrado branco" que aparecia antes.
 *
 * Custo zero pro runtime: tudo é absolute background — não afeta layout
 * nem comportamento do widget real.
 */
function EditorPreviewFrame({
  type,
  meta,
  minHeight,
  hasMock,
  children,
}: {
  type: string;
  meta: ReturnType<typeof getWidgetMeta>;
  minHeight?: string;
  /** Quando o widget tem mockVariables, o miolo já renderiza fiel —
   *  removemos a "água" pra não competir com pixels reais. */
  hasMock?: boolean;
  children: React.ReactNode;
}) {
  const Icon = iconByName(meta?.icon ?? 'square');
  if (hasMock) {
    // Widget renderiza dados fiéis: zero água, sem border tracejada, sem
    // min-height forçado — fica idêntico ao runtime.
    return <div className="relative">{children}</div>;
  }
  return (
    <div
      className="relative bg-panel-light border border-dashed border-border-light"
      style={minHeight ? { minHeight } : { minHeight: 80 }}
    >
      {/* Camada base — placeholder centralizado (só pros widgets SEM mock) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none select-none"
      >
        <Icon
          className="w-5 h-5 text-muted-on-light/40"
          strokeWidth={1.5}
        />
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-on-light/60">
          {meta?.label ?? type}
        </p>
        {meta?.description && (
          <p className="text-[9px] text-muted-on-light/50 leading-tight max-w-[80%] text-center px-2">
            {meta.description}
          </p>
        )}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * Item da paleta — thumb inline 80px com mini-render fiel (quando o
 * widget tem mockVariables) + popover de hover 320×180 com preview
 * maior. Sem mock: cai pra placeholder discreto.
 *
 * Popover ancorado à direita da paleta; só aparece após 180ms de hover
 * pra evitar flicker ao rolar a lista.
 */
function PaletteItem({
  type,
  meta,
  onAdd,
}: {
  type: string;
  meta: ReturnType<typeof getWidgetMeta>;
  onAdd: () => void;
}) {
  const Icon = iconByName(meta?.icon ?? 'square');
  const [hover, setHover] = React.useState(false);
  const liRef = React.useRef<HTMLLIElement>(null);
  // `top`/`bottom` = bordas verticais do item; `left` = borda direita + gap
  // (ponto de abertura). Guardamos `bottom` pro flip vertical pra cima quando
  // o item está no fundo da viewport (Missão #7).
  const [popPos, setPopPos] = React.useState<
    { top: number; bottom: number; left: number } | null
  >(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const el = liRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPopPos({ top: r.top, bottom: r.bottom, left: r.right + 6 });
      setHover(true);
    }, 180);
  };
  const leave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHover(false);
  };

  React.useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <li
      ref={liRef}
      onMouseEnter={enter}
      onMouseLeave={leave}
      className="border-b border-border-light/60"
    >
      {/* role=button em <div> pra não aninhar <button> (MiniWidgetPreview
          renderiza widgets que têm seus próprios <button> internos). */}
      <div
        role="button"
        tabIndex={0}
        onClick={onAdd}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAdd();
          }
        }}
        title={type}
        className="w-full p-2 text-left hover:bg-raised-light flex items-start gap-2 cursor-pointer focus:outline-none focus:bg-raised-light"
        data-testid={`palette-item-${type}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.5} />
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-medium truncate">
            {meta?.label ?? type}
          </span>
          {meta?.description && (
            <span className="block text-[10px] text-muted-on-light leading-tight mt-0.5 line-clamp-2">
              {meta.description}
            </span>
          )}
        </span>
        <Plus
          className="w-3 h-3 text-muted-on-light shrink-0 mt-0.5"
          strokeWidth={1.5}
        />
      </div>

      {hover && popPos && typeof document !== 'undefined' && (
        <PalettePreviewPopover
          type={type}
          meta={meta}
          anchorTop={popPos.top}
          anchorRight={popPos.left}
          anchorBottom={popPos.bottom}
          Icon={Icon}
        />
      )}
    </li>
  );
}

/**
 * PalettePreviewPopover — popover de hover dos itens da paleta (Missão #7).
 *
 * Renderizado num PORTAL em `document.body`, então escapa qualquer
 * `overflow-hidden`/`overflow-auto` do scroller da paleta — o clipping
 * lateral nunca volta.
 *
 * O problema do ÚLTIMO item: o popover era ancorado SEMPRE pelo topo do
 * item e crescia pra BAIXO. Pro item no fundo da viewport, ele estourava
 * por baixo e só sobrava o cabeçalho (operador via só o título). A correção
 * é colisão-aware no eixo VERTICAL: medimos a altura real do popover (que é
 * dinâmica — depende do widget + descrição + escala) e fixamos o `top` pra
 * que o popover INTEIRO caiba; quando o item está perto do fundo, ele "vira"
 * pra cima (bottom encostando na borda inferior). Horizontal preserva a
 * lógica que já existia: se estoura à direita, abre à esquerda.
 */
function PalettePreviewPopover({
  type,
  meta,
  anchorTop,
  anchorRight,
  anchorBottom,
  Icon,
}: {
  type: string;
  meta: ReturnType<typeof getWidgetMeta>;
  /** `top` do item ancorado (px, viewport). */
  anchorTop: number;
  /** Borda direita do item + gap (px) — ponto de abertura à direita. */
  anchorRight: number;
  /** `bottom` do item ancorado (px, viewport) — usado pra alinhar a base. */
  anchorBottom: number;
  Icon: ReturnType<typeof iconByName>;
}) {
  const popRef = React.useRef<HTMLDivElement>(null);
  // Margem mínima entre o popover e qualquer borda da viewport.
  const MARGIN = 8;
  const viewportH =
    typeof window !== 'undefined' ? window.innerHeight : 0;
  const viewportW =
    typeof window !== 'undefined' ? window.innerWidth : 0;

  // Largura natural do widget (KPI=320, Dashboard layout=1200, etc).
  const naturalW = meta?.previewWidth ?? 320;
  // Espaço horizontal disponível (viewport menos margens).
  const maxAvailW = viewportW - MARGIN * 3;
  // Largura do popover: cap em maxAvailW pra nunca sair da tela.
  const popoverW = Math.min(naturalW + 16, maxAvailW);
  // Scale: se widget natural > popover, encolhe pra caber. Senão 1:1.
  const scale = Math.min(1, (popoverW - 16) / naturalW);
  // Posição horizontal: se sai pela direita, abre à esquerda do item.
  const left =
    anchorRight + popoverW + MARGIN > viewportW
      ? Math.max(MARGIN, anchorRight - popoverW - 12)
      : anchorRight;

  // O `top` arranca ancorado no item, mas é re-clampado após a medição
  // (layout-effect + ResizeObserver) pra caber inteiro na viewport.
  const [top, setTop] = React.useState(() =>
    Math.max(MARGIN, Math.min(anchorTop, viewportH - 60)),
  );

  React.useLayoutEffect(() => {
    const el = popRef.current;
    if (!el || viewportH <= 0) return;
    const reposition = () => {
      const h = el.offsetHeight;
      // Espaço disponível pra baixo, ancorando no topo do item.
      const fitsDown = anchorTop + h + MARGIN <= viewportH;
      let next: number;
      if (fitsDown) {
        // Cabe pra baixo: mantém alinhado ao topo do item.
        next = anchorTop;
      } else if (anchorBottom - h - MARGIN >= MARGIN) {
        // Não cabe pra baixo, mas cabe pra CIMA: alinha a BASE do popover
        // à base do item (flip pra cima) — popover inteiro visível.
        next = anchorBottom - h;
      } else {
        // Popover maior que o espaço útil em qualquer direção: cola no topo
        // (o corpo scrolla internamente via overflow-y-auto).
        next = MARGIN;
      }
      // Garante que o popover nunca ultrapasse nenhuma borda.
      const clamped = Math.max(MARGIN, Math.min(next, viewportH - h - MARGIN));
      setTop(Number.isFinite(clamped) ? clamped : MARGIN);
    };
    reposition();
    if (typeof ResizeObserver === 'undefined') return;
    // O MiniWidgetPreview escala async (ResizeObserver interno), então a
    // altura pode mudar depois do 1º paint — reobservamos pra re-clampar.
    const ro = new ResizeObserver(reposition);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchorTop, anchorBottom, viewportH]);

  return createPortal(
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        top,
        left,
        width: popoverW,
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        zIndex: 80,
      }}
      className="surface-light bg-panel-light border border-border-light pointer-events-none flex flex-col"
      data-testid={`palette-preview-${type}`}
    >
      <div className="h-7 px-2.5 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
        <Icon className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        <p className="text-[11px] font-semibold truncate flex-1">
          {meta?.label ?? type}
        </p>
        <span className="text-[9px] font-mono text-muted-on-light uppercase tracking-wider">
          {scale < 1 ? `preview · ${Math.round(scale * 100)}%` : 'preview'}
        </span>
      </div>
      {meta?.description && (
        <p className="px-2.5 py-1.5 text-[10px] text-muted-on-light border-b border-border-light leading-relaxed shrink-0">
          {meta.description}
        </p>
      )}
      {/* Widget renderiza em naturalW; aplicamos scale via transform
          pra caber em popoverW quando macro é maior que a viewport. */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-canvas-light p-2">
        <div
          style={{
            width: naturalW * scale,
            height:
              meta?.previewHeight != null
                ? meta.previewHeight * scale
                : undefined,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: naturalW,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <MiniWidgetPreview type={type} fit="natural" />
          </div>
        </div>
      </div>
      <p className="px-2.5 py-1 text-[9px] font-mono text-muted-on-light/70 uppercase tracking-[0.16em] border-t border-border-light text-center shrink-0">
        clique no item pra adicionar
      </p>
    </div>,
    document.body,
  );
}

/**
 * LintWarnings — Tier A do parity roadmap (2026-05-20).
 *
 * Banner não-bloqueante exibindo violações de best-practices:
 *   - max 10 widgets visíveis por view (page ativa)
 *   - max 7 páginas no app
 *   - app sem header customizado quando tem >= 3 pages (recomendação)
 *
 * Cada warning é dismissable via localStorage (chave por app+rule).
 */
const LINT_DISMISS_KEY = (appId: string, rule: string) =>
  `workshop.lint-dismissed.${appId}.${rule}`;

interface LintRule {
  id: string;
  level: 'warning' | 'info';
  message: string;
  hint: string;
}

function computeLints(
  app: WorkshopApp,
  activePageId: string,
): LintRule[] {
  const out: LintRule[] = [];
  const pages = (app.pages && app.pages.length > 0)
    ? app.pages
    : [{ id: '__main__', label: 'Principal', layout: app.layout }];
  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0];
  const widgetCount = activePage.layout?.root?.length ?? 0;
  if (widgetCount > 10) {
    out.push({
      id: 'widgets-per-view',
      level: 'warning',
      message: `Esta página tem ${widgetCount} widgets — pode ficar pesada de ler.`,
      hint: 'Considere dividir em outras páginas ou agrupar com abas.',
    });
  }
  if (pages.length > 7) {
    out.push({
      id: 'too-many-pages',
      level: 'warning',
      message: `Este painel tem ${pages.length} páginas — pode dificultar a navegação.`,
      hint: 'Painéis muito grandes ficam confusos; considere embarcar sub-painéis.',
    });
  }
  if (pages.length >= 3 && !app.header_config) {
    out.push({
      id: 'missing-header-config',
      level: 'info',
      message: 'Painel com 3+ páginas sem cabeçalho customizado — o operador pode se perder.',
      hint: 'Use o botão "Cabeçalho" do topo pra adicionar ícone e cor.',
    });
  }
  return out;
}

function LintWarnings({
  app,
  activePageId,
}: {
  app: WorkshopApp;
  activePageId: string;
}) {
  const lints = React.useMemo(() => computeLints(app, activePageId), [app, activePageId]);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = new Set<string>();
    for (const r of lints) {
      if (window.localStorage.getItem(LINT_DISMISS_KEY(app.id, r.id))) {
        next.add(r.id);
      }
    }
    setDismissed(next);
  }, [app.id, lints]);

  const dismiss = (ruleId: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LINT_DISMISS_KEY(app.id, ruleId), '1');
    setDismissed((prev) => new Set(prev).add(ruleId));
  };

  const visible = lints.filter((r) => !dismissed.has(r.id));
  if (visible.length === 0) return null;

  return (
    <div className="border-b border-border-light" data-testid="editor-lint-warnings">
      {visible.map((r) => (
        <div
          key={r.id}
          data-testid={`lint-${r.id}`}
          className={cn(
            'flex items-start gap-2 px-3 py-1.5 text-[11px] border-l-4',
            r.level === 'warning'
              ? 'bg-warning/10 text-warning border-warning'
              : 'bg-primary/5 text-primary border-primary/60',
          )}
        >
          <p className="flex-1 leading-relaxed">
            <span className="font-semibold">{r.message}</span>{' '}
            <span className="text-muted-on-light">— {r.hint}</span>
          </p>
          <button
            type="button"
            onClick={() => dismiss(r.id)}
            aria-label="Dispensar warning"
            className="h-5 w-5 flex items-center justify-center hover:bg-text-on-light/10"
          >
            <X className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * PageSettingsButton — Sprint A4 (Parity Audit).
 *
 * Popover ancorado num chip de página com:
 *   - PAGE ID interno (read-only, mono small)
 *   - URL slug (input editável — usado quando routing está ligado)
 *   - Checkbox "Página inicial deste painel" (singleton)
 *   - Conflito: avisa se URL slug repete entre páginas
 */
function PageSettingsButton({
  page,
  isActive,
  isOnlyPage,
  pages,
  onPagePatch,
  onSetDefault,
}: {
  page: WorkshopPage;
  isActive: boolean;
  isOnlyPage: boolean;
  pages: WorkshopPage[];
  onPagePatch: (patch: Partial<WorkshopPage>) => void;
  onSetDefault: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const slug = page.url_slug ?? '';
  const slugConflict = !!slug && pages.some(
    (p) => p.id !== page.id && (p.url_slug ?? '') === slug,
  );
  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={`Configurar página ${page.label}`}
        title="Configurar URL e página inicial"
        data-testid={`editor-page-settings-${page.id}`}
        className={cn(
          'h-full w-6 border-l flex items-center justify-center',
          isActive
            ? 'border-white/30 hover:bg-white/10'
            : 'border-border-light hover:bg-raised-light hover:text-primary',
        )}
      >
        <Cog className="w-3 h-3" strokeWidth={1.5} />
      </button>
      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30"
          />
          <div
            data-testid={`editor-page-settings-popover-${page.id}`}
            className="absolute top-full left-0 mt-1 bg-canvas-light border border-border-light shadow-xl z-40 w-[300px] p-3 space-y-2.5 text-text-on-light"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono text-muted-on-light">
              Configurações da página
            </p>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
                Identificador interno
              </p>
              <p className="text-[11px] font-mono px-2 h-7 bg-raised-light/40 border border-border-light flex items-center text-muted-on-light">
                {page.id}
              </p>
            </div>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
                Slug na URL (opcional)
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) => onPagePatch({ url_slug: e.target.value.trim() || undefined })}
                placeholder="ex.: dashboard, detalhes"
                className={cn(
                  'w-full h-7 px-2 text-[11px] bg-canvas-light border outline-none focus:border-primary font-mono',
                  slugConflict ? 'border-danger' : 'border-border-light',
                )}
              />
              {slugConflict && (
                <p className="text-[10px] text-danger mt-1">
                  Outro slug igual existe neste painel. Escolha um único por página.
                </p>
              )}
              {!slugConflict && (
                <p className="text-[10px] text-muted-on-light leading-snug mt-1">
                  Aparece na URL como <code className="font-mono text-text-on-light">/{slug || page.id}</code> quando o roteamento estiver ligado.
                </p>
              )}
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!page.is_default}
                onChange={() => {
                  if (page.is_default) return; // já default — não pode desligar (singleton)
                  onSetDefault();
                }}
                disabled={isOnlyPage}
                data-testid={`editor-page-settings-default-${page.id}`}
                className="accent-primary mt-0.5"
              />
              <span className="flex-1">
                <span className="text-[11px] text-text-on-light block">Página inicial deste painel</span>
                <span className="text-[10px] text-muted-on-light leading-snug">
                  {isOnlyPage
                    ? 'Já é a única página — automaticamente inicial.'
                    : 'Operador entra direto nesta página ao abrir o painel.'}
                </span>
              </span>
            </label>
            <div className="pt-2 border-t border-border-light/60 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-6 px-2.5 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
              >
                Fechar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * PagesBar — Sprint 3 do parity roadmap.
 *
 * Barra horizontal mostrando as páginas do app multi-page + botão
 * "+ Nova página". Apps single-page (sem `pages`) mostram um chip
 * "Página única" + botão "Adicionar segunda página" pra migrar pro
 * modelo multi-page.
 *
 * Cada page chip suporta:
 *   - click → muda página ativa
 *   - double-click → rename inline (browser-native prompt por
 *     simplicidade Sprint 3; UI inline picker fica pra polish futuro)
 *   - botão X → deletar (mínimo 1 página)
 */
function PagesBar({
  app,
  activePageId,
  onSelect,
  onChange,
}: {
  app: WorkshopApp;
  activePageId: string;
  onSelect: (id: string) => void;
  onChange: (next: WorkshopApp) => void;
}) {
  const pages = app.pages;
  const isMulti = !!(pages && pages.length > 0);

  const addPage = () => {
    const newId = `page_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newPage = {
      id: newId,
      label: `Página ${(pages?.length ?? 1) + 1}`,
      layout: { columns: 20, root: [] },
    };
    if (isMulti) {
      onChange({ ...app, pages: [...(pages as []), newPage] });
    } else {
      // Migra single-page → multi-page: primeira página é o layout atual.
      const firstPage = {
        id: '__main__',
        label: 'Principal',
        layout: app.layout,
      };
      onChange({ ...app, pages: [firstPage, newPage] });
    }
    onSelect(newId);
  };

  const renamePage = async (id: string) => {
    if (!isMulti) return;
    const cur = (pages as { id: string; label: string }[]).find(
      (p) => p.id === id,
    );
    if (!cur) return;
    const next = await promptModal({ title: 'Novo nome da página', defaultValue: cur.label, confirmLabel: 'Renomear' });
    if (next == null) return;
    onChange({
      ...app,
      pages: (pages ?? []).map((p) =>
        p.id === id ? { ...p, label: next.trim() || cur.label } : p,
      ),
    });
  };

  const removePage = async (id: string) => {
    if (!isMulti || !pages || pages.length <= 1) return;
    if (!(await confirmModal({
      title: 'Remover esta página?',
      description: 'Os widgets dela serão perdidos.',
      tone: 'danger', confirmLabel: 'Remover',
    })))
      return;
    onChange({ ...app, pages: pages.filter((p) => p.id !== id) });
  };

  // Single-page: barra compacta com 1 chip + Add segunda.
  if (!isMulti) {
    return (
      <div
        data-testid="editor-pages-bar"
        className="h-8 px-3 border-b border-border-light bg-panel-light flex items-center gap-1.5 shrink-0"
      >
        <span className="px-2 h-6 text-[10px] font-mono uppercase tracking-[0.14em] bg-primary text-white border border-primary flex items-center">
          Página única
        </span>
        <button
          type="button"
          onClick={addPage}
          data-testid="editor-add-page"
          className="h-6 px-2 text-[10px] font-mono text-primary hover:underline"
        >
          + nova página
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="editor-pages-bar"
      className="h-9 px-3 border-b border-border-light bg-panel-light flex items-center gap-1 shrink-0 overflow-x-auto"
    >
      {(pages ?? []).map((p) => {
        const isActive = p.id === activePageId;
        return (
          <div
            key={p.id}
            className={cn(
              'h-7 flex items-center text-[11px] border transition-colors',
              isActive
                ? 'bg-primary text-white border-primary'
                : 'bg-canvas-light text-muted-on-light border-border-light hover:border-primary hover:text-text-on-light',
            )}
            data-testid={`editor-page-${p.id}`}
          >
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              onDoubleClick={() => renamePage(p.id)}
              className="h-full px-2.5 truncate max-w-[160px] flex items-center gap-1.5"
              title={`Página · ${p.id} (double-click pra renomear)`}
            >
              {p.label}
              {p.is_default && (
                <span
                  className={cn(
                    'inline-flex items-center text-[9px] font-mono px-1 py-0.5 border',
                    isActive ? 'bg-white/15 border-white/40' : 'bg-success/10 text-success border-success/30',
                  )}
                  title="Página inicial deste painel"
                >
                  Início
                </span>
              )}
            </button>
            <PageSettingsButton
              page={p}
              isActive={isActive}
              isOnlyPage={!pages || pages.length === 1}
              pages={pages ?? []}
              onPagePatch={(patch) =>
                onChange({
                  ...app,
                  pages: (pages ?? []).map((x) =>
                    x.id === p.id ? { ...x, ...patch } : x,
                  ),
                })
              }
              onSetDefault={() =>
                onChange({
                  ...app,
                  // Singleton: limpa todos antes de marcar
                  pages: (pages ?? []).map((x) => ({
                    ...x,
                    is_default: x.id === p.id,
                  })),
                })
              }
            />
            {pages && pages.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removePage(p.id);
                }}
                aria-label={`Remover página ${p.label}`}
                className={cn(
                  'h-full w-6 border-l flex items-center justify-center',
                  isActive
                    ? 'border-white/30 hover:bg-white/10'
                    : 'border-border-light hover:bg-danger/10 hover:text-danger',
                )}
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addPage}
        data-testid="editor-add-page"
        className="h-7 px-2 text-[10px] font-mono text-primary hover:underline flex items-center gap-1"
      >
        <Plus className="w-3 h-3" strokeWidth={1.5} /> nova página
      </button>
    </div>
  );
}

/**
 * Chip de filtro da paleta — usado pra rapidamente escolher um grupo
 * (Dashboard, Ficha, Parlamentar, Detalhe, Dados, Viz, Conteúdo, Agentes)
 * ou "Todos" pra ver tudo. Sharp, sem rounded.
 */
/**
 * HeaderConfigButton — Tier A do parity roadmap (2026-05-20).
 *
 * Popover ancorado no toolbar do editor; permite operador escolher
 * ícone (lucide), cor (preset ou hex) e altura do header exibido em
 * /workshop/view/{id}. Persiste em `app.header_config`.
 */
const HEADER_COLOR_PRESETS = [
  { value: 'primary', label: 'Primary', hex: '#2d77be' },
  { value: 'success', label: 'Success', hex: '#22863a' },
  { value: 'warning', label: 'Warning', hex: '#d97706' },
  { value: 'danger', label: 'Danger', hex: '#cc2939' },
  { value: 'info', label: 'Info', hex: '#0ea5e9' },
];

const HEADER_ICON_SUGGESTIONS = [
  'shield', 'shield-alert', 'shield-check', 'users', 'user-square-2',
  'id-card', 'gavel', 'building', 'map', 'video', 'eye', 'search',
  'activity', 'bell-ring', 'file-text', 'layout-dashboard',
];

function HeaderConfigButton({
  app,
  onChange,
}: {
  app: WorkshopApp;
  onChange: (next: WorkshopApp) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const cfg = app.header_config ?? {};

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const update = (patch: Partial<NonNullable<WorkshopApp['header_config']>>) => {
    const next = { ...cfg, ...patch };
    // Limpa campos vazios pra manter o JSON enxuto.
    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([_, v]) => v !== undefined && v !== ''),
    );
    onChange({
      ...app,
      header_config: Object.keys(cleaned).length > 0
        ? (cleaned as WorkshopApp['header_config'])
        : undefined,
    });
  };

  const Icon = cfg.icon ? iconByName(cfg.icon) : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
        data-testid="workshop-header-config-toggle"
        title="Personalizar cabeçalho deste painel (ícone, cor)"
      >
        {Icon ? <Icon className="w-3 h-3" strokeWidth={1.5} /> : null}
        Cabeçalho
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 bg-canvas-light border border-border-light w-[280px] z-30 surface-light p-3 space-y-3"
          data-testid="workshop-header-config-popover"
        >
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono text-muted-on-light">
            Personalizar cabeçalho
          </p>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
              Ícone
            </span>
            <input
              type="text"
              value={cfg.icon ?? ''}
              onChange={(e) => update({ icon: e.target.value || undefined })}
              placeholder="Ex.: shield-alert, id-card"
              list="header-icon-suggestions"
              className="w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
            />
            <datalist id="header-icon-suggestions">
              {HEADER_ICON_SUGGESTIONS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
              Cor
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => update({ color: undefined })}
                className={cn(
                  'h-6 px-2 text-[10px] border font-mono',
                  !cfg.color
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white border-border-light hover:border-primary',
                )}
              >
                default
              </button>
              {HEADER_COLOR_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => update({ color: p.value })}
                  title={p.label}
                  className={cn(
                    'h-6 w-6 border-2',
                    cfg.color === p.value ? 'border-text-on-light' : 'border-border-light',
                  )}
                  style={{ backgroundColor: p.hex }}
                  data-testid={`header-color-${p.value}`}
                />
              ))}
            </div>
            <input
              type="text"
              value={cfg.color && !HEADER_COLOR_PRESETS.find((p) => p.value === cfg.color) ? cfg.color : ''}
              onChange={(e) => update({ color: e.target.value || undefined })}
              placeholder="ou hex #RRGGBB"
              className="mt-2 w-full h-6 px-2 text-[10px] font-mono bg-white border border-border-light outline-none focus:border-primary"
            />
          </div>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
              Altura (px)
            </span>
            <input
              type="number"
              min={32}
              max={120}
              step={2}
              value={cfg.height ?? 40}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                update({ height: Number.isFinite(n) ? n : undefined });
              }}
              className="w-full h-7 px-2 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
            />
          </label>
          {(cfg.icon || cfg.color || cfg.height) && (
            <button
              type="button"
              onClick={() => onChange({ ...app, header_config: undefined })}
              className="text-[10px] font-mono text-muted-on-light hover:text-danger underline"
            >
              limpar tudo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * PageRoutingButton — P2 do fechamento Sprint B (2026-05-21).
 *
 * Botão "Páginas" no toolbar do editor abre popover ancorado com:
 *   - dropdown listando string variables disponíveis no app
 *   - opção "Nenhuma" pra remover binding
 *   - hint operator-friendly explicando comportamento bidirecional
 *
 * Liga `app.active_page_variable` (coluna dedicada — migration 0026 no backend).
 */
function PageRoutingButton({
  app,
  onChange,
}: {
  app: WorkshopApp;
  onChange: (next: WorkshopApp) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const stringVars = (app.variables ?? []).filter(
    (v) => v.type === 'String' && v.external_id,
  );
  const selected = app.active_page_variable ?? '';
  const selectedLabel =
    stringVars.find((v) => v.external_id === selected)?.label || selected;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="workshop-page-routing-toggle"
        className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
        title="Configurar roteamento de páginas (qual variável controla a página ativa)"
      >
        <Workflow className="w-3 h-3" strokeWidth={1.5} />
        Páginas
        {selected && (
          <span className="px-1 text-[9px] font-mono bg-primary/15 text-primary border border-primary/30 truncate max-w-[80px]">
            {selectedLabel}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30"
          />
          <div
            data-testid="workshop-page-routing-popover"
            className="absolute top-full right-0 mt-1 bg-canvas-light border border-border-light shadow-xl z-40 w-[320px] p-3 space-y-2.5 surface-light"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono text-muted-on-light">
              Roteamento de páginas
            </p>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
                Variável que controla a página ativa
              </span>
              <select
                value={selected}
                onChange={(e) =>
                  onChange({
                    ...app,
                    active_page_variable: e.target.value || undefined,
                  })
                }
                data-testid="workshop-page-routing-select"
                className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
              >
                <option value="">— Nenhuma (usar página padrão) —</option>
                {stringVars.map((v) => (
                  <option key={v.external_id} value={v.external_id}>
                    {v.label || v.external_id} ({v.external_id})
                  </option>
                ))}
              </select>
            </label>
            {stringVars.length === 0 && (
              <p className="text-[10px] text-muted-on-light italic leading-snug">
                Crie uma variável do tipo Texto em <strong>Dados</strong> antes — só strings funcionam como seletor de página.
              </p>
            )}
            <p className="text-[10px] text-muted-on-light leading-snug">
              Quando definida, o valor da variável escolhe qual página fica visível.
              O operador pode trocar a página clicando nas abas ou via URL
              (<code className="font-mono text-text-on-light">?var.{selected || '<nome>'}=...</code>).
            </p>
            <div className="pt-2 border-t border-border-light/60 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-6 px-2.5 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
              >
                Fechar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * OverlaysConfigButton — P3 do fechamento Sprint B (2026-05-21).
 *
 * Botão "Janelas" no toolbar abre popover com a lista de overlays do app
 * + form pra configurar `open_variable` (boolean var que controla
 * abertura) e `open_variable_invert` (inverte semântica). Permite criar
 * overlay novo e deletar existente.
 */
function OverlaysConfigButton({
  app,
  onChange,
}: {
  app: WorkshopApp;
  onChange: (next: WorkshopApp) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const overlays = app.overlays ?? [];
  const booleanVars = (app.variables ?? []).filter(
    (v) => v.type === 'Boolean' && v.external_id,
  );

  const patchOverlay = (id: string, patch: Partial<WorkshopOverlay>) => {
    const next = overlays.map((o) => (o.id === id ? { ...o, ...patch } : o));
    onChange({ ...app, overlays: next });
  };

  const removeOverlay = async (id: string) => {
    if (
      !(await confirmModal({
        title: 'Remover esta janela?',
        description: 'Eventos que abrem essa janela vão parar de funcionar.',
        tone: 'danger', confirmLabel: 'Remover',
      }))
    )
      return;
    onChange({ ...app, overlays: overlays.filter((o) => o.id !== id) });
  };

  const addOverlay = () => {
    // Gera id estável tipo `overlay-1`, `overlay-2`, …, evitando colisão.
    const taken = new Set(overlays.map((o) => o.id));
    let n = overlays.length + 1;
    let id = `overlay-${n}`;
    while (taken.has(id)) {
      n += 1;
      id = `overlay-${n}`;
    }
    const fresh: WorkshopOverlay = {
      id,
      title: 'Nova janela',
      variant: 'drawer-right',
      width: 480,
      layout: { columns: 12, root: [] },
    };
    onChange({ ...app, overlays: [...overlays, fresh] });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="workshop-overlays-toggle"
        className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
        title="Gerenciar janelas (drawers e modais) do painel"
      >
        <PanelRight className="w-3 h-3" strokeWidth={1.5} />
        Janelas
        {overlays.length > 0 && (
          <span className="px-1 text-[9px] font-mono bg-primary/15 text-primary border border-primary/30">
            {overlays.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30"
          />
          <div
            data-testid="workshop-overlays-popover"
            className="absolute top-full right-0 mt-1 bg-canvas-light border border-border-light shadow-xl z-40 w-[420px] p-3 space-y-2.5 surface-light"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono text-muted-on-light">
              Janelas do painel
            </p>
            {overlays.length === 0 ? (
              <p className="text-[10.5px] text-muted-on-light italic leading-snug">
                Nenhuma janela ainda. Use o botão abaixo para criar a primeira
                — janelas viram drawers ou modais que abrem com o evento{' '}
                <code className="font-mono text-text-on-light">open_overlay</code>.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[360px] overflow-y-auto">
                {overlays.map((o) => {
                  const selected = o.open_variable ?? '';
                  const invert = !!o.open_variable_invert;
                  return (
                    <li
                      key={o.id}
                      data-testid={`workshop-overlay-row-${o.id}`}
                      className="border border-border-light bg-raised-light/40 p-2 space-y-1.5"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-text-on-light truncate">
                            {o.title || o.id}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="px-1 text-[9px] font-mono bg-canvas-light border border-border-light text-muted-on-light">
                              {o.id}
                            </span>
                            <span className="px-1 text-[9px] font-mono bg-canvas-light border border-border-light text-muted-on-light">
                              {o.variant}
                            </span>
                            {o.width !== undefined && (
                              <span className="px-1 text-[9px] font-mono bg-canvas-light border border-border-light text-muted-on-light">
                                {o.width}px
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeOverlay(o.id)}
                          aria-label={`Remover janela ${o.id}`}
                          data-testid={`workshop-overlay-remove-${o.id}`}
                          className="h-6 w-6 shrink-0 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger"
                          title="Remover janela"
                        >
                          <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      </div>
                      <label className="block">
                        <span className="block text-[9px] uppercase tracking-wider text-muted-on-light font-mono mb-0.5">
                          Variável booleana que controla abertura
                        </span>
                        <select
                          value={selected}
                          onChange={(e) =>
                            patchOverlay(o.id, {
                              open_variable: e.target.value || undefined,
                            })
                          }
                          data-testid={`workshop-overlay-open-var-${o.id}`}
                          className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
                        >
                          <option value="">— Nenhuma (só via evento) —</option>
                          {booleanVars.map((v) => (
                            <option key={v.external_id} value={v.external_id}>
                              {v.label || v.external_id} ({v.external_id})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label
                        className={cn(
                          'flex items-center gap-1.5 text-[10.5px] leading-snug select-none',
                          selected ? 'text-text-on-light' : 'text-muted-on-light/60',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={invert}
                          disabled={!selected}
                          onChange={(e) =>
                            patchOverlay(o.id, {
                              open_variable_invert: e.target.checked || undefined,
                            })
                          }
                          data-testid={`workshop-overlay-invert-${o.id}`}
                          className="h-3 w-3 accent-primary"
                        />
                        Inverter (variável true = fechado)
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {booleanVars.length === 0 && (
              <p className="text-[10px] text-muted-on-light italic leading-snug">
                Crie uma variável do tipo Booleano em <strong>Dados</strong> para
                ligar abertura/fechamento da janela a um dado do painel.
              </p>
            )}
            <div className="pt-2 border-t border-border-light/60 flex items-center justify-between">
              <button
                type="button"
                onClick={addOverlay}
                data-testid="workshop-overlay-add"
                className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" strokeWidth={1.5} /> Nova janela
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-6 px-2.5 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
              >
                Fechar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PaletteChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'h-5 px-1.5 text-[10px] font-mono uppercase tracking-wide border transition-colors',
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-canvas-light text-muted-on-light border-border-light hover:border-primary hover:text-text-on-light',
      )}
    >
      {label}
    </button>
  );
}

/**
 * StateSavingConfigButton — PF3 (2026-05-20).
 *
 * Botão "Estados" no toolbar do editor abre popover de 320px pra que o
 * operador customize a terminologia das "views salvas" deste painel. Por
 * default a UI mostra "Estado salvo / Estados salvos"; quando o operador
 * preenche os 2 campos, o `UserViewsToolbar` na página de view passa a
 * usar a terminologia escolhida (singular + plural).
 *
 * Persiste em `app.state_saving_config` (coluna dedicada no backend).
 * Botão "Restaurar padrões" limpa os 2 campos — backend volta a usar o
 * default ao serializar (vê `serializeStateSavingConfig`).
 */
function StateSavingConfigButton({
  app,
  onChange,
}: {
  app: WorkshopApp;
  onChange: (next: WorkshopApp) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const cfg = app.state_saving_config ?? {};
  const update = (patch: Partial<NonNullable<WorkshopApp['state_saving_config']>>) => {
    onChange({
      ...app,
      state_saving_config: { ...cfg, ...patch },
    });
  };
  const reset = () => {
    onChange({ ...app, state_saving_config: undefined });
  };
  const hasCustom =
    !!(cfg.display_name && cfg.display_name.trim()) ||
    !!(cfg.display_name_plural && cfg.display_name_plural.trim());
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="workshop-state-saving-config-toggle"
        className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
        title="Como chamar um estado salvo neste painel (singular e plural)"
      >
        <Bookmark className="w-3 h-3" strokeWidth={1.5} />
        Estados
        {hasCustom && (
          <span className="px-1 text-[9px] font-mono bg-primary/15 text-primary border border-primary/30 truncate max-w-[100px]">
            {(cfg.display_name && cfg.display_name.trim()) || 'custom'}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30"
          />
          <div
            className="absolute top-full right-0 mt-1 bg-canvas-light border border-border-light shadow-xl z-40 w-[320px] p-3 space-y-2.5 surface-light"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono text-muted-on-light">
              Terminologia de estados salvos
            </p>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
                Como chamar um estado salvo?
              </span>
              <input
                type="text"
                value={cfg.display_name ?? ''}
                onChange={(e) => update({ display_name: e.target.value })}
                placeholder="Estado salvo"
                data-testid="state-saving-config-name"
                className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
                Plural
              </span>
              <input
                type="text"
                value={cfg.display_name_plural ?? ''}
                onChange={(e) => update({ display_name_plural: e.target.value })}
                placeholder="Estados salvos"
                data-testid="state-saving-config-plural"
                className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
              />
            </label>
            <p className="text-[10px] text-muted-on-light leading-snug">
              Aparece no toolbar da view (&quot;Salvar {(cfg.display_name && cfg.display_name.trim()) || 'estado salvo'}&quot;,
              lista de salvos, etc.). Deixe vazio pra usar o padrão.
            </p>
            <div className="pt-2 border-t border-border-light/60 flex items-center justify-between">
              <button
                type="button"
                onClick={reset}
                disabled={!hasCustom}
                data-testid="state-saving-config-reset"
                className="text-[10px] font-mono text-muted-on-light hover:text-danger underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
              >
                Restaurar padrões
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-6 px-2.5 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
              >
                Fechar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
