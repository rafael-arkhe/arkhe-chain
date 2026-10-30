'use client';

/**
 * Operações — Painel de Controle (Sprint Foundry-A + E · 2026-05-22).
 *
 * Lista de Operações (Foundry: Projects) do tenant + botão "Restrições"
 * por linha que abre dialog inline pra configurar:
 *   - mode: nenhuma | permitidas | proibidas
 *   - markings: subset do vocabulário do tenant
 *   - classification_ceiling: opcional (LAI)
 *
 * Gated por `project.read` (listar) + `project.constraints.read`/`configure`
 * (ver/editar restrições). Audit emitido em cada save.
 */
import * as React from 'react';
import {
  FolderSearch,
  Settings2,
  X,
  Plus,
  Pencil,
  Trash2,
  ArchiveRestore,
  ShieldAlert,
  ListChecks,
} from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useCan } from '@/lib/auth/useAuth';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { TableCountBadge } from '@/components/data-table/table-count-badge';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';
import {
  Markings,
  Projects,
  type Marking,
  type ProjectListItem,
  type ProjectConstraintData,
  type RevalidateReport,
} from '@/lib/api';
import { CLASSIFICATION_LABEL, type ClassificationLevel } from '@/lib/classification';

type Mode = 'none' | 'allowed' | 'prohibited';

const MODE_LABEL_KEY: Record<Mode, string> = {
  none: 'operacoes.modeNone',
  allowed: 'operacoes.modeAllowed',
  prohibited: 'operacoes.modeProhibited',
};

