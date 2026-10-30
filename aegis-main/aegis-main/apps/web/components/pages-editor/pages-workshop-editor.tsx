'use client';

/**
 * Onda I.1 (2026-05-23) — Editor de Páginas reusando WorkshopEditor.
 *
 * Operador feedback #1 (executado, não proposto):
 *   "Por que voce fez outro editor para as 'Paginas' sendo que é so
 *    usar o mesmo editor do workshop? introduzir inclusive os
 *    widgets?"
 *
 * Esta é a resposta: 3-pane editor que reusa **o mesmo widget
 * registry** do Workshop (``getRegisteredWidgets``,
 * ``getWidgetComponent``, ``getWidgetMeta``). O operador vê e
 * arrasta os mesmos widgets ofertados pelo Workshop normal — sem
 * duplicação de paleta, sem widgets paralelos.
 *
 * O que muda vs. ``WorkshopEditor({appId})``:
 *
 *  1. Persistência → ``Pages.putConfig(slug, config)`` em vez de
 *     ``Workshop.update``. O blob de config carrega
 *     ``{mode: 'workshop', workshop_layout: {...}}``.
 *  2. Publish      → ``Pages.publish(slug)`` (status=published +
 *     lineage ``pages.publish``).
 *  3. Sem versions/comments/metrics — Page Registry é uma camada
 *     mais leve que Workshop apps standalone (Workshop continua
 *     sendo o lugar pra dossiês full-blown).
 *  4. Sem multi-page abas — uma Page = um layout single-page.
 *
 * Política (memórias honradas):
 *   feedback_no_rounded_no_sparkles · zero rounded-*, zero Sparkles
 *   feedback_no_emojis_in_ui · só lucide-react
 *   feedback_no_palantir_product_names · "Páginas" pt-BR
 *   feedback_no_localstorage_for_persistence · backend = source of truth
 *   feedback_workshop_widget_must_declare_mock · registry já garante
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Eye,
  PanelLeft,
  PanelRight,
  Plus,
  Save,
  Search as SearchIcon,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  getRegisteredWidgets,
  getWidgetMeta,
  type PropFieldDef,
  type WidgetGroup,
  type WidgetMeta,
} from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets'; // garante registry populado
import { WorkshopV2Renderer } from '@/components/workshop/WorkshopV2Renderer';
import { MiniWidgetPreview } from '@/components/workshop/widget-mini-preview';
// Import side-effect: registra os configuradores de experiências bespoke no
// registry genérico (buscar='buscar', solutions='solutions'). O painel
// abaixo resolve o editor pelo experience_kind (não pelo slug).
import './buscar-params-editor';
import './solutions-experience-editor';
import './agents-experience-editor';
import './aip-experience-editor';
import './embed-experience-editor';
import { getExperienceConfig } from '@/lib/pages/experience-registry';
// Onda L.3 (2026-05-23): renderer de FieldKinds COMPARTILHADO com o Workshop
// full. O editor de Páginas reusa exatamente os mesmos pickers visuais
// (variable-ref/variable-path/node-type/format-rules/form-fields/perm-key/
// action-type) — nenhum FieldKind cai em texto cru aqui.
import { PropFieldEditor } from '@/components/workshop/prop-field-editor';
// Onda R.3 (2026-05-23): reuso DIRETO do VariablesPanel do Workshop full.
// O editor de Páginas embute o MESMO gestor de dados (criar/editar/remover
// variables, com todos os tipos/kinds/specs), em vez de um botão "+ Novo"
// no-op. Persistência continua via `Pages.putConfig` (variables vão em
// `config.variables`, já suportado pelo adapter L.3/I.1). Nenhum backend
// novo, nenhuma reescrita do Workshop — só import + wiring de estado.
import { VariablesPanel } from '@/components/workshop/variables-panel';
import { iconByName } from '@/lib/icon-by-name';
import type { LayoutNode, WorkshopApp, WorkshopVariable } from '@/lib/workshop/types';
import { Pages, type RegisteredPage } from '@/lib/api';
import {
  coercePageConfig,
  migrateLegacyToWorkshop,
  pageToWorkshopApp,
  resolveExperienceKind,
  workshopAppToPageConfig,
} from './page-config-adapter';

// ── Constantes ──────────────────────────────────────────────────────────────

/**
 * Onda K.1 (#8): ordem ADAPTADA ao contexto de uma PÁGINA standalone.
 *
 * Páginas montam dashboards/exploração — então os grupos de propósito
 * geral (``home`` · ``data`` · ``viz`` · ``content`` · ``agent``) vêm
 * primeiro. Os grupos contextuais (``ficha`` · ``parlamentar`` ·
 * ``detalhe``), que só fazem sentido dentro de uma ficha de entidade ou
 * resultado de busca, descem pro fim sob um rótulo "Contextual" claro.
 *
 * REORDENAR / REAGRUPAR — não esconder: TODOS os widgets do registry
 * continuam na paleta (a busca textual encontra qualquer um deles).
 */
