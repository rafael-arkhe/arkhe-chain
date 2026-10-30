'use client';

/**
 * /workshop — Biblioteca de aplicativos.
 *
 * Padrão de UX:
 *
 *   ┌─ Meus aplicativos ─────────────────────────────────────┐
 *   │ filter chips: Todos · Standalone · Ficha · Detalhe      │
 *   │ search + sort                                            │
 *   │ lista densa: nome · surface · target · timestamp · ações │
 *   └────────────────────────────────────────────────────────┘
 *
 * Criação pela toolbar: "Novo painel" (modal) e "Construir com
 * Arquiteto" (Soluções / AIP).
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Copy,
  Edit3,
  Eye,
  LayoutDashboard,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { SEED_REGISTRY, pickFichaSeed, pickSearchResultSeed } from '@/lib/workshop/seeds';
import { Workshop } from '@/lib/workshop/client';
import type { WorkshopApp } from '@/lib/workshop/types';
import {
  NovoAppModal,
  type CreatePayload,
} from '@/components/workshop/novo-app-modal';
import { cn } from '@/lib/cn';
import { formatDataHoraBR } from '@/lib/datetime';
import { useT } from '@/lib/i18n/provider';
import { useCan } from '@/lib/auth/useAuth';
import { confirmModal } from '@/components/dialog/confirm-dialog';

type Source = 'seed' | 'local' | 'backend';
const SOURCE_LABEL: Record<Source, string> = {
  seed: 'seed',
  local: 'local',
  backend: 'servidor',
};

type Surface = 'standalone' | 'entity_ficha' | 'search_result';

const SURFACE_LABEL: Record<Surface, string> = {
  standalone: 'Página própria',
  entity_ficha: 'Ficha de entidade',
  search_result: 'Resultado de busca',
};

const SURFACE_STYLE: Record<Surface, string> = {
  standalone: 'bg-muted-on-light/10 text-muted-on-light border-border-light',
  entity_ficha: 'bg-primary/10 text-primary border-primary/40',
  search_result: 'bg-success/10 text-success border-success/40',
};

type Row = {
  id: string;
  display: string;
  description?: string | null;
  source: Source;
  updated_at?: string | null;
  surface?: Surface;
  target_kind?: string | null;
  target_source?: string | null;
  deleted_at?: string | null;
};

type SurfaceFilter = 'all' | Surface;
type SortKey = 'recent' | 'name' | 'created';

const LOCAL_KEY = (id: string) => `workshop.app.${id}`;

function readLocalApps(): WorkshopApp[] {
  if (typeof window === 'undefined') return [];
  const out: WorkshopApp[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith('workshop.app.')) continue;
    try {
      out.push(JSON.parse(window.localStorage.getItem(k) || '{}') as WorkshopApp);
    } catch {
      /* skip */
    }
  }
  return out;
}

