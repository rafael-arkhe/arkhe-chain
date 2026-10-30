'use client';

/**
 * Salas — Painel de Controle (Wave H.1 · 2026-05-23).
 *
 * Refazimento UX operacional do Modo Apresentação:
 *  - Card por Sala ganha badge "Em apresentação · N displays" quando há
 *    sessões ativas (visual primary; click expande o dialog)
 *  - Card ganha botão dedicado "Iniciar Apresentação" — não escondido
 *    dentro de Settings (o operador antes não entendia o uso)
 *  - KioskDialog reorganizado em 4 tabs:
 *      1. URL de kiosk     — gera link compartilhável + QR + open-in-window
 *                            + start-in-this-window-fullscreen
 *      2. Sessões ativas    — device/browser + IP + started_by + Encerrar
 *      3. Configuração      — toggles + slide loop + interval
 *      4. Histórico         — sessões finalizadas com duration
 *
 * Honra DS:
 *   - feedback_no_rounded_no_sparkles · ZERO `rounded-*`
 *   - feedback_no_emojis_in_ui · ZERO emoji; ícones lucide-react
 *   - feedback_no_palantir_product_names · "Sala" / "Modo Apresentação"
 *   - feedback_no_phase_status_in_ui · nada de "Fase X"/"em dev"
 *   - aria-live="polite" em counters · aria-label em icon-only buttons
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Compass,
  Copy,
  ExternalLink,
  History,
  Layers,
  LayoutDashboard,
  Link2,
  Maximize2,
  Monitor,
  Pencil,
  Plus,
  PlayCircle,
  RotateCcw,
  Settings,
  Square,
  Star,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { OPERACIONAL_SALAS_TABS } from '@/components/control-panel/hub-tabs';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useT } from '@/lib/i18n/provider';
import { OverflowMenu, type OverflowMenuItem } from '@/components/ui/overflow-menu';
import { toast } from '@/components/ui/toast';
import {
  KNOWN_APPLICATIONS,
  deriveKnownApplications,
  Organizations,
  Projects,
  WorkspaceKiosk,
  WorkspaceNavigation,
  WorkspacePromotions,
  Workspaces,
  type KioskConfig,
  type KioskSession,
  type KnownApplication,
  type Organization,
  type Workspace,
  type WorkspaceNavigationPolicy,
  type WorkspacePromotion,
  type WorkspaceVersion,
} from '@/lib/api';

type KioskTab = 'url' | 'sessions' | 'config' | 'history';

interface KioskSummary {
  active_count: number;
  loaded: boolean;
}

export default function SalasPage() {
  const t = useT();
  const [list, setList] = React.useState<Workspace[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [editing, setEditing] = React.useState<Workspace | null>(null);
  const [historyOf, setHistoryOf] = React.useState<Workspace | null>(null);
  const [navigationOf, setNavigationOf] = React.useState<Workspace | null>(null);
  const [promotingOf, setPromotingOf] = React.useState<Workspace | null>(null);
  /** Tab inicial controla qual aba abre no KioskDialog. */
  const [kioskOf, setKioskOf] = React.useState<
    { workspace: Workspace; initialTab: KioskTab } | null
  >(null);

  // Create fields
  const [cSlug, setCSlug] = React.useState('');
  const [cName, setCName] = React.useState('');
  const [cDesc, setCDesc] = React.useState('');
  const [cProjectId, setCProjectId] = React.useState('');
  const [projectOptions, setProjectOptions] = React.useState<
    { id: string; display_name: string; slug: string }[]
  >([]);
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();

  const [promotions, setPromotions] = React.useState<Record<string, number>>({});
  const [kioskSummaries, setKioskSummaries] = React.useState<Record<string, KioskSummary>>({});
  const askConfirm = useConfirm();

  React.useEffect(() => {
    Projects.list()
      .then((p) => setProjectOptions(p))
      .catch(() => setProjectOptions([]));
  }, []);

  const refresh = React.useCallback(() => {
    setErr(null);
    Workspaces.list({ limit: 200 })
      .then(async (rows) => {
        setList(rows);
        // promotions + kiosk active counts em paralelo.
        const [promoEntries, kioskEntries] = await Promise.all([
          Promise.all(
            rows.map((w) =>
              WorkspacePromotions.list(w.id)
                .then((p) => [w.id, p.length] as const)
                .catch(() => [w.id, 0] as const),
            ),
          ),
          Promise.all(
            rows.map((w) =>
              WorkspaceKiosk.get(w.id)
                .then(
                  (c) =>
                    [w.id, { active_count: c.active_sessions_count, loaded: true }] as const,
                )
                .catch(() => [w.id, { active_count: 0, loaded: false }] as const),
            ),
          ),
        ]);
        const promoMap: Record<string, number> = {};
        for (const [id, count] of promoEntries) promoMap[id] = count;
        setPromotions(promoMap);
        const ks: Record<string, KioskSummary> = {};
        for (const [id, s] of kioskEntries) ks[id] = s;
        setKioskSummaries(ks);
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar Salas'));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cSlug.trim() || !cName.trim() || !cProjectId) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await Workspaces.create({
        slug: cSlug.trim(),
        display_name: cName.trim(),
        description: cDesc.trim() || undefined,
        project_id: cProjectId,
        config: {},
      });
      setCSlug('');
      setCName('');
      setCProjectId('');
      setCDesc('');
      setShowCreate(false);
      router.push(`/sala/${created.slug}`);
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao criar Sala');
    } finally {
      setBusy(false);
    }
  };

  /** Wave I.4: ação destrutiva (overflow menu). */
  const deleteWorkspace = async (w: Workspace) => {
    const ok = await askConfirm({
      title: t('salas.deleteTitle').replace('{name}', w.display_name),
      description: t('salas.deleteDesc'),
      tone: 'warning',
      confirmLabel: t('salas.deleteConfirm'),
    });
    if (!ok) return;
    try {
      await Workspaces.delete(w.id);
      toast.success(t('salas.deleteConfirm'));
      refresh();
    } catch (e) {
      toast.error((e as Error)?.message ?? 'Falha ao apagar Sala');
    }
  };

  /** Wave H.1: ação primária — Iniciar Apresentação a partir do card. */
  const startPresentationFromCard = async (w: Workspace) => {
    try {
      const ci: Record<string, string> = {};
      if (typeof navigator !== 'undefined') ci.user_agent = navigator.userAgent;
      if (typeof window !== 'undefined' && window.screen) {
        ci.screen = `${window.screen.width}x${window.screen.height}`;
      }
      await WorkspaceKiosk.startSession(w.id, { client_info: ci });
      toast.success(t('salas.startPresentation'));
      // Abre o dialog na tab Sessões ativas pra o operador ver feedback.
      setKioskOf({ workspace: w, initialTab: 'sessions' });
      refresh();
    } catch (e) {
      toast.error((e as Error)?.message ?? 'Falha ao iniciar apresentação');
    }
  };

  return (
    <RequirePerm perm="workspace.read">
      <CpPageHeader
        title={t('salas.title')}
        subtitle={t('salas.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            data-testid="salas-toggle-create"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            {showCreate ? t('common.cancel') : t('salas.new')}
          </button>
        }
      />
      <CpHubSubnav group="Salas" tabs={OPERACIONAL_SALAS_TABS} />

      <div className="p-6 max-w-4xl space-y-4">
        {showCreate && (
          <form
            onSubmit={submitCreate}
            data-testid="salas-form"
            className="bg-canvas-light border border-border-light p-4 space-y-3"
          >
            <header className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-primary" strokeWidth={1.5} />
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
                {t('salas.newHeader')}
              </p>
            </header>
            <Field label={t('common.slugLabel')}>
              <input
                type="text"
                value={cSlug}
                onChange={(e) => setCSlug(e.target.value)}
                required
                data-testid="salas-slug"
                placeholder={t('salas.slugPlaceholder')}
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
            </Field>
            <Field label={t('common.nameLabel')}>
              <input
                type="text"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                required
                data-testid="salas-name"
                placeholder={t('salas.namePlaceholder')}
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              />
            </Field>
            <Field label={t('common.descriptionLabel')}>
              <textarea
                value={cDesc}
                onChange={(e) => setCDesc(e.target.value)}
                rows={2}
                data-testid="salas-desc"
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              />
            </Field>
            <Field label={t('salas.projectLabel')}>
              <select
                value={cProjectId}
                onChange={(e) => setCProjectId(e.target.value)}
                required
                data-testid="salas-project"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              >
                <option value="">{t('salas.chooseProject')}</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} ({p.slug})
                  </option>
                ))}
              </select>
              <p className="text-[10.5px] text-muted-on-light italic mt-1">
                {t('salas.projectHint')}
              </p>
            </Field>
            <div className="pt-2">
              <button
                type="submit"
                disabled={busy}
                data-testid="salas-submit"
                className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? t('common.creating') : t('salas.createSubmit')}
              </button>
            </div>
          </form>
        )}

        {err && (
          <CpErrorState
            title={t('salas.errorLoad')}
            description={err}
            retry={refresh}
          />
        )}
        {!list && !err && <CpSkeleton rows={3} />}
        {list && list.length === 0 && (
          <CpEmptyState
            icon={LayoutDashboard}
            title={t('salas.emptyTitle')}
            description={t('salas.emptyDesc')}
            cta={{
              label: t('salas.emptyCta'),
              onClick: () => setShowCreate(true),
              testId: 'salas-empty-cta',
            }}
          />
        )}
        {list && list.length > 0 && (
          <ul className="space-y-2" data-testid="salas-list">
            {list.map((w) => {
              const ks = kioskSummaries[w.id];
              const isPresenting = (ks?.active_count ?? 0) > 0;
              return (
                <li
                  key={w.id}
                  data-testid={`sala-${w.slug}`}
                  className="bg-canvas-light border border-border-light p-3 flex items-start gap-3"
                >
                  <span className="inline-flex w-9 h-9 items-center justify-center bg-white border border-border-light shrink-0">
                    <LayoutDashboard className="w-4 h-4 text-primary" strokeWidth={1.5} />
                  </span>
                  <div className="flex-1 min-w-0">
                    {/*
                      Wave I.4 — título em linha própria com truncate forte:
                        • nunca quebra linha
                        • title="" para tooltip nativo quando truncado
                        • metadados (slug · v · badges) descem pra row inferior
                    */}
                    <p
                      className="text-[13px] font-semibold text-text-on-light truncate"
                      title={w.display_name}
                      data-testid={`sala-title-${w.slug}`}
                    >
                      {w.display_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-on-light truncate max-w-[180px]">
                        {w.slug}
                      </span>
                      <span className="text-[10px] font-mono bg-white border border-border-light px-1.5 h-4 inline-flex items-center shrink-0">
                        v{w.version}
                      </span>
                      {promotions[w.id] > 0 && (
                        <span
                          data-testid={`sala-promoted-${w.slug}`}
                          className="text-[10px] font-mono bg-white border border-primary text-primary px-1.5 h-4 inline-flex items-center gap-1 shrink-0"
                        >
                          <Star className="w-2.5 h-2.5" strokeWidth={1.5} fill="currentColor" />
                          {promotions[w.id]}
                        </span>
                      )}
                      {/* Wave H.1: badge "Em apresentação · N displays". */}
                      {isPresenting && (
                        <button
                          type="button"
                          onClick={() =>
                            setKioskOf({ workspace: w, initialTab: 'sessions' })
                          }
                          data-testid={`sala-live-badge-${w.slug}`}
                          aria-label={t('salas.presentingBadge')
                            .replace('{n}', String(ks?.active_count))
                            .replace(
                              '{displayWord}',
                              ks?.active_count === 1
                                ? t('common.displaySingular')
                                : t('common.displayPlural'),
                            )}
                          className="text-[10px] font-mono bg-primary text-white border border-primary px-1.5 h-5 inline-flex items-center gap-1 hover:bg-primary-hover shrink-0"
                        >
                          <Tv className="w-2.5 h-2.5" strokeWidth={1.5} />
                          {t('salas.presentingBadge')
                            .replace('{n}', String(ks?.active_count))
                            .replace(
                              '{displayWord}',
                              ks?.active_count === 1
                                ? t('common.displaySingular')
                                : t('common.displayPlural'),
                            )}
                        </button>
                      )}
                    </div>
                    {w.description && (
                      <p className="text-[11.5px] text-muted-on-light mt-1 line-clamp-2">
                        {w.description}
                      </p>
                    )}
                    {w.signed_hash && (
                      <p className="text-[10px] font-mono text-muted-on-light mt-1 truncate">
                        hash: {w.signed_hash.slice(0, 16)}…
                      </p>
                    )}
                  </div>
                  {/*
                    Wave I.4 — layout enxuto:
                      • 2 botões primários: Iniciar Apresentação (CTA) + Editar
                      • Touch ≥ 44px nos primários (h-11)
                      • OverflowMenu agrupa Versões, Navegação, Layout,
                        Destaque, URL/QR de apresentação e Apagar.
                  */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => startPresentationFromCard(w)}
                      data-testid={`sala-start-presentation-${w.slug}`}
                      aria-label={t('salas.startPresentation')}
                      className="h-11 min-w-[44px] px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary flex items-center gap-1.5"
                    >
                      <PlayCircle className="w-4 h-4" strokeWidth={1.5} />
                      <span className="hidden sm:inline">{t('salas.startPresentation')}</span>
                      <span className="sm:hidden">{t('salas.start')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(w)}
                      data-testid={`sala-edit-${w.slug}`}
                      aria-label={t('common.edit')}
                      className="h-11 min-w-[44px] px-3 text-[12px] bg-white border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary flex items-center gap-1.5"
                    >
                      <Pencil className="w-4 h-4" strokeWidth={1.5} />
                      <span className="hidden sm:inline">{t('common.edit')}</span>
                    </button>
                    <OverflowMenu
                      ariaLabel={t('salas.moreActions').replace('{name}', w.display_name)}
                      testIdPrefix={`sala-more-${w.slug}`}
                      size="md"
                      items={
                        [
                          {
                            key: 'apresentacao-url',
                            label: t('salas.menuUrl'),
                            icon: Tv,
                            onSelect: () => setKioskOf({ workspace: w, initialTab: 'url' }),
                          },
                          {
                            key: 'versoes',
                            label: t('salas.menuVersions'),
                            icon: History,
                            onSelect: () => setHistoryOf(w),
                          },
                          {
                            key: 'navegacao',
                            label: t('salas.menuNavigation'),
                            icon: Compass,
                            onSelect: () => setNavigationOf(w),
                          },
                          {
                            key: 'layout',
                            label: t('salas.menuLayout'),
                            icon: Layers,
                            onSelect: () =>
                              router.push(`/painel-de-controle/carbon-composer/${w.id}`),
                          },
                          {
                            key: 'destaque',
                            label: t('salas.menuFeatured'),
                            icon: Star,
                            onSelect: () => setPromotingOf(w),
                          },
                          {
                            key: 'apagar',
                            label: t('salas.menuDelete'),
                            icon: Trash2,
                            tone: 'danger',
                            onSelect: () => deleteWorkspace(w),
                          },
                        ] satisfies OverflowMenuItem[]
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <EditDialog
          workspace={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {historyOf && (
        <HistoryDialog
          workspace={historyOf}
          onClose={() => setHistoryOf(null)}
          onRepublished={() => {
            setHistoryOf(null);
            refresh();
          }}
        />
      )}

      {navigationOf && (
        <NavigationDialog
          workspace={navigationOf}
          onClose={() => setNavigationOf(null)}
          onSaved={() => {
            setNavigationOf(null);
            refresh();
          }}
        />
      )}

      {promotingOf && (
        <PromotionDialog
          workspace={promotingOf}
          onClose={() => setPromotingOf(null)}
          onSaved={() => {
            setPromotingOf(null);
            refresh();
          }}
        />
      )}

      {kioskOf && (
        <KioskDialog
          workspace={kioskOf.workspace}
          initialTab={kioskOf.initialTab}
          onClose={() => setKioskOf(null)}
          onSaved={() => {
            setKioskOf(null);
            refresh();
          }}
        />
      )}
    </RequirePerm>
  );
}

function KioskDialog({
  workspace,
  initialTab,
  onClose,
  onSaved,
}: {
  workspace: Workspace;
  initialTab: KioskTab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [tab, setTab] = React.useState<KioskTab>(initialTab);
  const [config, setConfig] = React.useState<KioskConfig | null>(null);
  const [hideChrome, setHideChrome] = React.useState(true);
  const [allowExit, setAllowExit] = React.useState(true);
  const [autoFullscreen, setAutoFullscreen] = React.useState(true);
  const [allowReadInteraction, setAllowReadInteraction] = React.useState(true);
  const [slideLoop, setSlideLoop] = React.useState(false);
  const [slideIntervalSec, setSlideIntervalSec] = React.useState(30);
  const [active, setActive] = React.useState<KioskSession[]>([]);
  const [history, setHistory] = React.useState<KioskSession[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const askConfirm = useConfirm();

  const loadAll = React.useCallback(() => {
    setErr(null);
    Promise.all([
      WorkspaceKiosk.get(workspace.id),
      WorkspaceKiosk.listSessions(workspace.id, { active_only: true }),
      WorkspaceKiosk.listSessions(workspace.id, { limit: 50 }),
    ])
      .then(([c, a, h]) => {
        setConfig(c);
        setHideChrome(c.hide_chrome);
        setAllowExit(c.allow_exit);
        setAutoFullscreen(c.auto_fullscreen);
        setAllowReadInteraction(c.allow_read_interaction);
        setSlideLoop(c.slide_loop);
        setSlideIntervalSec(c.slide_interval_seconds);
        setActive(a);
        // Histórico = somente sessões já encerradas, sorted newest-first.
        setHistory(h.filter((s) => s.ended_at != null));
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar'));
  }, [workspace.id]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await WorkspaceKiosk.set(workspace.id, {
        hide_chrome: hideChrome,
        allow_exit: allowExit,
        auto_fullscreen: autoFullscreen,
        allow_read_interaction: allowReadInteraction,
        slide_loop: slideLoop,
        slide_interval_seconds: slideIntervalSec,
      });
      toast.success(t('salas.kioskSaveConfig'));
      loadAll();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar config');
    } finally {
      setBusy(false);
    }
  };

  const startSessionHere = async (mode: 'window' | 'fullscreen') => {
    setBusy(true);
    setErr(null);
    try {
      const ci: Record<string, string> = {};
      if (typeof navigator !== 'undefined') ci.user_agent = navigator.userAgent;
      if (typeof window !== 'undefined' && window.screen) {
        ci.screen = `${window.screen.width}x${window.screen.height}`;
      }
      await WorkspaceKiosk.startSession(workspace.id, { client_info: ci });
      toast.success(t('salas.kioskOpenFullscreen'));
      // Open in new tab / fullscreen.
      const url = kioskUrl(workspace.slug);
      if (mode === 'window') {
        window.open(url, '_blank', 'noopener');
      } else {
        const w = window.open(url, '_blank', 'noopener');
        if (w) {
          // Best-effort: o /sala/{slug}?kiosk=1 deve chamar
          // document.documentElement.requestFullscreen() em mount.
        }
      }
      loadAll();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao iniciar sessão');
    } finally {
      setBusy(false);
    }
  };

  const endSession = async (sessionId: string) => {
    setBusy(true);
    setErr(null);
    try {
      await WorkspaceKiosk.endSession(workspace.id, sessionId);
      toast.success(t('salas.kioskEndSession'));
      loadAll();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao encerrar sessão');
    } finally {
      setBusy(false);
    }
  };

  const endAll = async () => {
    if (active.length === 0) return;
    const ok = await askConfirm({
      title: t('salas.kioskEndAllTitle')
        .replace('{n}', String(active.length))
        .replace(
          '{sessionWord}',
          active.length === 1 ? t('common.sessionSingular') : t('common.sessionPlural'),
        ),
      description: t('salas.kioskEndAllDesc'),
      tone: 'warning',
      confirmLabel: t('salas.kioskEndAll'),
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await WorkspaceKiosk.endAllSessions(workspace.id, {
        reason: 'manual end_all from KioskDialog',
      });
      toast.success(
        `${out.ended} ${
          out.ended === 1 ? t('common.sessionSingular') : t('common.sessionPlural')
        }`,
      );
      loadAll();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao encerrar todas');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      title={t('salas.kioskTitle').replace('{name}', workspace.display_name)}
      onClose={onClose}
    >
      {/* Tab bar */}
      <div className="px-4 pt-3 border-b border-border-light flex items-center gap-1">
        <TabButton
          active={tab === 'url'}
          onClick={() => setTab('url')}
          testId="sala-kiosk-tab-url"
          icon={Link2}
          label={t('salas.kioskTabUrl')}
        />
        <TabButton
          active={tab === 'sessions'}
          onClick={() => setTab('sessions')}
          testId="sala-kiosk-tab-sessions"
          icon={Tv}
          label={t('salas.kioskTabSessions').replace('{n}', String(active.length))}
        />
        <TabButton
          active={tab === 'config'}
          onClick={() => setTab('config')}
          testId="sala-kiosk-tab-config"
          icon={Settings}
          label={t('salas.kioskTabConfig')}
        />
        <TabButton
          active={tab === 'history'}
          onClick={() => setTab('history')}
          testId="sala-kiosk-tab-history"
          icon={History}
          label={t('salas.kioskTabHistory')}
        />
      </div>

      <div className="p-4 space-y-4">
        {!config && !err && (
          <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
        )}
        {err && (
          <p className="text-[11px] text-danger font-mono" data-testid="sala-kiosk-error">
            {err}
          </p>
        )}

        {config && tab === 'url' && (
          <KioskUrlTab
            workspaceSlug={workspace.slug}
            onStartSession={startSessionHere}
            busy={busy}
            t={t}
          />
        )}

        {config && tab === 'sessions' && (
          <KioskSessionsTab
            sessions={active}
            onEndOne={endSession}
            onEndAll={endAll}
            busy={busy}
            t={t}
          />
        )}

        {config && tab === 'config' && (
          <form onSubmit={saveConfig} className="space-y-3" data-testid="sala-kiosk-config-tab">
            <header className="flex items-center gap-2 border-b border-border-light pb-2">
              <Settings className="w-4 h-4 text-primary" strokeWidth={1.5} />
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex-1">
                {t('salas.kioskConfigHeader')}
              </p>
            </header>
            <label className="flex items-start gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={hideChrome}
                onChange={(e) => setHideChrome(e.target.checked)}
                data-testid="sala-kiosk-hide-chrome"
                className="mt-0.5"
              />
              <span>
                <b className="text-text-on-light">{t('salas.kioskHideChrome')}</b>{' '}
                {t('salas.kioskHideChromeHint')}
              </span>
            </label>
            <label className="flex items-start gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={allowExit}
                onChange={(e) => setAllowExit(e.target.checked)}
                data-testid="sala-kiosk-allow-exit"
                className="mt-0.5"
              />
              <span>
                <b className="text-text-on-light">{t('salas.kioskAllowExit')}</b>{' '}
                {t('salas.kioskAllowExitHint')}
              </span>
            </label>
            <label className="flex items-start gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={autoFullscreen}
                onChange={(e) => setAutoFullscreen(e.target.checked)}
                data-testid="sala-kiosk-auto-fullscreen"
                className="mt-0.5"
              />
              <span>
                <b className="text-text-on-light">{t('salas.kioskAutoFullscreen')}</b>{' '}
                {t('salas.kioskAutoFullscreenHint')}
              </span>
            </label>
            <label className="flex items-start gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={allowReadInteraction}
                onChange={(e) => setAllowReadInteraction(e.target.checked)}
                data-testid="sala-kiosk-allow-read-interaction"
                className="mt-0.5"
              />
              <span>
                <b className="text-text-on-light">{t('salas.kioskAllowRead')}</b>{' '}
                {t('salas.kioskAllowReadHint')}
              </span>
            </label>
            <label className="flex items-start gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={slideLoop}
                onChange={(e) => setSlideLoop(e.target.checked)}
                data-testid="sala-kiosk-slide-loop"
                className="mt-0.5"
              />
              <span>
                <b className="text-text-on-light">{t('salas.kioskSlideLoop')}</b>{' '}
                {t('salas.kioskSlideLoopHint')}
              </span>
            </label>
            <div className="flex items-center gap-2 pl-6">
              <label
                htmlFor="sala-kiosk-slide-interval"
                className="text-[11px] text-text-on-light"
              >
                {t('salas.kioskSlideInterval')}
              </label>
              <input
                id="sala-kiosk-slide-interval"
                type="number"
                min={5}
                max={600}
                value={slideIntervalSec}
                onChange={(e) =>
                  setSlideIntervalSec(Math.max(5, Math.min(600, Number(e.target.value) || 30)))
                }
                disabled={!slideLoop}
                data-testid="sala-kiosk-slide-interval"
                className="w-20 h-7 px-2 text-[11px] bg-white border border-border-light font-mono outline-none focus:border-primary disabled:opacity-40"
              />
            </div>
            <p className="text-[10.5px] text-muted-on-light italic">
              {t('salas.kioskVersionHint')
                .replace('{n}', String(config.version))
                .replace('{next}', String(config.version + 1))}
            </p>
            <div>
              <button
                type="submit"
                disabled={busy}
                data-testid="sala-kiosk-save"
                className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? t('common.saving') : t('salas.kioskSaveConfig')}
              </button>
            </div>
          </form>
        )}

        {config && tab === 'history' && (
          <KioskHistoryTab sessions={history} t={t} />
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-border-light">
          <button
            type="button"
            onClick={onSaved}
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
          >
            {t('salas.done')}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

function TabButton({
  active,
  onClick,
  testId,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      role="tab"
      aria-selected={active}
      className={`h-7 px-3 text-[11px] border-b-2 flex items-center gap-1.5 ${
        active
          ? 'border-primary text-primary font-semibold'
          : 'border-transparent text-muted-on-light hover:text-text-on-light'
      }`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );
}

function kioskUrl(slug: string): string {
  if (typeof window === 'undefined') return `/sala/${slug}?kiosk=1`;
  return `${window.location.origin}/sala/${slug}?kiosk=1`;
}

function KioskUrlTab({
  workspaceSlug,
  onStartSession,
  busy,
  t,
}: {
  workspaceSlug: string;
  onStartSession: (mode: 'window' | 'fullscreen') => void;
  busy: boolean;
  t: (key: string) => string;
}) {
  const url = kioskUrl(workspaceSlug);
  // Onda L.1 — QR gerado LOCALMENTE (client-side, lib `qrcode`). Zero
  // dependência de rede externa (antes usava um serviço HTTP de terceiros,
  // o que quebrava em deploy air-gapped). Renderiza como dataURL no <img>.
  const [qrDataUrl, setQrDataUrl] = React.useState<string>('');
  React.useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 200, margin: 1 })
      .then((data) => {
        if (!cancelled) setQrDataUrl(data);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('salas.kioskCopied'));
    } catch {
      toast.error(t('salas.kioskCopyFail'));
    }
  };

  const startFullscreenHere = async () => {
    try {
      if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      onStartSession('fullscreen');
    } catch {
      onStartSession('fullscreen');
    }
  };

  return (
    <section
      data-testid="sala-kiosk-url-tab"
      className="space-y-3"
      aria-labelledby="sala-kiosk-url-heading"
    >
      <header className="flex items-center gap-2 border-b border-border-light pb-2">
        <Link2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
        <p
          id="sala-kiosk-url-heading"
          className="text-[10px] uppercase tracking-[0.16em] font-semibold flex-1"
        >
          {t('salas.kioskUrlHeader')}
        </p>
      </header>
      <p className="text-[11px] text-muted-on-light">{t('salas.kioskUrlHint')}</p>
      <div className="flex items-center gap-2 bg-white border border-border-light p-2">
        <code
          data-testid="sala-kiosk-url-value"
          className="flex-1 text-[11px] font-mono truncate"
        >
          {url}
        </code>
        <button
          type="button"
          onClick={copyLink}
          data-testid="sala-kiosk-url-copy"
          className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
        >
          <Copy className="w-3 h-3" strokeWidth={1.5} />
          {t('salas.kioskCopyLink')}
        </button>
      </div>
      <div className="flex items-start gap-4 bg-canvas-light border border-border-light p-3">
        <img
          src={qrDataUrl || undefined}
          alt={t('salas.kioskQrAlt').replace('{slug}', workspaceSlug)}
          width={140}
          height={140}
          data-testid="sala-kiosk-url-qr"
          className="border border-border-light bg-white"
        />
        <div className="flex-1 space-y-2">
          <p className="text-[11.5px] text-text-on-light">{t('salas.kioskQrHint')}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="sala-kiosk-open-window"
              className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
            >
              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
              {t('salas.kioskOpenWindow')}
            </a>
            <button
              type="button"
              onClick={startFullscreenHere}
              disabled={busy}
              data-testid="sala-kiosk-open-fullscreen"
              className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
            >
              <Maximize2 className="w-3 h-3" strokeWidth={1.5} />
              {t('salas.kioskOpenFullscreen')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function KioskSessionsTab({
  sessions,
  onEndOne,
  onEndAll,
  busy,
  t,
}: {
  sessions: KioskSession[];
  onEndOne: (id: string) => void;
  onEndAll: () => void;
  busy: boolean;
  t: (key: string) => string;
}) {
  return (
    <section data-testid="sala-kiosk-sessions-tab" className="space-y-3">
      <header className="flex items-center justify-between border-b border-border-light pb-2 gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Tv className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <p
            className="text-[10px] uppercase tracking-[0.16em] font-semibold"
            aria-live="polite"
          >
            {t('salas.kioskSessionsHeader').replace('{n}', String(sessions.length))}
          </p>
        </div>
        <button
          type="button"
          onClick={onEndAll}
          disabled={busy || sessions.length === 0}
          data-testid="sala-kiosk-end-all"
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-danger hover:text-danger disabled:opacity-40 flex items-center gap-1.5"
        >
          <Square className="w-3 h-3" strokeWidth={1.5} />
          {t('salas.kioskEndAll')}
        </button>
      </header>
      {sessions.length === 0 ? (
        <p
          data-testid="sala-kiosk-no-active"
          className="text-[11.5px] text-muted-on-light italic"
        >
          {t('salas.kioskNoActive')} {t('salas.kioskNoActiveHint')}
        </p>
      ) : (
        <ul className="space-y-1" data-testid="sala-kiosk-sessions">
          {sessions.map((s) => (
            <KioskSessionRow
              key={s.id}
              session={s}
              onEnd={() => onEndOne(s.id)}
              busy={busy}
              t={t}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function KioskSessionRow({
  session,
  onEnd,
  busy,
  t,
}: {
  session: KioskSession;
  onEnd: () => void;
  busy: boolean;
  t: (key: string) => string;
}) {
  const ci = session.client_info || {};
  const label = String(ci.label ?? ci.browser ?? t('salas.kioskUnknownClient'));
  const ip = ci.ip ? String(ci.ip) : null;
  const startedBy = ci.started_by ? String(ci.started_by) : null;
  return (
    <li
      data-testid={`sala-kiosk-session-${session.id}`}
      className="flex items-center gap-2 bg-white border border-border-light px-2 py-1.5"
    >
      <Monitor className="w-4 h-4 text-primary" strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] truncate">
          <span className="font-semibold">{label}</span>
          {ci.os ? <span className="text-muted-on-light"> · {String(ci.os)}</span> : null}
        </p>
        <p className="text-[10px] font-mono text-muted-on-light truncate">
          {ip ? `${ip} · ` : ''}
          {startedBy ? `${t('salas.kioskStartedBy').replace('{by}', startedBy)} · ` : ''}
          {t('salas.kioskSince').replace(
            '{date}',
            new Date(session.started_at).toLocaleString('pt-BR'),
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onEnd}
        disabled={busy}
        data-testid={`sala-kiosk-end-${session.id}`}
        className="h-6 px-2 text-[11px] bg-canvas-light border border-border-light hover:border-danger hover:text-danger disabled:opacity-50 flex items-center gap-1"
        aria-label={t('salas.kioskEndSession')}
      >
        <Square className="w-3 h-3" strokeWidth={1.5} />
        {t('salas.kioskEnd')}
      </button>
    </li>
  );
}

function KioskHistoryTab({
  sessions,
  t,
}: {
  sessions: KioskSession[];
  t: (key: string) => string;
}) {
  return (
    <section data-testid="sala-kiosk-history-tab" className="space-y-3">
      <header className="flex items-center gap-2 border-b border-border-light pb-2">
        <History className="w-4 h-4 text-primary" strokeWidth={1.5} />
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex-1">
          {t('salas.kioskHistoryHeader').replace('{n}', String(sessions.length))}
        </p>
      </header>
      {sessions.length === 0 ? (
        <p
          data-testid="sala-kiosk-history-empty"
          className="text-[11.5px] text-muted-on-light italic"
        >
          {t('salas.kioskHistoryEmpty')}
        </p>
      ) : (
        <ul className="space-y-1" data-testid="sala-kiosk-history-list">
          {sessions.map((s) => {
            const ci = s.client_info || {};
            const label = String(ci.label ?? ci.browser ?? t('salas.kioskUnknownClient'));
            const dur = s.duration_seconds ?? null;
            const durStr = dur != null ? formatDuration(dur) : '—';
            return (
              <li
                key={s.id}
                data-testid={`sala-kiosk-history-${s.id}`}
                className="flex items-center gap-2 bg-white border border-border-light px-2 py-1.5"
              >
                <Monitor className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] truncate">
                    <span className="font-semibold">{label}</span>
                    <span className="text-muted-on-light"> · {durStr}</span>
                  </p>
                  <p className="text-[10px] font-mono text-muted-on-light truncate">
                    {new Date(s.started_at).toLocaleString('pt-BR')}
                    {s.ended_at
                      ? ` → ${new Date(s.ended_at).toLocaleString('pt-BR')}`
                      : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}min`;
}

// ─── Sub-dialogs preserved from earlier sprint ──────────────────────────────

function PromotionDialog({
  workspace,
  onClose,
  onSaved,
}: {
  workspace: Workspace;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [orgs, setOrgs] = React.useState<Organization[] | null>(null);
  const [promotions, setPromotions] = React.useState<WorkspacePromotion[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setErr(null);
    Promise.all([Organizations.list(), WorkspacePromotions.list(workspace.id)])
      .then(([o, p]) => {
        setOrgs(o);
        setPromotions(p);
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar'));
  }, [workspace.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const isPromoted = (orgId: string) =>
    promotions.some((p) => p.organization_id === orgId);

  const promotedRow = (orgId: string) =>
    promotions.find((p) => p.organization_id === orgId);

  const togglePromote = async (orgId: string) => {
    setBusy(true);
    setErr(null);
    try {
      if (isPromoted(orgId)) {
        await WorkspacePromotions.unpromote(workspace.id, orgId);
      } else {
        await WorkspacePromotions.promote(workspace.id, {
          organization_id: orgId,
          ordering: promotions.length,
        });
      }
      load();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao atualizar destaque');
    } finally {
      setBusy(false);
    }
  };

  const updateOrdering = async (orgId: string, ordering: number) => {
    setBusy(true);
    setErr(null);
    try {
      await WorkspacePromotions.promote(workspace.id, {
        organization_id: orgId,
        ordering,
      });
      load();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao reordenar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      title={t('salas.promoTitle').replace('{name}', workspace.display_name)}
      onClose={onClose}
    >
      <div className="p-4 space-y-4">
        {!orgs && !err && (
          <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
        )}
        {err && (
          <p className="text-[11px] text-danger font-mono" data-testid="sala-destaque-error">
            {err}
          </p>
        )}
        {orgs && orgs.length === 0 && (
          <p className="text-[11.5px] text-muted-on-light italic">
            {t('salas.promoEmpty')}
          </p>
        )}
        {orgs && orgs.length > 0 && (
          <>
            <p className="text-[11px] text-muted-on-light">{t('salas.promoHint')}</p>
            <ul
              data-testid="sala-destaque-orgs"
              className="space-y-1 border border-border-light p-2 bg-white"
            >
              {orgs.map((o) => {
                const promoted = isPromoted(o.id);
                const row = promotedRow(o.id);
                return (
                  <li
                    key={o.id}
                    data-testid={`sala-destaque-org-${o.slug}`}
                    className="flex items-center gap-2 px-1.5 py-1 hover:bg-canvas-light"
                  >
                    <input
                      type="checkbox"
                      checked={promoted}
                      onChange={() => togglePromote(o.id)}
                      disabled={busy}
                      data-testid={`sala-destaque-toggle-${o.slug}`}
                    />
                    <span className="flex-1 text-[12px]">{o.display_name}</span>
                    <span className="text-[10px] font-mono text-muted-on-light">
                      {o.slug}
                    </span>
                    {promoted && row && (
                      <input
                        type="number"
                        min={0}
                        value={row.ordering}
                        onChange={(e) =>
                          updateOrdering(o.id, Number(e.target.value))
                        }
                        disabled={busy}
                        data-testid={`sala-destaque-order-${o.slug}`}
                        className="w-14 h-6 px-1 text-[11px] bg-white border border-border-light font-mono outline-none focus:border-primary"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="flex items-center gap-2 pt-2 border-t border-border-light">
          <button
            type="button"
            onClick={onSaved}
            data-testid="sala-destaque-close"
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover"
          >
            {t('salas.done')}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

function NavigationDialog({
  workspace,
  onClose,
  onSaved,
}: {
  workspace: Workspace;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [policy, setPolicy] = React.useState<WorkspaceNavigationPolicy | null>(null);
  const [allowOut, setAllowOut] = React.useState(true);
  const [apps, setApps] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // Onda L.4 — apps conhecidas derivadas das rotas reais (Pages.list);
  // alimenta o seletor (multi-select). Fallback estático embutido.
  const [knownApps, setKnownApps] =
    React.useState<KnownApplication[]>(KNOWN_APPLICATIONS);

  React.useEffect(() => {
    deriveKnownApplications()
      .then(setKnownApps)
      .catch(() => setKnownApps(KNOWN_APPLICATIONS));
  }, []);

  React.useEffect(() => {
    WorkspaceNavigation.get(workspace.id)
      .then((p) => {
        setPolicy(p);
        setAllowOut(p.navigate_out_allowed);
        setApps(p.allowed_applications);
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar política'));
  }, [workspace.id]);

  const toggleApp = (slug: string) => {
    setApps((cur) =>
      cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug],
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await WorkspaceNavigation.set(workspace.id, {
        navigate_out_allowed: allowOut,
        allowed_applications: apps,
        message: message.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar política');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      title={t('salas.navTitle').replace('{name}', workspace.display_name)}
      onClose={onClose}
    >
      <form onSubmit={save} className="p-4 space-y-4">
        {!policy && !err && (
          <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
        )}
        {err && (
          <p className="text-[11px] text-danger font-mono" data-testid="sala-nav-error">
            {err}
          </p>
        )}
        {policy && (
          <>
            <Field label={t('salas.navOutLabel')}>
              <label className="flex items-center gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={allowOut}
                  onChange={(e) => setAllowOut(e.target.checked)}
                  data-testid="sala-nav-allow-out"
                />
                <span>{t('salas.navOutToggle')}</span>
              </label>
              <p className="text-[10.5px] text-muted-on-light italic">
                {t('salas.navOutHint')}
              </p>
            </Field>

            <Field label={t('salas.navAppsLabel')}>
              <div
                data-testid="sala-nav-apps"
                className="border border-border-light p-2 space-y-1 bg-white"
              >
                {knownApps.map((a) => (
                  <label
                    key={a.slug}
                    className="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-canvas-light px-1.5 py-1"
                  >
                    <input
                      type="checkbox"
                      checked={apps.includes(a.slug)}
                      onChange={() => toggleApp(a.slug)}
                      data-testid={`sala-nav-app-${a.slug}`}
                    />
                    <span className="flex-1">{a.label}</span>
                    <span className="text-[10px] font-mono text-muted-on-light">
                      {a.slug}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[10.5px] text-muted-on-light italic">
                {t('salas.navAppsHint')}
              </p>
            </Field>

            <Field label={t('salas.navMsgLabel')}>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="ex: bloquear saída p/ operação Aurora"
                data-testid="sala-nav-message"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              />
            </Field>

            <p className="text-[10.5px] text-muted-on-light italic">
              {t('salas.kioskVersionHint')
                .replace('{n}', String(policy.version))
                .replace('{next}', String(policy.version + 1))}
            </p>

            <div className="flex items-center gap-2 pt-2 border-t border-border-light">
              <button
                type="submit"
                disabled={busy}
                data-testid="sala-nav-save"
                className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? t('common.saving') : t('salas.navSave')}
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
    </DialogShell>
  );
}

function EditDialog({
  workspace,
  onClose,
  onSaved,
}: {
  workspace: Workspace;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const initialConfig = (workspace.config ?? {}) as Record<string, unknown>;
  const [mode, setMode] = React.useState<'form' | 'json'>('form');
  const [homePage, setHomePage] = React.useState<string>(
    (initialConfig.home_page as string) ?? '',
  );
  const [tabs, setTabs] = React.useState<string[]>(() => {
    const t = initialConfig.tabs;
    return Array.isArray(t) ? (t as string[]) : [];
  });
  const [newTab, setNewTab] = React.useState('');
  const [text, setText] = React.useState(JSON.stringify(initialConfig, null, 2));
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode === 'form') {
      const next: Record<string, unknown> = {
        ...initialConfig,
        home_page: homePage || undefined,
        tabs,
      };
      Object.keys(next).forEach((k) => {
        if (next[k] === undefined) delete next[k];
      });
      setText(JSON.stringify(next, null, 2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homePage, tabs, mode]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      let payload: Record<string, unknown>;
      if (mode === 'json') {
        payload = JSON.parse(text);
      } else {
        payload = {
          ...initialConfig,
          ...(homePage ? { home_page: homePage } : {}),
          tabs,
        };
        if (!homePage) delete payload.home_page;
      }
      await Workspaces.publish(workspace.id, {
        config: payload,
        message: message.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao publicar');
    } finally {
      setBusy(false);
    }
  };

  const addTab = () => {
    const v = newTab.trim();
    if (!v || tabs.includes(v)) return;
    setTabs((cur) => [...cur, v]);
    setNewTab('');
  };

  const removeTab = (idx: number) => {
    setTabs((cur) => cur.filter((_, i) => i !== idx));
  };

  const moveTab = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= tabs.length) return;
    setTabs((cur) => {
      const next = [...cur];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  return (
    <DialogShell
      title={t('salas.editTitle')
        .replace('{name}', workspace.display_name)
        .replace('{version}', String(workspace.version))}
      onClose={onClose}
    >
      <div className="px-4 pt-3 border-b border-border-light flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMode('form')}
          data-testid="sala-edit-tab-form"
          className={`h-7 px-3 text-[11px] border-b-2 ${
            mode === 'form'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-on-light hover:text-text-on-light'
          }`}
        >
          {t('salas.editTabForm')}
        </button>
        <button
          type="button"
          onClick={() => setMode('json')}
          data-testid="sala-edit-tab-json"
          className={`h-7 px-3 text-[11px] border-b-2 ${
            mode === 'json'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-on-light hover:text-text-on-light'
          }`}
        >
          {t('salas.editTabJson')}
        </button>
      </div>
      <form onSubmit={save} className="p-4 space-y-3">
        {err && (
          <p className="text-[11px] text-danger font-mono" data-testid="sala-edit-error">
            {err}
          </p>
        )}

        {mode === 'form' ? (
          <>
            <Field label={t('salas.homePageLabel')}>
              <input
                type="text"
                value={homePage}
                onChange={(e) => setHomePage(e.target.value)}
                placeholder="ex: briefing"
                data-testid="sala-edit-homepage"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
            </Field>

            <Field label={t('salas.tabsLabel')}>
              <div
                data-testid="sala-edit-tabs"
                className="border border-border-light bg-white"
              >
                {tabs.length === 0 ? (
                  <p className="p-2 text-[10.5px] text-muted-on-light italic">
                    {t('salas.tabsEmpty')}
                  </p>
                ) : (
                  <ul>
                    {tabs.map((tab, idx) => (
                      <li
                        key={`${tab}-${idx}`}
                        data-testid={`sala-edit-tab-${idx}`}
                        className="flex items-center gap-2 px-2 py-1 border-b border-border-light last:border-b-0"
                      >
                        <span className="flex-1 text-[12px] font-mono">{tab}</span>
                        <button
                          type="button"
                          onClick={() => moveTab(idx, -1)}
                          disabled={idx === 0}
                          aria-label={t('common.moveUp')}
                          className="h-6 w-6 flex items-center justify-center bg-canvas-light border border-border-light hover:border-primary disabled:opacity-30 text-[10px]"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTab(idx, 1)}
                          disabled={idx === tabs.length - 1}
                          aria-label={t('common.moveDown')}
                          className="h-6 w-6 flex items-center justify-center bg-canvas-light border border-border-light hover:border-primary disabled:opacity-30 text-[10px]"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTab(idx)}
                          aria-label={t('tours.removePage')}
                          data-testid={`sala-edit-tab-remove-${idx}`}
                          className="h-6 w-6 flex items-center justify-center bg-canvas-light border border-border-light hover:border-danger hover:text-danger"
                        >
                          <X className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-1 p-2 border-t border-border-light">
                  <input
                    type="text"
                    value={newTab}
                    onChange={(e) => setNewTab(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTab();
                      }
                    }}
                    placeholder={t('salas.tabNewPlaceholder')}
                    data-testid="sala-edit-tab-new"
                    className="flex-1 h-7 px-2 text-[11.5px] bg-white border border-border-light outline-none focus:border-primary font-mono"
                  />
                  <button
                    type="button"
                    onClick={addTab}
                    data-testid="sala-edit-tab-add"
                    className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" strokeWidth={1.5} />
                    {t('salas.add')}
                  </button>
                </div>
              </div>
            </Field>
          </>
        ) : (
          <Field label={t('salas.configJsonLabel')}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              data-testid="sala-edit-config"
              spellCheck={false}
              className="w-full px-2 py-1.5 text-[11.5px] font-mono bg-white border border-border-light outline-none focus:border-primary"
            />
          </Field>
        )}

        <Field label={t('salas.versionMsgLabel')}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            data-testid="sala-edit-message"
            placeholder="ex: rearranjo do home page + 2 tabs novas"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          />
        </Field>
        <p className="text-[10.5px] text-muted-on-light italic">
          {t('salas.publishHint')}
        </p>
        <div className="flex items-center gap-2 pt-2 border-t border-border-light">
          <button
            type="submit"
            disabled={busy}
            data-testid="sala-edit-publish"
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? t('salas.publishing') : t('salas.publish')}
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
    </DialogShell>
  );
}

function HistoryDialog({
  workspace,
  onClose,
  onRepublished,
}: {
  workspace: Workspace;
  onClose: () => void;
  onRepublished: () => void;
}) {
  const t = useT();
  const askConfirm = useConfirm();
  const [vs, setVs] = React.useState<WorkspaceVersion[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    Workspaces.versions
      .list(workspace.id)
      .then(setVs)
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar histórico'));
  }, [workspace.id]);

  const republish = async (versionNumber: number) => {
    const ok = await askConfirm({
      title: t('salas.republishTitle').replace('{n}', String(versionNumber)),
      description: t('salas.republishDesc')
        .replace('{next}', String((workspace.version ?? 0) + 1))
        .replace('{n}', String(versionNumber)),
      tone: 'default',
      confirmLabel: t('salas.republish'),
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await Workspaces.versions.republish(workspace.id, versionNumber, {
        message: `republish of v${versionNumber}`,
      });
      onRepublished();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao republicar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      title={t('salas.historyTitle').replace('{name}', workspace.display_name)}
      onClose={onClose}
    >
      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
        {err && (
          <p className="text-[11px] text-danger font-mono" data-testid="sala-history-error">
            {err}
          </p>
        )}
        {!vs && !err && (
          <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
        )}
        {vs && vs.length === 0 && (
          <p className="text-[11.5px] text-muted-on-light italic">{t('salas.historyEmpty')}</p>
        )}
        {vs && vs.length > 0 && (
          <ul className="space-y-2" data-testid="sala-history-list">
            {vs.map((v) => (
              <li
                key={v.id}
                data-testid={`sala-version-${v.version_number}`}
                className="bg-canvas-light border border-border-light p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono font-semibold">
                    v{v.version_number}
                  </span>
                  <span className="flex-1 text-[10.5px] font-mono text-muted-on-light">
                    {new Date(v.published_at).toLocaleString('pt-BR')}
                  </span>
                  <button
                    type="button"
                    onClick={() => republish(v.version_number)}
                    disabled={busy || v.version_number === workspace.version}
                    data-testid={`sala-republish-${v.version_number}`}
                    className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                    {t('salas.republish')}
                  </button>
                </div>
                {v.message && (
                  <p className="text-[11px] text-muted-on-light mt-1">{v.message}</p>
                )}
                {v.signed_hash && (
                  <p className="text-[10px] font-mono text-muted-on-light mt-1 truncate">
                    hash: {v.signed_hash.slice(0, 16)}…
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogShell>
  );
}

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="sala-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[760px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <h2 className="text-[13px] font-semibold flex-1">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
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
