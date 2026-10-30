'use client';

/**
 * Status de conectores — 4A (gestão de conectores dentro de apps/painéis).
 *
 * GENÉRICO e multidomínio: lê um ObjectSet de nós 'conector' (o espelho
 * ontológico WP-E dos Agent workers — properties: agent_slug, skill, status,
 * last_run_at/last_run_status/last_run_output, runs_total/runs_failed) e
 * renderiza um card por conector: nome, skill humanizada, status
 * (ativo/pausado), última execução (quando + desfecho), contadores e erro
 * recente.
 *
 * Operador com `connectors.manage` roda/pausa o conector DAQUI — MESMO trilho
 * governance/agents que a central usa (`Connectors` client; zero mecanismo
 * paralelo). Sem a permissão, o widget vira somente-leitura (botões e link da
 * central somem; fail-closed, igual ao padrão de perm do frontend).
 *
 * O id do agente NÃO vive no nó espelho (chave é properties.agent_slug) — o
 * widget resolve slug→agente via Connectors.list() sob demanda, e SÓ quando o
 * operador pode gerir (sem perm não há fetch).
 */
import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
} from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '@/components/workshop/WorkshopV2Renderer';
import { Connectors, type ConnectorAgent } from '@/lib/api';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { skillLabel } from '@/lib/i18n/skill-labels';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { humanizeApiError } from '@/lib/workshop/missing-inputs';
import { cn } from '@/lib/cn';
import { getField } from './_row';

// ── Mocks da paleta (regra: widget data-driven SEM mock = placeholder) ─────
// Dados claramente de exemplo — nenhum nome/fonte real.
const MOCK_CONNECTORS = [
  {
    id: 'exemplo-1',
    name: 'Fonte de exemplo — cadastros',
    node_type: 'conector',
    properties: {
      agent_slug: 'exemplo-cadastros',
      skill: 'connector.http',
      status: 'active',
      last_run_at: '2026-01-05T08:30:00Z',
      last_run_status: 'succeeded',
      runs_total: 128,
      runs_failed: 2,
    },
  },
  {
    id: 'exemplo-2',
    name: 'Fonte de exemplo — leituras',
    node_type: 'conector',
    properties: {
      agent_slug: 'exemplo-leituras',
      skill: 'connector.http',
      status: 'inactive',
      last_run_at: '2026-01-04T22:10:00Z',
      last_run_status: 'failed',
      last_run_output: { error: 'HTTP 500 da fonte (exemplo)' },
      runs_total: 40,
      runs_failed: 5,
    },
  },
];

type Cfg = {
  source?: string;
  title?: string;
};

// Mesma resolução de dados dos widgets data-driven (object_list/map_live):
// a variable produz ObjectSet ({rows: [...]}) ou array cru.
function pickRows(variables: Record<string, unknown>, source: string | undefined): unknown[] {
  if (!source) return [];
  const raw = variables[source];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)) {
    return (raw as { rows: unknown[] }).rows;
  }
  return [];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

// "2026-06-10T08:30:00Z" → "2026-06-10 08:30" (JetBrains Mono na UI).
function fmtTime(iso: string): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '';
}

const STATUS_I18N = new Set(['active', 'inactive', 'running', 'degraded', 'failed', 'succeeded', 'queued']);

// Erro recente: o espelho grava last_run_output (string ou objeto) — defensivo.
export function recentError(row: unknown): string {
  if (str(getField(row, 'last_run_status')) !== 'failed') return '';
  const out = getField(row, 'last_run_output');
  if (typeof out === 'string') return out;
  if (out && typeof out === 'object') {
    const rec = out as Record<string, unknown>;
    return str(rec.error) || str(rec.message) || str(rec.error_message);
  }
  return '';
}

