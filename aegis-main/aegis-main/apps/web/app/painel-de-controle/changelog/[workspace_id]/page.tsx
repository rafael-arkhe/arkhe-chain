'use client';

/**
 * Changelog do painel (Workspace) — Wave G.2 (2026-05-23).
 *
 * Lista todos os LineageEvents do tenant filtrados client-side por
 * `metadata_.app_id == workspace_id`, ordenados por timestamp desc.
 * Reusa o endpoint global `/lineage/events` (sem precisar de filtro
 * backend novo nesta wave) e aplica o recorte no frontend.
 *
 * Filtros adicionais:
 *   - event_type (input livre, busca prefixada)
 *   - actor      (input livre)
 *   - status     (committed / failed / pending — chips)
 *
 * Acesso via topbar do workshop-editor: "Histórico de mudanças" abre
 * `/painel-de-controle/changelog/{workspace_id}` em nova aba.
 *
 * Não há entry na sidenav global — esta é página contextual ao painel.
 */

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Activity, Search, Filter, ArrowLeft, AlertCircle } from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { Lineage, type LineageEvent } from '@/lib/api';
import { Workshop } from '@/lib/workshop/client';
import type { WorkshopApp } from '@/lib/workshop/types';

const STATUS_OPTIONS = ['committed', 'failed', 'pending'] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

export default function ChangelogPage() {
  const params = useParams<{ workspace_id: string }>();
  const workspaceId = params?.workspace_id ?? '';
  return (
    <RequirePerm perm="data.lineage.read">
      <ChangelogView workspaceId={workspaceId} />
    </RequirePerm>
  );
}

