'use client';

/**
 * Layout da Sala — Sprint L16 (2026-05-23).
 *
 * Editor 3-pane (palette · canvas · inspetor) + toggle GUI/YAML +
 * Save publicando uma nova versão imutável da Sala. Persiste sob
 * `Workspace.config.carbon` via POST /workspaces/{id}/config-yaml.
 *
 * String visível "Layout da Sala" — internamente o schema vem do
 * Carbon (CarbonConfig em platform_v23/carbon_composer). Operador
 * nunca vê o nome "Carbon"; alinha com feedback_no_palantir_product_names
 * e feedback_ui_aip_not_openclaw.
 *
 * 3 colunas:
 *   - Esq (240px): paleta — Módulos descobríveis + Itens (objectType,
 *     application, resource) que podem ser arrastados pras seções.
 *   - Centro (flex): canvas — preview ao vivo da home da Sala (logo +
 *     colunas + seções), com edição inline. Em modo YAML, vira
 *     textarea + diff antes de salvar.
 *   - Dir (320px): inspetor — campos do nó selecionado (título da
 *     seção, displayAs, ref, label dos items).
 */

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import {
  LayoutDashboard,
  Save,
  X,
  FileCode,
  MousePointer,
  Layers,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Store,
  Sun,
  Moon,
  Monitor,
  Users,
  Download,
  Upload,
  Boxes,
  EyeOff,
  Globe,
} from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import {
  Carbon,
  Iam,
  Marketplace,
  Workspaces,
  type CarbonTemplate,
  type IamRole,
  type MarketplaceProduct,
  type Workspace,
} from '@/lib/api';

// ───────────────────────────────────────────────────────────────────────────
// Tipos espelhando CarbonConfig do backend (pt-BR — internamente "carbon",
// na UI "Layout da Sala").
// ───────────────────────────────────────────────────────────────────────────

type ItemKind = 'module' | 'objectType' | 'object' | 'resource' | 'application';

interface HomeItem {
  kind: ItemKind;
  ref: string;
  label?: string;
}

interface HomeSection {
  title: string;
  displayAs: 'LIST' | 'CARD';
  items: HomeItem[];
}

interface DiscoverableModule {
  module_id: string;
  label: string;
}

type MenuPosition = 'left' | 'right';

interface MenuBarItem {
  label: string;
  href: string;
  icon?: string;
  position: MenuPosition;
}

interface MenuBarCfg {
  visible: boolean;
  items: MenuBarItem[];
}

interface AccessRule {
  group_id: string;
  modules: string[];
}

type CarbonThemeMode = 'light' | 'dark' | 'auto';

// Wave F.1 — theme agora é object (R2 extras/dark-mode.md). Backward-compat
// preservada: aceita string ou object; backend normaliza pra object via
// field_validator(mode='before').
interface CarbonThemeCfg {
  mode: CarbonThemeMode;
  accent_color?: string;
  density?: 'compact' | 'comfortable';
}

interface DefaultObjectTypesFilter {
  type: 'specific' | 'all' | 'none';
  selectedObjectTypes: string[];
}

interface HomePageCfg {
  logo?: string;
  welcomeText?: string;
  shouldHideSearchBar?: boolean;
  defaultObjectTypesFilter?: DefaultObjectTypesFilter;
  columns: number[];
  sections: HomeSection[];
}

interface LayoutConfig {
  displayMetadata: { name: string; description?: string };
  discoverableModules: DiscoverableModule[];
  defaultLocation?: string;
  homePage?: HomePageCfg;
  // Wave D.2 — extensions
  menuBar?: MenuBarCfg;
  accessRules?: AccessRule[];
  // Wave F.1 — theme é object full ou string legacy (renderiza ambos).
  theme?: CarbonThemeMode | CarbonThemeCfg;
}

function getThemeMode(layout: LayoutConfig): CarbonThemeMode {
  const t = layout.theme;
  if (!t) return 'light';
  if (typeof t === 'string') return t;
  return t.mode ?? 'light';
}

function setThemeMode(
  layout: LayoutConfig,
  mode: CarbonThemeMode,
): LayoutConfig {
  const t = layout.theme;
  if (t && typeof t === 'object') {
    return { ...layout, theme: { ...t, mode } };
  }
  return { ...layout, theme: { mode } };
}

const EMPTY_LAYOUT: LayoutConfig = {
  displayMetadata: { name: '', description: '' },
  discoverableModules: [],
  homePage: {
    logo: undefined,
    welcomeText: undefined,
    shouldHideSearchBar: false,
    columns: [2, 1],
    sections: [],
  },
  menuBar: { visible: true, items: [] },
  accessRules: [],
  theme: { mode: 'light', density: 'comfortable' },
};

const PALETTE_ITEMS: { kind: ItemKind; ref: string; label: string }[] = [
  { kind: 'module', ref: 'briefing', label: 'Briefing' },
  { kind: 'module', ref: 'buscar', label: 'Buscar' },
  { kind: 'module', ref: 'painel', label: 'Painel' },
  { kind: 'objectType', ref: 'Event', label: 'Eventos' },
  { kind: 'objectType', ref: 'Person', label: 'Pessoas' },
  { kind: 'objectType', ref: 'Place', label: 'Locais' },
  { kind: 'application', ref: 'workshop', label: 'Workshop' },
  { kind: 'application', ref: 'painel', label: 'Painel de Controle' },
  { kind: 'resource', ref: 'datasets', label: 'Datasets' },
  { kind: 'resource', ref: 'docs', label: 'Documentação' },
];

const PALETTE_MODULES: DiscoverableModule[] = [
  { module_id: 'briefing', label: 'Briefing operacional' },
  { module_id: 'buscar', label: 'Busca unificada' },
  { module_id: 'grafo', label: 'Grafo de lineage' },
  { module_id: 'workshop', label: 'Workshop' },
  { module_id: 'cctv', label: 'CCTV ao vivo' },
];

// ───────────────────────────────────────────────────────────────────────────
// Page wrapper — gating por perm.
// ───────────────────────────────────────────────────────────────────────────