export default function WorkshopAppsPage() {
  const router = useRouter();
  const t = useT();
  // Atalho de descoberta para o Arquiteto (Soluções) — só aparece se o
  // operador puder abrir a página de destino. Não duplica nada: deep-link.
  const canArchitect = useCan('solution.diagram.read');
  const [rows, setRows] = useState<Row[]>([]);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  // F1 remoção — Lixeira (apps soft-deletados) + estado da view + busy por linha.
  const canPurge = useCan('workshop.apps.purge');
  const [view, setView] = useState<'apps' | 'trash'>('apps');
  const [trashRows, setTrashRows] = useState<WorkshopApp[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => {
    const map = new Map<string, Row>();
    // Não jogamos seeds no "Meus aplicativos" — eles vivem na seção
    // de templates. Só apps locais e do backend aparecem aqui.
    for (const a of readLocalApps()) {
      map.set(a.id, {
        id: a.id,
        display: a.display || a.external_id || a.id,
        description: a.description ?? null,
        source: 'local',
        updated_at: a.updated_at ?? null,
      });
    }
    setRows(
      Array.from(map.values()).sort((a, b) =>
        (a.display ?? a.id).localeCompare(b.display ?? b.id),
      ),
    );
  };

  // Re-busca os apps do backend. Dropa as linhas backend antigas e re-adiciona
  // — assim um restore reaparece e um soft-delete some sem reload de página.
  const refetchBackend = () => {
    Workshop.list()
      .then((apps) => {
        setBackendStatus('ok');
        setRows((prev) => {
          const m = new Map(prev.filter((r) => r.source !== 'backend').map((r) => [r.id, r]));
          for (const a of apps) {
            m.set(a.id, {
              id: a.id,
              display: a.display || a.external_id || a.id,
              description: a.description ?? null,
              source: 'backend',
              updated_at: a.updated_at ?? null,
              surface: (a.surface ?? 'standalone') as Surface,
              target_kind: a.target_kind ?? null,
              target_source: a.target_source ?? null,
            });
          }
          return Array.from(m.values());
        });
      })
      .catch(() => {
        setBackendStatus('err');
      });
  };

  const reloadTrash = () => {
    Workshop.listTrashed().then(setTrashRows).catch(() => setTrashRows([]));
  };

  useEffect(() => {
    reload();
    refetchBackend();
    reloadTrash();
  }, []);

  // ── Filtros + sort + search ──────────────────────────────────────
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (surfaceFilter !== 'all') {
        const s = r.surface ?? 'standalone';
        if (s !== surfaceFilter) return false;
      }
      if (!q) return true;
      const hay = [r.display, r.id, r.description ?? '', r.target_kind ?? '', r.target_source ?? '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    const sorted = [...list];
    if (sortKey === 'name') {
      sorted.sort((a, b) => a.display.localeCompare(b.display));
    } else {
      sorted.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    }
    return sorted;
  }, [rows, surfaceFilter, query, sortKey]);

  const counts = useMemo(() => {
    const out: Record<SurfaceFilter, number> = {
      all: rows.length,
      standalone: 0,
      entity_ficha: 0,
      search_result: 0,
    };
    for (const r of rows) {
      const s = (r.surface ?? 'standalone') as Surface;
      out[s] += 1;
    }
    return out;
  }, [rows]);

  // ── Modal ────────────────────────────────────────────────────────
  const [novoOpen, setNovoOpen] = useState(false);

  const openBlankNew = () => setNovoOpen(true);

  const createNew = async (payload: CreatePayload) => {
    // Seed do layout inicial por surface (ficha/busca) ou blank.
    const seed: WorkshopApp | null =
      payload.surface === 'entity_ficha'
        ? pickFichaSeed(payload.target_kind)
        : payload.surface === 'search_result'
          ? pickSearchResultSeed(payload.target_source)
          : null;
    const seededLayout = seed?.layout ?? { columns: 20, root: [] };
    const seededVariables = seed?.variables ?? [];
    const seededOverlays = seed?.overlays ?? undefined;

    try {
      const created = await Workshop.create({
        external_id: payload.slug,
        display: payload.display,
        schema_version: 2,
        variables: seededVariables,
        layout: seededLayout,
        surface: payload.surface,
        target_kind: payload.target_kind ?? null,
        target_source: payload.target_source ?? null,
        overlays: seededOverlays,
      });
      router.push(`/workshop/edit/${created.id}`);
      return;
    } catch (e) {
      if (payload.surface !== 'standalone') {
        throw e;
      }
      const id = `local.app.${Date.now()}`;
      const app: WorkshopApp = {
        id,
        external_id: payload.slug,
        display: payload.display,
        schema_version: 2,
        variables: seededVariables,
        layout: seededLayout,
        surface: 'standalone',
        overlays: seededOverlays,
      };
      window.localStorage.setItem(LOCAL_KEY(id), JSON.stringify(app));
      router.push(`/workshop/edit/${id}`);
    }
  };

  const duplicate = (id: string) => {
    const src = SEED_REGISTRY[id] ?? null;
    const local = window.localStorage.getItem(LOCAL_KEY(id));
    const base: WorkshopApp | null = local
      ? (JSON.parse(local) as WorkshopApp)
      : src;
    if (!base) return;
    const newId = `local.app.${Date.now()}`;
    const copy: WorkshopApp = {
      ...JSON.parse(JSON.stringify(base)),
      id: newId,
      external_id: newId,
      display: `${base.display} (cópia)`,
    };
    window.localStorage.setItem(LOCAL_KEY(newId), JSON.stringify(copy));
    router.push(`/workshop/edit/${newId}`);
  };

  const removeLocal = async (id: string) => {
    if (!(await confirmModal({ title: `Remover edições locais de "${id}"?`, tone: 'danger', confirmLabel: 'Remover' }))) return;
    window.localStorage.removeItem(LOCAL_KEY(id));
    reload();
  };

  // F1 remoção — soft-delete (vai pra Lixeira), restaurar e excluir definitivo.
  const softDelete = async (id: string, display: string) => {
    if (!(await confirmModal({ title: t('workshop.trash.confirmDelete').replace('{name}', display), description: t('workshop.trash.softInfo'), tone: 'danger', confirmLabel: 'Remover' }))) return;
    setBusyId(id);
    try {
      await Workshop.delete(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      reloadTrash();
    } finally {
      setBusyId(null);
    }
  };
  const restoreApp = async (id: string) => {
    setBusyId(id);
    try {
      await Workshop.restore(id);
      setTrashRows((prev) => prev.filter((r) => r.id !== id));
      refetchBackend();
    } finally {
      setBusyId(null);
    }
  };
  // Excluir DEFINITIVAMENTE = remover TUDO relacionado. Antes só fazia
  // ``{purge:true}`` (apaga a linha do app e deixa Operação/Espaço/Páginas/tipos/
  // ações/agentes/fluxos/funções na ontologia → rebuild colidia com "já existe").
  // Agora: busca o inventário (teardown-plan), MOSTRA o que será removido no modal,
  // e — quando o app foi materializado pelo AIP — executa o teardown COMPLETO da
  // construção (``teardownBuild``), não só o purge. Fail-soft: sem plano/perm, purge.
  const purgeApp = async (id: string, display: string) => {
    let inventory = '';
    let hasBuild = false;
    try {
      const plan = await Workshop.teardownPlan(id);
      if (plan?.available) {
        hasBuild = true;
        const c = plan.counts || {};
        const lines: Array<[string, number | undefined]> = [
          ['workshop.teardown.ontologyTypes', c.ontology_types],
          ['workshop.teardown.actions', c.action_types],
          ['workshop.teardown.agents', c.agents],
          ['workshop.teardown.flows', c.flows],
          ['workshop.teardown.functions', c.logic_functions],
          ['workshop.teardown.operacao', c.operacao],
          ['workshop.teardown.espaco', c.espaco],
          ['workshop.teardown.paginas', c.paginas],
        ];
        inventory = lines
          .filter(([, n]) => (n ?? 0) > 0)
          .map(([k, n]) => `${n} ${t(k)}`)
          .join(' · ');
      }
    } catch {
      /* sem plano (sem perm/sem build) → cai no purge simples */
    }
    const description =
      hasBuild
        ? `${t('workshop.teardown.alsoRemoves')} ${inventory || '—'}. ${t('workshop.teardown.irreversible')}`
        : `${t('workshop.teardown.nothingExtra')} ${t('workshop.teardown.irreversible')}`;
    if (!(await confirmModal({ title: t('workshop.trash.confirmPurge').replace('{name}', display), description, tone: 'danger', confirmLabel: 'Excluir definitivamente' }))) return;
    setBusyId(id);
    try {
      await Workshop.delete(id, hasBuild ? { teardownBuild: true } : { purge: true });
      setTrashRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <RequirePerm perm="security.painel.view">
      <PageShell
        title="Painéis"
        subtitle={
          backendStatus === 'err'
            ? 'Modo local · alterações ficam neste navegador'
            : backendStatus === 'ok'
              ? 'Sincronizado com o servidor'
              : 'Carregando…'
        }
        theme="light"
        toolbar={
          <div className="flex items-center gap-2">
            {canArchitect && (
              <Link
                href="/paginas/solutions/view"
                data-testid="workshop-build-architect"
                className="h-7 px-2.5 text-[11px] border border-border-light text-text-on-light hover:bg-muted-on-light/10 flex items-center gap-1.5"
              >
                <Share2 className="w-3 h-3" strokeWidth={1.5} />{' '}
                {t('workshop.buildWithArchitect')}
              </Link>
            )}
            <button
              type="button"
              onClick={openBlankNew}
              data-testid="workshop-new"
              className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" strokeWidth={1.5} /> Novo painel
            </button>
          </div>
        }
      >
        <div className="h-full overflow-y-auto">
          {/* ─── Meus aplicativos ────────────────────────────────── */}
          <section className="px-4 pt-4 pb-6">
            <header className="mb-3 flex items-end justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono">
                  Meus painéis
                </p>
                <h2 className="text-[14px] font-semibold text-text-on-light mt-1">
                  {view === 'trash'
                    ? `${t('workshop.trash.title')} · ${trashRows.length}`
                    : `Painéis criados · ${rows.length}`}
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Toggle Painéis / Lixeira */}
                <div className="flex items-center border border-border-light">
                  <button
                    type="button"
                    onClick={() => setView('apps')}
                    data-testid="workshop-view-apps"
                    className={cn(
                      'h-7 px-2.5 text-[11px] flex items-center gap-1.5',
                      view === 'apps'
                        ? 'bg-primary text-white'
                        : 'bg-white text-muted-on-light hover:text-text-on-light',
                    )}
                  >
                    <LayoutDashboard className="w-3 h-3" strokeWidth={1.5} /> {t('workshop.view.apps')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('trash')}
                    data-testid="workshop-view-trash"
                    className={cn(
                      'h-7 px-2.5 text-[11px] flex items-center gap-1.5 border-l border-border-light',
                      view === 'trash'
                        ? 'bg-primary text-white'
                        : 'bg-white text-muted-on-light hover:text-text-on-light',
                    )}
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.5} /> {t('workshop.trash.title')}
                    {trashRows.length > 0 && (
                      <span className="text-[9px] font-mono px-1 border border-current/30">
                        {trashRows.length}
                      </span>
                    )}
                  </button>
                </div>
                {view === 'apps' && (
                  <>
                    {/* Search */}
                    <div className="relative">
                      <Search
                        className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light"
                        strokeWidth={1.5}
                      />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar por nome, tipo ou fonte…"
                        data-testid="workshop-search"
                        className="w-64 h-7 pl-7 pr-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
                      />
                    </div>
                    {/* Sort */}
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      aria-label="Ordenar"
                      className="h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
                    >
                      <option value="recent">Mais recentes</option>
                      <option value="name">Nome (A→Z)</option>
                    </select>
                  </>
                )}
              </div>
            </header>

            {/* Filter chips (só na view de apps) */}
            {view === 'apps' && (
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <SurfaceChip
                  label="Todos"
                  count={counts.all}
                  active={surfaceFilter === 'all'}
                  onClick={() => setSurfaceFilter('all')}
                />
                <SurfaceChip
                  label="Página própria"
                  count={counts.standalone}
                  active={surfaceFilter === 'standalone'}
                  onClick={() => setSurfaceFilter('standalone')}
                />
                <SurfaceChip
                  label="Ficha de entidade"
                  count={counts.entity_ficha}
                  active={surfaceFilter === 'entity_ficha'}
                  onClick={() => setSurfaceFilter('entity_ficha')}
                />
                <SurfaceChip
                  label="Resultado de busca"
                  count={counts.search_result}
                  active={surfaceFilter === 'search_result'}
                  onClick={() => setSurfaceFilter('search_result')}
                />
              </div>
            )}

            {/* Lista densa */}
            {view === 'apps' ? (
              <div className="bg-white border border-border-light">
                {filteredRows.length === 0 && (
                  <div className="px-4 py-12 text-center">
                    <Activity
                      className="w-6 h-6 text-muted-on-light/40 mx-auto mb-2"
                      strokeWidth={1.5}
                    />
                    <p className="text-[12px] text-muted-on-light">
                      {rows.length === 0
                        ? 'Você ainda não criou nenhum painel.'
                        : 'Nenhum painel casa com os filtros atuais.'}
                    </p>
                    <p className="text-[11px] text-muted-on-light/70 mt-1">
                      {rows.length === 0
                        ? 'Comece pelos templates acima ou clique em "Novo painel".'
                        : 'Tente limpar a busca ou trocar o filtro.'}
                    </p>
                  </div>
                )}
                {filteredRows.length > 0 && (
                  <ul className="divide-y divide-border-light/60">
                    {filteredRows.map((r) => (
                      <AppRow
                        key={r.id}
                        row={r}
                        mode="apps"
                        busy={busyId === r.id}
                        canPurge={canPurge}
                        onDuplicate={() => duplicate(r.id)}
                        onRemoveLocal={() => removeLocal(r.id)}
                        onDelete={() => softDelete(r.id, r.display)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="bg-white border border-border-light" data-testid="workshop-trash-list">
                {trashRows.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <Trash2
                      className="w-6 h-6 text-muted-on-light/40 mx-auto mb-2"
                      strokeWidth={1.5}
                    />
                    <p className="text-[12px] text-muted-on-light">{t('workshop.trash.empty')}</p>
                    <p className="text-[11px] text-muted-on-light/70 mt-1">
                      {t('workshop.trash.emptyHint')}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border-light/60">
                    {trashRows.map((a) => (
                      <AppRow
                        key={a.id}
                        row={{
                          id: a.id,
                          display: a.display || a.external_id || a.id,
                          description: a.description ?? null,
                          source: 'backend',
                          surface: (a.surface ?? 'standalone') as Surface,
                          target_kind: a.target_kind ?? null,
                          target_source: a.target_source ?? null,
                          deleted_at: a.deleted_at ?? null,
                        }}
                        mode="trash"
                        busy={busyId === a.id}
                        canPurge={canPurge}
                        onRestore={() => restoreApp(a.id)}
                        onPurge={() => purgeApp(a.id, a.display || a.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      </PageShell>

      <NovoAppModal
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        onCreate={createNew}
      />
    </RequirePerm>
  );
}

/* -------------------------------------------------------------------------- */
/* Componentes auxiliares                                                     */
/* -------------------------------------------------------------------------- */

function SurfaceChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
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
        'h-7 px-2.5 text-[11px] border transition-colors flex items-center gap-1.5',
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-canvas-light text-muted-on-light border-border-light hover:border-primary hover:text-text-on-light',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'text-[9px] font-mono px-1 py-0.5 border',
          active
            ? 'border-white/30 text-white/80'
            : 'border-border-light text-muted-on-light/70',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function AppRow({
  row,
  mode = 'apps',
  busy = false,
  canPurge = false,
  onDuplicate,
  onRemoveLocal,
  onDelete,
  onRestore,
  onPurge,
}: {
  row: Row;
  mode?: 'apps' | 'trash';
  busy?: boolean;
  canPurge?: boolean;
  onDuplicate?: () => void;
  onRemoveLocal?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onPurge?: () => void;
}) {
  const t = useT();
  const surface = row.surface ?? 'standalone';
  return (
    <li
      data-testid={`workshop-row-${row.id}`}
      className={cn(
        'px-3 py-2 flex items-center gap-3 transition-colors',
        mode === 'trash' ? 'opacity-90' : 'hover:bg-raised-light/30',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-[12px] font-medium truncate text-text-on-light">
            {row.display}
          </p>
          <span
            className={cn(
              'px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border',
              row.source === 'local' &&
                'bg-warning/10 text-warning border-warning/40',
              row.source === 'backend' &&
                'bg-success/10 text-success border-success/40',
              row.source === 'seed' &&
                'bg-muted-on-light/10 text-muted-on-light border-border-light',
            )}
          >
            {SOURCE_LABEL[row.source]}
          </span>
          <span
            className={cn(
              'px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border',
              SURFACE_STYLE[surface],
            )}
            title={
              surface === 'entity_ficha'
                ? `Substitui /ficha de kind=${row.target_kind}`
                : surface === 'search_result'
                  ? `Substitui detalhe de source=${row.target_source}`
                  : 'Renderiza em /workshop/<id>'
            }
          >
            {SURFACE_LABEL[surface]}
            {row.target_kind ? ` · ${row.target_kind}` : ''}
            {row.target_source ? ` · ${row.target_source}` : ''}
          </span>
        </div>
        <p className="text-[10px] font-mono text-muted-on-light truncate mt-0.5">
          {row.id}
          {mode === 'trash' && row.deleted_at
            ? ` · ${t('workshop.trash.deletedAt')} ${formatDataHoraBR(row.deleted_at)}`
            : row.updated_at
              ? ` · editado ${formatDataHoraBR(row.updated_at)}`
              : ''}
        </p>
        {row.description && (
          <p className="text-[10px] text-muted-on-light truncate mt-0.5">
            {row.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {mode === 'trash' ? (
          <>
            <button
              type="button"
              onClick={onRestore}
              disabled={busy}
              data-testid={`workshop-restore-${row.id}`}
              className="h-7 px-2.5 flex items-center gap-1.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary disabled:opacity-50"
              title={t('workshop.trash.restore')}
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> {t('workshop.trash.restore')}
            </button>
            {canPurge && (
              <button
                type="button"
                onClick={onPurge}
                disabled={busy}
                data-testid={`workshop-purge-${row.id}`}
                className="h-7 px-2.5 flex items-center gap-1.5 text-[11px] bg-canvas-light border border-border-light hover:border-danger hover:text-danger disabled:opacity-50"
                title={t('workshop.trash.purge')}
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} /> {t('workshop.trash.purge')}
              </button>
            )}
          </>
        ) : (
          <>
            <Link
              href={`/workshop/view/${row.id}`}
              className="h-7 w-7 flex items-center justify-center bg-canvas-light border border-border-light hover:border-primary"
              title="Preview"
            >
              <Eye className="w-3 h-3" strokeWidth={1.5} />
            </Link>
            <Link
              href={`/workshop/edit/${row.id}`}
              className="h-7 w-7 flex items-center justify-center bg-canvas-light border border-border-light hover:border-primary"
              title="Editar"
            >
              <Edit3 className="w-3 h-3" strokeWidth={1.5} />
            </Link>
            <button
              type="button"
              onClick={onDuplicate}
              className="h-7 w-7 flex items-center justify-center bg-canvas-light border border-border-light hover:border-primary"
              title="Duplicar"
            >
              <Copy className="w-3 h-3" strokeWidth={1.5} />
            </button>
            {row.source === 'local' ? (
              <button
                type="button"
                onClick={onRemoveLocal}
                className="h-7 w-7 flex items-center justify-center bg-canvas-light border border-border-light hover:border-danger hover:text-danger"
                title="Limpar local"
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                data-testid={`workshop-delete-${row.id}`}
                className="h-7 w-7 flex items-center justify-center bg-canvas-light border border-border-light hover:border-danger hover:text-danger disabled:opacity-50"
                title={t('workshop.trash.delete')}
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