function ConnectorStatusWidget({ config, variables, emit }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as Cfg;
  const rows = pickRows(variables, cfg.source);
  const canManage = useCan('connectors.manage');

  const [agents, setAgents] = React.useState<ConnectorAgent[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, { ok: boolean; msg: string }>>({});
  const [statusOverride, setStatusOverride] = React.useState<Record<string, string>>({});

  // slug→agente só quando o operador PODE gerir (sem perm não há fetch).
  React.useEffect(() => {
    if (!canManage || rows.length === 0) return;
    let on = true;
    Connectors.list()
      .then((list) => { if (on) setAgents(list); })
      .catch(() => undefined);
    return () => { on = false; };
    // rows.length (não rows): refetch só quando o conjunto muda de tamanho.
  }, [canManage, rows.length]);

  const agentBySlug = React.useMemo(() => {
    const map: Record<string, ConnectorAgent> = {};
    for (const a of agents ?? []) map[a.slug] = a;
    return map;
  }, [agents]);

  const setNote = (slug: string, note: { ok: boolean; msg: string } | null) =>
    setNotes((p) => {
      const next = { ...p };
      if (note) next[slug] = note; else delete next[slug];
      return next;
    });

  // Tarefa E — skill humanizada pelo helper compartilhado do display layer
  // (dict skills.<key>.label pt-BR+en-US; desconhecidas degradam pra forma
  // legível) — nunca a chave técnica crua sozinha.
  const skillText = (skill: string): string => skillLabel(t, skill) || '—';

  const statusOf = (row: unknown, slug: string): string =>
    statusOverride[slug] || str(getField(row, 'status'));

  const statusText = (s: string): string =>
    s ? (STATUS_I18N.has(s) ? t(`conectores.status.${s}`) : s) : '—';

  // A skill REAL: do espelho; senão do binding do agente; connector.http é
  // só back-compat (mesma regra da central).
  const resolveSkill = (row: unknown, agent: ConnectorAgent): string =>
    str(getField(row, 'skill')) ||
    (agent.skill_keys ?? []).find((k) => k.startsWith('connector.')) ||
    (agent.skill_keys ?? [])[0] ||
    'connector.http';

  const doRun = async (row: unknown, slug: string) => {
    const agent = agentBySlug[slug];
    if (!agent || busy) return;
    setBusy(slug);
    setNote(slug, null);
    try {
      const r = await Connectors.run(agent.id, resolveSkill(row, agent));
      setNote(slug, { ok: true, msg: `${t('conectores.enqueued')} (${r.status})` });
      emit?.('value_change', { value: 'run', target: slug });
    } catch (e) {
      setNote(slug, { ok: false, msg: humanizeApiError((e as Error)?.message ?? '') });
    } finally {
      setBusy(null);
    }
  };

  const doToggle = async (row: unknown, slug: string, name: string) => {
    const agent = agentBySlug[slug];
    if (!agent || busy) return;
    const next = statusOf(row, slug) === 'active' ? 'inactive' : 'active';
    const ok = await confirmModal({
      title: t(next === 'active' ? 'conectores.confirm.activateTitle' : 'conectores.confirm.pauseTitle'),
      description: t(next === 'active' ? 'conectores.confirm.activateDesc' : 'conectores.confirm.pauseDesc')
        .replace('{name}', name),
      confirmLabel: t(next === 'active' ? 'connectorStatus.resume' : 'conectores.pause'),
      cancelLabel: t('common.cancel'),
      tone: next === 'active' ? 'default' : 'warning',
    });
    if (!ok) return;
    setBusy(slug);
    setNote(slug, null);
    try {
      await Connectors.update(agent.id, { status: next });
      setStatusOverride((p) => ({ ...p, [slug]: next }));
      emit?.('value_change', { value: next, target: slug });
    } catch (e) {
      setNote(slug, { ok: false, msg: humanizeApiError((e as Error)?.message ?? '') });
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <header className="h-8 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1 truncate">
        {cfg.title || t('conectores.title')}
      </p>
      <span className="text-[10px] font-mono text-muted-on-light">{rows.length}</span>
      {canManage && (
        <Link
          href="/painel-de-controle/conectores"
          data-testid="cs-central-link"
          className="flex items-center gap-1 text-[10px] text-primary hover:underline whitespace-nowrap"
        >
          {t('connectorStatus.openCentral')}
          <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      )}
    </header>
  );

  if (!cfg.source) {
    return (
      <div className="bg-white border border-border-light p-2 text-[11px] text-muted-on-light italic" data-testid="connector-status">
        {t('connectorStatus.configureSource')}
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light flex flex-col" data-testid="connector-status">
      {header}
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-[11px] text-muted-on-light italic text-center">
          {t('connectorStatus.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-border-light/60">
          {rows.map((row, i) => {
            const slug = str(getField(row, 'agent_slug')) || String(i);
            const name =
              str(getField(row, 'display_name')) ||
              str((row as Record<string, unknown>)?.name) ||
              slug;
            const status = statusOf(row, slug);
            const lastAt = str(getField(row, 'last_run_at'));
            const lastStatus = str(getField(row, 'last_run_status'));
            const total = num(getField(row, 'runs_total'));
            const failed = num(getField(row, 'runs_failed'));
            const err = recentError(row);
            const note = notes[slug];
            const agentReady = Boolean(agentBySlug[slug]);
            const isBusy = busy === slug;
            return (
              <li key={slug} className="px-2.5 py-2 space-y-1" data-testid={`cs-row-${slug}`}>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-medium text-text-on-light truncate flex-1">{name}</p>
                  <span className="text-[10px] font-mono text-muted-on-light truncate">
                    {skillText(str(getField(row, 'skill')))}
                  </span>
                  <span
                    className={cn(
                      'px-1.5 py-px text-[10px] font-mono border whitespace-nowrap',
                      status === 'active'
                        ? 'border-success text-success'
                        : status === 'failed' || status === 'degraded'
                          ? 'border-danger text-danger'
                          : 'border-border-light text-muted-on-light',
                    )}
                  >
                    {statusText(status)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-muted-on-light flex-wrap">
                  <span className="flex items-center gap-1">
                    {t('connectorStatus.lastRun')}:{' '}
                    {lastAt ? fmtTime(lastAt) : t('connectorStatus.never')}
                  </span>
                  {lastStatus && (
                    <span
                      className={cn(
                        'flex items-center gap-1',
                        lastStatus === 'failed' ? 'text-danger' : lastStatus === 'succeeded' ? 'text-success' : undefined,
                      )}
                    >
                      {lastStatus === 'succeeded' && <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />}
                      {lastStatus === 'failed' && <AlertCircle className="w-3 h-3" strokeWidth={1.5} />}
                      {statusText(lastStatus)}
                    </span>
                  )}
                  {total != null && (
                    <span>
                      {t('conectores.runs')}: <span className="text-text-on-light">{total}</span>
                    </span>
                  )}
                  {failed != null && (
                    <span>
                      {t('connectorStatus.failures')}:{' '}
                      <span className={failed > 0 ? 'text-danger' : 'text-text-on-light'}>{failed}</span>
                    </span>
                  )}
                </div>
                {err && (
                  <p className="text-[10px] font-mono text-danger truncate" title={err}>
                    {t('connectorStatus.lastError')}: {err}
                  </p>
                )}
                {note && (
                  <p className={cn('text-[10px] font-mono', note.ok ? 'text-success' : 'text-danger')}>
                    {note.msg}
                  </p>
                )}
                {canManage && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      data-testid={`cs-run-${slug}`}
                      disabled={!agentReady || isBusy}
                      onClick={() => void doRun(row, slug)}
                      className="h-6 px-2 text-[10px] border border-border-light hover:border-primary disabled:opacity-50 flex items-center gap-1"
                    >
                      {isBusy
                        ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                        : <Play className="w-3 h-3" strokeWidth={1.5} />}
                      {t('conectores.run')}
                    </button>
                    <button
                      type="button"
                      data-testid={`cs-toggle-${slug}`}
                      disabled={!agentReady || isBusy}
                      onClick={() => void doToggle(row, slug, name)}
                      className="h-6 px-2 text-[10px] border border-border-light hover:border-primary disabled:opacity-50 flex items-center gap-1"
                    >
                      {status === 'active'
                        ? <Pause className="w-3 h-3" strokeWidth={1.5} />
                        : <Play className="w-3 h-3" strokeWidth={1.5} />}
                      {status === 'active' ? t('conectores.pause') : t('connectorStatus.resume')}
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

registerWidget('connector_status', ConnectorStatusWidget, {
  group: 'data',
  label: 'Status de conectores',
  description:
    'Acompanha os conectores de dados de um conjunto (status, última execução, falhas) e permite rodar ou pausar sem sair do painel.',
  icon: 'cable',
  defaultColSpan: 6,
  emits: ['value_change'],
  mockConfig: { title: 'Conectores', source: 'conectores' },
  mockVariables: { conectores: { rows: MOCK_CONNECTORS } },
  previewWidth: 420,
  previewHeight: 260,
  config_schema: [
    { name: 'title', label: 'Título', field: 'string', placeholder: 'Conectores' },
    {
      name: 'source',
      label: 'Conectores (conjunto)',
      description: 'Variável ObjectSet com os nós de conector (espelho da central).',
      field: 'variable-ref',
    },
  ],
});