export default function OperacoesPage() {
  const askConfirm = useConfirm();
  const t = useT();
  const [projects, setProjects] = React.useState<ProjectListItem[] | null>(null);
  const [markings, setMarkings] = React.useState<Marking[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [editingProject, setEditingProject] = React.useState<ProjectListItem | null>(null);
  const [editingMeta, setEditingMeta] = React.useState<ProjectListItem | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [filter, setFilter] = React.useState('');

  const [salasCount, setSalasCount] = React.useState<Record<string, number>>({});

  const refresh = React.useCallback(() => {
    setErr(null);
    Promise.all([
      Projects.list({ include_inactive: includeInactive }),
      Markings.list({ limit: 500 }),
    ])
      .then(async ([p, m]) => {
        setProjects(p);
        setMarkings(m);
        // Sprint UX-3.2: contagem de Salas por Operação.
        const entries = await Promise.all(
          p.map((proj) =>
            Projects.workspaces(proj.id)
              .then((ws) => [proj.id, ws.length] as const)
              .catch(() => [proj.id, 0] as const),
          ),
        );
        const map: Record<string, number> = {};
        for (const [id, count] of entries) map[id] = count;
        setSalasCount(map);
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar Operações'));
  }, [includeInactive]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <RequirePerm perm="project.read">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            {t('operacoes.title')}
            {projects && <TableCountBadge total={projects.length} tone="primary" />}
          </span>
        }
        subtitle={t('operacoes.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            data-testid="operacoes-create"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            {t('operacoes.new')}
          </button>
        }
      />
      <div className="p-6 max-w-4xl space-y-4">
        {err && (
          <CpErrorState
            title={t('operacoes.errorLoad')}
            description={err}
            retry={refresh}
          />
        )}
        {projects && (
          <div
            className="flex items-center gap-3"
            data-testid="operacoes-toolbar"
          >
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('common.filterNameSlug')}
              data-testid="operacoes-filter"
              className="flex-1 h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-muted-on-light">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                data-testid="operacoes-include-inactive"
              />
              {t('operacoes.includeInactive')}
            </label>
          </div>
        )}
        {!projects && !err && <CpSkeleton rows={3} />}
        {projects && projects.length === 0 && (
          <CpEmptyState
            icon={FolderSearch}
            title={t('operacoes.emptyTitle')}
            description={t('operacoes.emptyDesc')}
            cta={{
              label: t('operacoes.emptyCta'),
              onClick: () => setShowCreate(true),
              testId: 'operacoes-empty-cta',
            }}
          />
        )}
        {projects && projects.length > 0 && (
          <ul className="space-y-2" data-testid="operacoes-list">
            {projects
              .filter((p) => {
                if (!filter.trim()) return true;
                const q = filter.trim().toLowerCase();
                return (
                  p.display_name.toLowerCase().includes(q) ||
                  p.slug.toLowerCase().includes(q)
                );
              })
              .map((p) => (
              <li
                key={p.id}
                data-testid={`operacao-${p.slug}`}
                className={`bg-canvas-light border border-border-light p-3 flex items-start gap-3 ${
                  !p.active ? 'opacity-60' : ''
                }`}
              >
                <span className="inline-flex w-9 h-9 items-center justify-center bg-white border border-border-light shrink-0">
                  <FolderSearch className="w-4 h-4 text-primary" strokeWidth={1.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-text-on-light truncate">
                      {p.display_name}
                    </p>
                    <span className="text-[10px] font-mono text-muted-on-light">
                      {p.slug}
                    </span>
                    {!p.active && (
                      <span className="text-[10px] font-mono bg-canvas-light border border-border-light px-1.5 h-4 inline-flex items-center text-muted-on-light uppercase">
                        {t('common.inactiveBadge')}
                      </span>
                    )}
                    {salasCount[p.id] > 0 && (
                      <span
                        data-testid={`operacao-salas-count-${p.slug}`}
                        className="text-[10px] font-mono bg-white border border-border-light px-1.5 h-4 inline-flex items-center text-primary"
                      >
                        {t('operacoes.salasCount')
                          .replace('{n}', String(salasCount[p.id]))
                          .replace('{plural}', salasCount[p.id] === 1 ? '' : 's')}
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-[11.5px] text-muted-on-light mt-0.5">
                      {p.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingMeta(p)}
                    data-testid={`operacao-edit-${p.slug}`}
                    className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
                  >
                    <Pencil className="w-3 h-3" strokeWidth={1.5} />
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingProject(p)}
                    data-testid={`operacao-restricoes-${p.slug}`}
                    className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
                  >
                    <Settings2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    {t('operacoes.restricoes')}
                  </button>
                  {p.active ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await askConfirm({
                          title: t('operacoes.deactivateTitle').replace(
                            '{name}',
                            p.display_name,
                          ),
                          description: t('operacoes.deactivateDesc'),
                          tone: 'warning',
                          confirmLabel: t('common.deactivate'),
                        });
                        if (!ok) return;
                        try {
                          await Projects.softDelete(p.id);
                          refresh();
                        } catch (e) {
                          setErr((e as Error)?.message ?? 'Falha ao desativar');
                        }
                      }}
                      aria-label={t('common.deactivate')}
                      title={t('common.deactivate')}
                      data-testid={`operacao-deactivate-${p.slug}`}
                      className="h-7 w-7 flex items-center justify-center bg-white border border-border-light hover:border-danger hover:text-danger"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await Projects.update(p.id, { active: true });
                          refresh();
                        } catch (e) {
                          setErr((e as Error)?.message ?? 'Falha ao reativar');
                        }
                      }}
                      aria-label={t('common.reactivate')}
                      title={t('common.reactivate')}
                      data-testid={`operacao-reactivate-${p.slug}`}
                      className="h-7 w-7 flex items-center justify-center bg-white border border-border-light hover:border-primary"
                    >
                      <ArchiveRestore className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editingProject && markings && (
        <ConstraintsDialog
          project={editingProject}
          markings={markings}
          onClose={() => setEditingProject(null)}
        />
      )}

      {showCreate && (
        <CreateOperacaoDialog
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}

      {editingMeta && (
        <EditOperacaoDialog
          project={editingMeta}
          onClose={() => setEditingMeta(null)}
          onSaved={() => {
            setEditingMeta(null);
            refresh();
          }}
        />
      )}
    </RequirePerm>
  );
}

function CreateOperacaoDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [slug, setSlug] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Projects.create({
        slug: slug.trim(),
        display_name: displayName.trim(),
        description: description.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao criar Operação');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OperacaoDialogShell title={t('operacoes.createTitle')} onClose={onClose}>
      <form onSubmit={save} className="p-4 space-y-3">
        <OpField label={t('common.slugLabel')}>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            data-testid="operacao-new-slug"
            placeholder="ex: aurora"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
          />
        </OpField>
        <OpField label={t('common.nameLabel')}>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            data-testid="operacao-new-name"
            placeholder="Operação Aurora"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          />
        </OpField>
        <OpField label={t('common.descriptionLabel')}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            data-testid="operacao-new-desc"
            className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          />
        </OpField>
        {err && (
          <p
            className="text-[11px] text-danger font-mono"
            data-testid="operacao-new-error"
          >
            {err}
          </p>
        )}
        <div className="flex items-center gap-2 pt-2 border-t border-border-light">
          <button
            type="submit"
            disabled={busy}
            data-testid="operacao-new-submit"
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? t('common.creating') : t('operacoes.createSubmit')}
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
    </OperacaoDialogShell>
  );
}

function EditOperacaoDialog({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [displayName, setDisplayName] = React.useState(project.display_name);
  const [description, setDescription] = React.useState(project.description ?? '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Projects.update(project.id, {
        display_name: displayName.trim(),
        description: description.trim() || null,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OperacaoDialogShell
      title={t('marcacoes.editTitle').replace('{name}', project.display_name)}
      onClose={onClose}
    >
      <form onSubmit={save} className="p-4 space-y-3">
        <OpField label={t('common.nameLabel')}>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            data-testid="operacao-edit-name"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          />
        </OpField>
        <OpField label={t('common.descriptionLabel')}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            data-testid="operacao-edit-desc"
            className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          />
        </OpField>
        {err && (
          <p
            className="text-[11px] text-danger font-mono"
            data-testid="operacao-edit-error"
          >
            {err}
          </p>
        )}
        <p className="text-[10.5px] text-muted-on-light italic">
          {t('operacoes.editSlugHint')}
        </p>
        <div className="flex items-center gap-2 pt-2 border-t border-border-light">
          <button
            type="submit"
            disabled={busy}
            data-testid="operacao-edit-submit"
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
    </OperacaoDialogShell>
  );
}

function OperacaoDialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="operacao-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <FolderSearch className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>
        {children}
      </div>
    </div>
    </ModalPortal>
  );
}

function OpField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        {label}
      </p>
      {children}
    </div>
  );
}

function ConstraintsDialog({
  project,
  markings,
  onClose,
}: {
  project: ProjectListItem;
  markings: Marking[];
  onClose: () => void;
}) {
  const t = useT();
  const canRevalidate = useCan('project.constraints.revalidate');
  const [data, setData] = React.useState<ProjectConstraintData | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [revalidating, setRevalidating] = React.useState(false);
  const [report, setReport] = React.useState<RevalidateReport | null>(null);

  React.useEffect(() => {
    Projects.constraints
      .get(project.id)
      .then(setData)
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar'));
  }, [project.id]);

  const revalidate = async () => {
    setRevalidating(true);
    setErr(null);
    try {
      const r = await Projects.constraints.revalidate(project.id);
      setReport(r);
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao revalidar');
    } finally {
      setRevalidating(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      await Projects.constraints.put(project.id, {
        mode: data.mode,
        markings: data.markings,
        classification_ceiling: data.classification_ceiling,
      });
      onClose();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const toggleMarking = (id: string) => {
    if (!data) return;
    const next = data.markings.includes(id)
      ? data.markings.filter((x) => x !== id)
      : [...data.markings, id];
    setData({ ...data, markings: next });
  };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="restricoes-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">
            {t('operacoes.constraintsTitle').replace('{name}', project.display_name)}
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

        <form onSubmit={save} className="p-4 space-y-4">
          {!data && !err && (
            <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
          )}
          {err && (
            <p className="text-[11px] text-danger font-mono" data-testid="restricoes-error">
              {err}
            </p>
          )}
          {data && (
            <>
              <Field label={t('operacoes.modeLabel')}>
                <select
                  value={data.mode}
                  onChange={(e) => setData({ ...data, mode: e.target.value as Mode })}
                  data-testid="restricoes-mode"
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                >
                  {(Object.keys(MODE_LABEL_KEY) as Mode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {t(MODE_LABEL_KEY[mode])}
                    </option>
                  ))}
                </select>
              </Field>

              {data.mode !== 'none' && (
                <Field label={t('operacoes.markingsLabel')}>
                  <div
                    data-testid="restricoes-markings"
                    className="max-h-[200px] overflow-y-auto border border-border-light p-2 space-y-1"
                  >
                    {markings.length === 0 ? (
                      <p className="text-[10.5px] text-muted-on-light italic">
                        {t('operacoes.markingsEmpty')}
                      </p>
                    ) : (
                      markings.map((m) => (
                        <label
                          key={m.id}
                          className="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-canvas-light px-1.5 py-1"
                        >
                          <input
                            type="checkbox"
                            checked={data.markings.includes(m.id)}
                            onChange={() => toggleMarking(m.id)}
                            data-testid={`restricoes-marking-${m.slug}`}
                          />
                          <span className="flex-1 truncate">{m.display_name}</span>
                          <span className="text-[10px] font-mono text-muted-on-light">
                            {m.slug}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </Field>
              )}

              <Field label={t('operacoes.ceilingLabel')}>
                <select
                  value={data.classification_ceiling ?? ''}
                  onChange={(e) =>
                    setData({
                      ...data,
                      classification_ceiling:
                        (e.target.value as ClassificationLevel) || null,
                    })
                  }
                  data-testid="restricoes-ceiling"
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                >
                  <option value="">{t('operacoes.ceilingNone')}</option>
                  {(['publico', 'restrito', 'confidencial', 'sigiloso'] as ClassificationLevel[]).map(
                    (lvl) => (
                      <option key={lvl} value={lvl}>
                        {CLASSIFICATION_LABEL[lvl]}
                      </option>
                    ),
                  )}
                </select>
              </Field>

              {data.mode !== 'none' && canRevalidate && (
                <div className="pt-2 border-t border-border-light space-y-2">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={revalidate}
                      disabled={revalidating}
                      data-testid="restricoes-revalidate"
                      className="h-8 px-3 text-[12px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <ListChecks className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {revalidating
                        ? t('operacoes.revalidateRunning')
                        : t('operacoes.revalidate')}
                    </button>
                    <p className="text-[10.5px] text-muted-on-light leading-snug flex-1">
                      {t('operacoes.revalidateHint')}
                    </p>
                  </div>

                  {report && report.violation_count === 0 && (
                    <p
                      className="text-[11.5px] text-text-on-light bg-canvas-light border border-border-light px-2.5 py-1.5"
                      data-testid="restricoes-revalidate-clean"
                    >
                      {t('operacoes.revalidateClean').replace(
                        '{n}',
                        String(report.total_checked),
                      )}
                    </p>
                  )}

                  {report && report.violation_count > 0 && (
                    <div
                      data-testid="restricoes-revalidate-violations"
                      className="border border-danger/40 bg-danger/5"
                    >
                      <p className="text-[11.5px] text-danger font-semibold px-2.5 py-1.5 flex items-center gap-1.5 border-b border-danger/30">
                        <ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {t('operacoes.revalidateSummary')
                          .replace('{v}', String(report.violation_count))
                          .replace('{n}', String(report.total_checked))}
                      </p>
                      <ul className="max-h-[180px] overflow-y-auto divide-y divide-border-light">
                        {report.violations.map((v, i) => (
                          <li
                            key={`${v.resource_kind}-${v.resource_id}-${v.marking_id}-${i}`}
                            data-testid={`restricoes-violation-${v.marking_slug}`}
                            className="px-2.5 py-1.5 flex items-center gap-2 text-[12px]"
                          >
                            <span className="flex-1 truncate text-text-on-light">
                              {v.marking_display_name}
                              <span className="text-[10px] font-mono text-muted-on-light ml-1.5">
                                {v.marking_slug}
                              </span>
                            </span>
                            <span className="text-[10px] text-muted-on-light shrink-0">
                              {v.resource_kind === 'data_asset'
                                ? t('operacoes.violationOnAsset')
                                : t('operacoes.violationOnProject')}
                            </span>
                            <span className="text-[10px] font-mono uppercase tracking-wide text-danger border border-danger/40 px-1.5 h-4 inline-flex items-center shrink-0">
                              {v.violation === 'prohibited'
                                ? t('operacoes.violationProhibited')
                                : t('operacoes.violationNotAllowed')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-border-light">
                <button
                  type="submit"
                  disabled={busy}
                  data-testid="restricoes-save"
                  className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {busy ? t('common.saving') : t('operacoes.saveConstraints')}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </>
          )}
        </form>
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
