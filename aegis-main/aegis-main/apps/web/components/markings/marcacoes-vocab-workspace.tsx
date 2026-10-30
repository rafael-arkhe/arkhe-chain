'use client';

/**
 * MarcacoesVocabWorkspace — "Vocabulário" de Marcações (Sprint Foundry-C ·
 * 2026-05-22; extraído da page no LOTE1 ELO PAGES · 2026-06-28).
 *
 * Fundamento do mandatory access control. Vocabulário aberto, lógica
 * conjuntiva por padrão (categorias podem ser disjuntivas — releasability).
 *
 * Entrega CRUD + listagem por Categoria + gestão de **elegibilidade**
 * (quais Usuários E Grupos podem ver/aplicar recursos marcados, via
 * seletor/dropdown — Onda R.1). Aplicação a recursos vive em
 * `/resources/{kind}/{id}/markings`.
 *
 * LOTE1 ELO PAGES (#7): o conteúdo saiu da page (`/painel-de-controle/marcacoes`,
 * agora um redirect) para este componente reusável. A aba "Marcações" do hub
 * Dados o embute (`embedded`), sem CpPageHeader nem RequirePerm próprios — o hub
 * já provê o cabeçalho e o gate. Standalone (`embedded=false`) preserva o
 * CpPageHeader original para os testes que importam o componente.
 */
