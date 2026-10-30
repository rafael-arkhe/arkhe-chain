'use client';

/**
 * Tours — Painel de Controle (Wave H.1 · 2026-05-23).
 *
 * Refazimento UX operacional:
 *  - Card por Tour mostra:
 *      • Badge de status (Rascunho / Ativo / Arquivado) com tom
 *      • View counters "N / M operadores viram" (link → lista)
 *      • Quando aparece (path/data) — explicação inline humana
 *      • Botão "Pré-visualizar" — abre overlay simulando o tour real
 *  - Editor virou wizard 3 passos:
 *      1. Páginas        — título + descrição + media + doc + target CSS
 *      2. Conteúdo       — texto markdown-ish por slide (reordenável)
 *      3. Trigger        — start_at / end_at + target_pages + audience
 *  - "Testar agora" no editor abre preview no estado corrente
 *
 * Honra DS:
 *   - feedback_no_rounded_no_sparkles · ZERO rounded
 *   - feedback_no_emojis_in_ui · ZERO emoji
 *   - feedback_no_palantir_product_names
 *   - aria-live em counters
 */
import * as React from 'react';
import {
  Archive,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  Filter,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { OPERACIONAL_SALAS_TABS } from '@/components/control-panel/hub-tabs';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';
import { toast } from '@/components/ui/toast';
import { TourPreview } from '@/components/tours/tour-preview';
import {
  Groups,
  Workspaces,
  WorkspaceUpdates,
  type Group,
  type TourAudience,
  type TourEligibleUser,
  type TourPageInput,
  type TourTrigger,
  type TourViewCount,
  type Workspace,
  type WorkspaceUpdate,
} from '@/lib/api';

export default function ToursPage() {
  const askConfirm = useConfirm();
  const t = useT();
  const [salas, setSalas] = React.useState<Workspace[] | null>(null);
  const [salaId, setSalaId] = React.useState<string>('');
  const [tours, setTours] = React.useState<WorkspaceUpdate[]>([]);
  const [editing, setEditing] = React.useState<WorkspaceUpdate | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [viewCounts, setViewCounts] = React.useState<Record<string, TourViewCount>>({});
  const [eligibleOf, setEligibleOf] = React.useState<WorkspaceUpdate | null>(null);
  const [previewOf, setPreviewOf] = React.useState<WorkspaceUpdate | null>(null);

  React.useEffect(() => {
    Workspaces.list({ limit: 500 })
      .then((rows) => {
        setSalas(rows);
        if (rows.length > 0 && !salaId) setSalaId(rows[0].id);
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar Salas'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshTours = React.useCallback(() => {
    if (!salaId) return;
    setErr(null);
    WorkspaceUpdates.list(salaId, { include_archived: includeArchived })
      .then(async (rows) => {
        setTours(rows);
        // Fetch view-count em paralelo (lightweight; cache-friendly).
        const entries = await Promise.all(
          rows.map((t) =>
            WorkspaceUpdates.viewCount(salaId, t.id)
              .then((vc) => [t.id, vc] as const)
              .catch(() => [t.id, { viewed: 0, total_eligible: 0 }] as const),
          ),
        );
        const map: Record<string, TourViewCount> = {};
        for (const [id, vc] of entries) map[id] = vc;
        setViewCounts(map);
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar Tours'));
  }, [salaId, includeArchived]);

  React.useEffect(() => {
    refreshTours();
  }, [refreshTours]);

  const archive = async (tour: WorkspaceUpdate) => {
    const ok = await askConfirm({
      title: t('tours.archiveTitle').replace('{name}', tour.title),
      description: t('tours.archiveDesc'),
      tone: 'warning',
      confirmLabel: t('common.archive'),
    });
    if (!ok) return;
    try {
      await WorkspaceUpdates.archive(salaId, tour.id);
      toast.success(t('tours.statusArchived'));
      refreshTours();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao arquivar');
    }
  };

  const hardDelete = async (tour: WorkspaceUpdate) => {
    const ok = await askConfirm({
      title: t('tours.deleteTitle').replace('{name}', tour.title),
      description: t('tours.deleteDesc'),
      tone: 'danger',
      confirmLabel: t('tours.deleteConfirmLabel'),
      requireConfirmText: tour.title,
    });
    if (!ok) return;
    try {
      await WorkspaceUpdates.delete(salaId, tour.id);
      toast.success(t('common.delete'));
      refreshTours();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao deletar');
    }
  };

  const selectedSala = (salas ?? []).find((s) => s.id === salaId) ?? null;

  return (
    <RequirePerm perm="workspace.update.read">
      <CpPageHeader
        title={t('tours.title')}
        subtitle={t('tours.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={!salaId}
            data-testid="tours-create"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary disabled:opacity-50 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            {t('tours.new')}
          </button>
        }
      />
      <CpHubSubnav group="Salas" tabs={OPERACIONAL_SALAS_TABS} />

      <div className="p-6 max-w-4xl space-y-4">
        <section className="bg-canvas-light border border-border-light p-4 space-y-3">
          <header className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" strokeWidth={1.5} />
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
              {t('tours.salaHeader')}
            </p>
          </header>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={salaId}
              onChange={(e) => setSalaId(e.target.value)}
              data-testid="tours-sala"
              className="flex-1 min-w-[280px] h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            >
              <option value="">{t('tours.chooseSala')}</option>
              {(salas ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name} ({s.slug})
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-on-light">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                data-testid="tours-include-archived"
              />
              {t('tours.includeArchived')}
            </label>
          </div>
        </section>

        {err && (
          <p className="text-[11px] text-danger font-mono" data-testid="tours-error">
            {err}
          </p>
        )}

        {salaId && tours.length === 0 && (
          <p data-testid="tours-empty" className="text-[11.5px] text-muted-on-light italic">
            {includeArchived ? t('tours.emptyAll') : t('tours.emptyActive')}
          </p>
        )}
        {tours.length > 0 && (
          <ul className="space-y-2" data-testid="tours-list">
            {tours.map((t) => (
              <TourCard
                key={t.id}
                tour={t}
                salaSlug={selectedSala?.slug}
                viewCount={viewCounts[t.id] ?? { viewed: 0, total_eligible: 0 }}
                onEdit={() => setEditing(t)}
                onArchive={() => archive(t)}
                onDelete={() => hardDelete(t)}
                onPreview={() => setPreviewOf(t)}
                onShowEligible={() => setEligibleOf(t)}
              />
            ))}
          </ul>
        )}
      </div>

      {(creating || editing) && (
        <TourEditor
          workspaceId={salaId}
          tour={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refreshTours();
          }}
        />
      )}

      {eligibleOf && (
        <EligibleUsersDialog
          workspaceId={salaId}
          tour={eligibleOf}
          onClose={() => setEligibleOf(null)}
        />
      )}

      {previewOf && (
        <TourPreview
          title={previewOf.title}
          summary={previewOf.summary}
          pages={previewOf.pages}
          previewOnly
          onClose={() => setPreviewOf(null)}
        />
      )}
    </RequirePerm>
  );
}

// ─── Card per Tour ──────────────────────────────────────────────────────────

function TourCard({
  tour,
  salaSlug,
  viewCount,
  onEdit,
  onArchive,
  onDelete,
  onPreview,
  onShowEligible,
}: {
  tour: WorkspaceUpdate;
  salaSlug?: string;
  viewCount: TourViewCount;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onShowEligible: () => void;
}) {
  const t = useT();
  const status = computeStatus(tour);
  const visibility = describeVisibility(tour, salaSlug, t);
  return (
    <li
      data-testid={`tour-${tour.id}`}
      className="bg-canvas-light border border-border-light p-3 flex items-start gap-3"
    >
      <span className="inline-flex w-9 h-9 items-center justify-center bg-white border border-border-light shrink-0">
        <BookOpen className="w-4 h-4 text-primary" strokeWidth={1.5} />
      </span>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-text-on-light truncate">
            {tour.title}
          </p>
          <StatusBadge status={status} testId={`tour-status-${tour.id}`} t={t} />
          <span className="text-[10px] font-mono bg-white border border-border-light px-1.5 h-4 inline-flex items-center">
            {tour.pages.length}p
          </span>
        </div>
        {tour.summary && (
          <p className="text-[11.5px] text-muted-on-light">{tour.summary}</p>
        )}
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-on-light">
          <button
            type="button"
            onClick={onShowEligible}
            data-testid={`tour-view-counts-${tour.id}`}
            aria-live="polite"
            className="inline-flex items-center gap-1.5 hover:text-primary"
          >
            <Eye className="w-3 h-3" strokeWidth={1.5} />
            {t('tours.viewCounts')
              .replace('{viewed}', String(viewCount.viewed))
              .replace('{total}', String(viewCount.total_eligible))}
          </button>
          <span
            data-testid={`tour-visibility-${tour.id}`}
            className="inline-flex items-center gap-1.5"
          >
            <Calendar className="w-3 h-3" strokeWidth={1.5} />
            {visibility}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onPreview}
          data-testid={`tour-preview-${tour.id}`}
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
        >
          <Eye className="w-3 h-3" strokeWidth={1.5} />
          {t('tours.preview')}
        </button>
        <button
          type="button"
          onClick={onEdit}
          data-testid={`tour-edit-${tour.id}`}
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary"
        >
          {t('common.edit')}
        </button>
        {tour.status === 'active' && (
          <button
            type="button"
            onClick={onArchive}
            data-testid={`tour-archive-${tour.id}`}
            className="h-7 w-7 flex items-center justify-center bg-white border border-border-light hover:border-primary"
            aria-label={t('common.archive')}
            title={t('common.archive')}
          >
            <Archive className="w-3 h-3" strokeWidth={1.5} />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          data-testid={`tour-delete-${tour.id}`}
          className="h-7 w-7 flex items-center justify-center bg-white border border-border-light hover:border-danger hover:text-danger"
          aria-label={t('common.delete')}
          title={t('tours.deleteConfirmLabel')}
        >
          <Trash2 className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>
    </li>
  );
}

type TourStatus = 'draft' | 'active' | 'archived';

function computeStatus(t: WorkspaceUpdate): TourStatus {
  if (t.status === 'archived') return 'archived';
  // Rascunho = sem pages OU sem título com 2+ chars.
  if (!t.pages || t.pages.length === 0) return 'draft';
  return 'active';
}

function StatusBadge({
  status,
  testId,
  t,
}: {
  status: TourStatus;
  testId: string;
  t: (key: string) => string;
}) {
  const map: Record<TourStatus, { label: string; cls: string }> = {
    draft: {
      label: t('tours.statusDraft'),
      cls: 'bg-canvas-light border-border-light text-muted-on-light',
    },
    active: {
      label: t('tours.statusActive'),
      cls: 'bg-white border-primary text-primary',
    },
    archived: {
      label: t('tours.statusArchived'),
      cls: 'bg-canvas-light border-border-light text-muted-on-light',
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      data-testid={testId}
      className={`text-[10px] font-mono border px-1.5 h-4 inline-flex items-center uppercase ${cls}`}
    >
      {label}
    </span>
  );
}

function describeVisibility(
  tour: WorkspaceUpdate,
  salaSlug: string | undefined,
  t: (key: string) => string,
): string {
  const trigger = tour.trigger ?? null;
  const slug = salaSlug ?? 'sala';
  const startTxt = trigger?.start_at ? formatDateBr(trigger.start_at) : null;
  const endTxt = trigger?.end_at ? formatDateBr(trigger.end_at) : null;
  const targets = trigger?.target_pages ?? [];
  const pathScope =
    targets.length > 0
      ? t('tours.visScopeTargets').replace('{pages}', targets.join(', '))
      : t('tours.visScopeRoom').replace('{slug}', slug);
  if (startTxt && endTxt) {
    return t('tours.visFromTo')
      .replace('{scope}', pathScope)
      .replace('{start}', startTxt)
      .replace('{end}', endTxt);
  }
  if (startTxt) {
    return t('tours.visFrom').replace('{scope}', pathScope).replace('{start}', startTxt);
  }
  if (endTxt) {
    return t('tours.visTo').replace('{scope}', pathScope).replace('{end}', endTxt);
  }
  return t('tours.visUntilDismiss').replace('{scope}', pathScope);
}

function formatDateBr(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

// ─── Eligible users dialog ──────────────────────────────────────────────────

function EligibleUsersDialog({
  workspaceId,
  tour,
  onClose,
}: {
  workspaceId: string;
  tour: WorkspaceUpdate;
  onClose: () => void;
}) {
  const t = useT();
  const [list, setList] = React.useState<TourEligibleUser[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    WorkspaceUpdates.eligibleUsers(workspaceId, tour.id)
      .then(setList)
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar'));
  }, [workspaceId, tour.id]);

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="tour-eligible-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-white border border-border-light shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">
            {t('tours.whoSawTitle').replace('{name}', tour.title)}
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
        <div className="p-4 space-y-2">
          {err && (
            <p className="text-[11px] text-danger font-mono">{err}</p>
          )}
          {!list && !err && (
            <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
          )}
          {list && list.length === 0 && (
            <p className="text-[11.5px] text-muted-on-light italic">
              {t('tours.eligibleEmpty')}
            </p>
          )}
          {list && list.length > 0 && (
            <ul data-testid="tour-eligible-list" className="space-y-1">
              {list.map((u) => (
                <li
                  key={u.id}
                  data-testid={`tour-eligible-${u.username}`}
                  className="flex items-center gap-2 bg-canvas-light border border-border-light px-2 py-1.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] truncate">
                      <span className="font-semibold">{u.display_name ?? u.username}</span>
                      <span className="text-muted-on-light"> · {u.username}</span>
                    </p>
                    {u.viewed_at && (
                      <p className="text-[10px] font-mono text-muted-on-light">
                        {t('tours.viewedOn').replace(
                          '{date}',
                          new Date(u.viewed_at).toLocaleString('pt-BR'),
                        )}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-mono border px-1.5 h-4 inline-flex items-center uppercase ${
                      u.viewed
                        ? 'bg-white border-primary text-primary'
                        : 'bg-canvas-light border-border-light text-muted-on-light'
                    }`}
                  >
                    {u.viewed ? t('tours.viewedBadge') : t('tours.pendingBadge')}
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

// ─── Wizard editor (3 steps) ───────────────────────────────────────────────

interface PageDraft {
  title: string;
  description: string;
  media_url: string;
  documentation_url: string;
  target_selector: string;
}

type WizardStep = 'pages' | 'content' | 'trigger';

function TourEditor({
  workspaceId,
  tour,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  tour: WorkspaceUpdate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [step, setStep] = React.useState<WizardStep>('pages');
  const [title, setTitle] = React.useState(tour?.title ?? '');
  const [summary, setSummary] = React.useState(tour?.summary ?? '');
  const [pages, setPages] = React.useState<PageDraft[]>(() => {
    if (tour && tour.pages.length > 0) {
      return tour.pages.map((p) => ({
        title: p.title,
        description: p.description ?? '',
        media_url: p.media_url ?? '',
        documentation_url: p.documentation_url ?? '',
        target_selector: p.target_selector ?? '',
      }));
    }
    return [{ title: '', description: '', media_url: '', documentation_url: '', target_selector: '' }];
  });
  const [audience, setAudience] = React.useState<TourAudience>(() => tour?.audience ?? {});
  const [trigger, setTrigger] = React.useState<TourTrigger>(() => tour?.trigger ?? {});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const addPage = () =>
    setPages((ps) => [
      ...ps,
      { title: '', description: '', media_url: '', documentation_url: '', target_selector: '' },
    ]);
  const removePage = (idx: number) => setPages((ps) => ps.filter((_, i) => i !== idx));
  const movePage = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= pages.length) return;
    setPages((ps) => {
      const next = [...ps];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };
  const updatePage = (idx: number, patch: Partial<PageDraft>) =>
    setPages((ps) => ps.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const validPages = pages.filter((p) => p.title.trim().length > 0);

  const save = async () => {
    if (!title.trim()) {
      setStep('pages');
      setErr(t('tours.errSaveTitle'));
      return;
    }
    if (validPages.length === 0) {
      setStep('pages');
      setErr(t('tours.errSavePage'));
      return;
    }
    const payload: TourPageInput[] = validPages.map((p, idx) => ({
      title: p.title.trim(),
      description: p.description.trim() || undefined,
      media_url: p.media_url.trim() || undefined,
      documentation_url: p.documentation_url.trim() || undefined,
      target_selector: p.target_selector.trim() || undefined,
      ordering: idx,
    }));
    setBusy(true);
    setErr(null);
    try {
      const body = {
        title: title.trim(),
        summary: summary.trim() || undefined,
        pages: payload,
        audience: hasAudience(audience) ? audience : undefined,
        trigger: hasTrigger(trigger) ? trigger : undefined,
      };
      if (tour) {
        await WorkspaceUpdates.patch(workspaceId, tour.id, body);
        toast.success(t('tours.saveChanges'));
      } else {
        await WorkspaceUpdates.create(workspaceId, body);
        toast.success(t('tours.createSubmit'));
      }
      onSaved();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar Tour');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="tour-editor"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[760px] bg-white border border-border-light shadow-2xl text-text-on-light max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2 sticky top-0 bg-white z-10">
          <BookOpen className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">
            {tour ? t('tours.editTitle').replace('{name}', tour.title) : t('tours.new')}
          </h2>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            data-testid="tour-editor-test-now"
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <Eye className="w-3 h-3" strokeWidth={1.5} />
            {t('tours.testNow')}
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

        {/* Wizard stepper */}
        <div className="px-4 pt-3 border-b border-border-light">
          <ol className="flex items-center gap-2" data-testid="tour-wizard-steps">
            <WizardStepBtn
              n={1}
              label={t('tours.stepPages')}
              active={step === 'pages'}
              onClick={() => setStep('pages')}
              testId="tour-wizard-step-pages"
            />
            <ChevronRight className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
            <WizardStepBtn
              n={2}
              label={t('tours.stepContent')}
              active={step === 'content'}
              onClick={() => setStep('content')}
              testId="tour-wizard-step-content"
            />
            <ChevronRight className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
            <WizardStepBtn
              n={3}
              label={t('tours.stepTrigger')}
              active={step === 'trigger'}
              onClick={() => setStep('trigger')}
              testId="tour-wizard-step-trigger"
            />
          </ol>
        </div>

        <div className="p-4 space-y-4">
          {err && (
            <p className="text-[11px] text-danger font-mono" data-testid="tour-error">
              {err}
            </p>
          )}

          {step === 'pages' && (
            <div data-testid="tour-wizard-pages-panel" className="space-y-3">
              <Field label={t('tours.titleLabel')}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  data-testid="tour-title"
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                />
              </Field>
              <Field label={t('tours.summaryLabel')}>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  data-testid="tour-summary"
                  className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                />
              </Field>
              <div className="space-y-2">
                <header className="flex items-center justify-between border-b border-border-light pb-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
                    {t('tours.pagesHeader')}
                  </p>
                  <button
                    type="button"
                    onClick={addPage}
                    data-testid="tour-add-page"
                    className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" strokeWidth={1.5} />
                    {t('tours.addPage')}
                  </button>
                </header>
                {pages.map((p, idx) => (
                  <PageRow
                    key={idx}
                    idx={idx}
                    total={pages.length}
                    page={p}
                    onChange={(patch) => updatePage(idx, patch)}
                    onMove={(dir) => movePage(idx, dir)}
                    onRemove={() => removePage(idx)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'content' && (
            <div data-testid="tour-wizard-content-panel" className="space-y-3">
              <p className="text-[11px] text-muted-on-light">{t('tours.contentHint')}</p>
              {validPages.length === 0 ? (
                <p className="text-[11.5px] text-muted-on-light italic">
                  {t('tours.contentEmpty')}
                </p>
              ) : (
                <ol className="space-y-2">
                  {validPages.map((p, idx) => (
                    <li
                      key={idx}
                      data-testid={`tour-content-slide-${idx}`}
                      className="bg-canvas-light border border-border-light p-3 space-y-2"
                    >
                      <p className="text-[11px] font-mono font-semibold">
                        {t('tours.slideLabel')
                          .replace('{n}', String(idx + 1))
                          .replace('{title}', p.title)}
                      </p>
                      <textarea
                        value={p.description}
                        onChange={(e) =>
                          updatePage(
                            pages.findIndex((x) => x === p),
                            { description: e.target.value },
                          )
                        }
                        rows={4}
                        data-testid={`tour-content-desc-${idx}`}
                        placeholder={t('tours.slideTextPlaceholder')}
                        className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
                      />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {step === 'trigger' && (
            <TriggerPanel
              audience={audience}
              trigger={trigger}
              onAudienceChange={setAudience}
              onTriggerChange={setTrigger}
              t={t}
            />
          )}
        </div>

        <footer className="px-4 py-3 border-t border-border-light flex items-center gap-2 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={() => moveStep(step, -1, setStep)}
            disabled={step === 'pages'}
            data-testid="tour-wizard-prev"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary disabled:opacity-40 flex items-center gap-1.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
            {t('tours.prev')}
          </button>
          <button
            type="button"
            onClick={() => moveStep(step, 1, setStep)}
            disabled={step === 'trigger'}
            data-testid="tour-wizard-next"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary disabled:opacity-40 flex items-center gap-1.5"
          >
            {t('tours.next')}
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            data-testid="tour-save"
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? t('common.saving') : tour ? t('tours.saveChanges') : t('tours.createSubmit')}
          </button>
        </footer>
      </div>

      {previewOpen && (
        <TourPreview
          title={title || t('tours.noTitleFallback')}
          summary={summary}
          pages={validPages.length > 0 ? (validPages as unknown as PageDraft[]) : pages}
          previewOnly
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
    </ModalPortal>
  );
}

function moveStep(
  cur: WizardStep,
  dir: -1 | 1,
  set: (s: WizardStep) => void,
) {
  const order: WizardStep[] = ['pages', 'content', 'trigger'];
  const idx = order.indexOf(cur);
  const next = idx + dir;
  if (next < 0 || next >= order.length) return;
  set(order[next]);
}

function WizardStepBtn({
  n,
  label,
  active,
  onClick,
  testId,
}: {
  n: number;
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        aria-current={active ? 'step' : undefined}
        className={`flex items-center gap-2 h-7 px-2.5 text-[11px] border ${
          active
            ? 'bg-primary text-white border-primary'
            : 'bg-canvas-light border-border-light text-muted-on-light hover:border-primary hover:text-text-on-light'
        }`}
      >
        <span className="w-4 h-4 inline-flex items-center justify-center bg-white text-primary border border-primary text-[10px] font-mono">
          {n}
        </span>
        {label}
      </button>
    </li>
  );
}

function PageRow({
  idx,
  total,
  page,
  onChange,
  onMove,
  onRemove,
  t,
}: {
  idx: number;
  total: number;
  page: PageDraft;
  onChange: (patch: Partial<PageDraft>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      data-testid={`tour-page-${idx}`}
      className="bg-canvas-light border border-border-light p-3 space-y-2"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono font-semibold flex-1">
          {t('tours.pageLabel').replace('{n}', String(idx + 1))}
        </span>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={idx === 0}
          className="h-6 w-6 flex items-center justify-center bg-white border border-border-light hover:border-primary disabled:opacity-30"
          aria-label={t('common.moveUp')}
        >
          <ChevronUp className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={idx === total - 1}
          className="h-6 w-6 flex items-center justify-center bg-white border border-border-light hover:border-primary disabled:opacity-30"
          aria-label={t('common.moveDown')}
        >
          <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={total === 1}
          className="h-6 w-6 flex items-center justify-center bg-white border border-border-light hover:border-danger hover:text-danger disabled:opacity-30"
          aria-label={t('tours.removePage')}
        >
          <X className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>
      <input
        type="text"
        value={page.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder={t('tours.pageTitlePlaceholder')}
        required
        data-testid={`tour-page-${idx}-title`}
        className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
      />
      <textarea
        value={page.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder={t('tours.pageDescPlaceholder')}
        rows={2}
        data-testid={`tour-page-${idx}-desc`}
        className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={page.media_url}
          onChange={(e) => onChange({ media_url: e.target.value })}
          placeholder={t('tours.pageMediaPlaceholder')}
          data-testid={`tour-page-${idx}-media`}
          className="h-8 px-2 text-[11.5px] bg-white border border-border-light outline-none focus:border-primary font-mono"
        />
        <input
          type="text"
          value={page.documentation_url}
          onChange={(e) => onChange({ documentation_url: e.target.value })}
          placeholder={t('tours.pageDocPlaceholder')}
          data-testid={`tour-page-${idx}-doc`}
          className="h-8 px-2 text-[11.5px] bg-white border border-border-light outline-none focus:border-primary font-mono"
        />
      </div>
      <input
        type="text"
        value={page.target_selector}
        onChange={(e) => onChange({ target_selector: e.target.value })}
        placeholder={t('tours.pageTargetPlaceholder')}
        data-testid={`tour-page-${idx}-target`}
        className="w-full h-8 px-2 text-[11.5px] bg-white border border-border-light outline-none focus:border-primary font-mono"
      />
    </div>
  );
}

function TriggerPanel({
  audience,
  trigger,
  onAudienceChange,
  onTriggerChange,
  t,
}: {
  audience: TourAudience;
  trigger: TourTrigger;
  onAudienceChange: (a: TourAudience) => void;
  onTriggerChange: (tr: TourTrigger) => void;
  t: (key: string) => string;
}) {
  const rolesStr = (audience.roles ?? []).join(', ');
  const targetsStr = (trigger.target_pages ?? []).join('\n');
  // Wave H.1: mode toggle local (filtered/all) — independente de
  // arrays vazios, pra UI revelar inputs assim que operador escolhe.
  const [mode, setMode] = React.useState<'all' | 'filtered'>(
    (audience.roles ?? []).length > 0 || (audience.groups ?? []).length > 0
      ? 'filtered'
      : 'all',
  );

  return (
    <div data-testid="tour-wizard-trigger-panel" className="space-y-4">
      <section className="space-y-2">
        <header className="flex items-center gap-2 border-b border-border-light pb-2">
          <Calendar className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
            {t('tours.whenHeader')}
          </p>
        </header>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('tours.startDate')}>
            <input
              type="datetime-local"
              value={isoToLocal(trigger.start_at)}
              onChange={(e) =>
                onTriggerChange({ ...trigger, start_at: localToIso(e.target.value) })
              }
              data-testid="tour-trigger-start"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
            />
          </Field>
          <Field label={t('tours.endDate')}>
            <input
              type="datetime-local"
              value={isoToLocal(trigger.end_at)}
              onChange={(e) =>
                onTriggerChange({ ...trigger, end_at: localToIso(e.target.value) })
              }
              data-testid="tour-trigger-end"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
            />
          </Field>
        </div>
        <Field label={t('tours.targetPagesLabel')}>
          <textarea
            value={targetsStr}
            onChange={(e) =>
              onTriggerChange({
                ...trigger,
                target_pages: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            rows={3}
            placeholder={'/sala/aurora\n/painel-de-controle/salas'}
            data-testid="tour-trigger-target-pages"
            className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
          />
          <p className="text-[10.5px] text-muted-on-light italic">
            {t('tours.targetPagesHint')}
          </p>
        </Field>
      </section>

      <section className="space-y-2">
        <header className="flex items-center gap-2 border-b border-border-light pb-2">
          <Filter className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
            {t('tours.audienceHeader')}
          </p>
        </header>
        <Field label={t('tours.audienceLabel')}>
          <select
            data-testid="tour-audience-mode"
            value={mode}
            onChange={(e) => {
              const next = e.target.value as 'all' | 'filtered';
              setMode(next);
              if (next === 'all') {
                onAudienceChange({});
              }
            }}
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          >
            <option value="all">{t('tours.audienceAll')}</option>
            <option value="filtered">{t('tours.audienceFiltered')}</option>
          </select>
        </Field>
        {mode === 'filtered' ? (
          <>
            <Field label={t('tours.rolesLabel')}>
              <input
                type="text"
                value={rolesStr}
                onChange={(e) =>
                  onAudienceChange({
                    ...audience,
                    roles: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="ex: operador, supervisor"
                data-testid="tour-audience-roles"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
            </Field>
            <Field label={t('tours.groupsLabel')}>
              <GroupCheckSelect
                selected={audience.groups ?? []}
                onChange={(groups) => onAudienceChange({ ...audience, groups })}
              />
            </Field>
          </>
        ) : (
          <p className="text-[10.5px] text-muted-on-light italic">
            {t('tours.audienceHint')}
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * GroupCheckSelect — Onda L.6. Seletor de Grupos por checkbox-list populado
 * de Groups.list() (NUNCA texto-livre de id; memory feedback_no_manual_technical_input).
 * Persiste os group_ids selecionados via onChange.
 */
function GroupCheckSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (groups: string[]) => void;
}) {
  const [groups, setGroups] = React.useState<Group[] | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    Groups.list()
      .then((g) => {
        if (!cancelled) setGroups(g);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const toggle = (id: string) => {
    const set = new Set(selected);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  };
  if (groups === null) {
    return <p className="text-[10.5px] text-muted-on-light italic">…</p>;
  }
  if (groups.length === 0) {
    return (
      <p
        data-testid="tour-audience-groups-empty"
        className="text-[10.5px] text-muted-on-light italic"
      >
        Nenhum grupo disponível. Crie em Grupos.
      </p>
    );
  }
  return (
    <div
      data-testid="tour-audience-groups"
      className="border border-border-light bg-white max-h-40 overflow-y-auto divide-y divide-border-light"
    >
      {groups.map((g) => (
        <label
          key={g.id}
          data-testid={`tour-audience-group-${g.id}`}
          className="flex items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-canvas-light cursor-pointer"
        >
          <input
            type="checkbox"
            checked={selected.includes(g.id)}
            onChange={() => toggle(g.id)}
            className="focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="flex-1 truncate text-text-on-light">{g.name}</span>
          <span className="text-[10px] text-muted-on-light">{g.member_count}</span>
        </label>
      ))}
    </div>
  );
}

function hasAudience(a: TourAudience): boolean {
  return Boolean((a.roles && a.roles.length > 0) || (a.groups && a.groups.length > 0));
}

function hasTrigger(t: TourTrigger): boolean {
  return Boolean(
    t.start_at ||
      t.end_at ||
      (t.target_pages && t.target_pages.length > 0),
  );
}

function isoToLocal(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    // datetime-local expects YYYY-MM-DDTHH:mm
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function localToIso(local: string): string | undefined {
  if (!local) return undefined;
  try {
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  } catch {
    return undefined;
  }
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
