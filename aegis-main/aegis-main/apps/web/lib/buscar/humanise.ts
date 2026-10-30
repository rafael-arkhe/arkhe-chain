/**
 * Tradução amigável (pt-BR) de erros de conector da busca.
 *
 * Onda 1 (2026-06-23) — antes os erros chegavam CRUS na Fila: o corpo HTTP do
 * backend (`{"detail":"circuit-open:camara-deputados"}`, `upstream-error:...`)
 * vazava direto via `ApiError.message`. Esta camada central reclassifica por
 * status/conteúdo e NUNCA exibe corpo técnico ao operador. Compartilhada por
 * `store.ts` (Fila) e `page.tsx` (bootstrap de adapters).
 *
 * Regra: distinguir falha de INFRA/transitória (503/circuit-open/timeout) de
 * falha de INPUT (400) e de PERMISSÃO (403). A fonte que falhou já aparece pelo
 * `source.label` no item da Fila, então a mensagem é genérica de propósito.
 */
import { ApiError } from '@/lib/api/client';

/** Padrões de erro transitório/infra que o backend emite no corpo do 503. */
const TRANSIENT_RE = /circuit-open|upstream-error|upstream:|timeout|timed out|connect|unavailable|temporar/i;

/**
 * SLA — diferencia as causas transitórias em vez de achatar tudo em "Fonte
 * temporariamente indisponível" (que não dizia NADA ao operador). Cada mensagem é
 * pt-BR, acionável e NUNCA vaza corpo técnico. A fonte que falhou já aparece pelo
 * `source.label` no item da Fila. Ordem importa: circuit-open antes de upstream.
 */
function humaniseTransient(msg: string, status?: number): string {
  const m = (msg || '').toLowerCase();
  if (/circuit-open/.test(m)) {
    // nosso breaker (half-open): pausa curta após falhas seguidas, retoma sozinho.
    return 'Fonte pausada após falhas seguidas — retoma sozinha em instantes.';
  }
  if (status === 429 || /429|too many|rate.?limit/.test(m)) {
    return 'Limite de consultas da fonte atingido — aguarde alguns segundos.';
  }
  if (/timeout|timed out/.test(m)) {
    return 'A fonte demorou demais a responder — tente de novo.';
  }
  if (/connect/.test(m)) {
    return 'Não foi possível conectar à fonte.';
  }
  // 502/503/504, upstream-error, unavailable → provedor fora do ar.
  return 'A fonte está fora do ar no momento — tente de novo em instantes.';
}

export function humaniseSearchError(e: unknown): string {
  if (e instanceof ApiError) {
    const msg = e.message || '';
    if (e.status === 403) return 'Sem permissão para esta fonte.';
    if (e.status === 401) return 'Sessão expirada — entre novamente.';
    if (e.status === 429) return humaniseTransient(msg, 429);
    if (e.status === 503 || e.status === 502 || e.status === 504 || TRANSIENT_RE.test(msg)) {
      return humaniseTransient(msg, e.status);
    }
    if (e.status === 400 || e.status === 422) {
      return 'Esta fonte não aceita este tipo de busca.';
    }
    if (e.status === 404) return 'Nada encontrado nesta fonte.';
    // Nunca devolver o corpo cru: só a classe do erro.
    return `Erro ao consultar a fonte (HTTP ${e.status}).`;
  }
  // FASE 2 (2026-06-26): o stream SSE entrega o erro como STRING CRUA do backend
  // (ex.: "upstream: circuit-open:senado-federal", "timeout after 90s"), não como
  // ApiError. Reclassifica AQUI pra nunca vazar corpo técnico e diferenciar a causa.
  const rawMsg = typeof e === 'string' ? e : e instanceof Error ? e.message : '';
  if (rawMsg && TRANSIENT_RE.test(rawMsg)) {
    return humaniseTransient(rawMsg);
  }
  // Erros lançados pelos próprios workers já são mensagens pt-BR amigáveis.
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e.trim()) return e;
  return 'Erro desconhecido ao consultar a fonte.';
}