const PAGE_GROUP_ORDER: readonly WidgetGroup[] = [
  'home',
  'data',
  'viz',
  'content',
  'agent',
  // ── Contextual (ficha/busca) ──
  'ficha',
  'detalhe',
  'parlamentar',
] as const;

/** Grupos que pertencem a fichas/resultados de busca, não a páginas. */
const CONTEXTUAL_GROUPS = new Set<WidgetGroup>([
  'ficha',
  'detalhe',
  'parlamentar',
]);

const GROUP_LABEL: Record<WidgetGroup, string> = {
  home: 'Dashboard',
  data: 'Dados',
  viz: 'Visualização',
  content: 'Conteúdo',
  agent: 'Agentes (LLM)',
  ficha: 'Ficha de entidade',
  parlamentar: 'Dossiê parlamentar',
  detalhe: 'Detalhe de busca',
};

const COL_SPAN_OPTIONS = [1, 2, 4, 5, 10, 20] as const;

// ── Tipos ───────────────────────────────────────────────────────────────────

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string; at: number };

// ── Componente principal ────────────────────────────────────────────────────

export interface PagesWorkshopEditorProps {
  page: RegisteredPage;
  onPageChange: (page: RegisteredPage) => void;
  onBack: () => void;
}

/**
 * Dispatcher: rotas servidas por código de aplicação (``mode='app_route'``)
 * NÃO são montáveis por widgets — renderizam um painel explicativo claro
 * (Onda K.1 #1) em vez do editor 3-pane com banner "Migrar" enganoso.
 * Todas as demais (workshop/legacy) abrem o editor de canvas normal.
 */
export function PagesWorkshopEditor(props: PagesWorkshopEditorProps) {
  const mode = React.useMemo(
    () => coercePageConfig(props.page.config).mode,
    [props.page.config],
  );
  if (mode === 'app_route') {
    return <AppRoutePanel page={props.page} onBack={props.onBack} />;
  }
  return <PagesWorkshopCanvasEditor {...props} />;
}

/**
 * Editor 3-pane reusando o registry do Workshop. Carrega o config da
 * Page como WorkshopApp virtual, opera sobre o ``WorkshopApp.layout``
 * via paleta/canvas/inspector, persiste via ``Pages.putConfig``.
 */
