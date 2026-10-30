'use client';

/**
 * Painel de Controle · Páginas — Wave H.4.A (2026-05-23).
 *
 * Lista/edita a registry de páginas do tenant. O storage é
 * `Tenant.metadata_["registered_pages"]` (ontology-module), exposto em
 * `/platform/v23/pages`.
 *
 * Layout 3-col:
 *   ┌──────────┬────────────────────┬─────────────────┐
 *   │ Filtros  │     Cards lista     │   Detalhe       │
 *   │  240px   │      (centro)       │   320px         │
 *   └──────────┴────────────────────┴─────────────────┘
 *
 * Filtros (esquerda): status, scope (tenant/operacao/espaco), perm.
 * Centro: cards com title + route + status + bindings chip + perm chip.
 * Direita: detalhe da page selecionada com edição inline.
 *
 * Mutações:
 *   - Nova página (topo)                  → POST  /pages
 *   - Editar metadata (inspetor direito)  → PATCH /pages/{slug}
 *   - Editor de canvas (botão "Editar")   → /paginas/{slug}/edit
 *   - Duplicar                            → POST  /pages/{slug}/duplicate
 *   - Arquivar (ConfirmDialog)            → DELETE /pages/{slug}
 *
 * DS pro-max (memórias honradas):
 *   - feedback_no_rounded_no_sparkles · sharp Palantir-style
 *   - feedback_no_emojis_in_ui · lucide icons só
 *   - feedback_no_palantir_product_names · "Páginas" pt-BR
 *   - feedback_no_phase_status_in_ui · zero "Fase X"
 */
import * as React from 'react';
import Link from 'next/link';
import {
  Archive,
  AppWindow,
  Copy,
  FileEdit,
  Files,
  Layers,
  Plus,
  Save,
  Search,
  Shield,
  X,
} from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
// FIX #3 (2026-06-28): "Páginas" virou item de 1ª classe na seção "Catálogo" do
// nav do Painel — a página é destino próprio (CpPageHeader já dá o título). O
// CpHubSubnav do hub "Personalização" (Aparência | Layout do App) saiu daqui.
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import {
  MarkingSelect,
  OrgSelect,
  PermSelect,
  SpaceSelect,
  WorkspaceSelect,
} from '@/components/app-shell-editor/option-sources';
import {
  Pages,
  type PageScope,
  type PageStatus,
  type PagesListFilters,
  type RegisteredPage,
} from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { resolveExperienceKind } from '@/components/pages-editor/page-config-adapter';
import { hasExperienceConfig } from '@/lib/pages/experience-registry';
// Auto-registro dos configuradores de experiências bespoke (side-effect):
// sem estes imports o registry fica vazio na lista de Páginas e o botão
// "Configurar experiência" não apareceria (igual ao auto-registro de app
// routes via AipThreadsApp). Cada experiência app_route com parâmetros
// editáveis registra seu configurador aqui.
import '@/components/pages-editor/buscar-params-editor'; // experience_kind='buscar'
import '@/components/pages-editor/solutions-experience-editor'; // experience_kind='solutions'
import '@/components/pages-editor/agents-experience-editor'; // experience_kind='agents'
import '@/components/pages-editor/aip-experience-editor'; // experience_kind='aip_chat'
import '@/components/pages-editor/embed-experience-editor'; // experience_kind='embed' (Onda 3b)

const STATUS_LABEL: Record<PageStatus, string> = {
  published: 'Publicada',
  draft: 'Rascunho',
  archived: 'Arquivada',
};

const STATUS_TONE: Record<PageStatus, string> = {
  published: 'bg-success/10 text-success border-success/30',
  draft: 'bg-warning/10 text-warning border-warning/30',
  archived: 'bg-muted-on-light/10 text-muted-on-light border-border-light',
};

const SCOPE_LABEL: Record<PageScope, string> = {
  tenant: 'Unidade',
  operacao: 'Operação',
  espaco: 'Espaço',
};

