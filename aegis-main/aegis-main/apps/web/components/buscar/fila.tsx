'use client';

/**
 * Fila visual de buscas em andamento.
 *
 * Recolhida por padrão (#2): o operador não precisa ver o detalhe técnico o
 * tempo todo. O cabeçalho é um TOGGLE; quando há ERRO na fila aparece um aviso
 * (!) e a fila auto-expande uma vez pra o operador ver o que falhou. Strings
 * via useT() (pt-BR + en-US).
 *
 * O worker (orchestrator no page.tsx) é quem muda o status — este componente
 * é puramente visual.
 */
import * as React from 'react';
import { AlertCircle, AlertTriangle, Check, ChevronDown, ChevronRight, Clock, Loader2, MinusCircle, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import type { FilaItem } from '@/lib/buscar/types';
import { useBuscarStore, toolBase } from '@/lib/buscar/store';
import {
  formatElapsed,
  estimateEtaSeconds,
  coverageFromItem,
  msToSeconds,
} from '@/lib/buscar/perf';

/** Referência estável p/ o selector do store não disparar re-render à toa. */
const EMPTY_FIELDS: Record<string, string> = {};

function relativeTime(t: (k: string) => string, epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 1000) return t('buscar.tempo.agora');
  const atras = t('buscar.tempo.atras');
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ${atras}`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ${atras}`;
  return `${Math.floor(diff / 3_600_000)}h ${atras}`;
}

function statusIcon(status: FilaItem['status']) {
  switch (status) {
    case 'queued':
      return <Clock className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />;
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-info animate-spin" strokeWidth={1.5} />;
    case 'done':
      return <Check className="w-3.5 h-3.5 text-success" strokeWidth={1.5} />;
    case 'error':
      return <AlertCircle className="w-3.5 h-3.5 text-danger" strokeWidth={1.5} />;
    case 'skipped':
      return <MinusCircle className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />;
    case 'cancelled':
      return <XCircle className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />;
  }
}

function statusLabel(t: (k: string) => string, item: FilaItem): string {
  switch (item.status) {
    case 'queued':
      return t('buscar.fila.status.queued');
    case 'running':
      return t('buscar.fila.status.running');
    case 'done':
      return `${item.results.length} ${t('buscar.fila.resultados')} · ${item.durationMs}ms`;
    case 'error':
      return item.error || t('buscar.fila.status.error');
    case 'skipped':
      return item.skipReason || t('buscar.fila.status.skipped');
    case 'cancelled':
      return t('buscar.fila.status.cancelled');
  }
}