function ChangelogView({ workspaceId }: { workspaceId: string }) {
  const [events, setEvents] = React.useState<LineageEvent[] | null>(null);
  const [app, setApp] = React.useState<WorkshopApp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [eventTypeFilter, setEventTypeFilter] = React.useState('');
  const [actorFilter, setActorFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusOption | ''>('');
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const refresh = React.useCallback(() => {
    setLoading(true);
    setErr(null);
    // limit=200 alinhado com /lineage page existente — limites maiores
    // (500+) podem disparar 500 no backend dependendo do tamanho do
    // tenant. Filtragem por workspace ocorre client-side abaixo.
    Lineage.listEvents({ limit: 200 })
      .then(setEvents)
      .catch((e: unknown) =>
        setErr(e instanceof Error ? e.message : 'Falha ao carregar histórico'),
      )
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!workspaceId) return;
    Workshop.get(workspaceId).then(setApp).catch(() => setApp(null));
  }, [workspaceId]);

  // Client-side filter: metadata.app_id, workspace_id, ou painel_app_id.
  // Múltiplos campos cobrem eventos das diferentes waves.
  const filtered = React.useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      const meta = (e.metadata_ ?? {}) as Record<string, unknown>;
      const wsCandidates = [
        meta.app_id,
        meta.workspace_id,
        meta.painel_app_id,
        meta.target_workspace,
      ].filter((x) => typeof x === 'string' && x);
      const isThisWorkspace =
        wsCandidates.length === 0
          ? false
          : wsCandidates.includes(workspaceId);
      if (!isThisWorkspace) return false;
      if (eventTypeFilter && !e.event_type.includes(eventTypeFilter.trim()))
        return false;
      if (
        actorFilter &&
        !(e.actor ?? '').toLowerCase().includes(actorFilter.trim().toLowerCase())
      )
        return false;
      if (statusFilter && e.status !== statusFilter) return false;
      return true;
    });
  }, [events, workspaceId, eventTypeFilter, actorFilter, statusFilter]);

  const total = events?.length ?? 0;
  const showing = filtered.length;

  return (
    <>
      <CpPageHeader
        title="Histórico de mudanças"
        subtitle={
          app
            ? `LineageEvents do painel "${app.display}" (${workspaceId}).`
            : `LineageEvents do painel ${workspaceId}.`
        }
      />
      <div className="p-6 max-w-5xl space-y-4" data-testid="changelog-page">
        <div className="flex items-center gap-2">
          <a
            href="/painel-de-controle/app-shell"
            data-testid="changelog-back-to-shell"
            className="h-7 px-2 text-caption border border-border-light bg-white hover:border-primary flex items-center gap-1.5 text-text-on-light"
          >
            <ArrowLeft className="w-3 h-3" strokeWidth={1.5} /> Voltar para painéis
          </a>
          <a
            href={`/workshop/edit/${workspaceId}`}
            data-testid="changelog-open-editor"
            className="h-7 px-2 text-caption border border-border-light bg-white hover:border-primary flex items-center gap-1.5 text-text-on-light"
          >
            Abrir editor
          </a>
        </div>

        <section className="bg-canvas-light border border-border-light p-3 space-y-3">
          <header className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" strokeWidth={1.5} />
            <p className="text-caption uppercase tracking-[0.16em] font-semibold flex-1">
              Filtros
            </p>
            <span
              className="text-caption font-mono text-muted-on-light"
              data-testid="changelog-count"
            >
              {showing}/{total} eventos
            </span>
          </header>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              placeholder="event_type contém…"
              data-testid="changelog-filter-event-type"
              className="h-8 px-2 text-small bg-white border border-border-light outline-none focus:border-primary font-mono"
            />
            <input
              type="text"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="ator (username)"
              data-testid="changelog-filter-actor"
              className="h-8 px-2 text-small bg-white border border-border-light outline-none focus:border-primary font-mono"
            />
            <div className="flex items-center gap-1.5" data-testid="changelog-status-chips">
              <button
                type="button"
                onClick={() => setStatusFilter('')}
                aria-pressed={statusFilter === ''}
                data-testid="changelog-status-all"
                className={
                  statusFilter === ''
                    ? 'h-7 px-2 text-caption font-mono border border-primary bg-primary text-white'
                    : 'h-7 px-2 text-caption font-mono border border-border-light bg-white text-text-on-light hover:border-primary'
                }
              >
                Todos
              </button>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  aria-pressed={statusFilter === s}
                  data-testid={`changelog-status-${s}`}
                  className={
                    statusFilter === s
                      ? 'h-7 px-2 text-caption font-mono border border-primary bg-primary text-white'
                      : 'h-7 px-2 text-caption font-mono border border-border-light bg-white text-text-on-light hover:border-primary'
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {err && (
          <p
            className="text-small text-danger font-mono"
            data-testid="changelog-error"
          >
            {err}
          </p>
        )}

        {loading && (
          <p className="text-small text-muted-on-light italic">Carregando…</p>
        )}

        {!loading && events && filtered.length === 0 && (
          <CpEmptyState
            icon={Search}
            title="Sem eventos para este painel"
            description="Nenhum LineageEvent encontrado para o painel atual com os filtros vigentes."
            cta={{
              label: 'Limpar filtros',
              onClick: () => {
                setEventTypeFilter('');
                setActorFilter('');
                setStatusFilter('');
              },
              testId: 'changelog-clear-filters',
            }}
          />
        )}

        {!loading && filtered.length > 0 && (
          <ul className="space-y-1" data-testid="changelog-list">
            {filtered.map((e) => {
              const isExpanded = !!expanded[e.id];
              const metaKeys = Object.keys(e.metadata_ ?? {});
              return (
                <li
                  key={e.id}
                  data-testid={`changelog-event-${e.id}`}
                  className="bg-canvas-light border border-border-light p-3"
                >
                  <header className="flex items-center gap-2">
                    <Activity
                      className="w-3 h-3 text-primary shrink-0"
                      strokeWidth={1.5}
                    />
                    <span
                      className={`text-caption font-mono uppercase px-1.5 h-4 inline-flex items-center border ${
                        e.status === 'committed'
                          ? 'border-success text-success bg-white'
                          : e.status === 'failed'
                          ? 'border-danger text-danger bg-white'
                          : 'border-border-light text-muted-on-light bg-white'
                      }`}
                    >
                      {e.status}
                    </span>
                    <p className="text-small font-mono font-semibold truncate flex-1">
                      {e.event_type}
                    </p>
                    <span className="text-caption font-mono text-muted-on-light shrink-0">
                      {new Date(e.timestamp).toLocaleString('pt-BR')}
                    </span>
                  </header>
                  <p className="text-caption font-mono text-muted-on-light mt-1 truncate">
                    ator: {e.actor ?? 'system'}
                  </p>
                  {metaKeys.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [e.id]: !isExpanded }))
                        }
                        data-testid={`changelog-event-toggle-${e.id}`}
                        className="h-6 px-2 text-caption font-mono border border-border-light bg-white hover:border-primary text-text-on-light"
                      >
                        {isExpanded ? 'Ocultar metadata' : `Ver metadata (${metaKeys.length})`}
                      </button>
                      {isExpanded && (
                        <pre
                          data-testid={`changelog-event-meta-${e.id}`}
                          className="text-caption font-mono text-text-on-light mt-1 bg-white border border-border-light px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all"
                        >
                          {JSON.stringify(e.metadata_, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && events && total === 0 && (
          <p className="text-caption italic text-muted-on-light flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
            Sem nenhum LineageEvent no tenant. Faça uma mudança no painel para
            ver o histórico aqui.
          </p>
        )}
      </div>
    </>
  );
}