function scopeOf(page: RegisteredPage): PageScope {
  const b = page.workspace_bindings;
  if (b?.sala_id || b?.operacao_id) return 'operacao';
  if (b?.espaco_id) return 'espaco';
  return 'tenant';
}

export default function PaginasPage() {
  return (
    <RequirePerm perm="workspace.publish">
      <PaginasInner />
    </RequirePerm>
  );
}

function PaginasInner() {
  const askConfirm = useConfirm();
  const [pages, setPages] = React.useState<RegisteredPage[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<PagesListFilters>({});
  const [search, setSearch] = React.useState('');
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);

  const refresh = React.useCallback(() => {
    setErr(null);
    Pages.list(filters)
      .then((rows) => setPages(rows))
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar Páginas'));
  }, [filters]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = React.useMemo(() => {
    const list = pages ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.slug.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.route.toLowerCase().includes(q),
    );
  }, [pages, search]);

  const selected = React.useMemo(
    () => (selectedSlug ? filtered.find((p) => p.slug === selectedSlug) ?? null : null),
    [filtered, selectedSlug],
  );

  // Auto-seleciona o primeiro card quando a lista chega.
  React.useEffect(() => {
    if (!selectedSlug && filtered.length > 0) {
      setSelectedSlug(filtered[0].slug);
    }
  }, [filtered, selectedSlug]);

  const onArchive = async (page: RegisteredPage) => {
    const ok = await askConfirm({
      title: `Arquivar "${page.title}"?`,
      description: (
        <span>
          A página deixará de aparecer na lista padrão. Operadores com filtro
          em <strong>Arquivada</strong> continuam vendo. Esta ação não apaga o
          registro.
        </span>
      ),
      tone: 'danger',
      requireConfirmText: 'arquivar',
      confirmLabel: 'Arquivar página',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    try {
      await Pages.delete(page.slug);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao arquivar página');
    }
  };

  const onDuplicate = async (page: RegisteredPage) => {
    try {
      const clone = await Pages.duplicate(page.slug);
      refresh();
      setSelectedSlug(clone.slug);
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao duplicar página');
    }
  };

  const onSaveDetail = async (
    page: RegisteredPage,
    patch: Parameters<typeof Pages.update>[1],
  ) => {
    try {
      await Pages.update(page.slug, patch);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar detalhes');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <CpPageHeader
        title="Páginas"
        subtitle="Registry de rotas operacionais — controle status, bindings de operação/espaço, perm e marcações por página."
        actions={
          <button
            type="button"
            data-testid="paginas-novo"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-3 h-8 bg-primary text-white text-[12px] hover:bg-primary/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label="Criar nova página"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            <span>Nova página</span>
          </button>
        }
      />
      <div className="flex-1 flex min-h-0">
        <PaginasFiltrosColumn
          filters={filters}
          onChange={setFilters}
          counts={pages ?? []}
        />
        <div className="flex-1 flex flex-col min-w-0 border-l border-border-light">
          <div className="px-6 py-3 border-b border-border-light bg-white flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por slug, título ou rota..."
                data-testid="paginas-search"
                className="w-full h-8 pl-8 pr-3 text-[12px] bg-white border border-border-light text-text-on-light placeholder:text-muted-on-light focus:outline-none focus:border-primary"
                aria-label="Buscar páginas"
              />
            </div>
            <span
              className="text-[11px] text-muted-on-light font-mono"
              data-testid="paginas-count"
            >
              {filtered.length} {filtered.length === 1 ? 'página' : 'páginas'}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-canvas-light">
            {err && <CpErrorState description={err} retry={refresh} />}
            {!err && pages === null && <CpSkeleton />}
            {!err && pages !== null && filtered.length === 0 && (
              <CpEmptyState
                icon={Files}
                title="Nenhuma página encontrada"
                description={
                  search
                    ? 'Ajuste a busca ou limpe os filtros laterais.'
                    : 'Crie a primeira página da unidade clicando em "Nova página".'
                }
              />
            )}
            {!err && filtered.length > 0 && (
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
                data-testid="paginas-grid"
              >
                {filtered.map((p) => (
                  <PaginaCard
                    key={p.slug}
                    page={p}
                    selected={p.slug === selectedSlug}
                    onSelect={() => setSelectedSlug(p.slug)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        <PaginaDetailColumn
          page={selected}
          onSave={onSaveDetail}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
        />
      </div>
      {showCreate && (
        <CreatePageDialog
          onClose={() => setShowCreate(false)}
          onCreated={(p) => {
            setShowCreate(false);
            refresh();
            setSelectedSlug(p.slug);
          }}
        />
      )}
    </div>
  );
}

// ── Filtros (esquerda) ─────────────────────────────────────────────────────

function PaginasFiltrosColumn({
  filters,
  onChange,
  counts,
}: {
  filters: PagesListFilters;
  onChange: (f: PagesListFilters) => void;
  counts: RegisteredPage[];
}) {
  const t = useT();
  const statusCounts = React.useMemo(() => {
    const c: Record<PageStatus, number> = { published: 0, draft: 0, archived: 0 };
    for (const p of counts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [counts]);

  return (
    <aside
      className="w-[240px] shrink-0 bg-white p-4 overflow-y-auto"
      data-testid="paginas-filtros"
    >
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-2">
          Status
        </div>
        {(['published', 'draft', 'archived'] as PageStatus[]).map((s) => (
          <label
            key={s}
            className="flex items-center gap-2 h-7 text-[12px] text-text-on-light cursor-pointer hover:text-primary"
          >
            <input
              type="radio"
              name="paginas-status"
              checked={filters.status === s}
              onChange={() => onChange({ ...filters, status: s })}
              data-testid={`paginas-filter-status-${s}`}
              className="accent-primary"
            />
            <span className="flex-1">{STATUS_LABEL[s]}</span>
            <span className="text-[10px] text-muted-on-light font-mono">
              {statusCounts[s] ?? 0}
            </span>
          </label>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...filters, status: undefined })}
          className="mt-1 text-[11px] text-muted-on-light hover:text-primary"
        >
          Limpar status
        </button>
      </div>

      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-2">
          Escopo
        </div>
        <select
          value={filters.scope ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              scope: (e.target.value || undefined) as PageScope | undefined,
            })
          }
          data-testid="paginas-filter-scope"
          className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus:border-primary"
          aria-label="Filtrar por escopo"
        >
          <option value="">Todos os escopos</option>
          <option value="tenant">Unidade</option>
          <option value="operacao">Operação</option>
          <option value="espaco">Espaço</option>
        </select>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-2">
          {t('paginas.permFilterLabel')}
        </div>
        <PermSelect
          value={filters.perm ?? ''}
          onChange={(v) => onChange({ ...filters, perm: v || undefined })}
          placeholder={t('paginas.permFilterAll')}
          data-testid="paginas-filter-perm"
        />
      </div>
    </aside>
  );
}

// ── Card (centro) ──────────────────────────────────────────────────────────

function PaginaCard({
  page,
  selected,
  onSelect,
}: {
  page: RegisteredPage;
  selected: boolean;
  onSelect: () => void;
}) {
  const scope = scopeOf(page);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`paginas-card-${page.slug}`}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'text-left bg-white border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        selected
          ? 'border-primary ring-1 ring-primary'
          : 'border-border-light hover:border-primary/60',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold text-text-on-light truncate">
            {page.title}
          </h3>
          <p className="text-[11px] text-muted-on-light font-mono truncate mt-0.5">
            {page.route}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 border font-semibold',
            STATUS_TONE[page.status],
          )}
        >
          {STATUS_LABEL[page.status]}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-border-light text-muted-on-light bg-canvas-light">
          <Layers className="w-3 h-3" strokeWidth={1.5} />
          {SCOPE_LABEL[scope]}
        </span>
        {page.iam_perm_required && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 border border-border-light text-text-on-light bg-canvas-light">
            <Shield className="w-3 h-3" strokeWidth={1.5} />
            {page.iam_perm_required}
          </span>
        )}
        {page.marking_requirements.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 border border-border-light text-text-on-light bg-canvas-light">
            {page.marking_requirements.length}{' '}
            {page.marking_requirements.length === 1 ? 'marcação' : 'marcações'}
          </span>
        )}
      </div>
      {page.last_edited_at && (
        <p className="mt-3 text-[10px] text-muted-on-light">
          Editado em{' '}
          {new Date(page.last_edited_at).toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>
      )}
    </button>
  );
}

// ── Detalhe (direita) ──────────────────────────────────────────────────────

function PaginaDetailColumn({
  page,
  onSave,
  onDuplicate,
  onArchive,
}: {
  page: RegisteredPage | null;
  onSave: (page: RegisteredPage, patch: Parameters<typeof Pages.update>[1]) => Promise<void>;
  onDuplicate: (page: RegisteredPage) => Promise<void>;
  onArchive: (page: RegisteredPage) => Promise<void>;
}) {
  const t = useT();
  const [draftPerm, setDraftPerm] = React.useState('');
  const [draftOperacao, setDraftOperacao] = React.useState('');
  const [draftEspaco, setDraftEspaco] = React.useState('');
  const [draftSala, setDraftSala] = React.useState('');
  const [draftMarkings, setDraftMarkings] = React.useState<string[]>([]);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!page) return;
    setDraftPerm(page.iam_perm_required ?? '');
    setDraftOperacao(page.workspace_bindings.operacao_id ?? '');
    setDraftEspaco(page.workspace_bindings.espaco_id ?? '');
    setDraftSala(page.workspace_bindings.sala_id ?? '');
    setDraftMarkings(page.marking_requirements ?? []);
    setDirty(false);
  }, [page]);

  if (!page) {
    return (
      <aside
        className="w-[320px] shrink-0 border-l border-border-light bg-white p-6 overflow-y-auto"
        data-testid="paginas-detail"
      >
        <div className="text-[12px] text-muted-on-light">
          Selecione uma página para inspecionar e editar.
        </div>
      </aside>
    );
  }

  // Onda K.1: rotas servidas por código de aplicação não são montáveis
  // por widgets — não oferecemos "Editar layout" pra elas.
  const isAppRoute =
    (page.config as { mode?: string } | null)?.mode === 'app_route';
  // W0: rotas de código que MESMO ASSIM têm parâmetros editáveis abrem o
  // configurador da experiência bespoke. Lookup GENÉRICO pelo
  // experience_kind (registry) — não mais o special-case slug==='buscar'.
  // Novas experiências (W1+) aparecem aqui só registrando seu configurador.
  const experienceKind = resolveExperienceKind(page);
  const hasParams = isAppRoute && hasExperienceConfig(experienceKind);

  const handleSave = async () => {
    await onSave(page, {
      iam_perm_required: draftPerm.trim() || null,
      workspace_bindings: {
        operacao_id: draftOperacao.trim() || null,
        espaco_id: draftEspaco.trim() || null,
        sala_id: draftSala.trim() || null,
      },
      marking_requirements: draftMarkings,
    });
    setDirty(false);
  };

  return (
    <aside
      className="w-[320px] shrink-0 border-l border-border-light bg-white p-5 overflow-y-auto"
      data-testid="paginas-detail"
    >
      <div className="mb-4">
        <h2 className="text-[14px] font-semibold text-text-on-light">
          {page.title}
        </h2>
        <p className="text-[11px] text-muted-on-light font-mono mt-0.5">
          {page.route}
        </p>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {isAppRoute ? (
          <>
            <div
              className="w-full px-3 py-2 bg-canvas-light border border-border-light text-[11px] text-muted-on-light flex items-start gap-2"
              data-testid="paginas-app-route-note"
            >
              <AppWindow className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} />
              <span>
                Rota servida pela aplicação — não é montável por widgets.
                {hasParams
                  ? ' Mas a PARAMETRIZAÇÃO (parâmetros da página) é editável — abra abaixo.'
                  : ' Status, permissão e marcações continuam editáveis abaixo.'}
              </span>
            </div>
            {hasParams && (
              <Link
                href={`/painel-de-controle/paginas/${encodeURIComponent(page.slug)}/edit`}
                data-testid="paginas-params-button"
                data-experience-kind={experienceKind}
                className="block w-full text-center px-3 h-8 bg-primary text-white text-[12px] hover:bg-primary/90 leading-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label={t('pages.configureExperience')}
              >
                <span className="inline-flex items-center gap-2 align-middle">
                  <FileEdit className="w-4 h-4" strokeWidth={1.5} />
                  {t('pages.configureExperience')}
                </span>
              </Link>
            )}
          </>
        ) : (
          <Link
            href={`/painel-de-controle/paginas/${encodeURIComponent(page.slug)}/edit`}
            data-testid="paginas-edit-button"
            className="block w-full text-center px-3 h-8 bg-primary text-white text-[12px] hover:bg-primary/90 leading-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label="Editar layout da página"
          >
            <span className="inline-flex items-center gap-2 align-middle">
              <FileEdit className="w-4 h-4" strokeWidth={1.5} />
              Editar layout
            </span>
          </Link>
        )}
        <Link
          href={`/paginas/${encodeURIComponent(page.slug)}/view`}
          data-testid="paginas-view-button"
          className="block w-full text-center px-3 h-8 bg-white text-text-on-light text-[12px] border border-border-light hover:border-primary leading-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="Visualizar página em rota pública"
          target="_blank"
          rel="noopener noreferrer"
        >
          Visualizar
        </Link>
      </div>

      <Field label="Status">
        <select
          value={page.status}
          onChange={(e) =>
            onSave(page, { status: e.target.value as PageStatus })
          }
          data-testid="paginas-detail-status"
          className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus:border-primary"
          aria-label="Status da página"
        >
          <option value="published">Publicada</option>
          <option value="draft">Rascunho</option>
          <option value="archived">Arquivada</option>
        </select>
      </Field>

      <Field label={t('paginas.permLabel')}>
        <PermSelect
          value={draftPerm}
          onChange={(v) => {
            setDraftPerm(v);
            setDirty(true);
          }}
          data-testid="paginas-detail-perm"
        />
        <p className="text-[10px] text-muted-on-light mt-1">
          {t('paginas.permHelp')}
        </p>
      </Field>

      <Field label={t('paginas.bindingsLabel')}>
        <div className="space-y-2">
          <div>
            <span className="block text-[10px] text-muted-on-light mb-0.5">
              {t('paginas.bindingOperacao')}
            </span>
            <OrgSelect
              value={draftOperacao}
              onChange={(v) => {
                setDraftOperacao(v);
                setDirty(true);
              }}
              data-testid="paginas-detail-operacao"
            />
          </div>
          <div>
            <span className="block text-[10px] text-muted-on-light mb-0.5">
              {t('paginas.bindingEspaco')}
            </span>
            <SpaceSelect
              value={draftEspaco}
              onChange={(v) => {
                setDraftEspaco(v);
                setDirty(true);
              }}
              data-testid="paginas-detail-espaco"
            />
          </div>
          <div>
            <span className="block text-[10px] text-muted-on-light mb-0.5">
              {t('paginas.bindingSala')}
            </span>
            <WorkspaceSelect
              value={draftSala}
              onChange={(v) => {
                setDraftSala(v);
                setDirty(true);
              }}
              data-testid="paginas-detail-sala"
            />
          </div>
        </div>
      </Field>

      <Field label={t('paginas.markingsLabel')}>
        <MarkingSelect
          values={draftMarkings}
          onChange={(v) => {
            setDraftMarkings(v);
            setDirty(true);
          }}
          data-testid="paginas-detail-markings"
        />
        <p className="text-[10px] text-muted-on-light mt-1">
          {t('paginas.markingsHelp')}
        </p>
      </Field>

      {dirty && (
        <button
          type="button"
          onClick={handleSave}
          data-testid="paginas-detail-save"
          className="w-full inline-flex items-center justify-center gap-2 px-3 h-8 bg-primary text-white text-[12px] hover:bg-primary/90 mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="Salvar detalhes da página"
        >
          <Save className="w-4 h-4" strokeWidth={1.5} />
          Salvar detalhes
        </button>
      )}

      <div className="border-t border-border-light pt-3 mt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onDuplicate(page)}
          data-testid="paginas-duplicate"
          className="inline-flex items-center justify-center gap-2 px-3 h-8 bg-white text-text-on-light text-[12px] border border-border-light hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="Duplicar página"
        >
          <Copy className="w-4 h-4" strokeWidth={1.5} />
          Duplicar
        </button>
        {page.status !== 'archived' && (
          <button
            type="button"
            onClick={() => onArchive(page)}
            data-testid="paginas-archive"
            className="inline-flex items-center justify-center gap-2 px-3 h-8 bg-white text-danger text-[12px] border border-danger/30 hover:bg-danger/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/60"
            aria-label="Arquivar página"
          >
            <Archive className="w-4 h-4" strokeWidth={1.5} />
            Arquivar
          </button>
        )}
      </div>
    </aside>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="block text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Create dialog ──────────────────────────────────────────────────────────

function CreatePageDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: RegisteredPage) => void;
}) {
  const [slug, setSlug] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [route, setRoute] = React.useState('');
  const [status, setStatus] = React.useState<PageStatus>('draft');
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const created = await Pages.create({ slug, title, route, status });
      onCreated(created);
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao criar página');
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex items-center justify-center p-4"
      role="dialog"
      aria-label="Criar nova página"
      aria-modal="true"
    >
      <form
        onSubmit={onSubmit}
        className="bg-white border border-border-light w-full max-w-md p-5"
        data-testid="paginas-create-dialog"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-[14px] font-semibold text-text-on-light">
            Nova página
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-on-light hover:text-text-on-light"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <Field label="Slug">
          <input
            type="text"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="ex: dossie-veiculo"
            data-testid="paginas-create-slug"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light placeholder:text-muted-on-light focus:outline-none focus:border-primary font-mono"
          />
        </Field>

        <Field label="Título">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex: Dossiê de Veículo"
            data-testid="paginas-create-title"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light placeholder:text-muted-on-light focus:outline-none focus:border-primary"
          />
        </Field>

        <Field label="Rota">
          <input
            type="text"
            required
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="ex: /dossie/veiculo/[id]"
            data-testid="paginas-create-route"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light placeholder:text-muted-on-light focus:outline-none focus:border-primary font-mono"
          />
        </Field>

        <Field label="Status inicial">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PageStatus)}
            data-testid="paginas-create-status"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus:border-primary"
          >
            <option value="draft">Rascunho</option>
            <option value="published">Publicada</option>
          </select>
        </Field>

        {err && (
          <div className="mb-3 text-[11px] text-danger border border-danger/30 bg-danger/10 px-2 py-1.5">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 h-8 bg-white text-text-on-light text-[12px] border border-border-light hover:border-primary/60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !slug || !title || !route}
            data-testid="paginas-create-submit"
            className="inline-flex items-center gap-2 px-3 h-8 bg-primary text-white text-[12px] hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Criar página
          </button>
        </div>
      </form>
    </div>
    </ModalPortal>
  );
}
