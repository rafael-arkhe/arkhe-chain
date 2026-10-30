/**
 * Number formatting canônico — Sprint L1.3 (2026-05-23).
 *
 * Toda métrica/número operacional do AEGIS UI passa por aqui.
 * Nunca chame `toLocaleString()` inline em componente — perde a
 * consistência de locale e dificulta auditoria de densidade.
 *
 * Regras em `docs/design/density.md`.
 */
export type Locale = 'pt-BR' | 'en-US';

const COMPACT_THRESHOLD = 10_000;

function safeLocale(locale: Locale | string | undefined): Locale {
  return locale === 'en-US' ? 'en-US' : 'pt-BR';
}

/** Inteiro com separador de milhar locale-aware. */
export function fmtInt(value: number, locale: Locale = 'pt-BR'): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(safeLocale(locale), {
    maximumFractionDigits: 0,
  });
}

/** Decimal com casas fixas locale-aware. */
export function fmtFloat(
  value: number,
  locale: Locale = 'pt-BR',
  decimals = 2,
): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(safeLocale(locale), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Percentual 0-1 → "8,4%" pt-BR / "8.4%" en-US.
 *  Acima de 1% usa 1 decimal; abaixo usa `decimals`. */
export function fmtPct(
  value: number,
  locale: Locale = 'pt-BR',
  decimals = 1,
): string {
  if (!Number.isFinite(value)) return '—';
  const pct = value * 100;
  const d = pct >= 1 ? 1 : decimals;
  return `${fmtFloat(pct, locale, d)}%`;
}

/** Bytes IEC (base 1024) → "15,0 MB". Sempre 1 casa para MB/GB. */
export function fmtBytes(bytes: number, locale: Locale = 'pt-BR'): string {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${fmtInt(bytes, locale)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${fmtFloat(v, locale, 1)} ${units[i]}`;
}

/** Delta com sinal explícito → "+12" / "−8" (minus sign tipográfico). */
export function fmtDelta(value: number, locale: Locale = 'pt-BR'): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const sign = value > 0 ? '+' : '−';
  return `${sign}${fmtInt(Math.abs(value), locale)}`;
}

/** Compact ≥ 10k → "12,3 mil" / "12.3K". */
export function fmtCompact(value: number, locale: Locale = 'pt-BR'): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < COMPACT_THRESHOLD) return fmtInt(value, locale);
  const loc = safeLocale(locale);
  return value.toLocaleString(loc, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

/**
 * Duração em SEGUNDOS → texto curto legível ("15m 30s", "1h 0m", "45s").
 * Usado por métricas de tempo (MTTR/SLA de alertas). As unidades h/m/s são
 * neutras e estáveis nos dois locales (não localizadas de propósito —
 * abreviações universais, sem ambiguidade pt-BR/en-US).
 */
export function fmtDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '—';
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Notação científica para valores muito pequenos. */
export function fmtSci(value: number, decimals = 1): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  return value.toExponential(decimals);
}

/** Sentido semântico de delta para escolher cor.
 *  - good-when-positive: cobertura, throughput → ↑ verde, ↓ vermelho
 *  - bad-when-positive:  incidentes, latência   → ↑ vermelho, ↓ verde
 *  - neutral:            sempre cinza */
export type DeltaSentiment =
  | 'good-when-positive'
  | 'bad-when-positive'
  | 'neutral';

export function deltaTone(
  value: number,
  sentiment: DeltaSentiment,
): 'success' | 'danger' | 'muted' {
  if (Math.abs(value) < 0.01) return 'muted';
  if (sentiment === 'neutral') return 'muted';
  const isPositive = value > 0;
  const isGood =
    (sentiment === 'good-when-positive' && isPositive) ||
    (sentiment === 'bad-when-positive' && !isPositive);
  return isGood ? 'success' : 'danger';
}