const splitCsv = (csv: string): string[] =>
  (csv || '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Texto de COBERTURA final (FE-B) — do envelope do resultado. As CLIs de
 * username devolvem `found_count`/`checked`/`duration_ms`; reusamos isso:
 *   - wmn (tem `checked`): "varreu X sites em Ys, N contas"
 *   - maigret/sherlock (só found+duração): "N contas em Ys"
 * Sem nenhum desses campos → null (a UI cai no statusLabel padrão).
 */
export function coverageText(t: (k: string) => string, item: FilaItem): string | null {
  const cov = coverageFromItem(item);
  const tempo = msToSeconds(cov.durationMs);
  if (cov.checked !== undefined && cov.foundCount !== undefined && tempo !== null) {
    return t('buscar.perf.cobertura')
      .replace('{sites}', String(cov.checked))
      .replace('{tempo}', tempo)
      .replace('{contas}', String(cov.foundCount));
  }
  if (cov.foundCount !== undefined && tempo !== null) {
    return t('buscar.perf.coberturaSimples')
      .replace('{contas}', String(cov.foundCount))
      .replace('{tempo}', tempo);
  }
  return null;
}

/**
 * Estimativa de ETA (segundos) p/ um item `running`, a partir do estado
 * por-fonte (advanced.fields): #sites (selecionados, ou o total do catálogo
 * carregado) e timeout por-site escolhido. ESTIMATIVA HONESTA — a UI rotula
 * como tal. `siteTotalByCatalog` traz o total do catálogo (do cache do hook)
 * pra quando nenhum site foi explicitamente escolhido.
 */
export function etaSecondsForItem(
  item: FilaItem,
  fields: Record<string, string>,
  siteTotalByCatalog?: number,
): number | null {
  if (!item.source.mcpTool) return null;
  const base = toolBase(item.source.mcpTool);
  const selectedSites = splitCsv(fields[`${base}__sites`] ?? '').length;
  const timeoutRaw = (fields[`${base}__timeout`] ?? '').trim();
  const timeout = timeoutRaw && Number.isFinite(Number(timeoutRaw)) ? Number(timeoutRaw) : undefined;
  const siteCount = selectedSites > 0 ? selectedSites : (siteTotalByCatalog ?? 0);
  // Sem #sites E sem timeout → não dá pra estimar nada útil.
  if (siteCount === 0 && timeout === undefined) return null;
  return estimateEtaSeconds({ siteCount, timeoutPerSiteS: timeout });
}

type Props = {
  items: FilaItem[];
  onCancelAll: () => void;
  onClear: () => void;
};

export function Fila({ items, onCancelAll, onClear }: Props) {
  const t = useT();
  // Parâmetros por-fonte (timeout/sites) p/ a ESTIMATIVA de ETA — fonte única.
  const fields = useBuscarStore((s) => s.advanced?.fields ?? EMPTY_FIELDS);
  const [aberta, setAberta] = React.useState(false); // default RECOLHIDA (#2)
  // Tick a cada 5s para o "relativeTime" não congelar.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (items.length === 0) return;
    const id = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(id);
  }, [items.length]);

  // Tick de 1s SÓ quando há item rodando — alimenta o DECORRIDO ao vivo (m:ss)
  // sem custo quando a fila está parada. `now` é a base do timer client-side.
  const running = items.some((i) => i.status === 'running');
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const erros = items.filter((i) => i.status === 'error').length;
  // Auto-expandir UMA vez quando surge um erro novo (não esconder falha).
  const prevErros = React.useRef(0);
  React.useEffect(() => {
    if (erros > prevErros.current) setAberta(true);
    prevErros.current = erros;
  }, [erros]);

  if (items.length === 0) return null;

  const pendentes = items.filter((i) => i.status === 'queued' || i.status === 'running').length;
  const concluidos = items.filter((i) => i.status === 'done').length;

  return (
    <section data-testid="buscar-fila" className="bg-canvas-light border-b border-border-light">
      <div className="h-9 px-4 flex items-center gap-3 border-b border-border-light bg-white">
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          data-testid="buscar-fila-toggle"
          aria-expanded={aberta}
          className="flex items-center gap-2 min-w-0"
        >
          {aberta ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
          )}
          <span className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
            {t('buscar.fila.titulo')}
          </span>
          {/* aviso (!) só quando há ERRO na fila */}
          {erros > 0 && (
            <span
              data-testid="buscar-fila-aviso"
              title={t('buscar.fila.aviso')}
              className="flex items-center gap-1 text-[11px] text-danger font-mono"
            >
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} /> {erros}
            </span>
          )}
        </button>
        <span className="text-[11px] text-muted-on-light truncate">
          {pendentes} {t('buscar.fila.pendentes')} · {concluidos} {t('buscar.fila.concluidas')}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {pendentes > 0 && (
            <button
              type="button"
              onClick={onCancelAll}
              data-testid="buscar-fila-cancelar"
              className="h-7 px-2 text-[11px] bg-white border border-border-light hover:border-danger hover:text-danger flex items-center gap-1"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
              {t('buscar.fila.cancelar')}
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            data-testid="buscar-fila-limpar"
            className="h-7 px-2 text-[11px] bg-white border border-border-light hover:border-primary"
          >
            {t('buscar.fila.limpar')}
          </button>
        </div>
      </div>

      {aberta && (
        <ul className="max-h-[180px] overflow-y-auto" data-testid="buscar-fila-lista">
          {items.map((item) => (
            <FilaRow key={item.id} item={item} now={now} fields={fields} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Uma linha da fila + FEEDBACK DE DESEMPENHO (FE-B):
 *   - running → DECORRIDO ao vivo (m:ss, do `now` que tica 1s) + ETA estimada
 *     (rotulada como estimativa) derivada de #sites × timeout ÷ paralelismo;
 *   - done    → COBERTURA do envelope (varreu X sites em Ys, N contas) quando a
 *     fonte traz `checked`/`found_count`/`duration_ms`; senão o statusLabel padrão.
 * Sem prometer progresso parcial — as CLIs não dão.
 */
function FilaRow({
  item,
  now,
  fields,
}: {
  item: FilaItem;
  now: number;
  fields: Record<string, string>;
}) {
  const t = useT();
  const isRunning = item.status === 'running';
  const isDone = item.status === 'done';

  const elapsed = isRunning && item.startedAt ? formatElapsed(now - item.startedAt) : null;
  const etaS = isRunning ? etaSecondsForItem(item, fields) : null;
  const cobertura = isDone ? coverageText(t, item) : null;

  return (
    <li
      data-testid={`buscar-fila-item-${item.id}`}
      data-status={item.status}
      className={cn(
        'flex items-center gap-3 px-4 py-1.5 border-b border-border-light last:border-b-0 text-[12px]',
        item.status === 'running' && 'bg-info/5',
        item.status === 'error' && 'bg-danger/5',
      )}
    >
      <span className="shrink-0">{statusIcon(item.status)}</span>
      <span className="font-mono text-text-on-light truncate max-w-[200px]">
        &quot;{item.query}&quot;
      </span>
      <span className="text-muted-on-light text-[11px] truncate flex-1">
        {item.source.label}
      </span>

      {/* status / desempenho */}
      {isRunning ? (
        <span className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono">
          {elapsed && (
            <span className="text-info" data-testid={`buscar-fila-decorrido-${item.id}`}>
              {elapsed} <span className="text-muted-on-light/70">{t('buscar.perf.decorrido')}</span>
            </span>
          )}
          {etaS != null && (
            <span
              className="text-muted-on-light/70"
              data-testid={`buscar-fila-eta-${item.id}`}
              title={t('buscar.perf.estimativa')}
            >
              · {t('buscar.perf.estimado').replace('{tempo}', String(etaS))}
            </span>
          )}
        </span>
      ) : cobertura ? (
        <span
          className="text-[11px] font-mono shrink-0 text-success"
          data-testid={`buscar-fila-cobertura-${item.id}`}
        >
          {cobertura}
        </span>
      ) : (
        <span
          className={cn(
            'text-[11px] font-mono shrink-0',
            item.status === 'error' && 'text-danger',
            item.status === 'done' && 'text-success',
          )}
        >
          {statusLabel(t, item)}
        </span>
      )}

      <span className="text-[10px] text-muted-on-light/70 shrink-0 w-16 text-right">
        {item.finishedAt
          ? relativeTime(t, item.finishedAt)
          : item.startedAt
            ? relativeTime(t, item.startedAt)
            : relativeTime(t, item.queuedAt)}
      </span>
    </li>
  );
}