export default function CarbonComposerPage() {
  return (
    <RequirePerm perm="workspace.publish">
      <CarbonComposerInner />
    </RequirePerm>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Inner — carrega Sala, sincroniza estado, despacha render.
// ───────────────────────────────────────────────────────────────────────────

function CarbonComposerInner() {
  const params = useParams<{ workspace_id: string }>();
  const router = useRouter();
  const workspaceId = String(params?.workspace_id ?? '');
  const askConfirm = useConfirm();

  const [ws, setWs] = React.useState<Workspace | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [layout, setLayout] = React.useState<LayoutConfig>(EMPTY_LAYOUT);
  const [originalLayout, setOriginalLayout] = React.useState<LayoutConfig>(EMPTY_LAYOUT);
  const [mode, setMode] = React.useState<'gui' | 'yaml'>('gui');
  const [yamlText, setYamlText] = React.useState('');
  const [yamlErr, setYamlErr] = React.useState<string | null>(null);
  const [selectedSection, setSelectedSection] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);
  // Wave D.2: right-panel tab + lazy-loaded refs.
  const [rightTab, setRightTab] = React.useState<'inspector' | 'marketplace'>('inspector');
  const [roles, setRoles] = React.useState<IamRole[]>([]);
  const [products, setProducts] = React.useState<MarketplaceProduct[]>([]);
  const [productsErr, setProductsErr] = React.useState<string | null>(null);
  // Wave F.1: templates picker.
  const [templates, setTemplates] = React.useState<CarbonTemplate[]>([]);
  const [showTemplates, setShowTemplates] = React.useState(false);
  // Wave G.1: auto-publish checkbox no dialog Templates. Quando ligado,
  // o backend chama publish_workspace direto após o apply (bump version).
  const [templatesAutoPublish, setTemplatesAutoPublish] = React.useState(false);

  // Load templates uma vez (lazy só quando user abre).
  const loadTemplates = React.useCallback(async () => {
    if (templates.length > 0) return;
    try {
      const list = await Carbon.templates();
      setTemplates(list);
    } catch (e) {
      setSaveErr((e as Error)?.message ?? 'Falha ao carregar templates');
    }
  }, [templates.length]);

  React.useEffect(() => {
    // Carrega papéis (usados como "grupos" em accessRules) e produtos
    // do marketplace junto da Sala — vai pra esses caches em paralelo
    // pra evitar latência no clique do operador.
    Iam.roles.list().then(setRoles).catch(() => setRoles([]));
    Marketplace.list(true)
      .then(setProducts)
      .catch((e) => setProductsErr((e as Error)?.message ?? 'Falha ao listar Loja'));
  }, []);

  // ── load workspace ──
  React.useEffect(() => {
    if (!workspaceId) return;
    setLoadErr(null);
    Workspaces.get(workspaceId)
      .then((w) => {
        setWs(w);
        const cfg = (w.config?.carbon as LayoutConfig | undefined) ?? {
          displayMetadata: { name: w.display_name, description: w.description ?? '' },
          discoverableModules: [],
          homePage: { columns: [2, 1], sections: [] },
        };
        setLayout(cfg);
        setOriginalLayout(cfg);
        setYamlText(JSON.stringify(cfg, null, 2));
      })
      .catch((e) => setLoadErr((e as Error)?.message ?? 'Falha ao carregar Sala'));
  }, [workspaceId]);

  // ── GUI ↔ YAML sync ──
  React.useEffect(() => {
    if (mode === 'gui') {
      setYamlText(JSON.stringify(layout, null, 2));
      setYamlErr(null);
    }
  }, [mode, layout]);

  const isDirty = JSON.stringify(layout) !== JSON.stringify(originalLayout);

  // ── save ──
  const onSave = async () => {
    setSaveErr(null);

    let payload: LayoutConfig;
    if (mode === 'yaml') {
      try {
        payload = JSON.parse(yamlText) as LayoutConfig;
      } catch (e) {
        setYamlErr((e as Error).message);
        return;
      }
    } else {
      payload = layout;
    }

    // Valida antes de publicar — pega erros do schema.
    try {
      const v = await Carbon.validate(payload as unknown as Record<string, unknown>);
      if (!v.ok) {
        setSaveErr(
          `Layout inválido: ${v.errors
            .map((er) => `${er.loc.join('.')}: ${er.msg}`)
            .join(' · ')}`,
        );
        return;
      }
    } catch (e) {
      setSaveErr((e as Error).message);
      return;
    }

    // Mostra diff resumido + confirm.
    const summary = describeDiff(originalLayout, payload);
    const ok = await askConfirm({
      title: 'Publicar nova versão da Sala?',
      description: `Resumo das mudanças:\n\n${summary}\n\nIsto cria uma nova versão imutável da Sala. Versões anteriores ficam acessíveis em Histórico.`,
      tone: 'default',
      confirmLabel: 'Publicar',
    });
    if (!ok) return;

    setBusy(true);
    try {
      const updated = await Workspaces.publishCarbon(workspaceId, {
        config: payload as unknown as Record<string, unknown>,
        message: `layout da sala: v${(ws?.version ?? 0) + 1}`,
      });
      setWs(updated);
      setLayout(payload);
      setOriginalLayout(payload);
    } catch (e) {
      setSaveErr((e as Error)?.message ?? 'Falha ao publicar Layout da Sala');
    } finally {
      setBusy(false);
    }
  };

  // ── Wave F.1 + Wave G.1: apply template (com opcional auto_publish) ──
  const onApplyTemplate = async (slug: string) => {
    setSaveErr(null);
    const autoPub = templatesAutoPublish;
    const ok = await askConfirm({
      title: autoPub ? 'Aplicar template e publicar?' : 'Aplicar template?',
      description: autoPub
        ? 'O template carregado substitui o draft atual e uma nova versão da Sala será publicada imediatamente.'
        : 'O template carregado substitui o draft atual. Você ainda precisa salvar para publicar.',
      tone: 'warning',
      confirmLabel: autoPub ? 'Aplicar e publicar' : 'Aplicar',
    });
    if (!ok) return;
    try {
      const out = await Carbon.applyTemplate(slug, workspaceId, {
        auto_publish: autoPub,
      });
      const next = out.config as unknown as LayoutConfig;
      setLayout(next);
      setOriginalLayout(next);
      setYamlText(JSON.stringify(next, null, 2));
      setShowTemplates(false);
      if (autoPub && out.published_version != null) {
        // Atualiza Workspace local para refletir version bumped.
        try {
          const refreshed = await Workspaces.get(workspaceId);
          setWs(refreshed);
        } catch {
          // Sem regressão crítica — preview do número aparece no save seguinte.
        }
      }
    } catch (e) {
      setSaveErr((e as Error)?.message ?? 'Falha ao aplicar template');
    }
  };

  // ── Wave F.1: import YAML via /import-yaml ──
  const onImportYaml = async (text: string) => {
    setYamlErr(null);
    try {
      const r = await Carbon.importYaml(text);
      if (!r.ok) {
        setYamlErr(
          r.errors
            .map((er) => `${er.loc.join('.')}: ${er.msg}`)
            .join(' · '),
        );
        return;
      }
      // Valid — re-parse JSON via backend roundtrip (já validou).
      // Para popular layout, parseamos como JSON aceitável.
      try {
        const parsed = JSON.parse(text) as LayoutConfig;
        setLayout(parsed);
      } catch {
        // YAML pode não ser JSON-paríavel; nesse caso só atualizamos
        // yamlText e deixamos o save final processar.
      }
      setYamlText(text);
    } catch (e) {
      setYamlErr((e as Error)?.message ?? 'Falha ao validar YAML');
    }
  };

  // ── Wave F.1: download YAML do layout corrente ──
  const onExportYaml = () => {
    const blob = new Blob([JSON.stringify(layout, null, 2)], {
      type: 'application/x-yaml',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sala-${ws?.slug ?? workspaceId}-v${ws?.version ?? 0}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── add palette item to section ──
  const addItemToSection = (idx: number, item: HomeItem) => {
    setLayout((cur) => {
      const sections = cur.homePage?.sections.slice() ?? [];
      if (!sections[idx]) return cur;
      sections[idx] = { ...sections[idx], items: [...sections[idx].items, item] };
      return { ...cur, homePage: { ...(cur.homePage ?? { columns: [2, 1], sections: [] }), sections } };
    });
  };

  const addSection = () => {
    setLayout((cur) => {
      const sections = cur.homePage?.sections.slice() ?? [];
      sections.push({ title: `Nova seção ${sections.length + 1}`, displayAs: 'LIST', items: [] });
      const out: LayoutConfig = {
        ...cur,
        homePage: { ...(cur.homePage ?? { columns: [2, 1], sections: [] }), sections },
      };
      return out;
    });
    setSelectedSection((cur) => cur === null ? 0 : cur);
  };

  const removeSection = (idx: number) => {
    setLayout((cur) => {
      const sections = cur.homePage?.sections.slice() ?? [];
      sections.splice(idx, 1);
      return { ...cur, homePage: { ...(cur.homePage ?? { columns: [2, 1], sections: [] }), sections } };
    });
    setSelectedSection(null);
  };

  const updateSection = (idx: number, patch: Partial<HomeSection>) => {
    setLayout((cur) => {
      const sections = cur.homePage?.sections.slice() ?? [];
      if (!sections[idx]) return cur;
      sections[idx] = { ...sections[idx], ...patch };
      return { ...cur, homePage: { ...(cur.homePage ?? { columns: [2, 1], sections: [] }), sections } };
    });
  };

  const removeItemFromSection = (sectionIdx: number, itemIdx: number) => {
    setLayout((cur) => {
      const sections = cur.homePage?.sections.slice() ?? [];
      if (!sections[sectionIdx]) return cur;
      const items = sections[sectionIdx].items.slice();
      items.splice(itemIdx, 1);
      sections[sectionIdx] = { ...sections[sectionIdx], items };
      return { ...cur, homePage: { ...(cur.homePage ?? { columns: [2, 1], sections: [] }), sections } };
    });
  };

  if (loadErr) {
    return (
      <div data-testid="carbon-composer-page">
        <CpPageHeader title="Layout da Sala" subtitle="Editor 3-pane do layout operacional." />
        <div className="p-6">
          <CpErrorState
            title="Falha ao carregar a Sala"
            description={loadErr}
            retry={() => router.refresh()}
          />
        </div>
      </div>
    );
  }
  if (!ws) {
    return (
      <div data-testid="carbon-composer-page">
        <CpPageHeader title="Layout da Sala" subtitle="Carregando…" />
        <div className="p-6"><CpSkeleton rows={3} /></div>
      </div>
    );
  }

  return (
    <div data-testid="carbon-composer-page" className="flex flex-col h-full">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
            Layout da Sala · {ws.display_name}
          </span>
        }
        subtitle={`Editor de 3 painéis — paleta · canvas · inspetor. Save publica nova versão (v${ws.version} → v${ws.version + 1}).`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void loadTemplates();
                setShowTemplates(true);
              }}
              data-testid="composer-templates-open"
              aria-label="Aplicar template de Sala"
              className="h-8 px-3 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
            >
              <Boxes className="w-3.5 h-3.5" strokeWidth={1.5} />
              Templates
            </button>
            <button
              type="button"
              onClick={onExportYaml}
              data-testid="composer-export-yaml"
              aria-label="Exportar layout para YAML"
              className="h-8 w-8 inline-flex items-center justify-center bg-canvas-light border border-border-light hover:border-primary"
              title="Exportar YAML"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <div className="flex items-center border border-border-light" data-testid="composer-mode-toggle">
              <button
                type="button"
                onClick={() => setMode('gui')}
                data-testid="composer-mode-gui"
                className={`h-8 px-3 text-[11px] flex items-center gap-1.5 ${
                  mode === 'gui' ? 'bg-primary text-white' : 'bg-canvas-light hover:bg-white'
                }`}
              >
                <MousePointer className="w-3.5 h-3.5" strokeWidth={1.5} />
                Visual
              </button>
              <button
                type="button"
                onClick={() => setMode('yaml')}
                data-testid="composer-mode-yaml"
                className={`h-8 px-3 text-[11px] flex items-center gap-1.5 ${
                  mode === 'yaml' ? 'bg-primary text-white' : 'bg-canvas-light hover:bg-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" strokeWidth={1.5} />
                YAML
              </button>
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={busy || (!isDirty && mode === 'gui')}
              data-testid="composer-save"
              className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
              {busy ? 'Salvando…' : 'Salvar Layout da Sala'}
            </button>
          </div>
        }
      />

      {saveErr && (
        <div className="px-6 pt-3">
          <p data-testid="composer-error" className="text-[12px] text-danger font-mono">
            {saveErr}
          </p>
        </div>
      )}

      {/* Wave F.1 — Templates dialog */}
      {showTemplates && (
        <ModalPortal>
        <div
          data-testid="composer-templates-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="composer-templates-title"
          className="fixed inset-0 z-50 flex items-center justify-center ds-overlay"
        >
          <div className="bg-white border border-border-light shadow-lg w-full max-w-[640px] max-h-[80vh] flex flex-col">
            <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
              <Boxes className="w-4 h-4 text-primary" strokeWidth={1.5} />
              <h2
                id="composer-templates-title"
                className="text-[14px] font-semibold flex-1"
              >
                Aplicar template de Sala
              </h2>
              <button
                type="button"
                onClick={() => setShowTemplates(false)}
                aria-label="Fechar"
                data-testid="composer-templates-close"
                className="h-7 w-7 inline-flex items-center justify-center bg-canvas-light border border-border-light hover:border-primary"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </header>
            {/* Wave G.1 — auto-publish toggle. Quando ligado, o backend
                chama publish_workspace direto após o apply → bump version
                + LineageEvent imediato. */}
            <div className="px-4 py-2 border-b border-border-light bg-canvas-light">
              <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={templatesAutoPublish}
                  onChange={(e) => setTemplatesAutoPublish(e.target.checked)}
                  data-testid="composer-templates-auto-publish"
                  className="w-3.5 h-3.5 accent-primary focus-visible:ring-2 focus-visible:ring-primary"
                />
                <span className="text-text-on-light font-mono">
                  Publicar automaticamente após aplicar
                </span>
                <span className="text-muted-on-light">
                  (bump version + audit imediato)
                </span>
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {templates.length === 0 ? (
                <p
                  data-testid="composer-templates-empty"
                  className="text-small text-muted-on-light italic"
                >
                  Carregando templates…
                </p>
              ) : (
                templates.map((t) => (
                  <article
                    key={t.slug}
                    data-testid={`composer-template-${t.slug}`}
                    className="border border-border-light p-3 bg-canvas-light"
                  >
                    <h3 className="text-[13px] font-semibold mb-1">
                      {t.display_name}
                    </h3>
                    <p className="text-[11.5px] text-muted-on-light mb-2 leading-relaxed">
                      {t.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => void onApplyTemplate(t.slug)}
                      data-testid={`composer-template-${t.slug}-apply`}
                      className="h-8 px-3 text-[11.5px] bg-primary text-white border border-primary hover:bg-primary-hover"
                    >
                      Aplicar
                    </button>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      <div className="flex-1 flex min-h-0">
        {mode === 'gui' ? (
          <>
            <Palette onAddItem={(it) => {
              if (selectedSection === null) {
                // Auto-pick first section if any; else create one and add.
                const ss = layout.homePage?.sections ?? [];
                if (ss.length === 0) {
                  addSection();
                  setTimeout(() => addItemToSection(0, it), 0);
                } else {
                  addItemToSection(0, it);
                }
              } else {
                addItemToSection(selectedSection, it);
              }
            }} />
            <Canvas
              layout={layout}
              selectedSection={selectedSection}
              onSelectSection={setSelectedSection}
              onAddSection={addSection}
              onRemoveSection={removeSection}
              onRemoveItem={removeItemFromSection}
              onUpdateLayout={setLayout}
            />
            <RightPane
              tab={rightTab}
              onTabChange={setRightTab}
              layout={layout}
              selectedSection={selectedSection}
              onUpdateSection={updateSection}
              onUpdateLayout={setLayout}
              roles={roles}
              products={products}
              productsErr={productsErr}
              onInstallProduct={(p) => {
                // Adiciona o produto como discoverableModule + grava
                // install no backend. Operador vê o module_id passar a
                // existir na paleta após o save da Sala.
                setLayout((cur) => {
                  if (cur.discoverableModules.some((d) => d.module_id === p.slug)) {
                    return cur;
                  }
                  return {
                    ...cur,
                    discoverableModules: [
                      ...cur.discoverableModules,
                      { module_id: p.slug, label: p.display_name },
                    ],
                  };
                });
                Marketplace.install(p.id, `installed from sala ${workspaceId}`).catch(() => {
                  /* swallow — UI já mostrou o módulo; restart redoes if needed */
                });
              }}
            />
          </>
        ) : (
          <YamlEditor
            text={yamlText}
            setText={setYamlText}
            error={yamlErr}
            setError={setYamlErr}
            originalText={JSON.stringify(originalLayout, null, 2)}
            onImportYaml={onImportYaml}
          />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Palette (240px)
// ───────────────────────────────────────────────────────────────────────────

function Palette({ onAddItem }: { onAddItem: (item: HomeItem) => void }) {
  return (
    <aside
      data-testid="composer-palette"
      className="w-[240px] border-r border-border-light bg-canvas-light overflow-y-auto"
    >
      <header className="px-3 py-2 border-b border-border-light">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
          Paleta
        </p>
        <p className="text-[10.5px] text-muted-on-light italic mt-0.5">
          Clique em um item para adicioná-lo à seção selecionada.
        </p>
      </header>
      <section className="p-2 border-b border-border-light">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold px-1 mb-1.5">
          Módulos descobríveis
        </p>
        <ul className="space-y-1" data-testid="composer-palette-modules">
          {PALETTE_MODULES.map((m) => (
            <li key={m.module_id}>
              <button
                type="button"
                data-testid={`composer-palette-module-${m.module_id}`}
                onClick={() => onAddItem({ kind: 'module', ref: m.module_id, label: m.label })}
                className="w-full text-left px-2 py-1 text-[11.5px] bg-white border border-border-light hover:border-primary flex items-center gap-2"
              >
                <Layers className="w-3 h-3 text-primary" strokeWidth={1.5} />
                <span className="flex-1 truncate">{m.label}</span>
                <span className="text-[10px] font-mono text-muted-on-light">{m.module_id}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="p-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold px-1 mb-1.5">
          Itens do home
        </p>
        <ul className="space-y-1" data-testid="composer-palette-items">
          {PALETTE_ITEMS.map((it, i) => (
            <li key={`${it.kind}-${it.ref}-${i}`}>
              <button
                type="button"
                data-testid={`composer-palette-item-${i}`}
                onClick={() => onAddItem({ kind: it.kind, ref: it.ref, label: it.label })}
                className="w-full text-left px-2 py-1 text-[11.5px] bg-white border border-border-light hover:border-primary flex items-center gap-2"
              >
                <span className="text-[9px] font-mono uppercase text-muted-on-light shrink-0">
                  {it.kind}
                </span>
                <span className="flex-1 truncate">{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Canvas (flex)
// ───────────────────────────────────────────────────────────────────────────

function Canvas({
  layout,
  selectedSection,
  onSelectSection,
  onAddSection,
  onRemoveSection,
  onRemoveItem,
  onUpdateLayout,
}: {
  layout: LayoutConfig;
  selectedSection: number | null;
  onSelectSection: (i: number | null) => void;
  onAddSection: () => void;
  onRemoveSection: (i: number) => void;
  onRemoveItem: (sectionIdx: number, itemIdx: number) => void;
  onUpdateLayout: (next: LayoutConfig) => void;
}) {
  const sections = layout.homePage?.sections ?? [];
  return (
    <main
      data-testid="composer-canvas"
      className="flex-1 overflow-auto bg-white p-6"
    >
      <div className="max-w-4xl mx-auto space-y-4">
        <header className="flex items-center gap-3 pb-3 border-b border-border-light">
          <LayoutDashboard className="w-5 h-5 text-primary" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <input
              data-testid="composer-canvas-name"
              type="text"
              value={layout.displayMetadata.name}
              onChange={(e) =>
                onUpdateLayout({
                  ...layout,
                  displayMetadata: { ...layout.displayMetadata, name: e.target.value },
                })
              }
              placeholder="Nome da Sala"
              className="w-full text-[18px] font-semibold text-text-on-light bg-transparent outline-none border-b border-transparent focus:border-primary"
            />
            <input
              data-testid="composer-canvas-description"
              type="text"
              value={layout.displayMetadata.description ?? ''}
              onChange={(e) =>
                onUpdateLayout({
                  ...layout,
                  displayMetadata: { ...layout.displayMetadata, description: e.target.value },
                })
              }
              placeholder="Descrição curta"
              className="w-full text-[12px] text-muted-on-light bg-transparent outline-none border-b border-transparent focus:border-primary mt-1"
            />
          </div>
        </header>

        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
            Seções
          </p>
          <button
            type="button"
            onClick={onAddSection}
            data-testid="composer-add-section"
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" strokeWidth={1.5} />
            Adicionar seção
          </button>
        </div>

        {sections.length === 0 && (
          <div
            data-testid="composer-canvas-empty"
            className="border border-dashed border-border-light bg-canvas-light p-8 text-center"
          >
            <p className="text-[12px] text-muted-on-light italic">
              Nenhuma seção criada ainda. Use "Adicionar seção" para começar.
            </p>
          </div>
        )}

        <ul className="space-y-3" data-testid="composer-canvas-sections">
          {sections.map((sec, idx) => {
            const sel = selectedSection === idx;
            return (
              <li
                key={`sec-${idx}`}
                data-testid={`composer-section-${idx}`}
                onClick={() => onSelectSection(idx)}
                className={`border bg-canvas-light p-3 cursor-pointer ${
                  sel ? 'border-primary' : 'border-border-light hover:border-muted-on-light'
                }`}
              >
                <header className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase text-muted-on-light">
                    {sec.displayAs}
                  </span>
                  <p className="flex-1 text-[13px] font-semibold text-text-on-light truncate">
                    {sec.title || '(sem título)'}
                  </p>
                  <span
                    data-testid={`composer-section-${idx}-count`}
                    className="text-[10px] font-mono text-muted-on-light"
                  >
                    {sec.items.length} {sec.items.length === 1 ? 'item' : 'itens'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSection(idx);
                    }}
                    aria-label="Remover seção"
                    data-testid={`composer-section-${idx}-remove`}
                    className="h-6 w-6 flex items-center justify-center bg-white border border-border-light hover:border-danger hover:text-danger"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </header>
                {sec.items.length === 0 ? (
                  <p className="text-[10.5px] text-muted-on-light italic mt-2">
                    Vazia. Clique em um item da paleta para adicionar.
                  </p>
                ) : (
                  <ul className="mt-2 grid grid-cols-2 gap-1.5">
                    {sec.items.map((it, ii) => (
                      <li
                        key={`it-${idx}-${ii}`}
                        data-testid={`composer-item-${idx}-${ii}`}
                        className="bg-white border border-border-light p-2 flex items-center gap-2"
                      >
                        <span className="text-[9px] font-mono uppercase text-muted-on-light shrink-0">
                          {it.kind}
                        </span>
                        <span className="flex-1 text-[11.5px] truncate">
                          {it.label ?? it.ref}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveItem(idx, ii);
                          }}
                          aria-label="Remover item"
                          data-testid={`composer-item-${idx}-${ii}-remove`}
                          className="h-5 w-5 flex items-center justify-center bg-canvas-light border border-border-light hover:border-danger hover:text-danger"
                        >
                          <X className="w-2.5 h-2.5" strokeWidth={1.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// RightPane (320px) — tabs Inspector | Marketplace (Wave D.2).
// ───────────────────────────────────────────────────────────────────────────

function RightPane({
  tab,
  onTabChange,
  layout,
  selectedSection,
  onUpdateSection,
  onUpdateLayout,
  roles,
  products,
  productsErr,
  onInstallProduct,
}: {
  tab: 'inspector' | 'marketplace';
  onTabChange: (t: 'inspector' | 'marketplace') => void;
  layout: LayoutConfig;
  selectedSection: number | null;
  onUpdateSection: (i: number, patch: Partial<HomeSection>) => void;
  onUpdateLayout: (next: LayoutConfig) => void;
  roles: IamRole[];
  products: MarketplaceProduct[];
  productsErr: string | null;
  onInstallProduct: (p: MarketplaceProduct) => void;
}) {
  return (
    <aside
      data-testid="composer-right-pane"
      className="w-[320px] border-l border-border-light bg-canvas-light overflow-hidden flex flex-col"
    >
      <div
        className="flex items-center border-b border-border-light"
        data-testid="composer-right-tabs"
      >
        <button
          type="button"
          data-testid="composer-tab-inspector"
          onClick={() => onTabChange('inspector')}
          className={`flex-1 h-9 text-[11px] flex items-center justify-center gap-1.5 border-r border-border-light ${
            tab === 'inspector'
              ? 'bg-white text-text-on-light font-semibold'
              : 'bg-canvas-light text-muted-on-light hover:bg-white'
          }`}
        >
          <Layers className="w-3 h-3" strokeWidth={1.5} />
          Inspetor
        </button>
        <button
          type="button"
          data-testid="composer-tab-marketplace"
          onClick={() => onTabChange('marketplace')}
          className={`flex-1 h-9 text-[11px] flex items-center justify-center gap-1.5 ${
            tab === 'marketplace'
              ? 'bg-white text-text-on-light font-semibold'
              : 'bg-canvas-light text-muted-on-light hover:bg-white'
          }`}
        >
          <Store className="w-3 h-3" strokeWidth={1.5} />
          Loja
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'inspector' ? (
          <Inspector
            layout={layout}
            selectedSection={selectedSection}
            onUpdateSection={onUpdateSection}
            onUpdateLayout={onUpdateLayout}
            roles={roles}
          />
        ) : (
          <MarketplacePanel
            layout={layout}
            products={products}
            error={productsErr}
            onInstallProduct={onInstallProduct}
          />
        )}
      </div>
    </aside>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Inspector (sem sidebar wrapper — vive dentro do RightPane)
// ───────────────────────────────────────────────────────────────────────────

function Inspector({
  layout,
  selectedSection,
  onUpdateSection,
  onUpdateLayout,
  roles,
}: {
  layout: LayoutConfig;
  selectedSection: number | null;
  onUpdateSection: (i: number, patch: Partial<HomeSection>) => void;
  onUpdateLayout: (next: LayoutConfig) => void;
  roles: IamRole[];
}) {
  const sec =
    selectedSection !== null
      ? layout.homePage?.sections[selectedSection] ?? null
      : null;
  return (
    <div data-testid="composer-inspector">
      {/* Wave F.1 — Cabeçalho da Sala (welcomeText/hide search/filtro/local) */}
      <HomePageExtrasBlock layout={layout} onUpdateLayout={onUpdateLayout} />

      {/* Wave D.2 — Aparência (theme light/dark/auto) — Wave F.1 estende */}
      <ThemeBlock layout={layout} onUpdateLayout={onUpdateLayout} />

      {/* Wave D.2 — Barra de menu */}
      <MenuBarBlock layout={layout} onUpdateLayout={onUpdateLayout} />

      {/* Wave D.2 — Acesso por grupo */}
      <AccessRulesBlock
        layout={layout}
        onUpdateLayout={onUpdateLayout}
        roles={roles}
      />

      <section className="p-3 border-b border-border-light space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          Layout global
        </p>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
            Larguras de coluna (CSV)
          </span>
          <input
            type="text"
            data-testid="composer-inspector-columns"
            value={(layout.homePage?.columns ?? []).join(', ')}
            onChange={(e) => {
              const parts = e.target.value
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n) && n > 0);
              onUpdateLayout({
                ...layout,
                homePage: {
                  ...(layout.homePage ?? { columns: [2, 1], sections: [] }),
                  columns: parts,
                },
              });
            }}
            placeholder="2, 1"
            className="w-full h-7 px-2 text-[11.5px] font-mono bg-white border border-border-light outline-none focus:border-primary mt-1"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
            Logo (URL)
          </span>
          <input
            type="text"
            data-testid="composer-inspector-logo"
            value={layout.homePage?.logo ?? ''}
            onChange={(e) =>
              onUpdateLayout({
                ...layout,
                homePage: {
                  ...(layout.homePage ?? { columns: [2, 1], sections: [] }),
                  logo: e.target.value || undefined,
                },
              })
            }
            placeholder="/logo.svg"
            className="w-full h-7 px-2 text-[11.5px] bg-white border border-border-light outline-none focus:border-primary mt-1"
          />
        </label>
      </section>

      {sec ? (
        <section className="p-3 space-y-2" data-testid="composer-inspector-section">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            Seção #{(selectedSection ?? 0) + 1}
          </p>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Título
            </span>
            <input
              type="text"
              data-testid="composer-inspector-title"
              value={sec.title}
              onChange={(e) => onUpdateSection(selectedSection!, { title: e.target.value })}
              className="w-full h-7 px-2 text-[11.5px] bg-white border border-border-light outline-none focus:border-primary mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Mostrar como
            </span>
            <select
              data-testid="composer-inspector-displayas"
              value={sec.displayAs}
              onChange={(e) =>
                onUpdateSection(selectedSection!, { displayAs: e.target.value as 'LIST' | 'CARD' })
              }
              className="w-full h-7 px-2 text-[11.5px] bg-white border border-border-light outline-none focus:border-primary mt-1"
            >
              <option value="LIST">Lista</option>
              <option value="CARD">Cartão</option>
            </select>
          </label>
        </section>
      ) : (
        <section className="p-3" data-testid="composer-inspector-empty">
          <p className="text-[11.5px] text-muted-on-light italic">
            Selecione uma seção no canvas para editar seus campos.
          </p>
        </section>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Wave D.2 — Aparência (theme)
// ───────────────────────────────────────────────────────────────────────────

function ThemeBlock({
  layout,
  onUpdateLayout,
}: {
  layout: LayoutConfig;
  onUpdateLayout: (next: LayoutConfig) => void;
}) {
  const current: CarbonThemeMode = getThemeMode(layout);
  const themeObj: CarbonThemeCfg =
    typeof layout.theme === 'object' && layout.theme !== null
      ? layout.theme
      : { mode: current };
  const density = themeObj.density ?? 'comfortable';
  const accent = themeObj.accent_color ?? '';
  const opts: { value: CarbonThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Claro', icon: <Sun className="w-3 h-3" strokeWidth={1.5} /> },
    { value: 'dark', label: 'Escuro', icon: <Moon className="w-3 h-3" strokeWidth={1.5} /> },
    { value: 'auto', label: 'Auto', icon: <Monitor className="w-3 h-3" strokeWidth={1.5} /> },
  ];
  return (
    <section
      data-testid="composer-block-theme"
      className="p-3 border-b border-border-light space-y-2"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Aparência
      </p>
      <p className="text-[10.5px] text-muted-on-light italic">
        Define o modo de cores aplicado quando a Sala é renderizada em /sala.
      </p>
      <div
        role="radiogroup"
        aria-label="Aparência"
        className="flex items-center border border-border-light"
        data-testid="composer-theme-group"
      >
        {opts.map((o, i) => {
          const active = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`composer-theme-${o.value}`}
              onClick={() => onUpdateLayout(setThemeMode(layout, o.value))}
              className={`flex-1 h-7 text-[11px] flex items-center justify-center gap-1.5 ${
                i > 0 ? 'border-l border-border-light' : ''
              } ${active ? 'bg-primary text-white' : 'bg-white hover:bg-canvas-light'}`}
            >
              {o.icon}
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Wave F.1 — R2 extras/dark-mode.md: density + accent_color */}
      <div className="flex items-center gap-1" data-testid="composer-theme-density">
        <span className="text-[9px] uppercase tracking-wider text-muted-on-light shrink-0">
          Densidade
        </span>
        {(['comfortable', 'compact'] as const).map((d) => (
          <button
            key={d}
            type="button"
            data-testid={`composer-theme-density-${d}`}
            onClick={() =>
              onUpdateLayout({
                ...layout,
                theme: { ...themeObj, density: d },
              })
            }
            className={`h-6 px-2 text-[10px] border border-border-light ${
              density === d
                ? 'bg-primary text-white border-primary'
                : 'bg-canvas-light hover:border-primary'
            }`}
          >
            {d === 'comfortable' ? 'Confortável' : 'Compacta'}
          </button>
        ))}
      </div>
      <label className="block" data-testid="composer-theme-accent-block">
        <span className="text-[9px] uppercase tracking-wider text-muted-on-light">
          Cor de destaque (hex)
        </span>
        <input
          type="text"
          data-testid="composer-theme-accent"
          value={accent}
          placeholder="#2965CC"
          onChange={(e) =>
            onUpdateLayout({
              ...layout,
              theme: { ...themeObj, accent_color: e.target.value || undefined },
            })
          }
          className="w-full h-6 px-2 mt-1 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
        />
      </label>
    </section>
  );
}

// ─── Wave F.1 — HomePage extras (welcomeText, hide search, default filter) ─

function HomePageExtrasBlock({
  layout,
  onUpdateLayout,
}: {
  layout: LayoutConfig;
  onUpdateLayout: (next: LayoutConfig) => void;
}) {
  const hp: HomePageCfg =
    layout.homePage ?? { columns: [2, 1], sections: [] };
  const dotf = hp.defaultObjectTypesFilter ?? {
    type: 'specific' as const,
    selectedObjectTypes: [] as string[],
  };

  const updateHomePage = (patch: Partial<HomePageCfg>) => {
    onUpdateLayout({ ...layout, homePage: { ...hp, ...patch } });
  };

  return (
    <section
      data-testid="composer-block-homepage-extras"
      className="p-3 border-b border-border-light space-y-2"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Cabeçalho da Sala
      </p>
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
          Texto de boas-vindas
        </span>
        <input
          type="text"
          data-testid="composer-homepage-welcome"
          value={hp.welcomeText ?? ''}
          onChange={(e) =>
            updateHomePage({ welcomeText: e.target.value || undefined })
          }
          placeholder="Bem-vindo, operador."
          className="w-full h-7 px-2 mt-1 text-[11.5px] bg-white border border-border-light outline-none focus:border-primary"
        />
      </label>
      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input
          type="checkbox"
          data-testid="composer-homepage-hide-search"
          checked={hp.shouldHideSearchBar === true}
          onChange={(e) =>
            updateHomePage({ shouldHideSearchBar: e.target.checked })
          }
          className="h-3.5 w-3.5"
        />
        <EyeOff className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        Esconder a barra de busca do topo
      </label>
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
          Filtro padrão (tipos de objeto · csv)
        </span>
        <input
          type="text"
          data-testid="composer-homepage-filter"
          value={dotf.selectedObjectTypes.join(', ')}
          onChange={(e) => {
            const parts = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            updateHomePage({
              defaultObjectTypesFilter: {
                type: 'specific',
                selectedObjectTypes: parts,
              },
            });
          }}
          placeholder="Person, Event, Place"
          className="w-full h-7 px-2 mt-1 text-[11.5px] font-mono bg-white border border-border-light outline-none focus:border-primary"
        />
      </label>
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
          Local padrão após login (URL)
        </span>
        <input
          type="text"
          data-testid="composer-default-location"
          value={layout.defaultLocation ?? ''}
          onChange={(e) =>
            onUpdateLayout({
              ...layout,
              defaultLocation: e.target.value || undefined,
            })
          }
          placeholder="/sala/cockpit"
          className="w-full h-7 px-2 mt-1 text-[11.5px] font-mono bg-white border border-border-light outline-none focus:border-primary"
        />
      </label>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Wave D.2 — Barra de menu
// ───────────────────────────────────────────────────────────────────────────

function MenuBarBlock({
  layout,
  onUpdateLayout,
}: {
  layout: LayoutConfig;
  onUpdateLayout: (next: LayoutConfig) => void;
}) {
  const mb: MenuBarCfg = layout.menuBar ?? { visible: true, items: [] };

  const update = (patch: Partial<MenuBarCfg>) => {
    onUpdateLayout({ ...layout, menuBar: { ...mb, ...patch } });
  };
  const setItem = (idx: number, patch: Partial<MenuBarItem>) => {
    const items = mb.items.slice();
    if (!items[idx]) return;
    items[idx] = { ...items[idx], ...patch };
    update({ items });
  };
  const removeItem = (idx: number) => {
    const items = mb.items.slice();
    items.splice(idx, 1);
    update({ items });
  };
  const move = (idx: number, dir: -1 | 1) => {
    const items = mb.items.slice();
    const swap = idx + dir;
    if (swap < 0 || swap >= items.length) return;
    [items[idx], items[swap]] = [items[swap], items[idx]];
    update({ items });
  };
  const add = () => {
    update({
      items: [
        ...mb.items,
        { label: `Item ${mb.items.length + 1}`, href: '/', position: 'left' },
      ],
    });
  };

  return (
    <section
      data-testid="composer-block-menubar"
      className="p-3 border-b border-border-light space-y-2"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Barra de menu
      </p>
      <label className="flex items-center gap-2 text-[11px] text-text-on-light cursor-pointer">
        <input
          type="checkbox"
          data-testid="composer-menubar-visible"
          checked={mb.visible}
          onChange={(e) => update({ visible: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        Mostrar barra de menu no topo da Sala
      </label>

      <div data-testid="composer-menubar-list" className="space-y-1.5">
        {mb.items.length === 0 ? (
          <p className="text-[10.5px] text-muted-on-light italic">
            Nenhum item ainda. Use "Adicionar item" para criar.
          </p>
        ) : (
          mb.items.map((it, idx) => (
            <div
              key={`mb-${idx}`}
              data-testid={`composer-menubar-item-${idx}`}
              className="bg-white border border-border-light p-2 space-y-1.5"
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`composer-menubar-item-${idx}-up`}
                  aria-label="Mover para cima"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="h-5 w-5 flex items-center justify-center bg-canvas-light border border-border-light hover:border-primary disabled:opacity-30"
                >
                  <ArrowUp className="w-2.5 h-2.5" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  data-testid={`composer-menubar-item-${idx}-down`}
                  aria-label="Mover para baixo"
                  onClick={() => move(idx, 1)}
                  disabled={idx === mb.items.length - 1}
                  className="h-5 w-5 flex items-center justify-center bg-canvas-light border border-border-light hover:border-primary disabled:opacity-30"
                >
                  <ArrowDown className="w-2.5 h-2.5" strokeWidth={1.5} />
                </button>
                <span className="flex-1 text-[9px] font-mono uppercase text-muted-on-light text-right">
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  data-testid={`composer-menubar-item-${idx}-remove`}
                  aria-label="Remover item"
                  onClick={() => removeItem(idx)}
                  className="h-5 w-5 flex items-center justify-center bg-canvas-light border border-border-light hover:border-danger hover:text-danger"
                >
                  <X className="w-2.5 h-2.5" strokeWidth={1.5} />
                </button>
              </div>
              <input
                type="text"
                data-testid={`composer-menubar-item-${idx}-label`}
                value={it.label}
                placeholder="Rótulo"
                onChange={(e) => setItem(idx, { label: e.target.value })}
                className="w-full h-6 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
              />
              <input
                type="text"
                data-testid={`composer-menubar-item-${idx}-href`}
                value={it.href}
                placeholder="/rota"
                onChange={(e) => setItem(idx, { href: e.target.value })}
                className="w-full h-6 px-2 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
              />
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-on-light">
                  Posição
                </span>
                {(['left', 'right'] as MenuPosition[]).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    data-testid={`composer-menubar-item-${idx}-pos-${pos}`}
                    onClick={() => setItem(idx, { position: pos })}
                    className={`h-5 px-2 text-[10px] border border-border-light ${
                      it.position === pos
                        ? 'bg-primary text-white border-primary'
                        : 'bg-canvas-light hover:border-primary'
                    }`}
                  >
                    {pos === 'left' ? 'Esquerda' : 'Direita'}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        data-testid="composer-menubar-add"
        onClick={add}
        className="w-full h-7 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center justify-center gap-1.5"
      >
        <Plus className="w-3 h-3" strokeWidth={1.5} />
        Adicionar item
      </button>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Wave D.2 — Acesso por grupo (papéis = "grupos")
// ───────────────────────────────────────────────────────────────────────────

function AccessRulesBlock({
  layout,
  onUpdateLayout,
  roles,
}: {
  layout: LayoutConfig;
  onUpdateLayout: (next: LayoutConfig) => void;
  roles: IamRole[];
}) {
  const rules: AccessRule[] = layout.accessRules ?? [];
  const modules = layout.discoverableModules;
  const availableRoles = roles.filter(
    (r) => !rules.some((rule) => rule.group_id === r.id),
  );

  const addRule = (roleId: string) => {
    if (!roleId) return;
    onUpdateLayout({
      ...layout,
      accessRules: [...rules, { group_id: roleId, modules: [] }],
    });
  };
  const removeRule = (idx: number) => {
    const next = rules.slice();
    next.splice(idx, 1);
    onUpdateLayout({ ...layout, accessRules: next });
  };
  const toggleModule = (idx: number, moduleId: string) => {
    const next = rules.slice();
    if (!next[idx]) return;
    const has = next[idx].modules.includes(moduleId);
    next[idx] = {
      ...next[idx],
      modules: has
        ? next[idx].modules.filter((m) => m !== moduleId)
        : [...next[idx].modules, moduleId],
    };
    onUpdateLayout({ ...layout, accessRules: next });
  };

  const labelFor = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  return (
    <section
      data-testid="composer-block-access"
      className="p-3 border-b border-border-light space-y-2"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Acesso por grupo
      </p>
      <p className="text-[10.5px] text-muted-on-light italic">
        Para cada papel, escolha quais módulos descobríveis ficam
        visíveis. Lista vazia = sem restrição (vê todos os módulos).
      </p>

      {rules.length === 0 ? (
        <p
          data-testid="composer-access-empty"
          className="text-[10.5px] text-muted-on-light italic"
        >
          Nenhuma regra ainda.
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="composer-access-list">
          {rules.map((r, idx) => (
            <li
              key={`access-${r.group_id}-${idx}`}
              data-testid={`composer-access-rule-${idx}`}
              className="bg-white border border-border-light p-2 space-y-1.5"
            >
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-primary" strokeWidth={1.5} />
                <span className="flex-1 text-[11px] font-semibold text-text-on-light truncate">
                  {labelFor(r.group_id)}
                </span>
                <button
                  type="button"
                  aria-label="Remover regra"
                  data-testid={`composer-access-rule-${idx}-remove`}
                  onClick={() => removeRule(idx)}
                  className="h-5 w-5 flex items-center justify-center bg-canvas-light border border-border-light hover:border-danger hover:text-danger"
                >
                  <X className="w-2.5 h-2.5" strokeWidth={1.5} />
                </button>
              </div>
              {modules.length === 0 ? (
                <p className="text-[10px] text-muted-on-light italic">
                  Sem módulos descobríveis ainda.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1">
                  {modules.map((m) => {
                    const active = r.modules.includes(m.module_id);
                    return (
                      <li key={m.module_id}>
                        <button
                          type="button"
                          data-testid={`composer-access-rule-${idx}-mod-${m.module_id}`}
                          onClick={() => toggleModule(idx, m.module_id)}
                          className={`h-5 px-2 text-[10px] border ${
                            active
                              ? 'bg-primary text-white border-primary'
                              : 'bg-canvas-light border-border-light hover:border-primary'
                          }`}
                        >
                          {m.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <select
        data-testid="composer-access-add"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) {
            addRule(v);
            e.target.value = '';
          }
        }}
        className="w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
      >
        <option value="" disabled>
          {availableRoles.length === 0
            ? 'Todos os papéis já têm regra'
            : 'Adicionar regra para…'}
        </option>
        {availableRoles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Wave D.2 — Marketplace panel (tab)
// ───────────────────────────────────────────────────────────────────────────

function MarketplacePanel({
  layout,
  products,
  error,
  onInstallProduct,
}: {
  layout: LayoutConfig;
  products: MarketplaceProduct[];
  error: string | null;
  onInstallProduct: (p: MarketplaceProduct) => void;
}) {
  const installed = new Set(layout.discoverableModules.map((d) => d.module_id));
  return (
    <div data-testid="composer-marketplace-panel" className="p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Loja
      </p>
      <p className="text-[10.5px] text-muted-on-light italic">
        Produtos publicados pela operação. Instalar adiciona o módulo
        à paleta da Sala — salve para publicar a versão.
      </p>

      {error ? (
        <p
          data-testid="composer-marketplace-error"
          className="text-[11px] text-danger font-mono"
        >
          {error}
        </p>
      ) : products.length === 0 ? (
        <p
          data-testid="composer-marketplace-empty"
          className="text-[10.5px] text-muted-on-light italic"
        >
          Nenhum produto publicado ainda.
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="composer-marketplace-list">
          {products.map((p) => {
            const has = installed.has(p.slug);
            return (
              <li
                key={p.id}
                data-testid={`composer-marketplace-card-${p.id}`}
                className="bg-white border border-border-light p-2 space-y-1.5"
              >
                <div className="flex items-start gap-1.5">
                  <Store className="w-3 h-3 text-primary mt-0.5 shrink-0" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11.5px] font-semibold truncate">
                      {p.display_name}
                    </p>
                    <p className="text-[10px] font-mono text-muted-on-light truncate">
                      {p.slug} · v{p.version}
                    </p>
                  </div>
                </div>
                {p.description && (
                  <p className="text-[10.5px] text-muted-on-light line-clamp-2">
                    {p.description}
                  </p>
                )}
                <button
                  type="button"
                  data-testid={`composer-marketplace-install-${p.id}`}
                  disabled={has}
                  onClick={() => onInstallProduct(p)}
                  className={`w-full h-6 text-[11px] border flex items-center justify-center gap-1.5 ${
                    has
                      ? 'bg-canvas-light text-muted-on-light border-border-light cursor-default'
                      : 'bg-primary text-white border-primary hover:bg-primary-hover'
                  }`}
                >
                  {has ? 'Instalado' : 'Instalar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// YAML editor pane
// ───────────────────────────────────────────────────────────────────────────

function YamlEditor({
  text,
  setText,
  error,
  setError,
  originalText,
  onImportYaml,
}: {
  text: string;
  setText: (s: string) => void;
  error: string | null;
  setError: (s: string | null) => void;
  originalText: string;
  onImportYaml: (text: string) => void | Promise<void>;
}) {
  return (
    <main data-testid="composer-yaml-editor" className="flex-1 flex flex-col overflow-hidden">
      <header className="px-4 py-2 border-b border-border-light bg-canvas-light flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
            Layout da Sala (texto)
          </p>
          <p className="text-[10.5px] text-muted-on-light italic mt-0.5">
            Edição textual livre — JSON ou YAML. Validação remota antes
            da publicação. Diff vivo à direita.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onImportYaml(text)}
          data-testid="composer-yaml-validate"
          className="h-7 px-2 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
        >
          <Upload className="w-3 h-3" strokeWidth={1.5} />
          Validar YAML
        </button>
      </header>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 flex flex-col">
          <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-on-light bg-canvas-light border-b border-border-light">
            Atual (edição)
          </p>
          <textarea
            data-testid="composer-yaml-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            spellCheck={false}
            className="flex-1 p-3 text-[11.5px] font-mono bg-white border-r border-border-light outline-none resize-none"
          />
        </div>
        <div className="flex-1 flex flex-col">
          <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-on-light bg-canvas-light border-b border-border-light">
            Versão atual (publicada)
          </p>
          <pre
            data-testid="composer-yaml-original"
            className="flex-1 p-3 text-[11.5px] font-mono bg-canvas-light overflow-auto whitespace-pre-wrap"
          >
            {originalText}
          </pre>
        </div>
      </div>
      {error && (
        <p
          data-testid="composer-yaml-error"
          className="px-4 py-2 text-[11.5px] text-danger font-mono border-t border-border-light"
        >
          Erro de parse: {error}
        </p>
      )}
    </main>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function describeDiff(before: LayoutConfig, after: LayoutConfig): string {
  const lines: string[] = [];
  if (before.displayMetadata.name !== after.displayMetadata.name) {
    lines.push(`- Nome: "${before.displayMetadata.name}" -> "${after.displayMetadata.name}"`);
  }
  const beforeSections = before.homePage?.sections ?? [];
  const afterSections = after.homePage?.sections ?? [];
  if (beforeSections.length !== afterSections.length) {
    lines.push(`- Seções: ${beforeSections.length} -> ${afterSections.length}`);
  }
  const beforeItems = beforeSections.reduce((a, s) => a + s.items.length, 0);
  const afterItems = afterSections.reduce((a, s) => a + s.items.length, 0);
  if (beforeItems !== afterItems) {
    lines.push(`- Itens totais: ${beforeItems} -> ${afterItems}`);
  }
  const beforeCols = (before.homePage?.columns ?? []).join(',');
  const afterCols = (after.homePage?.columns ?? []).join(',');
  if (beforeCols !== afterCols) {
    lines.push(`- Colunas: [${beforeCols}] -> [${afterCols}]`);
  }
  if (lines.length === 0) lines.push('- Sem mudanças estruturais detectadas.');
  return lines.join('\n');
}
