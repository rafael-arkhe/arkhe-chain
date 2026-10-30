'use client';

/**
 * buscas_monitoradas — GESTÃO das buscas salvas que o operador monitora (SearchFeeds).
 *
 * É o par de gestão do gesto "Salvar busca + monitorar" do /buscar: lista os feeds do
 * tenant (GET /alerts/feeds — API REAL), com pausar/retomar (PATCH active), editar
 * cadência (PATCH cadence_seconds) e excluir (DELETE). Sem isso o operador criava alerta
 * no escuro. Vive como SEÇÃO da página /alertas (parametrizável).
 *
 * Estados honestos (loading/vazio/erro), nunca dado fake; na paleta/editor renderiza
 * exemplos via mockVariables (feeds_demo). Ações gated por perm alerts.feeds.subscribe;
 * confirmModal/promptModal (nunca diálogo nativo). A caixa de alertas DISPARADOS é o
 * alert_list (outro widget) — aqui é a configuração dos feeds.
 */
import * as React from 'react';
import { Bell, Pause, Play, Trash2, Clock, RefreshCw, AlertTriangle, Inbox } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { Alerts } from '@/lib/api';
import type { AlertFeed } from '@/lib/api/types';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { confirmModal, promptModal } from '@/components/dialog/confirm-dialog';

// ── Mocks da paleta (regra: widget data-driven SEM mock = placeholder) ─────
const MOCK_FEEDS: AlertFeed[] = [
  { id: 'exemplo-1', name: 'Exemplo — placa monitorada', filters: { query: 'ABC1D23' }, cadence_seconds: 300, active: true },
  { id: 'exemplo-2', name: 'Exemplo — nome monitorado', filters: { query: 'fulano de exemplo' }, cadence_seconds: 900, active: false },
];

type LoadState = 'loading' | 'ready' | 'error';

function cadenceHuman(s: number): string {
  if (s > 0 && s % 3600 === 0) return `${s / 3600}h`;
  if (s > 0 && s % 60 === 0) return `${s / 60} min`;
  return `${s}s`;
}

function feedQuery(f: AlertFeed): string {
  const q = (f.filters as { query?: unknown } | undefined)?.query;
  return typeof q === 'string' ? q : '';
}

