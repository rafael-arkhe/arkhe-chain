'use client';

/**
 * ConnectorCard — FICHA TÉCNICA do conector: cabeçalho (nome + estado + tipo),
 * grade densa de metadados operacionais (identificador, cadência, última
 * execução, duração, situação da última rodada) e rodapé de ações. As gavetas
 * (execuções, datasets gerados, últimas mensagens) abrem INLINE, nunca modal.
 *
 * Extraído de conectores-workspace.tsx (Fase 5B). Apresentacional: recebe
 * tudo via props.
 *
 * Régua: cantos retos; profundidade por BORDA + tonalidade (faixa
 * `bg-panel-light` da grade), NUNCA sombra em card; #2D77BE único acento
 * (ação primária e "selecionado"); cor de estado sempre com RÓTULO junto;
 * dado estruturado em JetBrains Mono; sem ícone decorativo nas linhas; botões
 * de ação são texto (verbo). useT() em toda string.
 */
import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, Loader2, RotateCcw } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { skillLabel } from '@/lib/i18n/skill-labels';
import { StationPairingDialog } from '@/components/dados/station-pairing-dialog';
import { StationMessages } from '@/components/dados/station-messages';
import { Connectors, type ConnectorAgent, type ConnectorRun, type ConnectorDatasetRef } from '@/lib/api';

const STATUS_KEYS = new Set(['inactive', 'active', 'running', 'degraded', 'failed']);
const CRON_KEYS = new Set(['1min', '2min', '5min', '15min', '30min', 'hourly', '2h', '6h', '12h', 'daily']);

function isConnectorSkill(k: string): boolean {
  return k.startsWith('connector.') || k === 'camera.detect_tick' || k === 'camera.stream';
}
function skillOf(a: ConnectorAgent): string {
  return (a.skill_keys ?? []).find(isConnectorSkill) ?? 'connector.http';
}
function fmtTime(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '—';
}
function fmtDur(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// Cor SEMPRE acompanhada do rótulo (regra da cor falante): borda/texto do chip
// e o ponto quadrado dizem a mesma coisa que a palavra.
function statusTone(status: string): { chip: string; dot: string } {
  if (status === 'active') return { chip: 'border-success text-success', dot: 'bg-success' };
  if (status === 'failed' || status === 'degraded') return { chip: 'border-danger text-danger', dot: 'bg-danger' };
  if (status === 'running') return { chip: 'border-primary text-primary', dot: 'bg-primary' };
  return { chip: 'border-border-light text-muted-on-light', dot: 'bg-muted-on-light' };
}
function runStatusCls(status: string): string {
  if (status === 'failed') return 'text-danger';
  if (status === 'succeeded') return 'text-success';
  if (status === 'running') return 'text-primary';
  return 'text-muted-on-light';
}
function statusText(t: (k: string) => string, status: string): string {
  return STATUS_KEYS.has(status) || status === 'succeeded' || status === 'queued'
    ? t(`conectores.status.${status}`)
    : status;
}

// Par rótulo→valor da ficha: rótulo Inter 10px MAIÚSCULO muted, valor SEMPRE
// em JetBrains Mono (é dado estruturado).
function Meta({
  label, testid, className, children,
}: {
  label: string;
  testid?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-on-light truncate">{label}</dt>
      <dd data-testid={testid}
        className={'text-[11px] font-mono mt-0.5 truncate ' + (className ?? 'text-text-on-light')}>
        {children}
      </dd>
    </div>
  );
}

// Botão de ação: TEXTO (verbo), reto, com borda. Sem ícone decorativo — só o
// spinner quando ocupado. `selected` usa o azul-aço (acento de seleção).
function CardAction({
  children, onClick, busy, disabled, selected, expanded, testid,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  selected?: boolean;
  expanded?: boolean;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
      data-testid={testid}
      className={
        'h-7 px-2.5 text-[11px] bg-canvas-light border flex items-center gap-1.5 '
        + 'disabled:opacity-60 hover:border-primary hover:text-primary '
        + (selected ? 'border-primary text-primary' : 'border-border-light')
      }
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />}
      {children}
    </button>
  );
}

