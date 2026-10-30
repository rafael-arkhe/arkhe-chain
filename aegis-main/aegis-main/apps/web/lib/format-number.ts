/**
 * format-number — formatação de números e tempo relativo sensível ao locale
 * (SF5 · Onda 1). Usa Intl nativo: respeita pt-BR (1.204) e en-US (1,204) e a
 * ordem de palavras do tempo relativo ("há 3 min" vs "3 min ago").
 */

/** Inteiro/decimal formatado pelo locale. null/NaN → travessão. */
export function formatNumber(n: number | null | undefined, locale = 'pt-BR'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale).format(n);
}

/**
 * Tempo relativo a partir de um ISO (ex.: "há 3 minutos" / "3 minutes ago").
 * Vazio se a data for inválida/ausente — nunca inventa "agora".
 */
export function formatRelativeTime(iso: string | null | undefined, locale = 'pt-BR'): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = then - Date.now();
  const abs = Math.abs(diffMs);
  const MIN = 60_000, HR = 3_600_000, DAY = 86_400_000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < MIN) return rtf.format(Math.round(diffMs / 1000), 'second');
  if (abs < HR) return rtf.format(Math.round(diffMs / MIN), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diffMs / HR), 'hour');
  return rtf.format(Math.round(diffMs / DAY), 'day');
}