import * as React from 'react';
import {
  Tag,
  Plus,
  FolderTree,
  X,
  Archive,
  ArchiveRestore,
  Trash2,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { TableCountBadge } from '@/components/data-table/table-count-badge';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { MarkingEligibilityDialog } from '@/components/markings/marking-eligibility-dialog';
import { useT } from '@/lib/i18n/provider';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { Markings, type Marking, type MarkingCategory } from '@/lib/api';

export function MarcacoesVocabWorkspace({ embedded = false }: { embedded?: boolean }) {
  const askConfirm = useConfirm();
  const t = useT();
  const [markings, setMarkings] = React.useState<Marking[] | null>(null);
  const [categories, setCategories] = React.useState<MarkingCategory[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [showCategories, setShowCategories] = React.useState(false);
  const [editing, setEditing] = React.useState<Marking | null>(null);
  const [editingEligibility, setEditingEligibility] = React.useState<Marking | null>(null);
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [usage, setUsage] = React.useState<Record<string, number>>({});

  // Form fields
  const [slug, setSlug] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(() => {
    setErr(null);
    Promise.all([
      Markings.list({ limit: 500, include_archived: includeArchived }),
      Markings.categories.list(),
    ])
      .then(([m, c]) => {
        setMarkings(m);
        setCategories(c);
        // Buscar uso de cada marking em paralelo (lightweight COUNT).
        Promise.all(
          m.map((x) =>
            Markings.usage(x.id)
              .then((u) => [x.id, u.applied_count] as const)
              .catch(() => [x.id, 0] as const),
          ),
        ).then((entries) => {
          const map: Record<string, number> = {};
          for (const [id, count] of entries) map[id] = count;
          setUsage(map);
        });
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar Marcações'));
  }, [includeArchived]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Markings.create({
        slug: slug.trim(),
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        category_id: categoryId || undefined,
      });
      setSlug('');
      setDisplayName('');
      setDescription('');
      setCategoryId('');
      setShowForm(false);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao criar Marcação');
    } finally {
      setBusy(false);
    }
  };

  const labelOfCategory = (cid: string | null) => {
    if (!cid || !categories) return t('marcacoes.noCategory');
    return categories.find((c) => c.id === cid)?.display_name ?? t('marcacoes.noCategory');
  };

  const titleNode = (
    <span className="flex items-center gap-2">
      {t('marcacoes.title')}
      {markings && (
        <TableCountBadge
          total={markings.length}
          filtered={
            filter.trim()
              ? markings.filter((m) => {
                  const q = filter.trim().toLowerCase();
                  return (
                    m.display_name.toLowerCase().includes(q) ||
                    m.slug.toLowerCase().includes(q)
                  );
                }).length
              : undefined
          }
          tone="primary"
        />
      )}
    </span>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowCategories(true)}
        data-testid="marcacoes-categories-open"
        className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
      >
        <FolderTree className="w-3.5 h-3.5" strokeWidth={1.5} />
        {t('marcacoes.categories')}
      </button>
      <button
        type="button"
        onClick={() => setShowForm((v) => !v)}
        data-testid="marcacoes-toggle-create"
        className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
        {showForm ? t('common.cancel') : t('marcacoes.new')}
      </button>
    </div>
  );

  return (
    <>
      {embedded ? (
        <div className="px-6 pt-4 flex items-center justify-end gap-2" data-testid="marcacoes-embedded-toolbar">
          {actions}
        </div>
      ) : (
        <CpPageHeader title={titleNode} subtitle={t('marcacoes.subtitle')} actions={actions} />
      )}
      <div className="p-6 max-w-4xl space-y-4">
        {showForm && (
          <form
            onSubmit={submit}
            data-testid="marcacoes-form"
            className="bg-canvas-light border border-border-light p-4 space-y-3"
          >
            <header className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" strokeWidth={1.5} />
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
                {t('marcacoes.new')}
              </p>
            </header>
            <Field label={t('common.slugLabel')}>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                data-testid="marcacoes-slug"
                placeholder="ex: pii"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
            </Field>
            <Field label={t('common.nameLabel')}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                data-testid="marcacoes-display-name"
                placeholder="PII"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              />
            </Field>
            <Field label={t('common.descriptionLabel')}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                data-testid="marcacoes-description"
                placeholder="Informações pessoais identificáveis"
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              />
            </Field>
            <Field label={t('marcacoes.categoryOptional')}>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                data-testid="marcacoes-category"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              >
                <option value="">{t('marcacoes.noCategoryOption')}</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} ({c.mode === 'disjunctive' ? t('common.modeOr') : t('common.modeAnd')})
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={busy}
                data-testid="marcacoes-submit"
                className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? t('common.creating') : t('marcacoes.createSubmit')}
              </button>
            </div>
          </form>
        )}

        {err && (
          <CpErrorState
            title={t('marcacoes.errorLoad')}
            description={err}
            retry={refresh}
          />
        )}
        {!markings && !err && <CpSkeleton rows={4} />}
        {markings && (
          <div className="flex items-center gap-3" data-testid="marcacoes-toolbar">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('common.filterNameSlug')}
              data-testid="marcacoes-filter"
              className="flex-1 h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-muted-on-light">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                data-testid="marcacoes-include-archived"
              />
              {t('marcacoes.includeArchived')}
            </label>
          </div>
        )}
        {markings && markings.length === 0 && (
          <CpEmptyState
            icon={Tag}
            title={t('marcacoes.emptyTitle')}
            description={t('marcacoes.emptyDesc')}
            cta={{
              label: t('marcacoes.emptyCta'),
              onClick: () => setShowForm(true),
              testId: 'marcacoes-empty-cta',
            }}
            secondary={{
              label: t('marcacoes.emptyCats'),
              onClick: () => setShowCategories(true),
              testId: 'marcacoes-empty-cats',
            }}
          />
        )}
        {markings && markings.length > 0 && (
          <ul className="space-y-2" data-testid="marcacoes-list">
            {markings
              .filter((m) => {
                if (!filter.trim()) return true;
                const q = filter.trim().toLowerCase();
                return (
                  m.display_name.toLowerCase().includes(q) ||
                  m.slug.toLowerCase().includes(q)
                );
              })
              .map((m) => {
                const used = usage[m.id] ?? 0;
                const isArchived = !m.active;
                return (
                  <li
                    key={m.id}
                    data-testid={`marcacao-${m.slug}`}
                    className={`bg-canvas-light border border-border-light p-3 flex items-start gap-3 ${
                      isArchived ? 'opacity-60' : ''
                    }`}
                  >
                    <span className="inline-flex w-9 h-9 items-center justify-center bg-white border border-border-light shrink-0">
                      <Tag className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-text-on-light truncate">
                          {m.display_name}
                        </p>
                        <span className="text-[10px] font-mono text-muted-on-light">
                          {m.slug}
                        </span>
                        {isArchived && (
                          <span className="text-[10px] font-mono bg-canvas-light border border-border-light px-1.5 h-4 inline-flex items-center text-muted-on-light uppercase">
                            {t('marcacoes.archivedBadge')}
                          </span>
                        )}
                        {used > 0 && (
                          <span
                            data-testid={`marcacao-usage-${m.slug}`}
                            className="text-[10px] font-mono bg-white border border-border-light px-1.5 h-4 inline-flex items-center text-primary"
                          >
                            {t('marcacoes.usageBadge')
                              .replace('{n}', String(used))
                              .replace('{plural}', used === 1 ? '' : 's')}
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <p className="text-[11.5px] text-muted-on-light mt-0.5">
                          {m.description}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-on-light mt-1 font-mono">
                        {t('marcacoes.categoryPrefix')} {labelOfCategory(m.category_id)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton
                        title={t('marcacoes.eligibility.open')}
                        onClick={() => setEditingEligibility(m)}
                        testId={`marcacao-eligibility-${m.slug}`}
                      >
                        <ShieldCheck className="w-3 h-3" strokeWidth={1.5} />
                      </IconButton>
                      <IconButton
                        title={t('common.edit')}
                        onClick={() => setEditing(m)}
                        testId={`marcacao-edit-${m.slug}`}
                      >
                        <Pencil className="w-3 h-3" strokeWidth={1.5} />
                      </IconButton>
                      {isArchived ? (
                        <IconButton
                          title={t('common.restore')}
                          onClick={async () => {
                            try {
                              await Markings.unarchive(m.id);
                              refresh();
                            } catch (e) {
                              setErr((e as Error)?.message ?? 'Falha ao restaurar');
                            }
                          }}
                          testId={`marcacao-unarchive-${m.slug}`}
                        >
                          <ArchiveRestore className="w-3 h-3" strokeWidth={1.5} />
                        </IconButton>
                      ) : (
                        <IconButton
                          title={t('marcacoes.archiveTitleHint')}
                          onClick={async () => {
                            const ok = await askConfirm({
                              title: t('marcacoes.archiveTitle').replace(
                                '{name}',
                                m.display_name,
                              ),
                              description: t('marcacoes.archiveDesc'),
                              tone: 'warning',
                              confirmLabel: t('common.archive'),
                            });
                            if (!ok) return;
                            try {
                              await Markings.archive(m.id);
                              refresh();
                            } catch (e) {
                              setErr((e as Error)?.message ?? 'Falha ao arquivar');
                            }
                          }}
                          testId={`marcacao-archive-${m.slug}`}
                        >
                          <Archive className="w-3 h-3" strokeWidth={1.5} />
                        </IconButton>
                      )}
                      <IconButton
                        title={
                          used > 0
                            ? t('marcacoes.deleteBlockedTitle').replace('{n}', String(used))
                            : t('marcacoes.deleteTitleHint')
                        }
                        onClick={async () => {
                          if (used > 0) return;
                          const ok = await askConfirm({
                            title: t('marcacoes.deleteTitle').replace('{name}', m.display_name),
                            description: t('marcacoes.deleteDesc'),
                            tone: 'danger',
                            confirmLabel: t('marcacoes.deleteConfirmLabel'),
                            requireConfirmText: m.slug,
                          });
                          if (!ok) return;
                          try {
                            await Markings.delete(m.id);
                            refresh();
                          } catch (e) {
                            setErr((e as Error)?.message ?? 'Falha ao deletar');
                          }
                        }}
                        disabled={used > 0}
                        testId={`marcacao-delete-${m.slug}`}
                        danger
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {editing && (
        <EditMarkingDialog
          marking={editing}
          categories={categories ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {editingEligibility && (
        <MarkingEligibilityDialog
          marking={editingEligibility}
          onClose={() => setEditingEligibility(null)}
        />
      )}

      {showCategories && (
        <CategoriesDialog
          onClose={() => setShowCategories(false)}
          onChanged={() => {
            refresh();
          }}
        />
      )}
    </>
  );
}

function CategoriesDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [cats, setCats] = React.useState<MarkingCategory[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [cSlug, setCSlug] = React.useState('');
  const [cName, setCName] = React.useState('');
  const [cDesc, setCDesc] = React.useState('');
  const [cMode, setCMode] = React.useState<'conjunctive' | 'disjunctive'>('conjunctive');

  const refresh = React.useCallback(() => {
    setErr(null);
    Markings.categories
      .list()
      .then(setCats)
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar Categorias'));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cSlug.trim() || !cName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Markings.categories.create({
        slug: cSlug.trim(),
        display_name: cName.trim(),
        description: cDesc.trim() || undefined,
        mode: cMode,
      });
      setCSlug('');
      setCName('');
      setCDesc('');
      setCMode('conjunctive');
      setShowForm(false);
      refresh();
      onChanged();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao criar Categoria');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="categories-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-white border border-border-light shadow-2xl text-text-on-light max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2 sticky top-0 bg-white z-10">
          <FolderTree className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">
            {t('marcacoes.catsTitle')}
          </h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            data-testid="categories-toggle-create"
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" strokeWidth={1.5} />
            {showForm ? t('common.cancel') : t('marcacoes.catsNew')}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          {showForm && (
            <form
              onSubmit={submit}
              data-testid="categories-form"
              className="bg-canvas-light border border-border-light p-3 space-y-2"
            >
              <Field label={t('common.slugLabel')}>
                <input
                  type="text"
                  value={cSlug}
                  onChange={(e) => setCSlug(e.target.value)}
                  required
                  data-testid="categories-slug"
                  placeholder="ex: sensibilidade"
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
                />
              </Field>
              <Field label={t('common.nameLabel')}>
                <input
                  type="text"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  required
                  data-testid="categories-name"
                  placeholder="Sensibilidade do dado"
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                />
              </Field>
              <Field label={t('common.descriptionLabel')}>
                <textarea
                  value={cDesc}
                  onChange={(e) => setCDesc(e.target.value)}
                  rows={2}
                  data-testid="categories-desc"
                  className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                />
              </Field>
              <Field label={t('marcacoes.catsModeLabel')}>
                <select
                  value={cMode}
                  onChange={(e) => setCMode(e.target.value as 'conjunctive' | 'disjunctive')}
                  data-testid="categories-mode"
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                >
                  <option value="conjunctive">{t('marcacoes.catsModeConjunctive')}</option>
                  <option value="disjunctive">{t('marcacoes.catsModeDisjunctive')}</option>
                </select>
              </Field>
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  data-testid="categories-submit"
                  className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {busy ? t('common.creating') : t('marcacoes.catsCreateSubmit')}
                </button>
              </div>
            </form>
          )}

          {err && (
            <p className="text-[11px] text-danger font-mono" data-testid="categories-error">
              {err}
            </p>
          )}
          {!cats && !err && (
            <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
          )}
          {cats && cats.length === 0 && (
            <p
              data-testid="categories-empty"
              className="text-[11.5px] text-muted-on-light italic"
            >
              {t('marcacoes.catsEmpty')}
            </p>
          )}
          {cats && cats.length > 0 && (
            <ul data-testid="categories-list" className="space-y-1">
              {cats.map((c) => (
                <li
                  key={c.id}
                  data-testid={`category-${c.slug}`}
                  className="bg-canvas-light border border-border-light px-3 py-2 flex items-center gap-2"
                >
                  <FolderTree className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold truncate">
                      {c.display_name}
                    </p>
                    {c.description && (
                      <p className="text-[10.5px] text-muted-on-light truncate">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted-on-light">
                    {c.slug}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 h-4 inline-flex items-center border ${
                      c.mode === 'disjunctive'
                        ? 'border-warning text-warning'
                        : 'border-border-light text-muted-on-light'
                    }`}
                  >
                    {c.mode === 'disjunctive' ? t('common.modeOr') : t('common.modeAnd')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        {label}
      </p>
      {children}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  testId,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  testId: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      data-testid={testId}
      className={`h-7 w-7 flex items-center justify-center bg-white border border-border-light disabled:opacity-30 disabled:cursor-not-allowed ${
        danger ? 'hover:border-danger hover:text-danger' : 'hover:border-primary'
      }`}
    >
      {children}
    </button>
  );
}

function EditMarkingDialog({
  marking,
  categories,
  onClose,
  onSaved,
}: {
  marking: Marking;
  categories: MarkingCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [displayName, setDisplayName] = React.useState(marking.display_name);
  const [description, setDescription] = React.useState(marking.description ?? '');
  const [categoryId, setCategoryId] = React.useState(marking.category_id ?? '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Markings.update(marking.id, {
        display_name: displayName.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="edit-marking-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <Pencil className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">
            {t('marcacoes.editTitle').replace('{name}', marking.display_name)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>
        <form onSubmit={save} className="p-4 space-y-3">
          <Field label={t('common.nameLabel')}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              data-testid="edit-marking-name"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
          </Field>
          <Field label={t('common.descriptionLabel')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="edit-marking-desc"
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
          </Field>
          <Field label={t('marcacoes.categoryLabel')}>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              data-testid="edit-marking-category"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            >
              <option value="">{t('marcacoes.noCategoryOption')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name} ({c.mode === 'disjunctive' ? 'OU' : 'E'})
                </option>
              ))}
            </select>
          </Field>
          {err && (
            <p
              className="text-[11px] text-danger font-mono"
              data-testid="edit-marking-error"
            >
              {err}
            </p>
          )}
          <p className="text-[10.5px] text-muted-on-light italic">
            {t('marcacoes.editSlugHint')}
          </p>
          <div className="flex items-center gap-2 pt-2 border-t border-border-light">
            <button
              type="submit"
              disabled={busy}
              data-testid="edit-marking-save"
              className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
}