type Props = {
  agent: ConnectorAgent;
  result?: { ok: boolean; msg: string };
  runs: ConnectorRun[] | null;
  openRuns: boolean;
  busy: string | null;
  canManage: boolean;
  catalogLabelBySkill: Record<string, string>;
  // Capacidades declaradas por skill (catálogo). A skill do binding com
  // capability 'pairing' habilita "Parear" + "Últimas mensagens" (estação).
  capabilitiesBySkill?: Record<string, string[]>;
  onToggleRuns: () => void;
  onTest: () => void;
  onRun: () => void;
  onToggleStatus: () => void;
  onConfigure: () => void;
  onRetry: (runId: string) => void;
};

export function ConnectorCard({
  agent: a, result: r, runs, openRuns, busy, canManage,
  catalogLabelBySkill, capabilitiesBySkill, onToggleRuns, onTest, onRun,
  onToggleStatus, onConfigure, onRetry,
}: Props) {
  const t = useT();
  const active = a.status === 'active';
  const skill = skillOf(a);
  const tone = statusTone(a.status);
  // Estação WhatsApp: a skill do binding declara capability 'pairing' →
  // habilita Parear (QR) e o painel de últimas mensagens. Só com gestão.
  const caps = capabilitiesBySkill?.[skill] ?? [];
  const canPair = canManage && caps.includes('pairing');
  const [showPair, setShowPair] = React.useState(false);
  const [openMessages, setOpenMessages] = React.useState(false);
  // F7.2b — "Datasets gerados" (cross-link do organismo /dados). Lazy: só busca
  // ao abrir; auto-contido no card (o workspace não precisa saber).
  const [openDatasets, setOpenDatasets] = React.useState(false);
  const [datasets, setDatasets] = React.useState<ConnectorDatasetRef[] | null>(null);
  const [datasetsFailed, setDatasetsFailed] = React.useState(false);
  React.useEffect(() => {
    if (!openDatasets || datasets !== null || datasetsFailed) return;
    let alive = true;
    Connectors.datasets(a.id)
      .then((rows) => { if (alive) setDatasets(rows); })
      .catch(() => { if (alive) setDatasetsFailed(true); });
    return () => { alive = false; };
  }, [openDatasets, datasets, datasetsFailed, a.id]);

  // Última execução conhecida — só aparece quando a gaveta de execuções já foi
  // aberta (a listagem não traz runs). Nada é inventado: sem dado, "—".
  const lastRun = Array.isArray(runs) && runs.length > 0 ? runs[0] : null;
  const cadence = a.schedule
    ? (CRON_KEYS.has(a.schedule) ? t(`conectores.cron.${a.schedule}`) : a.schedule)
    : t('conectores.cron.manual');

  return (
    <React.Fragment>
      <article className="border-b border-border-light text-[12px]" data-testid={`conector-card-${a.slug}`}>
        {/* Cabeçalho: identidade + estado + tipo. Sem ícone decorativo. */}
        <header className="px-3 pt-2.5 pb-2 flex items-center flex-wrap gap-x-2 gap-y-1.5 min-w-0">
          <h3 className="text-[13px] font-semibold text-text-on-light truncate min-w-0">
            {a.display_name || a.slug}
          </h3>
          <span data-testid={`conector-status-${a.slug}`}
            className={'text-[10px] uppercase tracking-wider px-1.5 py-0.5 border shrink-0 inline-flex items-center gap-1.5 ' + tone.chip}>
            <span aria-hidden="true" className={'w-1.5 h-1.5 shrink-0 ' + tone.dot} />
            {statusText(t, a.status)}
          </span>
          <span data-testid={`conector-skill-${a.slug}`}
            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-border-light text-muted-on-light shrink-0">
            {skillLabel(t, skill, catalogLabelBySkill[skill])}
          </span>
        </header>

        {/* Ficha técnica: faixa tonal (profundidade por tonalidade + borda,
            nunca sombra) com a grade densa de metadados. */}
        <dl data-testid={`conector-meta-${a.slug}`}
          className="px-3 py-2 bg-panel-light border-t border-border-light grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-x-4 gap-y-2">
          <Meta label={t('conectores.meta.slug')} testid={`conector-meta-slug-${a.slug}`}>
            {a.slug}
          </Meta>
          <Meta label={t('conectores.meta.cadence')} testid={`conector-meta-cadence-${a.slug}`}>
            {cadence}
          </Meta>
          <Meta label={t('conectores.meta.created')} testid={`conector-meta-created-${a.slug}`}>
            {fmtTime(a.created_at)}
          </Meta>
          {/* Execuções não vêm na listagem: enquanto a gaveta não abriu, o valor
              é "—" (nunca um número inventado). */}
          <Meta label={t('conectores.meta.last_run')} testid={`conector-meta-lastrun-${a.slug}`}>
            {lastRun ? fmtTime(lastRun.started_at || lastRun.queued_at) : '—'}
          </Meta>
          <Meta label={t('conectores.meta.duration')} testid={`conector-meta-duration-${a.slug}`}>
            {lastRun ? fmtDur(lastRun.duration_ms) : '—'}
          </Meta>
          {lastRun && (
            <Meta label={t('conectores.meta.last_status')} testid={`conector-meta-laststatus-${a.slug}`}
              className={runStatusCls(lastRun.status)}>
              {statusText(t, lastRun.status)}
            </Meta>
          )}
        </dl>

        {/* Resultado/erro do teste: linha própria, quebra e nunca sobrepõe a barra. */}
        {r && (
          <div className={'px-3 pt-2 flex items-start gap-1.5 text-[11px] ' + (r.ok ? 'text-success' : 'text-danger')} data-testid={`conector-res-${a.slug}`}>
            {r.ok
              ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.5} />
              : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.5} />}
            <span className="min-w-0 break-words font-mono">{r.msg}</span>
          </div>
        )}

        {/* Rodapé de ações: verbos, sem ícone decorativo; quebram linha em
            telas estreitas e o rótulo nunca comprime. */}
        <footer className="px-3 py-2 border-t border-border-light flex flex-wrap items-center gap-1.5">
          {canManage && (
            <CardAction onClick={onConfigure} testid={`conector-configurar-${a.slug}`}>
              {t('conectores.configure')}
            </CardAction>
          )}
          <CardAction onClick={onToggleStatus} disabled={busy != null} busy={busy != null}
            testid={`conector-toggle-${a.slug}`}>
            {active ? t('conectores.pause') : t('conectores.activate')}
          </CardAction>
          <CardAction onClick={onTest} disabled={busy != null} busy={busy != null}
            testid={`conector-test-${a.slug}`}>
            {t('conectores.test')}
          </CardAction>
          <CardAction onClick={onRun} disabled={busy != null} busy={busy != null}
            testid={`conector-run-${a.slug}`}>
            {t('conectores.run')}
          </CardAction>
          {canPair && (
            <CardAction onClick={() => setShowPair(true)} testid={`conector-pair-${a.slug}`}>
              {t('conectores.pair')}
            </CardAction>
          )}
          <CardAction onClick={onToggleRuns} expanded={openRuns} selected={openRuns}
            testid={`conector-runs-${a.slug}`}>
            {t('conectores.runs')}
          </CardAction>
          <CardAction onClick={() => setOpenDatasets((v) => !v)} expanded={openDatasets} selected={openDatasets}
            testid={`conector-datasets-${a.slug}`}>
            {t('conectores.datasets')}
          </CardAction>
          {canPair && (
            <CardAction onClick={() => setOpenMessages((v) => !v)} expanded={openMessages} selected={openMessages}
              testid={`conector-messages-${a.slug}`}>
              {t('conectores.msgs.title')}
            </CardAction>
          )}
        </footer>
      </article>
      {canPair && openMessages && (
        <div className="px-3 py-2 border-b border-border-light bg-canvas-light" data-testid={`conector-messages-panel-${a.slug}`}>
          <StationMessages slug={a.slug} />
        </div>
      )}
      {showPair && (
        <StationPairingDialog
          agentId={a.id}
          skillKey={skill}
          onClose={() => setShowPair(false)}
        />
      )}
      {openDatasets && (
        <div className="px-3 py-2 border-b border-border-light bg-canvas-light" data-testid={`conector-datasets-panel-${a.slug}`}>
          {datasets === null && !datasetsFailed && (
            <p className="text-[11px] text-muted-on-light flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> {t('common.loading')}</p>
          )}
          {datasetsFailed && (
            <p className="text-[11px] text-muted-on-light italic">{t('conectores.datasets.unavailable')}</p>
          )}
          {Array.isArray(datasets) && datasets.length === 0 && (
            <p className="text-[11px] text-muted-on-light italic">{t('conectores.datasets.empty')}</p>
          )}
          {Array.isArray(datasets) && datasets.length > 0 && (
            <ul className="bg-white border border-border-light">
              {datasets.map((d) => (
                <li key={d.dataset} className="flex items-center gap-2 px-2 py-1.5 text-[11px] border-b border-border-light last:border-b-0">
                  <Link
                    href={`/painel-de-controle/dados?aba=datasets&ds=${encodeURIComponent(d.dataset)}`}
                    data-testid={`conector-dataset-${d.dataset}`}
                    className="font-mono truncate text-primary hover:underline"
                  >
                    {d.dataset}
                  </Link>
                  <span className="ml-auto text-[10px] font-mono text-muted-on-light shrink-0">
                    {d.rows} {t('conectores.datasets.rows')} · {d.pulls}× · {fmtTime(d.last_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {openRuns && (
        <div className="px-3 py-2 border-b border-border-light bg-canvas-light" data-testid={`conector-runs-panel-${a.slug}`}>
          {runs === null && (
            <p className="text-[11px] text-muted-on-light flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> {t('common.loading')}</p>
          )}
          {Array.isArray(runs) && runs.length === 0 && (
            <p className="text-[11px] text-muted-on-light italic">{t('conectores.runs.empty')}</p>
          )}
          {Array.isArray(runs) && runs.length > 0 && (
            <div className="bg-white border border-border-light">
              <div className="grid grid-cols-[90px_120px_70px_1fr_28px] gap-2 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-on-light border-b border-border-light">
                <span>{t('conectores.runs.status')}</span>
                <span>{t('conectores.runs.started')}</span>
                <span>{t('conectores.runs.duration')}</span>
                <span>{t('conectores.runs.summary')}</span>
                <span />
              </div>
              {runs.map((ru) => (
                <div key={ru.id} data-testid={`run-row-${ru.id}`}
                  className="grid grid-cols-[90px_120px_70px_1fr_28px] gap-2 px-2 py-1.5 text-[11px] border-b border-border-light last:border-b-0 items-center">
                  <span className={runStatusCls(ru.status)}>{statusText(t, ru.status)}</span>
                  <span className="font-mono text-muted-on-light">{fmtTime(ru.started_at || ru.queued_at)}</span>
                  <span className="font-mono text-muted-on-light">{fmtDur(ru.duration_ms)}</span>
                  <span className="font-mono truncate" title={ru.error_message || undefined}>
                    {ru.error_message
                      ? <span className="text-danger">{ru.error_message}</span>
                      : Object.keys(ru.output_summary || {}).length > 0
                        ? JSON.stringify(ru.output_summary)
                        : '—'}
                  </span>
                  {ru.status === 'failed' ? (
                    <button type="button" onClick={() => onRetry(ru.id)} disabled={busy === `retry-${ru.id}`}
                      data-testid={`run-retry-${ru.id}`} aria-label={t('conectores.runs.retry')} title={t('conectores.runs.retry')}
                      className="h-6 w-6 border border-border-light hover:border-primary flex items-center justify-center">
                      {busy === `retry-${ru.id}` ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : <RotateCcw className="w-3 h-3" strokeWidth={1.5} />}
                    </button>
                  ) : <span />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </React.Fragment>
  );
}