function BuscasMonitoradasWidget({ appId, variables }: WidgetRenderProps) {
  const t = useT();
  const canManage = useCan('alerts.feeds.subscribe');
  const isDesign = appId === 'palette-preview' || appId === 'editor';
  const demo =
    isDesign && Array.isArray(variables.feeds_demo) ? (variables.feeds_demo as AlertFeed[]) : null;

  const [rows, setRows] = React.useState<AlertFeed[]>(demo ?? []);
  const [state, setState] = React.useState<LoadState>(demo ? 'ready' : 'loading');
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (demo) return;
    setState('loading');
    Alerts.feeds
      .list()
      .then((d) => {
        setRows(Array.isArray(d) ? d : []);
        setState('ready');
      })
      .catch(() => {
        setRows([]);
        setState('error');
      });
  }, [demo]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(f: AlertFeed) {
    if (busy || demo) return;
    setBusy(f.id);
    try {
      const upd = await Alerts.feeds.update(f.id, { active: !f.active });
      setRows((prev) => prev.map((r) => (r.id === f.id ? upd : r)));
    } catch {
      /* estado honesto: nada muda; pode tentar de novo */
    } finally {
      setBusy(null);
    }
  }

  async function editCadence(f: AlertFeed) {
    if (busy || demo) return;
    const val = await promptModal({
      title: t('buscasMonitoradas.editarCadencia'),
      description: t('buscasMonitoradas.cadenciaPrompt'),
      defaultValue: String(f.cadence_seconds),
      confirmLabel: t('buscasMonitoradas.salvar'),
    });
    if (val == null) return;
    const secs = parseInt(val, 10);
    if (!Number.isFinite(secs) || secs < 60) return;
    setBusy(f.id);
    try {
      const upd = await Alerts.feeds.update(f.id, { cadence_seconds: secs });
      setRows((prev) => prev.map((r) => (r.id === f.id ? upd : r)));
    } catch {
      /* honesto */
    } finally {
      setBusy(null);
    }
  }

  async function remove(f: AlertFeed) {
    if (busy || demo) return;
    const ok = await confirmModal({
      title: t('buscasMonitoradas.excluir'),
      description: t('buscasMonitoradas.excluirConfirma'),
      confirmLabel: t('buscasMonitoradas.excluir'),
    });
    if (!ok) return;
    setBusy(f.id);
    try {
      await Alerts.feeds.delete(f.id);
      setRows((prev) => prev.filter((r) => r.id !== f.id));
    } catch {
      /* honesto */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="bg-panel-light border border-border-light h-full flex flex-col overflow-hidden"
      data-testid="buscas-monitoradas"
    >
      <div className="h-9 px-3 border-b border-border-light flex items-center gap-2 shrink-0">
        <Bell className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light">
          {t('buscasMonitoradas.titulo')}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-on-light">
          {state === 'ready' ? rows.length : ''}
        </span>
        {!demo && (
          <button
            type="button"
            onClick={load}
            title={t('buscasMonitoradas.atualizar')}
            data-testid="buscas-monitoradas-reload"
            className="w-6 h-6 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
          >
            <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {state === 'loading' && (
        <div className="flex-1 flex items-center justify-center p-6 text-[12px] text-muted-on-light">
          {t('buscasMonitoradas.carregando')}
        </div>
      )}

      {state === 'error' && (
        <div
          data-testid="buscas-monitoradas-error"
          className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center"
        >
          <AlertTriangle className="w-5 h-5 text-danger" strokeWidth={1.5} />
          <p className="text-[12px] font-semibold">{t('buscasMonitoradas.erro')}</p>
          <button
            type="button"
            onClick={load}
            className="h-7 px-3 text-[11px] bg-white border border-border-light hover:border-primary"
          >
            {t('buscasMonitoradas.atualizar')}
          </button>
        </div>
      )}

      {state === 'ready' && rows.length === 0 && (
        <div
          data-testid="buscas-monitoradas-empty"
          className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center"
        >
          <Inbox className="w-5 h-5 text-muted-on-light" strokeWidth={1.5} />
          <p className="text-[12px] text-muted-on-light">{t('buscasMonitoradas.vazio')}</p>
        </div>
      )}

      {state === 'ready' && rows.length > 0 && (
        <ul className="flex-1 overflow-y-auto scrollbar-hide divide-y divide-border-light">
          {rows.map((f) => {
            const q = feedQuery(f);
            const rowBusy = busy === f.id;
            return (
              <li key={f.id} className="px-3 py-2 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-text-on-light truncate">
                      {f.name}
                    </span>
                    <span
                      className={`text-[9px] uppercase tracking-wider px-1 py-0.5 border ${
                        f.active
                          ? 'text-primary border-primary/30 bg-primary/5'
                          : 'text-muted-on-light border-border-light'
                      }`}
                    >
                      {f.active ? t('buscasMonitoradas.ativa') : t('buscasMonitoradas.pausada')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-on-light font-mono">
                    {q && <span className="truncate">“{q}”</span>}
                    <span className="flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" strokeWidth={1.5} />
                      {cadenceHuman(f.cadence_seconds)}
                    </span>
                  </div>
                </div>
                {canManage && !demo && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleActive(f)}
                      disabled={rowBusy}
                      title={f.active ? t('buscasMonitoradas.pausar') : t('buscasMonitoradas.retomar')}
                      data-testid={`feed-toggle-${f.id}`}
                      className="w-7 h-7 flex items-center justify-center text-muted-on-light hover:text-text-on-light disabled:opacity-50"
                    >
                      {f.active ? (
                        <Pause className="w-3.5 h-3.5" strokeWidth={1.5} />
                      ) : (
                        <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => editCadence(f)}
                      disabled={rowBusy}
                      title={t('buscasMonitoradas.editarCadencia')}
                      className="w-7 h-7 flex items-center justify-center text-muted-on-light hover:text-text-on-light disabled:opacity-50"
                    >
                      <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(f)}
                      disabled={rowBusy}
                      title={t('buscasMonitoradas.excluir')}
                      data-testid={`feed-delete-${f.id}`}
                      className="w-7 h-7 flex items-center justify-center text-muted-on-light hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

registerWidget('buscas_monitoradas', BuscasMonitoradasWidget, {
  group: 'data',
  label: 'Buscas monitoradas',
  description:
    'Gerencia as buscas salvas que o operador monitora (pausar, mudar cadência, excluir). Par de gestão do "Salvar busca + monitorar" da tela Buscar.',
  icon: 'bell',
  defaultColSpan: 12,
  mockVariables: { feeds_demo: MOCK_FEEDS },
  previewWidth: 480,
  previewHeight: 240,
});