function PagesWorkshopCanvasEditor({
  page,
  onPageChange,
  onBack,
}: PagesWorkshopEditorProps) {
  const initialConfig = React.useMemo(
    () => coercePageConfig(page.config),
    [page.config],
  );

  const [legacyDetected, setLegacyDetected] = React.useState(
    initialConfig.mode === 'legacy',
  );

  // App em memória. Se config era legacy, começa vazio (operador
  // pode migrar via botão; até lá o blob legacy permanece intacto no
  // storage — não escrevemos até save explícito).
  const [app, setApp] = React.useState<WorkshopApp>(() =>
    pageToWorkshopApp(
      page,
      initialConfig.mode === 'workshop'
        ? initialConfig
        : { mode: 'workshop', workshop_layout: { columns: 20, root: [] } },
    ),
  );

  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    null,
  );
  const [dirty, setDirty] = React.useState(false);
  const [status, setStatus] = React.useState<SaveStatus>({ kind: 'idle' });
  const [paletteOpen, setPaletteOpen] = React.useState(true);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [paletteQuery, setPaletteQuery] = React.useState('');
  const [paletteGroup, setPaletteGroup] = React.useState<WidgetGroup | null>(
    null,
  );
  const [collapsedGroups, setCollapsedGroups] = React.useState<
    Record<string, boolean>
  >({});
  const [previewOpen, setPreviewOpen] = React.useState(false);
  // Onda R.3: gestor de dados (variables) embutido. O "+ Novo" dos pickers
  // variable-ref/variable-path abre este painel; salvar uma variable nova
  // a torna disponível nos dropdowns + marca dirty (persiste no save).
  const [variablesPanelOpen, setVariablesPanelOpen] = React.useState(false);

  const groupedWidgets = React.useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    const out: Record<WidgetGroup, { type: string; meta: WidgetMeta }[]> = {
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
      const hay = [w.type, w.meta.label ?? '', w.meta.description ?? '']
        .join(' ')
        .toLowerCase();
      if (q && !hay.includes(q)) continue;
      out[w.meta.group].push(w);
    }
    for (const g of PAGE_GROUP_ORDER) {
      out[g].sort((a, b) =>
        (a.meta?.label ?? a.type).localeCompare(
          b.meta?.label ?? b.type,
          'pt-BR',
        ),
      );
    }
    return out;
  }, [paletteQuery, paletteGroup]);

  const widgetCount = React.useMemo(
    () => getRegisteredWidgets().filter((w) => !w.meta.hidden).length,
    [],
  );

  const selectedNode = React.useMemo(() => {
    if (!selectedNodeId) return null;
    return app.layout.root.find((n) => n.id === selectedNodeId) ?? null;
  }, [app, selectedNodeId]);

  const updateApp = (next: WorkshopApp) => {
    setApp(next);
    setDirty(true);
  };

  const addWidget = (type: string) => {
    const meta = getWidgetMeta(type);
    const newNode: LayoutNode = {
      id: `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      widget: { type, props: { ...(meta?.mockConfig ?? {}) } },
      layout: meta?.defaultColSpan
        ? { col_span: meta.defaultColSpan }
        : { col_span: 10 },
    };
    updateApp({
      ...app,
      layout: { ...app.layout, root: [...app.layout.root, newNode] },
    });
    setSelectedNodeId(newNode.id);
    setInspectorOpen(true);
  };

  const removeNode = (id: string) => {
    updateApp({
      ...app,
      layout: {
        ...app.layout,
        root: app.layout.root.filter((n) => n.id !== id),
      },
    });
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
      setInspectorOpen(false);
    }
  };

  const duplicateNode = (id: string) => {
    const idx = app.layout.root.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const src = app.layout.root[idx];
    const copy: LayoutNode = {
      ...JSON.parse(JSON.stringify(src)),
      id: `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    };
    const next = [...app.layout.root];
    next.splice(idx + 1, 0, copy);
    updateApp({ ...app, layout: { ...app.layout, root: next } });
    setSelectedNodeId(copy.id);
    setInspectorOpen(true);
  };

  const moveNode = (id: string, direction: -1 | 1) => {
    const list = app.layout.root;
    const idx = list.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    updateApp({ ...app, layout: { ...app.layout, root: next } });
  };

  const updateNode = (id: string, patch: Partial<LayoutNode>) => {
    updateApp({
      ...app,
      layout: {
        ...app.layout,
        root: app.layout.root.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      },
    });
  };

  const setNodeProps = (id: string, propsPatch: Record<string, unknown>) => {
    const node = app.layout.root.find((n) => n.id === id);
    if (!node) return;
    updateNode(id, {
      widget: { ...node.widget, props: { ...node.widget.props, ...propsPatch } },
    });
  };

  const setColSpan = (id: string, span: number) => {
    const node = app.layout.root.find((n) => n.id === id);
    if (!node) return;
    const totalCols = app.layout.columns ?? 20;
    const clamped = Math.max(1, Math.min(totalCols, span));
    updateNode(id, {
      layout: { ...(node.layout ?? {}), col_span: clamped },
    });
  };

  const migrateLegacy = () => {
    const migrated = migrateLegacyToWorkshop(
      initialConfig.mode === 'legacy'
        ? initialConfig
        : { mode: 'legacy', blocks: [] },
    );
    updateApp(pageToWorkshopApp(page, migrated));
    setLegacyDetected(false);
  };

  const save = async () => {
    setStatus({ kind: 'saving' });
    try {
      const config = workshopAppToPageConfig(app);
      const updated = await Pages.putConfig(
        page.slug,
        config as unknown as Record<string, unknown>,
      );
      onPageChange(updated);
      setDirty(false);
      setStatus({ kind: 'saved', at: Date.now() });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: (e as Error)?.message ?? 'Falha ao salvar',
        at: Date.now(),
      });
    }
  };

  const publish = async () => {
    setStatus({ kind: 'saving' });
    try {
      // 1. salva config corrente (mantém edições) — só se houver dirty
      if (dirty) {
        const config = workshopAppToPageConfig(app);
        await Pages.putConfig(
          page.slug,
          config as unknown as Record<string, unknown>,
        );
      }
      // 2. publica via endpoint dedicado (lineage pages.publish)
      const updated = await Pages.publish(page.slug);
      onPageChange(updated);
      setDirty(false);
      setStatus({ kind: 'saved', at: Date.now() });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: (e as Error)?.message ?? 'Falha ao publicar',
        at: Date.now(),
      });
    }
  };

  const totalCols = app.layout.columns ?? 20;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar topo */}
      <header
        className="h-10 px-3 border-b border-border-light flex items-center gap-2 bg-white shrink-0"
        data-testid="paginas-edit-toolbar"
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar à lista de páginas"
          className="h-7 px-2.5 text-[11px] bg-white text-text-on-light border border-border-light hover:border-primary flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          Voltar
        </button>
        <div className="h-5 w-px bg-border-light" />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-text-on-light truncate">
            {page.title}
          </div>
          <div className="text-[10px] text-muted-on-light font-mono truncate">
            {page.route}
          </div>
        </div>
        <SaveStatusChip dirty={dirty} status={status} />
        <button
          type="button"
          onClick={() => setVariablesPanelOpen(true)}
          data-testid="paginas-edit-dados"
          aria-label="Gerenciar dados da página"
          className="h-7 px-2.5 text-[11px] bg-white text-text-on-light border border-border-light hover:border-primary flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Database className="w-3.5 h-3.5" strokeWidth={1.5} />
          Dados
          {(app.variables?.length ?? 0) > 0 && (
            <span className="text-[10px] font-mono text-muted-on-light">
              {app.variables?.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          data-testid="paginas-edit-preview"
          aria-label="Visualizar página"
          className="h-7 px-2.5 text-[11px] bg-white text-text-on-light border border-border-light hover:border-primary flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
          Visualizar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || status.kind === 'saving'}
          data-testid="paginas-edit-rascunho"
          aria-label="Salvar rascunho"
          className={cn(
            'h-7 px-2.5 text-[11px] border flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
            dirty && status.kind !== 'saving'
              ? 'bg-white text-text-on-light border-border-light hover:border-primary'
              : 'bg-canvas-light border-border-light text-muted-on-light cursor-not-allowed',
          )}
        >
          <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
          {status.kind === 'saving' ? 'Salvando...' : 'Salvar rascunho'}
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={status.kind === 'saving'}
          data-testid="paginas-edit-publicar"
          aria-label="Publicar página"
          className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Publicar
        </button>
      </header>

      {/* Banner de legacy → migração */}
      {legacyDetected && (
        <div
          className="px-3 py-2 bg-warning/10 border-b border-warning/30 text-[11px] text-warning flex items-center gap-3"
          data-testid="paginas-legacy-banner"
        >
          <span className="flex-1">
            Esta página foi criada com o editor antigo. Migrar agora habilita
            todos os widgets do Workshop.
          </span>
          <button
            type="button"
            onClick={migrateLegacy}
            data-testid="paginas-legacy-migrate"
            className="h-6 px-2 text-[11px] bg-warning text-white border border-warning hover:bg-warning/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/60"
          >
            Migrar para Workshop
          </button>
        </div>
      )}

      {/* 3-pane: paleta · canvas · inspector */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {paletteOpen ? (
          <aside
            className="w-[280px] bg-white border-r border-border-light flex flex-col shrink-0 overflow-hidden"
            data-testid="paginas-edit-palette"
            aria-label="Paleta de widgets"
          >
            <div className="h-9 px-3 border-b border-border-light flex items-center bg-canvas-light gap-2">
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light flex-1">
                Paleta · {widgetCount} widgets
              </p>
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                aria-label="Esconder paleta"
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
                  placeholder="Buscar widget..."
                  data-testid="paginas-palette-search"
                  className="w-full h-7 pl-7 pr-2 text-[11px] bg-white border border-border-light text-text-on-light placeholder:text-muted-on-light outline-none focus:border-primary"
                  aria-label="Buscar widgets na paleta"
                />
              </div>
              <div
                className="flex flex-wrap gap-1"
                role="tablist"
                aria-label="Filtrar paleta por grupo"
              >
                <PaletteChip
                  label="Todos"
                  active={paletteGroup === null}
                  onClick={() => setPaletteGroup(null)}
                />
                {PAGE_GROUP_ORDER.map((g) => (
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
              {(() => {
                // Primeiro grupo contextual COM itens visíveis — marca onde
                // o divisor "Contextual (ficha/busca)" deve aparecer.
                const firstContextual = PAGE_GROUP_ORDER.find(
                  (g) => CONTEXTUAL_GROUPS.has(g) && groupedWidgets[g].length > 0,
                );
                return PAGE_GROUP_ORDER.map((g) => {
                  const items = groupedWidgets[g];
                  if (items.length === 0) return null;
                  const collapsed = collapsedGroups[g] ?? false;
                  return (
                    <React.Fragment key={g}>
                      {g === firstContextual && (
                        <div
                          className="px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] font-semibold text-muted-on-light/80 bg-raised-light/60 border-y border-border-light"
                          data-testid="paginas-palette-contextual-divider"
                        >
                          Contextual (ficha · busca)
                        </div>
                      )}
                      <section data-testid={`paginas-palette-group-${g}`}>
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedGroups((s) => ({ ...s, [g]: !collapsed }))
                          }
                          className="w-full px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold bg-canvas-light border-b border-border-light flex items-center gap-2 hover:bg-border-light/40"
                          aria-expanded={!collapsed}
                        >
                          <span className="flex-1 text-text-on-light">
                            {GROUP_LABEL[g]} · {items.length}
                          </span>
                          <ChevronDown
                            className={cn(
                              'w-3 h-3 transition-transform text-muted-on-light',
                              collapsed && '-rotate-90',
                            )}
                            strokeWidth={1.5}
                          />
                        </button>
                        {!collapsed && (
                          <ul>
                            {items.map((w) => (
                              <PalettePreviewItem
                                key={w.type}
                                type={w.type}
                                meta={w.meta}
                                onAdd={() => addWidget(w.type)}
                              />
                            ))}
                          </ul>
                        )}
                      </section>
                    </React.Fragment>
                  );
                });
              })()}
              {Object.values(groupedWidgets).every((arr) => arr.length === 0) && (
                <div className="p-4 text-[11px] text-muted-on-light text-center">
                  Nenhum widget encontrado.
                </div>
              )}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Mostrar paleta"
            className="w-6 bg-white border-r border-border-light flex items-start justify-center pt-2 hover:bg-canvas-light shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <PanelLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}

        {/* Canvas central */}
        <section
          className="flex-1 flex flex-col overflow-hidden bg-canvas-light"
          data-testid="paginas-edit-canvas"
        >
          <div className="flex-1 overflow-y-auto p-4">
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${totalCols}, minmax(0,1fr))`,
              }}
            >
              {app.layout.root.length === 0 && (
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  data-testid="paginas-canvas-empty"
                  className="col-span-full p-8 text-center text-[12px] text-muted-on-light italic border-2 border-dashed border-border-light hover:border-primary hover:text-text-on-light flex flex-col items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  aria-label="Canvas vazio — abrir paleta"
                >
                  <Plus className="w-5 h-5" strokeWidth={1.5} />
                  <span>Canvas vazio</span>
                  <span className="text-[11px] text-muted-on-light/80 not-italic">
                    Clique aqui para abrir a paleta e escolher seu primeiro
                    widget.
                  </span>
                </button>
              )}
              {app.layout.root.map((node, idx) => (
                <CanvasNode
                  key={node.id}
                  node={node}
                  selected={selectedNodeId === node.id}
                  isFirst={idx === 0}
                  isLast={idx === app.layout.root.length - 1}
                  totalCols={totalCols}
                  onSelect={() => {
                    setSelectedNodeId(node.id);
                    setInspectorOpen(true);
                  }}
                  onMoveUp={() => moveNode(node.id, -1)}
                  onMoveDown={() => moveNode(node.id, 1)}
                  onDuplicate={() => duplicateNode(node.id)}
                  onRemove={() => removeNode(node.id)}
                  onColSpanChange={(span) => setColSpan(node.id, span)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Inspector direito */}
        {inspectorOpen && selectedNode ? (
          <aside
            className="w-[340px] bg-white border-l border-border-light flex flex-col shrink-0 overflow-hidden"
            data-testid="paginas-edit-inspector"
            aria-label="Inspetor de widget"
          >
            <div className="h-9 px-3 border-b border-border-light flex items-center bg-canvas-light gap-2">
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                aria-label="Esconder inspetor"
                className="h-5 w-5 flex items-center justify-center hover:bg-border-light/40"
              >
                <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
              </button>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light flex-1">
                Inspetor
              </p>
            </div>
            <NodeInspector
              node={selectedNode}
              appVariables={app.variables ?? []}
              onOpenVariablesPanel={() => setVariablesPanelOpen(true)}
              onPropsChange={(patch) => setNodeProps(selectedNode.id, patch)}
            />
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (selectedNode) setInspectorOpen(true);
            }}
            aria-label="Mostrar inspetor"
            className="w-6 bg-white border-l border-border-light flex items-start justify-center pt-2 hover:bg-canvas-light shrink-0 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            disabled={!selectedNode}
          >
            <PanelRight className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <PreviewDialog app={app} onClose={() => setPreviewOpen(false)} />
      )}

      {/* Onda R.3: gestor de dados (variables) — MESMO painel do Workshop full.
          `onChange` devolve o WorkshopApp com `variables` atualizado; `updateApp`
          marca dirty e propaga pros dropdowns variable-ref/variable-path. No
          save, `workshopAppToPageConfig` serializa `app.variables` em
          `config.variables` (Pages.putConfig) — sem backend novo. */}
      <VariablesPanel
        app={app}
        open={variablesPanelOpen}
        onClose={() => setVariablesPanelOpen(false)}
        onChange={(next) => updateApp(next)}
      />
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

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
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={cn(
        'h-6 px-2 text-[10px] uppercase tracking-wider font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-white text-muted-on-light border-border-light hover:border-primary',
      )}
    >
      {label}
    </button>
  );
}

/**
 * Item da paleta com PREVIEW VISUAL no hover (Onda K.1 #8).
 *
 * Reusa exatamente o mecanismo do ``PaletteItem`` do WorkshopEditor
 * (``components/workshop/workshop-editor.tsx``): popover via ``createPortal``
 * (escapa o overflow da aside) + ``MiniWidgetPreview fit="natural"``
 * escalado por ``previewWidth/previewHeight``. Debounce de 180ms evita
 * flicker ao rolar a lista; o popover ancora à direita da paleta e
 * inverte pra esquerda quando sairia da viewport.
 *
 * Mantém ``data-testid``/``data-widget-type``/``aria-label`` do botão
 * original — a paleta continua mostrando ``meta.label`` (nunca o type
 * cru, ``feedback_widget_type_never_raw_in_ui``).
 */
function PalettePreviewItem({
  type,
  meta,
  onAdd,
}: {
  type: string;
  meta: WidgetMeta;
  onAdd: () => void;
}) {
  const Icon = iconByName(meta?.icon ?? 'square');
  const [hover, setHover] = React.useState(false);
  const liRef = React.useRef<HTMLLIElement>(null);
  const [popPos, setPopPos] = React.useState<{ top: number; left: number } | null>(
    null,
  );
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const el = liRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPopPos({ top: r.top, left: r.right + 6 });
      setHover(true);
    }, 180);
  };
  const leave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHover(false);
  };

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <li
      ref={liRef}
      onMouseEnter={enter}
      onMouseLeave={leave}
      className="border-b border-border-light/60"
    >
      <button
        type="button"
        onClick={onAdd}
        data-testid={`paginas-palette-widget-${type}`}
        data-widget-type={type}
        className="w-full px-3 py-2 text-left hover:bg-canvas-light flex items-start gap-2 focus:outline-none focus-visible:bg-canvas-light"
        aria-label={`Adicionar widget ${meta?.label ?? type}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-on-light" strokeWidth={1.5} />
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-semibold text-text-on-light truncate">
            {meta?.label ?? type}
          </span>
          {meta?.description && (
            <span className="block text-[10px] text-muted-on-light leading-tight mt-0.5 line-clamp-2">
              {meta.description}
            </span>
          )}
        </span>
        <Plus className="w-3 h-3 text-muted-on-light shrink-0 mt-0.5" strokeWidth={1.5} />
      </button>

      {hover &&
        popPos &&
        typeof document !== 'undefined' &&
        (() => {
          const naturalW = meta?.previewWidth ?? 320;
          const maxAvailW = window.innerWidth - 24;
          const popoverW = Math.min(naturalW + 16, maxAvailW);
          const scale = Math.min(1, (popoverW - 16) / naturalW);
          const left =
            popPos.left + popoverW + 8 > window.innerWidth
              ? Math.max(8, popPos.left - popoverW - 12)
              : popPos.left;
          return createPortal(
            <div
              style={{
                position: 'fixed',
                top: Math.max(8, Math.min(popPos.top, window.innerHeight - 60)),
                left,
                width: popoverW,
                maxHeight: 'calc(100vh - 16px)',
                zIndex: 80,
              }}
              className="surface-light bg-white border border-border-light pointer-events-none flex flex-col"
              data-testid={`paginas-palette-preview-${type}`}
            >
              <div className="h-7 px-2.5 border-b border-border-light bg-canvas-light flex items-center gap-2 shrink-0">
                <Icon className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
                <p className="text-[11px] font-semibold truncate flex-1 text-text-on-light">
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
        })()}
    </li>
  );
}

/**
 * Painel pra Páginas servidas por código de aplicação (Onda K.1 #1).
 *
 * ``documentacao`` (/docs), ``workshop`` (/workshop) e ``sala``
 * (/sala/[slug]) são rotas renderizadas pela aplicação, não montáveis
 * por widgets. Mostrar o editor 3-pane vazio + banner "Migrar" seria
 * enganoso — então damos um estado explícito que comunica isso, sem
 * jamais oferecer migração.
 */
function AppRoutePanel({
  page,
  onBack,
}: {
  page: RegisteredPage;
  onBack: () => void;
}) {
  const cfg = coercePageConfig(page.config);
  const note = cfg.mode === 'app_route' ? cfg.note : undefined;
  const RouteIcon = iconByName('panels-top-left');
  // W0: roteia o configurador pela experiência bespoke (registry genérico),
  // não mais pelo special-case slug==='buscar'. Sem configurador registrado
  // → painel app_route padrão (rota servida só por código).
  const ConfigEditor = getExperienceConfig(resolveExperienceKind(page))
    ?.ConfigEditor;
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header
        className="h-10 px-3 border-b border-border-light flex items-center gap-2 bg-white shrink-0"
        data-testid="paginas-edit-toolbar"
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar à lista de páginas"
          className="h-7 px-2.5 text-[11px] bg-white text-text-on-light border border-border-light hover:border-primary flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          Voltar
        </button>
        <div className="h-5 w-px bg-border-light" />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-text-on-light truncate">
            {page.title}
          </div>
          <div className="text-[10px] text-muted-on-light font-mono truncate">
            {page.route}
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border-light text-muted-on-light bg-canvas-light font-semibold">
          Rota de aplicação
        </span>
      </header>
      {ConfigEditor ? (
        // Rota de código (widgets bloqueados) MAS com PARAMETRIZAÇÃO editável —
        // configurador resolvido pelo experience_kind no registry genérico.
        <div
          className="flex-1 overflow-y-auto bg-canvas-light p-6 flex flex-col items-center gap-4"
          data-testid="paginas-app-route-panel"
        >
          <ConfigEditor page={page} />
          <p className="max-w-2xl text-[11px] text-muted-on-light text-center">
            Esta rota é servida por código — por isso não é montável por widgets.
            Status, permissão e marcações continuam na lista de Páginas.
          </p>
        </div>
      ) : (
        <div
          className="flex-1 flex items-center justify-center bg-canvas-light p-8"
          data-testid="paginas-app-route-panel"
        >
          <div className="max-w-md w-full bg-white border border-border-light p-6 flex flex-col items-center text-center gap-3">
            <RouteIcon className="w-8 h-8 text-muted-on-light/60" strokeWidth={1.25} />
            <h2 className="text-[14px] font-semibold text-text-on-light">
              Esta página é servida pela aplicação
            </h2>
            <p className="text-[12px] text-muted-on-light leading-relaxed">
              {note ??
                'O conteúdo desta rota é renderizado por código da aplicação e não pode ser montado por widgets.'}{' '}
              Você ainda pode ajustar status, permissão e marcações pela lista
              de Páginas.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-1 h-8 px-3 text-[12px] bg-white text-text-on-light border border-border-light hover:border-primary flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              aria-label="Voltar à lista de páginas"
            >
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
              Voltar à lista
            </button>
          </div>
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
  if (status.kind === 'saving') {
    return (
      <span
        data-testid="paginas-edit-status-saving"
        className="text-[10px] font-mono text-muted-on-light"
      >
        Salvando...
      </span>
    );
  }
  if (status.kind === 'saved') {
    return (
      <span
        data-testid="paginas-edit-status-saved"
        className="text-[10px] font-mono text-success"
      >
        Salvo {new Date(status.at).toLocaleTimeString('pt-BR')}
      </span>
    );
  }
  if (status.kind === 'error') {
    return (
      <span
        data-testid="paginas-edit-status-error"
        className="text-[10px] font-mono text-danger"
        title={status.message}
      >
        Erro: {status.message.slice(0, 40)}
      </span>
    );
  }
  if (dirty) {
    return (
      <span
        data-testid="paginas-edit-status-dirty"
        className="text-[10px] font-mono text-warning"
      >
        Edições não salvas
      </span>
    );
  }
  return null;
}

function CanvasNode({
  node,
  selected,
  isFirst,
  isLast,
  totalCols,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  onColSpanChange,
}: {
  node: LayoutNode;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  totalCols: number;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onColSpanChange: (span: number) => void;
}) {
  const meta = getWidgetMeta(node.widget.type);
  const colSpan = node.layout?.col_span ?? totalCols;
  const style: React.CSSProperties = {
    gridColumn: `span ${Math.min(colSpan, totalCols)}`,
  };
  return (
    <div
      style={style}
      onClick={onSelect}
      data-testid={`paginas-edit-block-${node.id}`}
      data-widget-type={node.widget.type}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'bg-white border cursor-pointer transition-colors flex flex-col',
        selected
          ? 'border-primary ring-1 ring-primary'
          : 'border-border-light hover:border-primary/60',
      )}
    >
      <div className="h-7 px-2 border-b border-border-light flex items-center gap-1 bg-canvas-light text-[10px]">
        <span className="font-semibold text-text-on-light truncate flex-1">
          {meta?.label ?? node.widget.type}
        </span>
        <select
          value={colSpan}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onColSpanChange(Number(e.target.value))}
          data-testid={`paginas-edit-colspan-${node.id}`}
          aria-label="Largura do widget em colunas do grid"
          className="h-5 px-1 text-[10px] bg-white border border-border-light text-text-on-light focus:outline-none focus:border-primary font-mono"
        >
          {COL_SPAN_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}/20
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
          disabled={isFirst}
          aria-label="Mover widget para cima"
          className="p-1 text-muted-on-light hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowUp className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
          disabled={isLast}
          aria-label="Mover widget para baixo"
          className="p-1 text-muted-on-light hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowDown className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          aria-label="Duplicar widget"
          className="p-1 text-muted-on-light hover:text-primary"
        >
          <Copy className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remover widget"
          className="p-1 text-muted-on-light hover:text-danger"
        >
          <Trash2 className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>
      <div className="p-3 flex-1 min-h-[60px] text-[11px] font-mono text-muted-on-light">
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-text-on-light">
          {meta?.label ?? node.widget.type}
        </div>
        {meta?.description && (
          <p className="text-[10px] text-muted-on-light line-clamp-2 normal-case font-sans">
            {meta.description}
          </p>
        )}
        {Object.keys(node.widget.props ?? {}).length > 0 && (
          <pre className="mt-2 text-[9px] text-muted-on-light overflow-hidden">
            {JSON.stringify(node.widget.props, null, 0).slice(0, 80)}
          </pre>
        )}
      </div>
    </div>
  );
}

function NodeInspector({
  node,
  appVariables,
  onOpenVariablesPanel,
  onPropsChange,
}: {
  node: LayoutNode;
  /** Variables declaradas na página — alimentam os pickers variable-ref/path. */
  appVariables: WorkshopVariable[];
  /** Abre o gestor de dados (Onda R.3: VariablesPanel embutido). */
  onOpenVariablesPanel: () => void;
  onPropsChange: (patch: Record<string, unknown>) => void;
}) {
  const meta = getWidgetMeta(node.widget.type);
  const schema: PropFieldDef[] = meta?.config_schema ?? [];
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1">
          Widget selecionado
        </div>
        <div className="text-[12px] font-semibold text-text-on-light">
          {meta?.label ?? node.widget.type}
        </div>
      </div>
      {schema.length === 0 ? (
        <div className="text-[11px] text-muted-on-light">
          Este widget não declara um schema visual. Edite os props em JSON
          abaixo.
        </div>
      ) : (
        // Onda L.3: reusa o MESMO renderer rico do Workshop full. Cada
        // FieldKind ganha seu picker visual (dropdowns/pickers) — nenhum cai
        // em texto cru. Fecha #8 (editor idêntico ao Workshop) + #9 (forms
        // ricos no editor de Páginas).
        <div className="space-y-3">
          {schema.map((field) => (
            <PropFieldEditor
              key={field.name}
              field={field}
              value={
                (node.widget.props as Record<string, unknown>)?.[field.name] ??
                field.default
              }
              appVariables={appVariables}
              siblingConfig={(node.widget.props as Record<string, unknown>) ?? {}}
              onOpenVariablesPanel={onOpenVariablesPanel}
              onChange={(v) => onPropsChange({ [field.name]: v })}
            />
          ))}
        </div>
      )}
      <details className="mt-4">
        <summary className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold cursor-pointer mb-1">
          Props (JSON avançado)
        </summary>
        <textarea
          value={JSON.stringify(node.widget.props ?? {}, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              if (parsed && typeof parsed === 'object') {
                onPropsChange(parsed);
              }
            } catch {
              /* ignora — operador ainda está digitando */
            }
          }}
          data-testid="paginas-inspector-json"
          rows={8}
          className="w-full mt-1 p-2 text-[10px] font-mono bg-canvas-light border border-border-light text-text-on-light focus:outline-none focus:border-primary"
        />
      </details>
    </div>
  );
}

/* InspectorField (renderer simplificado que caía em texto cru pros FieldKinds
 * exóticos) foi REMOVIDO na Onda L.3 (2026-05-23) e substituído pelo
 * `PropFieldEditor` compartilhado com o Workshop full — ver `NodeInspector`
 * acima. Nenhum FieldKind cai mais em input de texto livre. */

function PreviewDialog({
  app,
  onClose,
}: {
  app: WorkshopApp;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex items-center justify-center p-6"
      role="dialog"
      aria-label="Visualização da página"
      aria-modal="true"
      onClick={onClose}
      data-testid="paginas-edit-preview-dialog"
    >
      <div
        className="bg-white border border-border-light w-full max-w-6xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-canvas-light shrink-0">
          <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light flex-1">
            Preview · {app.display}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar visualização"
            className="h-6 w-6 flex items-center justify-center hover:bg-border-light/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <WorkshopV2Renderer app={app} />
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
