/**
 * perf.ts — feedback de DESEMPENHO honesto da fila /buscar (FE-B).
 *
 * As CLIs de username (maigret/sherlock/wmn) NÃO emitem progresso parcial — só
 * o resultado final. Então o feedback ao vivo é:
 *   (a) DECORRIDO — timer client-side a partir de `startedAt` (m:ss);
 *   (b) ETA — estimativa HONESTA derivada de #sites × timeout ÷ paralelismo;
 *   (c) COBERTURA — quando `done`, do envelope: found_count / checked / duration_ms.
 *
 * Tudo PURO/testável; as strings são resolvidas pela UI via useT (estas funções
 * só montam números/segundos, a UI formata o texto i18n).
 */
import type { FilaItem } from './types';

/** Formata milissegundos decorridos como `m:ss` (ex.: 95s → "1:35", 8s → "0:08"). */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/** Paralelismo efetivo do fan-out — espelha o sufixo de `Mcp.fanoutStreamUrl`
 *  (http_concurrency=64). É o teto de sites varridos em paralelo por uma CLI. */
export const FANOUT_HTTP_CONCURRENCY = 64;

/** Timeout por-site default quando a fonte não declara `timeout` (segundos). */
export const DEFAULT_SITE_TIMEOUT_S = 20;

/**
 * Entrada da estimativa de ETA. `siteCount` é o nº de sites que a fonte vai
 * varrer (sites selecionados, ou o total do catálogo se nada foi escolhido);
 * `timeoutPerSiteS` é o timeout por-site escolhido; `concurrency` é o
 * paralelismo (default = FANOUT_HTTP_CONCURRENCY).
 */
export interface EtaInput {
  siteCount: number;
  timeoutPerSiteS?: number;
  concurrency?: number;
}

/**
 * ETA em SEGUNDOS — estimativa HONESTA (rotular como estimativa na UI). Modelo
 * simples: cada "onda" de `concurrency` sites custa no PIOR caso `timeoutPerSiteS`;
 * são `ceil(siteCount / concurrency)` ondas. Limita o piso a 1 onda (uma fonte
 * sem catálogo conhecido cai no timeout default). NUNCA promete progresso parcial.
 *
 * Retorna `null` quando não dá pra estimar (sem #sites e sem timeout) — a UI
 * então só mostra o decorrido.
 */
export function estimateEtaSeconds(input: EtaInput): number | null {
  const timeout = input.timeoutPerSiteS && input.timeoutPerSiteS > 0
    ? input.timeoutPerSiteS
    : DEFAULT_SITE_TIMEOUT_S;
  const concurrency = input.concurrency && input.concurrency > 0
    ? input.concurrency
    : FANOUT_HTTP_CONCURRENCY;
  const sites = input.siteCount && input.siteCount > 0 ? input.siteCount : 0;
  if (sites === 0) {
    // Sem catálogo: a fonte ainda leva ~1 timeout (uma única "rodada").
    return timeout;
  }
  const waves = Math.max(1, Math.ceil(sites / concurrency));
  return waves * timeout;
}

/**
 * Cobertura FINAL extraída do envelope cru do resultado (FilaItem.results[*].raw
 * ou o envelope agregado). Reusa os campos que JÁ vêm:
 *   - found_count : contas/perfis encontrados (maigret/sherlock/wmn);
 *   - checked     : sites varridos (wmn);
 *   - duration_ms : duração medida pela CLI (fallback = FilaItem.durationMs).
 *
 * Procura nesta ordem em cada candidato (raw envelope → raw.data → raw): os
 * adapters aninham em `.data`. Devolve só o que existir — a UI decide o texto.
 */
export interface Coverage {
  /** Sites varridos (wmn `checked`). */
  checked?: number;
  /** Contas/perfis encontrados. */
  foundCount?: number;
  /** Duração em ms (da CLI, ou do FilaItem). */
  durationMs?: number;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Camadas onde os adapters costumam aninhar o envelope (raw, raw.data, raw.result). */
function envelopeLayers(raw: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const push = (o: unknown) => {
    if (o && typeof o === 'object') out.push(o as Record<string, unknown>);
  };
  push(raw);
  if (raw && typeof raw === 'object') {
    push((raw as Record<string, unknown>).data);
    push((raw as Record<string, unknown>).result);
  }
  return out;
}

/** Lê o primeiro valor numérico de `keys` em qualquer camada do envelope. */
function readNum(layers: Record<string, unknown>[], keys: string[]): number | undefined {
  for (const layer of layers) {
    for (const k of keys) {
      const n = num(layer[k]);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

/**
 * Extrai a cobertura de um FilaItem concluído. Olha o `raw` do PRIMEIRO
 * resultado (as CLIs de username devolvem 1 item-resumo) e cai no
 * `item.durationMs` para a duração quando o envelope não a traz.
 */
export function coverageFromItem(item: FilaItem): Coverage {
  const raw = item.results?.[0]?.raw;
  const layers = envelopeLayers(raw);
  const checked = readNum(layers, ['checked', 'sites_checked', 'checked_sites']);
  const foundCount = readNum(layers, ['found_count', 'found', 'count', 'total_found']);
  const durationMs = readNum(layers, ['duration_ms', 'durationMs', 'elapsed_ms']) ?? item.durationMs;
  const out: Coverage = {};
  if (checked !== undefined) out.checked = checked;
  if (foundCount !== undefined) out.foundCount = foundCount;
  if (durationMs !== undefined) out.durationMs = durationMs;
  return out;
}

/** Segundos (1 casa) a partir de ms — p/ a UI montar "em Ys". */
export function msToSeconds(ms: number | undefined): string | null {
  if (ms === undefined || !Number.isFinite(ms)) return null;
  const s = ms / 1000;
  return s >= 10 ? String(Math.round(s)) : s.toFixed(1);
}
