'use client';

/**
 * /painel-de-controle/styles-configurator — Wave D.2 (2026-05-23).
 *
 * Configurador de estilos — UI 3-pane operacional pra editar tokens
 * visuais do tenant (cores, sizes, etc). O nome "Slate Styles" do
 * Foundry **não** aparece no produto (`feedback_no_palantir_product_names`).
 *
 * Layout:
 *   - Esq (240px): paleta de tokens — categorias (Tipografia, Cores,
 *     Espaçamento) + lista de tokens canônicos pra adicionar.
 *   - Centro (flex): canvas — preview ao vivo aplicando os tokens via
 *     style inline.
 *   - Dir (320px): inspetor — editar `value` do token selecionado.
 *
 * Persistência: GET/PUT /platform/v23/styles. O backend bloqueia
 * border-radius != 0 (regra de produto sharp-UI). LineageEvent
 * `styles.update` é emitido em cada PUT.
 *
 * Perm: `workspace.publish`.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Palette as PaletteIcon,
  Save,
  Type,
  Droplets,
  Move,
  Trash2,
  Code2,
  Layout as LayoutIcon,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { useT } from '@/lib/i18n/provider';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { PERSONALIZACAO_TABS } from '@/components/control-panel/hub-tabs';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import {
  Styles,
  type LayoutSlug,
  type LayoutTemplate,
  type GlobalStylesheetOut,
  type BrandOut,
  type RegionColorsOut,
  type BrandDefaultsOut,
} from '@/lib/api';
// Onda K.3 (2026-05-23) — UM preview unificado de Marca + Cores (Feedback #6).
import { IdentidadeVisualPreview } from '@/components/app-shell-editor';
import {
  DEFAULT_MARCA,
  PRESETS_COLOR_AEGIS,
  type RegionColorPreset,
} from '@/lib/app-shell/defaults';
import { useBrand } from '@/components/shell/brand-context';

// ── Token catalog — categorias canônicas ─────────────────────────────────

interface TokenDef {
  key: string;
  label: string;
  example: string;
  category: 'typography' | 'colors' | 'spacing';
}

const TOKEN_CATALOG: TokenDef[] = [
  // Tipografia
  { key: 'text-h1.size', label: 'Tamanho H1', example: '20px', category: 'typography' },
  { key: 'text-h2.size', label: 'Tamanho H2', example: '16px', category: 'typography' },
  { key: 'text-body.size', label: 'Tamanho corpo', example: '14px', category: 'typography' },
  { key: 'text-h1.weight', label: 'Peso H1', example: '600', category: 'typography' },
  // Cores
  { key: 'primary.color', label: 'Cor primária', example: '#2D77BE', category: 'colors' },
  { key: 'success.color', label: 'Cor sucesso', example: '#3D9F58', category: 'colors' },
  { key: 'warning.color', label: 'Cor alerta', example: '#E8B33B', category: 'colors' },
  { key: 'danger.color', label: 'Cor perigo', example: '#C8341F', category: 'colors' },
  // Espaçamento
  { key: 'spacing.gap', label: 'Gap base', example: '8px', category: 'spacing' },
  { key: 'spacing.padding', label: 'Padding base', example: '12px', category: 'spacing' },
];

const CATEGORY_LABEL: Record<TokenDef['category'], string> = {
  typography: 'Tipografia',
  colors: 'Cores',
  spacing: 'Espaçamento',
};

const CATEGORY_ICON: Record<TokenDef['category'], React.ReactNode> = {
  typography: <Type className="w-3 h-3 text-primary" strokeWidth={1.5} />,
  colors: <Droplets className="w-3 h-3 text-primary" strokeWidth={1.5} />,
  spacing: <Move className="w-3 h-3 text-primary" strokeWidth={1.5} />,
};

export default function StylesConfiguratorPage() {
  return (
    <RequirePerm perm="workspace.publish">
      <StylesConfiguratorInner />
    </RequirePerm>
  );
}

// Wave F.2 (2026-05-23) — 5 abas R2 slate-parity. `tokens` é a aba
// principal funcional; as outras são placeholders honestos "Em construção"
// pra dar visibilidade do roadmap ao operador (não silenciar gaps).
type StylesTab =
  | 'text-styles'
  | 'spacing'
  | 'colors'
  | 'layouts'
  | 'global-stylesheet'
  // Onda K.3 (2026-05-23, Feedback #6): Marca + Cores unificados num só
  // fluxo de "Identidade Visual" com UM preview vivo. Substitui o par de
  // abas confuso (Marca / Cores por região) que tinha dois previews.
  | 'visual-identity';

const STYLES_TABS: { key: StylesTab; label: string }[] = [
  { key: 'text-styles', label: 'Tipografia' },
  { key: 'spacing', label: 'Espaçamento' },
  { key: 'colors', label: 'Cores' },
  { key: 'layouts', label: 'Layouts' },
  { key: 'global-stylesheet', label: 'Folha de estilo global' },
  { key: 'visual-identity', label: 'Identidade Visual' },
];

function StylesConfiguratorInner() {
  const [tokens, setTokens] = React.useState<Record<string, string>>({});
  const [original, setOriginal] = React.useState<Record<string, string>>({});
  const [selected, setSelected] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<StylesTab>('text-styles');

  React.useEffect(() => {
    setLoading(true);
    Styles.get()
      .then((out) => {
        setTokens(out.tokens ?? {});
        setOriginal(out.tokens ?? {});
        setLoading(false);
      })
      .catch((e) => {
        setLoadErr((e as Error)?.message ?? 'Falha ao carregar tokens');
        setLoading(false);
      });
  }, []);

  const isDirty = JSON.stringify(tokens) !== JSON.stringify(original);

  const addToken = (def: TokenDef) => {
    setTokens((cur) => {
      if (cur[def.key] !== undefined) return cur;
      return { ...cur, [def.key]: def.example };
    });
    setSelected(def.key);
  };

  const removeToken = (key: string) => {
    setTokens((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
    if (selected === key) setSelected(null);
  };

  const updateValue = (key: string, value: string) => {
    setTokens((cur) => ({ ...cur, [key]: value }));
  };

  const onSave = async () => {
    setSaveErr(null);
    setBusy(true);
    try {
      const out = await Styles.update(tokens, 'styles configurator: update tokens');
      setTokens(out.tokens ?? {});
      setOriginal(out.tokens ?? {});
    } catch (e) {
      setSaveErr((e as Error)?.message ?? 'Falha ao salvar tokens');
    } finally {
      setBusy(false);
    }
  };

  if (loadErr) {
    return (
      <div data-testid="styles-configurator-page">
        <CpPageHeader
          title="Configurador de estilos"
          subtitle="Falha ao carregar tokens visuais."
        />
        <div className="p-6">
          <CpErrorState
            title="Erro ao carregar"
            description={loadErr}
            retry={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div data-testid="styles-configurator-page">
        <CpPageHeader title="Configurador de estilos" subtitle="Carregando…" />
        <div className="p-6">
          <CpSkeleton rows={3} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="styles-configurator-page" className="flex flex-col h-full">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <PaletteIcon className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
            Configurador de estilos
          </span>
        }
        subtitle="Edite tokens visuais do tenant. Não é permitido configurar border-radius — UI sharp é invariante do produto."
        actions={
          <button
            type="button"
            data-testid="styles-save"
            onClick={onSave}
            disabled={busy || !isDirty}
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        }
      />
      <CpHubSubnav group="Personalização" tabs={PERSONALIZACAO_TABS} />

      {saveErr && (
        <div className="px-6 pt-3">
          <p data-testid="styles-error" className="text-[12px] text-danger font-mono">
            {saveErr}
          </p>
        </div>
      )}

      {/* Wave F.2 — 5 abas slate-parity (R2 slate/styles/*). */}
      <nav
        data-testid="styles-tabs"
        className="border-b border-border-light bg-raised-light px-3 flex items-center gap-1"
      >
        {STYLES_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            data-testid={`styles-tab-${t.key}`}
            aria-pressed={activeTab === t.key}
            onClick={() => setActiveTab(t.key)}
            className={`h-8 px-3 text-[11px] uppercase tracking-[0.16em] font-semibold border-b-2 ${
              activeTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-on-light hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Wave G.3 — Layouts: editor real de template default da Sala. */}
      {activeTab === 'layouts' && <LayoutsTab />}
      {/* Wave G.3 — Folha de estilo global: editor real de CSS por tenant. */}
      {activeTab === 'global-stylesheet' && <GlobalStylesheetTab />}
      {/* Onda K.3 — Identidade Visual: Marca + Cores num só fluxo + 1 preview. */}
      {activeTab === 'visual-identity' && <IdentidadeVisualTab />}

      {(activeTab === 'text-styles' || activeTab === 'spacing' || activeTab === 'colors') && (
      <div className="flex-1 flex min-h-0">
        {/* Esq — Paleta */}
        <aside
          data-testid="styles-palette"
          className="w-[240px] border-r border-border-light bg-canvas-light overflow-y-auto"
        >
          <header className="px-3 py-2 border-b border-border-light">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
              Paleta de tokens
            </p>
            <p className="text-[10.5px] text-muted-on-light italic mt-0.5">
              Clique para adicionar ao tenant.
            </p>
          </header>
          {(
            (activeTab === 'text-styles'
              ? ['typography']
              : activeTab === 'spacing'
                ? ['spacing']
                : ['colors']) as TokenDef['category'][]
          ).map(
            (cat) => (
              <section
                key={cat}
                data-testid={`styles-palette-${cat}`}
                className="p-2 border-b border-border-light"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold px-1 mb-1.5 flex items-center gap-1.5">
                  {CATEGORY_ICON[cat]}
                  {CATEGORY_LABEL[cat]}
                </p>
                <ul className="space-y-1">
                  {TOKEN_CATALOG.filter((t) => t.category === cat).map((t) => {
                    const inUse = tokens[t.key] !== undefined;
                    return (
                      <li key={t.key}>
                        <button
                          type="button"
                          data-testid={`styles-add-${t.key}`}
                          onClick={() => addToken(t)}
                          disabled={inUse}
                          className={`w-full text-left px-2 py-1 text-[11px] border ${
                            inUse
                              ? 'bg-canvas-light text-muted-on-light border-border-light cursor-default'
                              : 'bg-white border-border-light hover:border-primary'
                          }`}
                        >
                          <span className="block truncate">{t.label}</span>
                          <span className="block text-[9px] font-mono text-muted-on-light truncate">
                            {t.key}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ),
          )}
        </aside>

        {/* Centro — Canvas */}
        <main
          data-testid="styles-canvas"
          className="flex-1 overflow-auto bg-white p-6"
        >
          <div className="max-w-2xl mx-auto space-y-4">
            <header className="pb-3 border-b border-border-light">
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
                Pré-visualização ao vivo
              </p>
            </header>
            <section
              data-testid="styles-preview"
              className="bg-canvas-light border border-border-light p-4 space-y-3"
              style={previewStyle(tokens)}
            >
              <h1
                data-testid="styles-preview-h1"
                style={previewTextStyle(tokens, 'text-h1')}
                className="text-h1 font-semibold"
              >
                Título principal (H1)
              </h1>
              <h2
                data-testid="styles-preview-h2"
                style={previewTextStyle(tokens, 'text-h2')}
                className="text-h2 font-semibold"
              >
                Subtítulo (H2)
              </h2>
              <p
                data-testid="styles-preview-body"
                style={previewTextStyle(tokens, 'text-body')}
                className="text-body"
              >
                Corpo de texto operacional. Lorem ipsum dolor sit amet,
                consectetur adipiscing elit.
              </p>
              <div className="flex gap-2">
                <span
                  data-testid="styles-preview-primary"
                  style={{ backgroundColor: tokens['primary.color'] ?? '#2D77BE' }}
                  className="h-6 px-3 text-[11px] text-white flex items-center"
                >
                  Primária
                </span>
                <span
                  data-testid="styles-preview-success"
                  style={{ backgroundColor: tokens['success.color'] ?? '#3D9F58' }}
                  className="h-6 px-3 text-[11px] text-white flex items-center"
                >
                  Sucesso
                </span>
                <span
                  data-testid="styles-preview-warning"
                  style={{ backgroundColor: tokens['warning.color'] ?? '#E8B33B' }}
                  className="h-6 px-3 text-[11px] text-white flex items-center"
                >
                  Alerta
                </span>
                <span
                  data-testid="styles-preview-danger"
                  style={{ backgroundColor: tokens['danger.color'] ?? '#C8341F' }}
                  className="h-6 px-3 text-[11px] text-white flex items-center"
                >
                  Perigo
                </span>
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
                Tokens ativos ({Object.keys(tokens).length})
              </p>
              {Object.keys(tokens).length === 0 ? (
                <p
                  data-testid="styles-active-empty"
                  className="text-[12px] text-muted-on-light italic"
                >
                  Nenhum token customizado. Adicione tokens pela paleta à
                  esquerda.
                </p>
              ) : (
                <ul
                  data-testid="styles-active-list"
                  className="bg-canvas-light border border-border-light divide-y divide-border-light"
                >
                  {Object.entries(tokens).map(([key, value]) => {
                    const isSel = selected === key;
                    return (
                      <li
                        key={key}
                        data-testid={`styles-active-${key}`}
                        onClick={() => setSelected(key)}
                        className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${
                          isSel ? 'bg-white' : 'hover:bg-white'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono truncate">{key}</p>
                          <p className="text-[10px] text-muted-on-light truncate">
                            {value}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Remover token"
                          data-testid={`styles-remove-${key}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeToken(key);
                          }}
                          className="h-6 w-6 flex items-center justify-center bg-canvas-light border border-border-light hover:border-danger hover:text-danger"
                        >
                          <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </main>

        {/* Dir — Inspector */}
        <aside
          data-testid="styles-inspector"
          className="w-[320px] border-l border-border-light bg-canvas-light overflow-y-auto"
        >
          <header className="px-3 py-2 border-b border-border-light">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
              Inspetor de token
            </p>
          </header>
          {selected && tokens[selected] !== undefined ? (
            <section
              data-testid="styles-inspector-edit"
              className="p-3 space-y-2"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                Chave
              </p>
              <p className="text-[11px] font-mono text-text-on-light break-all">
                {selected}
              </p>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  Valor
                </span>
                <input
                  type="text"
                  data-testid="styles-inspector-value"
                  value={tokens[selected]}
                  onChange={(e) => updateValue(selected, e.target.value)}
                  className="w-full h-7 px-2 text-[11.5px] font-mono bg-white border border-border-light outline-none focus:border-primary mt-1"
                />
              </label>
            </section>
          ) : (
            <section
              data-testid="styles-inspector-empty"
              className="p-3"
            >
              <p className="text-[11.5px] text-muted-on-light italic">
                Selecione um token na lista para editar seu valor.
              </p>
            </section>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}

function previewStyle(_tokens: Record<string, string>): React.CSSProperties {
  // Reservado para preview-level vars (ex.: --spacing-gap). Mantido
  // como hook por consistência com previewTextStyle.
  return {};
}

function previewTextStyle(
  tokens: Record<string, string>,
  prefix: 'text-h1' | 'text-h2' | 'text-body',
): React.CSSProperties {
  const out: React.CSSProperties = {};
  const size = tokens[`${prefix}.size`];
  if (size) out.fontSize = size;
  const weight = tokens[`${prefix}.weight`];
  if (weight) out.fontWeight = weight;
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Wave G.3 — Layouts tab                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function LayoutPreview({ slug }: { slug: LayoutSlug }) {
  // Mini-SVG simbolizando a topologia de cada template. Sem rounded — sharp
  // por invariante de produto. Cor única para não competir com a paleta.
  const stroke = 'currentColor';
  const fill = '#E2E8F0';
  const w = 96;
  const h = 56;
  if (slug === 'sidebar-canvas-inspector') {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <rect x="0" y="0" width={w} height={h} fill="none" stroke={stroke} />
        <rect x="2" y="2" width="20" height={h - 4} fill={fill} />
        <rect x={w - 22} y="2" width="20" height={h - 4} fill={fill} />
      </svg>
    );
  }
  if (slug === 'single-pane') {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <rect x="0" y="0" width={w} height={h} fill={fill} stroke={stroke} />
      </svg>
    );
  }
  if (slug === 'two-col') {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <rect x="0" y="0" width={w} height={h} fill="none" stroke={stroke} />
        <rect x="2" y="2" width="58" height={h - 4} fill={fill} />
        <rect x="64" y="2" width={w - 66} height={h - 4} fill={fill} opacity="0.4" />
      </svg>
    );
  }
  if (slug === 'three-col') {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <rect x="0" y="0" width={w} height={h} fill="none" stroke={stroke} />
        <rect x="2" y="2" width="28" height={h - 4} fill={fill} opacity="0.5" />
        <rect x="34" y="2" width="28" height={h - 4} fill={fill} />
        <rect x="66" y="2" width="28" height={h - 4} fill={fill} opacity="0.5" />
      </svg>
    );
  }
  // tabbed
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <rect x="0" y="8" width={w} height={h - 8} fill={fill} stroke={stroke} />
      <rect x="2" y="0" width="22" height="10" fill={stroke} />
      <rect x="26" y="0" width="22" height="10" fill="none" stroke={stroke} />
      <rect x="50" y="0" width="22" height="10" fill="none" stroke={stroke} />
    </svg>
  );
}

function LayoutsTab() {
  const [selected, setSelected] = React.useState<LayoutSlug | null>(null);
  const [available, setAvailable] = React.useState<LayoutTemplate[]>([]);
  const [original, setOriginal] = React.useState<LayoutSlug | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Styles.getLayouts()
      .then((out) => {
        if (cancelled) return;
        setAvailable(out.available);
        setSelected(out.default_template ?? null);
        setOriginal(out.default_template ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr((e as Error)?.message ?? 'Falha ao carregar layouts');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = selected !== original;

  const onSave = async () => {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      const out = await Styles.updateLayouts(
        selected,
        'styles configurator: update default layout',
      );
      setOriginal(out.default_template);
      setSelected(out.default_template);
      setOk(true);
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar layout');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-6" data-testid="styles-tab-layouts">
        <CpSkeleton rows={3} />
      </div>
    );
  }

  return (
    <div
      data-testid="styles-tab-layouts"
      className="flex-1 overflow-auto p-6 bg-white"
    >
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex items-center gap-2 pb-3 border-b border-border-light">
          <LayoutIcon className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.16em] font-semibold">
              Templates de layout
            </p>
            <p className="text-[12px] text-muted-on-light">
              O template selecionado vira o layout default ao criar uma nova
              Sala. Mudar não afeta Salas existentes.
            </p>
          </div>
          <button
            type="button"
            onClick={onSave}
            data-testid="styles-layouts-save"
            disabled={busy || !dirty || !selected}
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
            {busy ? 'Salvando…' : 'Salvar template default'}
          </button>
        </header>

        {err && (
          <p
            data-testid="styles-layouts-error"
            className="text-[12px] text-danger font-mono flex items-center gap-1.5"
          >
            <AlertCircle className="w-3 h-3" strokeWidth={1.5} /> {err}
          </p>
        )}
        {ok && !dirty && (
          <p
            data-testid="styles-layouts-saved"
            className="text-[12px] text-success font-mono flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} /> Template default
            salvo.
          </p>
        )}

        <ul
          data-testid="styles-layouts-list"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {available.map((tpl) => {
            const isSel = selected === tpl.slug;
            return (
              <li key={tpl.slug}>
                <button
                  type="button"
                  data-testid={`styles-layout-${tpl.slug}`}
                  aria-pressed={isSel}
                  onClick={() => setSelected(tpl.slug)}
                  className={`w-full text-left p-3 bg-canvas-light border ${
                    isSel
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border-light hover:border-primary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-text-on-light">
                      <LayoutPreview slug={tpl.slug} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold truncate flex items-center gap-1.5">
                        {tpl.label}
                        {isSel && (
                          <CheckCircle2
                            className="w-3 h-3 text-primary"
                            strokeWidth={2}
                          />
                        )}
                      </p>
                      <p className="text-[10.5px] text-muted-on-light leading-tight mt-1">
                        {tpl.description}
                      </p>
                      <p className="text-[9.5px] font-mono text-muted-on-light mt-1.5 uppercase tracking-wider">
                        {tpl.slug}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Wave G.3 — Global Stylesheet tab                                           */
/* ────────────────────────────────────────────────────────────────────────── */

// Lint client-side espelhando o servidor: bloqueia border-radius != 0.
const CSS_RADIUS_RE =
  /(?:^|[\s;{])(?:-(?:webkit|moz|ms|o)-)?border[-_]?radius\s*:\s*([^;}\n]+)/gim;
const ZERO_VAL_RE = /^\s*0(\.0+)?(px|rem|em|%|pt)?\s*$/i;

function lintCss(css: string): string[] {
  const errs: string[] = [];
  if (!css) return errs;
  const matches = css.match(CSS_RADIUS_RE) ?? [];
  for (const decl of matches) {
    const m = /:\s*([^;}\n]+)/.exec(decl);
    const value = (m?.[1] ?? '').trim();
    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length > 0 && parts.every((p) => ZERO_VAL_RE.test(p))) continue;
    errs.push(decl.trim().replace(/^[{;\s]+/, ''));
  }
  return errs;
}

function GlobalStylesheetTab() {
  const [css, setCss] = React.useState('');
  const [original, setOriginal] = React.useState('');
  const [enabled, setEnabled] = React.useState(true);
  const [origEnabled, setOrigEnabled] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);

  const lintErrs = React.useMemo(() => lintCss(css), [css]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Styles.getGlobalStylesheet()
      .then((out: GlobalStylesheetOut) => {
        if (cancelled) return;
        setCss(out.css ?? '');
        setOriginal(out.css ?? '');
        setEnabled(out.enabled !== false);
        setOrigEnabled(out.enabled !== false);
        setUpdatedAt(out.updated_at);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr((e as Error)?.message ?? 'Falha ao carregar folha de estilo');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = css !== original || enabled !== origEnabled;

  const onSave = async () => {
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      const out = await Styles.updateGlobalStylesheet(
        css,
        enabled,
        'styles configurator: update global stylesheet',
      );
      setOriginal(out.css);
      setOrigEnabled(out.enabled);
      setUpdatedAt(out.updated_at);
      setOk(true);
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar folha de estilo');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-6" data-testid="styles-tab-global-stylesheet">
        <CpSkeleton rows={3} />
      </div>
    );
  }

  return (
    <div
      data-testid="styles-tab-global-stylesheet"
      className="flex-1 flex flex-col bg-white"
    >
      <header className="flex items-center gap-2 px-6 py-3 border-b border-border-light">
        <Code2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold">
            Folha de estilo global
          </p>
          <p className="text-[11px] text-muted-on-light">
            CSS aplicado a todo o tenant via App Shell. Limite seu escopo
            usando seletores que comecem com{' '}
            <code className="font-mono text-primary">
              .aegis-app-shell-*
            </code>
            . Regras border-radius diferentes de zero são rejeitadas.
          </p>
          {updatedAt && (
            <p className="text-[10px] text-muted-on-light font-mono mt-0.5">
              última atualização: {updatedAt}
            </p>
          )}
        </div>
        <label className="text-[11px] flex items-center gap-1.5 mr-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            data-testid="styles-css-enabled"
            className="w-3.5 h-3.5 accent-primary"
          />
          ativo
        </label>
        <button
          type="button"
          onClick={onSave}
          data-testid="styles-css-save"
          disabled={busy || !dirty || lintErrs.length > 0}
          className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
          {busy ? 'Salvando…' : 'Salvar CSS'}
        </button>
      </header>

      {err && (
        <p
          data-testid="styles-css-error"
          className="px-6 py-2 text-[12px] text-danger font-mono flex items-center gap-1.5"
        >
          <AlertCircle className="w-3 h-3" strokeWidth={1.5} /> {err}
        </p>
      )}
      {ok && !dirty && (
        <p
          data-testid="styles-css-saved"
          className="px-6 py-2 text-[12px] text-success font-mono flex items-center gap-1.5"
        >
          <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} /> CSS aplicado
          ao tenant.
        </p>
      )}

      {lintErrs.length > 0 && (
        <div
          data-testid="styles-css-lint"
          className="mx-6 my-2 p-2 border border-danger/40 bg-danger/5"
        >
          <p className="text-[11px] font-semibold text-danger flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" strokeWidth={1.5} /> regras
            inválidas ({lintErrs.length})
          </p>
          <ul className="mt-1 text-[10.5px] font-mono text-danger space-y-0.5 list-disc list-inside">
            {lintErrs.map((e, i) => (
              <li key={i} data-testid={`styles-css-lint-${i}`}>
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      <textarea
        data-testid="styles-css-editor"
        value={css}
        onChange={(e) => setCss(e.target.value)}
        spellCheck={false}
        placeholder={
          '/* exemplo */\n.aegis-app-shell-banner { background: #0F172A; color: #fff; }'
        }
        className="flex-1 mx-6 my-3 px-3 py-2 text-[12px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary resize-none"
        style={{ minHeight: 240 }}
      />
    </div>
  );
}

// GlobalStylesheetMount foi extraído para components/shell/global-stylesheet-mount.tsx
// — Next 15 (App Router) não permite exports nomeados em arquivos de página.

// ─── Onda K.3 — Identidade Visual (Marca + Cores unificados) ───────────────
//
// Feedback #6 do operador: "'Marca' e 'Cores por região' o resultado entre
// os dois está meio confuso (...) Dois preview diferente que confunde
// totalmente a cabeça de quem está editando!".
//
// Solução: UMA aba "Identidade Visual" com controles agrupados à esquerda
// (seção Marca + seção Cores) e UM único `IdentidadeVisualPreview` à direita
// que reflete marca E cores no MESMO shell mock, ao vivo.

interface RegionDef {
  key: keyof RegionColorsOut;
  label: string;
  fields: { key: string; label: string; type?: 'color' | 'number' }[];
}

const REGION_DEFS: RegionDef[] = [
  {
    key: 'banner',
    label: 'Banner',
    fields: [
      { key: 'bg', label: 'Fundo' },
      { key: 'text', label: 'Texto' },
      { key: 'accent', label: 'Acento' },
    ],
  },
  {
    key: 'sidenav',
    label: 'Sidenav',
    fields: [
      { key: 'bg', label: 'Fundo' },
      { key: 'text', label: 'Texto' },
      { key: 'active', label: 'Ativo' },
    ],
  },
  {
    key: 'navbar',
    label: 'Navbar',
    fields: [
      { key: 'bg', label: 'Fundo' },
      { key: 'text', label: 'Texto' },
      { key: 'active', label: 'Ativo' },
    ],
  },
  {
    key: 'footer',
    label: 'Footer',
    fields: [
      { key: 'bg', label: 'Fundo' },
      { key: 'text', label: 'Texto' },
      { key: 'accent', label: 'Acento' },
    ],
  },
  {
    key: 'comunicados',
    label: 'Comunicados',
    fields: [
      { key: 'info', label: 'Info' },
      { key: 'warning', label: 'Alerta' },
      { key: 'danger', label: 'Perigo' },
      { key: 'success', label: 'Sucesso' },
    ],
  },
  {
    key: 'backdrop',
    label: 'Backdrop',
    fields: [
      { key: 'bg', label: 'Fundo' },
      { key: 'opacity', label: 'Opacidade (0..1)', type: 'number' },
    ],
  },
];

function emptyRegionColors(): RegionColorsOut {
  return {
    banner: {},
    sidenav: {},
    navbar: {},
    footer: {},
    comunicados: {},
    backdrop: {},
  };
}

function IdentidadeVisualTab() {
  const t = useT();
  const router = useRouter();
  const brandCtx = useBrand();
  // ── Estado da Marca ──────────────────────────────────────────────────
  // Onda I.2 (Feedback #7): brand pré-carregado com DEFAULT_MARCA — UI
  // nunca mostra campo vazio sem pista. Backend sobrescreve campos não-null.
  const [brand, setBrand] = React.useState<BrandOut>({ ...DEFAULT_MARCA });
  const [defaults, setDefaults] = React.useState<BrandDefaultsOut | null>(null);
  const [brandBusy, setBrandBusy] = React.useState(false);
  const [brandErr, setBrandErr] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadingDark, setUploadingDark] = React.useState(false);

  // ── Estado das Cores ─────────────────────────────────────────────────
  const [colors, setColors] = React.useState<RegionColorsOut>(emptyRegionColors);
  const [colorsBusy, setColorsBusy] = React.useState(false);
  const [colorsErr, setColorsErr] = React.useState<string | null>(null);
  // Presets canônicos AEGIS (fallback local; backend sobrescreve se houver).
  const [presets, setPresets] =
    React.useState<RegionColorPreset[]>(PRESETS_COLOR_AEGIS);

  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Guard de cancelamento — sem isto, o double-invoke de efeitos do React
    // Strict Mode (dev) dispara este load DUAS VEZES; a 2ª promise resolve
    // depois da 1ª (mesma corrida que popula o form) e pisava em qualquer
    // edição do operador feita entre a hidratação e a 2ª resolução (mesmo
    // padrão que LayoutsTab/GlobalStylesheetTab já usam nesta página).
    let cancelled = false;
    setLoading(true);
    // Carrega tudo em paralelo: defaults + brand + cores + presets. O
    // operador entra na aba e já vê o shell mock inteiro renderizado.
    Promise.all([
      Styles.getBrandDefaults().catch(() => null),
      Styles.getBrand().catch(() => null),
      Styles.getRegionColors().catch(() => null),
    ]).then(([def, b, r]) => {
      if (cancelled) return;
      if (def) setDefaults(def);
      const fallback: BrandOut = def
        ? {
            company_name: def.company_name_default,
            logo_url: def.logo_default_url,
            logo_dark_url: def.logo_dark_default_url,
            slogan: def.slogan_default,
            primary_color: def.primary_color_default,
            favicon_url: def.favicon_default,
            pwa_name: def.pwa_name,
            pwa_short_name: def.pwa_short_name,
          }
        : DEFAULT_MARCA;
      setBrand({
        company_name: b?.company_name ?? fallback.company_name,
        logo_url: b?.logo_url ?? fallback.logo_url,
        logo_dark_url: b?.logo_dark_url ?? fallback.logo_dark_url,
        slogan: b?.slogan ?? fallback.slogan,
        primary_color: b?.primary_color ?? fallback.primary_color,
        favicon_url: b?.favicon_url ?? fallback.favicon_url,
        pwa_name: b?.pwa_name ?? fallback.pwa_name,
        pwa_short_name: b?.pwa_short_name ?? fallback.pwa_short_name,
      });
      setColors({
        banner: r?.banner ?? {},
        sidenav: r?.sidenav ?? {},
        navbar: r?.navbar ?? {},
        footer: r?.footer ?? {},
        comunicados: r?.comunicados ?? {},
        backdrop: r?.backdrop ?? {},
      });
      setLoading(false);
    });
    // Presets best-effort; fallback local cobre offline.
    Styles.getRegionColorPresets?.()
      .then((out) => {
        if (cancelled) return;
        if (out?.presets?.length) {
          setPresets(
            out.presets.map((p) => ({
              key: p.key as RegionColorPreset['key'],
              label: p.label,
              description: p.description,
              colors: p.colors as RegionColorsOut,
            })),
          );
        }
      })
      .catch(() => {
        /* mantém fallback local PRESETS_COLOR_AEGIS */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Handlers da Marca ────────────────────────────────────────────────
  const handleSaveBrand = async () => {
    setBrandErr(null);
    setBrandBusy(true);
    try {
      const out = await Styles.updateBrand({
        company_name: brand.company_name ?? null,
        logo_url: brand.logo_url ?? null,
        logo_dark_url: brand.logo_dark_url ?? null,
        slogan: brand.slogan ?? null,
        primary_color: brand.primary_color ?? null,
        favicon_url: brand.favicon_url ?? null,
        pwa_name: brand.pwa_name ?? null,
        pwa_short_name: brand.pwa_short_name ?? null,
      });
      setBrand(out);
      // generateMetadata() (título da aba/favicon) só reexecuta em uma nova
      // navegação server-side do layout raiz — sem isto, o operador só via
      // o título mudar depois de um hard-refresh manual. router.refresh()
      // força o Next a rebuscar os Server Components (inclui o layout).
      router.refresh();
      // BrandLink/CpSidebarHeader vivem no AuthShell (acima desta página) e
      // só buscam a Marca uma vez no mount — sem isto, o sidenav ficava
      // com o nome/logo ANTIGO até um F5 (o refresh acima não alcança o
      // estado de client components fora desta árvore).
      brandCtx.refresh();
    } catch (e) {
      setBrandErr((e as Error).message ?? 'Falha ao salvar marca');
    } finally {
      setBrandBusy(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setBrandErr(null);
    setUploading(true);
    try {
      const out = await Styles.uploadLogo(file);
      setBrand((b) => ({ ...b, logo_url: out.url }));
    } catch (e) {
      setBrandErr((e as Error).message ?? 'Falha ao enviar logo');
    } finally {
      setUploading(false);
    }
  };

  // Onda brand2 (2026-07-09) — upload do logo para FUNDO ESCURO (mesmo
  // endpoint; só muda o campo destino no draft).
  const handleLogoDarkUpload = async (file: File) => {
    setBrandErr(null);
    setUploadingDark(true);
    try {
      const out = await Styles.uploadLogo(file);
      setBrand((b) => ({ ...b, logo_dark_url: out.url }));
    } catch (e) {
      setBrandErr((e as Error).message ?? 'Falha ao enviar logo');
    } finally {
      setUploadingDark(false);
    }
  };

  // ── Handlers das Cores ───────────────────────────────────────────────
  const updateField = (
    region: keyof RegionColorsOut,
    field: string,
    value: string,
  ) => {
    setColors((c) => ({
      ...c,
      [region]: { ...c[region], [field]: value },
    }));
  };

  const resetRegion = (region: keyof RegionColorsOut) => {
    setColors((c) => ({ ...c, [region]: {} }));
  };

  // Aplica um preset inteiro — substitui todas as 6 regiões de uma vez.
  const applyPreset = (preset: RegionColorPreset) => {
    setColors({
      banner: { ...preset.colors.banner },
      sidenav: { ...preset.colors.sidenav },
      navbar: { ...preset.colors.navbar },
      footer: { ...preset.colors.footer },
      comunicados: { ...preset.colors.comunicados },
      backdrop: { ...preset.colors.backdrop },
    });
  };

  const resetAllColors = () => setColors(emptyRegionColors());

  const handleSaveColors = async () => {
    setColorsErr(null);
    setColorsBusy(true);
    try {
      // Limpa campos vazios pra não mandar "" no payload.
      const payload: RegionColorsOut = emptyRegionColors();
      for (const region of REGION_DEFS) {
        const sub = colors[region.key] || {};
        const cleaned: Record<string, string> = {};
        for (const f of region.fields) {
          const v = sub[f.key];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            cleaned[f.key] = String(v);
          }
        }
        payload[region.key] = cleaned;
      }
      const out = await Styles.updateRegionColors(payload);
      setColors({
        banner: out.banner ?? {},
        sidenav: out.sidenav ?? {},
        navbar: out.navbar ?? {},
        footer: out.footer ?? {},
        comunicados: out.comunicados ?? {},
        backdrop: out.backdrop ?? {},
      });
    } catch (e) {
      setColorsErr((e as Error).message ?? 'Falha ao salvar cores');
    } finally {
      setColorsBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-6" data-testid="styles-tab-visual-identity">
        <CpSkeleton rows={3} />
      </div>
    );
  }

  return (
    <div
      data-testid="styles-tab-visual-identity"
      className="flex-1 overflow-y-auto p-6"
    >
      <header className="mb-4 pb-3 border-b border-border-light">
        <h2 className="text-[14px] font-semibold text-text-on-light flex items-center gap-2">
          <PaletteIcon className="w-4 h-4 text-primary" strokeWidth={1.5} />
          Identidade Visual
        </h2>
        <p className="text-[11.5px] text-muted-on-light mt-0.5">
          Configure a marca (logo, slogan, nome) e as cores de cada região do
          shell. Tudo o que você edita aparece na pré-visualização ao lado, no
          mesmo shell de exemplo.
        </p>
      </header>

      {/* Esquerda: controles agrupados · Direita: UM preview vivo. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {/* ─── Seção Marca ───────────────────────────────────────────── */}
          <section
            data-testid="visual-identity-brand-section"
            className="bg-white border border-border-light"
          >
            <header className="px-4 py-2.5 border-b border-border-light bg-raised-light">
              <h3 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
                Marca
              </h3>
              <p className="text-[10.5px] text-muted-on-light mt-0.5">
                Logo, slogan, cor primária, favicon e nome do app.
              </p>
              {defaults && (
                <p
                  data-testid="brand-defaults-hint"
                  className="text-[10.5px] text-muted-on-light italic mt-1"
                >
                  Valores padrão pré-carregados ({defaults.pwa_name}). Edite o
                  que quiser; o restante segue o padrão da plataforma.
                </p>
              )}
            </header>

            <div className="p-4 space-y-5">
              {/* Onda M3 (2026-05-24) — Nome da empresa. Identifica a unidade/
                  organização operadora; reusado no título da aba do navegador
                  ({nome da empresa} · {slogan}). */}
              <section className="space-y-1">
                <label
                  htmlFor="brand-company-name"
                  className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold block"
                >
                  {t('appshell.brandCompanyName')}
                </label>
                <p className="text-[10.5px] text-muted-on-light">
                  {t('appshell.brandCompanyNameHelp')}
                </p>
                <input
                  id="brand-company-name"
                  data-testid="brand-company-name"
                  type="text"
                  value={brand.company_name ?? ''}
                  onChange={(e) =>
                    setBrand((b) => ({
                      ...b,
                      company_name: e.target.value || null,
                    }))
                  }
                  placeholder={t('appshell.brandCompanyNamePlaceholder')}
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </section>

              {/* Logo upload — primário (fundo claro) */}
              <section className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
                  Logo (fundo claro)
                </label>
                <p className="text-[10.5px] text-muted-on-light">
                  Usado na sidebar do Painel de Controle e na tela de login
                  (superfícies claras). PNG, JPG, SVG ou WebP.
                </p>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 border border-border-light bg-canvas-light flex items-center justify-center">
                    {brand.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        data-testid="brand-logo-preview"
                        src={brand.logo_url}
                        alt="Logo"
                        className="max-h-full max-w-full"
                        // Se o logo persistido apontar pra uma URL inacessível
                        // (ex.: marca antiga removida do storage), cai pro logo
                        // canônico AEGIS em vez de uma miniatura quebrada.
                        onError={(e) => {
                          const img = e.currentTarget;
                          const fallback = DEFAULT_MARCA.logo_url ?? '/aegis-logo.svg';
                          if (img.getAttribute('src') !== fallback) {
                            img.src = fallback;
                          }
                        }}
                      />
                    ) : (
                      <span className="text-[10.5px] text-muted-on-light">sem logo</span>
                    )}
                  </div>
                  <label className="h-8 px-3 text-[12px] bg-white border border-border-light text-text-on-light hover:bg-canvas-light cursor-pointer flex items-center">
                    <input
                      data-testid="brand-logo-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoUpload(f);
                        e.target.value = '';
                      }}
                      disabled={uploading}
                    />
                    {uploading ? 'Enviando…' : 'Enviar imagem'}
                  </label>
                  {brand.logo_url && (
                    <button
                      type="button"
                      data-testid="brand-logo-clear"
                      onClick={() => setBrand((b) => ({ ...b, logo_url: null }))}
                      className="text-[11.5px] text-danger hover:underline"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </section>

              {/* Onda brand2 (2026-07-09) — Logo para FUNDO ESCURO. O
                  cabeçalho e o sidenav operacional são escuros; um logo
                  colorido/escuro some neles. Aqui o operador sobe uma variante
                  clara/knockout. O quadro de preview usa fundo escuro pra
                  refletir a superfície real. */}
              <section className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
                  Logo (fundo escuro)
                </label>
                <p className="text-[10.5px] text-muted-on-light">
                  Usado no cabeçalho e no sidenav operacional (superfícies
                  escuras). Envie uma versão clara/knockout do logo.
                </p>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 border border-border-light bg-[#14181E] flex items-center justify-center">
                    {brand.logo_dark_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        data-testid="brand-logo-dark-preview"
                        src={brand.logo_dark_url}
                        alt="Logo (fundo escuro)"
                        className="max-h-full max-w-full"
                        onError={(e) => {
                          const img = e.currentTarget;
                          const fallback =
                            DEFAULT_MARCA.logo_dark_url ?? '/logo-white.svg';
                          if (img.getAttribute('src') !== fallback) {
                            img.src = fallback;
                          }
                        }}
                      />
                    ) : (
                      <span className="text-[10.5px] text-muted-on-dark">sem logo</span>
                    )}
                  </div>
                  <label className="h-8 px-3 text-[12px] bg-white border border-border-light text-text-on-light hover:bg-canvas-light cursor-pointer flex items-center">
                    <input
                      data-testid="brand-logo-dark-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoDarkUpload(f);
                        e.target.value = '';
                      }}
                      disabled={uploadingDark}
                    />
                    {uploadingDark ? 'Enviando…' : 'Enviar imagem'}
                  </label>
                  {brand.logo_dark_url && (
                    <button
                      type="button"
                      data-testid="brand-logo-dark-clear"
                      onClick={() =>
                        setBrand((b) => ({ ...b, logo_dark_url: null }))
                      }
                      className="text-[11.5px] text-danger hover:underline"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </section>

              {/* Slogan */}
              <section className="space-y-1">
                <label
                  htmlFor="brand-slogan"
                  className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold block"
                >
                  Slogan
                </label>
                <p className="text-[10.5px] text-muted-on-light">
                  Frase curta exibida ao lado do logo.
                </p>
                <input
                  id="brand-slogan"
                  data-testid="brand-slogan"
                  type="text"
                  value={brand.slogan ?? ''}
                  onChange={(e) =>
                    setBrand((b) => ({ ...b, slogan: e.target.value || null }))
                  }
                  placeholder={DEFAULT_MARCA.slogan ?? ''}
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </section>

              {/* Primary color */}
              <section className="space-y-1">
                <label
                  htmlFor="brand-primary"
                  className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold block"
                >
                  Cor primária
                </label>
                <p className="text-[10.5px] text-muted-on-light">
                  Cor de destaque da marca (botões, links, logo-texto).
                </p>
                <div className="flex items-center gap-2">
                  <input
                    id="brand-primary"
                    data-testid="brand-primary-color"
                    type="color"
                    value={brand.primary_color ?? '#2D77BE'}
                    onChange={(e) =>
                      setBrand((b) => ({ ...b, primary_color: e.target.value }))
                    }
                    className="h-8 w-12 border border-border-light bg-white p-0 cursor-pointer"
                    aria-label="Cor primária da marca"
                  />
                  <input
                    data-testid="brand-primary-color-hex"
                    type="text"
                    value={brand.primary_color ?? ''}
                    onChange={(e) =>
                      setBrand((b) => ({ ...b, primary_color: e.target.value || null }))
                    }
                    placeholder="#2D77BE"
                    className="h-8 px-2 text-[12px] font-mono bg-white border border-border-light text-text-on-light focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </section>

              {/* Favicon */}
              <section className="space-y-1">
                <label
                  htmlFor="brand-favicon"
                  className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold block"
                >
                  Favicon (URL)
                </label>
                <p className="text-[10.5px] text-muted-on-light">
                  Ícone exibido na aba do navegador.
                </p>
                <input
                  id="brand-favicon"
                  data-testid="brand-favicon"
                  type="text"
                  value={brand.favicon_url ?? ''}
                  onChange={(e) =>
                    setBrand((b) => ({ ...b, favicon_url: e.target.value || null }))
                  }
                  placeholder="https://…/favicon.ico"
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </section>

              {/* PWA */}
              <section className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold block">
                  Nome do app instalável (PWA)
                </label>
                <p className="text-[10.5px] text-muted-on-light">
                  Nome completo e abreviado usados ao instalar o app.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-0.5">
                  <div>
                    <label
                      htmlFor="brand-pwa-name"
                      className="text-[10px] uppercase tracking-wider text-muted-on-light block mb-1"
                    >
                      Nome
                    </label>
                    <input
                      id="brand-pwa-name"
                      data-testid="brand-pwa-name"
                      type="text"
                      value={brand.pwa_name ?? ''}
                      onChange={(e) =>
                        setBrand((b) => ({ ...b, pwa_name: e.target.value || null }))
                      }
                      placeholder="AEGIS"
                      className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="brand-pwa-short"
                      className="text-[10px] uppercase tracking-wider text-muted-on-light block mb-1"
                    >
                      Nome curto
                    </label>
                    <input
                      id="brand-pwa-short"
                      data-testid="brand-pwa-short-name"
                      type="text"
                      value={brand.pwa_short_name ?? ''}
                      onChange={(e) =>
                        setBrand((b) => ({ ...b, pwa_short_name: e.target.value || null }))
                      }
                      placeholder="AEGIS"
                      className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </section>

              {brandErr && (
                <p data-testid="brand-error" className="text-[11.5px] text-danger font-mono">
                  {brandErr}
                </p>
              )}

              <div className="flex justify-end pt-2 border-t border-border-light">
                <button
                  type="button"
                  data-testid="brand-save"
                  disabled={brandBusy}
                  onClick={handleSaveBrand}
                  className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {brandBusy ? 'Salvando…' : 'Salvar marca'}
                </button>
              </div>
            </div>
          </section>

          {/* ─── Seção Cores ───────────────────────────────────────────── */}
          <section
            data-testid="visual-identity-colors-section"
            className="bg-white border border-border-light"
          >
            <header className="px-4 py-2.5 border-b border-border-light bg-raised-light">
              <h3 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
                Cores
              </h3>
              <p className="text-[10.5px] text-muted-on-light mt-0.5">
                Comece por um preset (na pré-visualização) e ajuste cada região
                abaixo. A faixa de cada bloco mostra o resultado isolado.
              </p>
            </header>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {REGION_DEFS.map((region) => (
                  <section
                    key={region.key}
                    data-testid={`region-colors-${region.key}`}
                    className="bg-canvas-light border border-border-light p-3 space-y-3"
                  >
                    <header className="flex items-center justify-between">
                      <h4 className="text-[12px] font-semibold text-text-on-light">
                        {region.label}
                      </h4>
                      <button
                        type="button"
                        data-testid={`region-colors-reset-${region.key}`}
                        onClick={() => resetRegion(region.key)}
                        className="text-[11px] text-muted-on-light hover:text-danger"
                      >
                        Restaurar padrão
                      </button>
                    </header>

                    {region.fields.map((f) => {
                      const v =
                        (colors[region.key] as Record<string, string>)[f.key] ?? '';
                      const isNumber = f.type === 'number';
                      return (
                        <div key={f.key} className="flex items-center gap-2">
                          <label
                            htmlFor={`rc-${region.key}-${f.key}`}
                            className="w-24 text-[11px] text-text-on-light"
                          >
                            {f.label}
                          </label>
                          {isNumber ? (
                            <input
                              id={`rc-${region.key}-${f.key}`}
                              data-testid={`region-input-${region.key}-${f.key}`}
                              type="text"
                              inputMode="decimal"
                              value={v}
                              onChange={(e) =>
                                updateField(region.key, f.key, e.target.value)
                              }
                              placeholder="0.5"
                              className="flex-1 h-8 px-2 text-[12px] font-mono bg-white border border-border-light text-text-on-light focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          ) : (
                            <>
                              <input
                                id={`rc-${region.key}-${f.key}`}
                                data-testid={`region-input-${region.key}-${f.key}`}
                                type="color"
                                value={v || '#000000'}
                                onChange={(e) =>
                                  updateField(region.key, f.key, e.target.value)
                                }
                                className="h-8 w-12 border border-border-light bg-white p-0 cursor-pointer"
                                aria-label={`${region.label} · ${f.label}`}
                              />
                              <input
                                data-testid={`region-input-${region.key}-${f.key}-hex`}
                                type="text"
                                value={v}
                                onChange={(e) =>
                                  updateField(region.key, f.key, e.target.value)
                                }
                                placeholder="#000000"
                                className="flex-1 h-8 px-2 text-[12px] font-mono bg-white border border-border-light text-text-on-light focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </>
                          )}
                        </div>
                      );
                    })}

                    {/* Faixa isolada da região (complementa o preview global). */}
                    <RegionPreview region={region} values={colors[region.key]} />
                  </section>
                ))}
              </div>

              {colorsErr && (
                <p
                  data-testid="region-colors-error"
                  className="text-[11.5px] text-danger font-mono"
                >
                  {colorsErr}
                </p>
              )}

              <div className="flex justify-end pt-3 border-t border-border-light">
                <button
                  type="button"
                  data-testid="region-colors-save"
                  disabled={colorsBusy}
                  onClick={handleSaveColors}
                  className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {colorsBusy ? 'Salvando…' : 'Salvar cores'}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Direita: UM preview vivo refletindo marca E cores juntos. */}
        <div className="xl:sticky xl:top-4">
          <IdentidadeVisualPreview
            brand={brand}
            regionColors={colors}
            presets={presets}
            onApplyPreset={applyPreset}
            onResetColors={resetAllColors}
            testId="identidade-visual-preview"
          />
        </div>
      </div>
    </div>
  );
}

function RegionPreview({
  region,
  values,
}: {
  region: RegionDef;
  values: Record<string, string>;
}) {
  const style: React.CSSProperties = {};
  if (values.bg) style.backgroundColor = values.bg;
  if (values.text) style.color = values.text;
  if (values.accent) style.borderColor = values.accent;
  if (region.key === 'comunicados' && values.info) {
    style.backgroundColor = values.info;
    style.color = '#FFFFFF';
  }
  return (
    <div
      data-testid={`region-preview-${region.key}`}
      style={style}
      className="h-8 px-3 text-[11px] flex items-center border border-border-light"
    >
      Pré-visualização · {region.label}
    </div>
  );
}
