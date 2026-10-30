/**
 * Sprint L1.3 — lib/format/number.ts
 */
import {
  fmtInt,
  fmtFloat,
  fmtPct,
  fmtBytes,
  fmtDelta,
  fmtCompact,
  fmtSci,
  deltaTone,
} from '@/lib/format/number';

describe('fmtInt', () => {
  it('formats pt-BR with dot thousand separator', () => {
    expect(fmtInt(1_234_567, 'pt-BR')).toBe('1.234.567');
  });
  it('formats en-US with comma thousand separator', () => {
    expect(fmtInt(1_234_567, 'en-US')).toBe('1,234,567');
  });
  it('returns em-dash for NaN/Infinity', () => {
    expect(fmtInt(NaN)).toBe('—');
    expect(fmtInt(Infinity)).toBe('—');
  });
});

describe('fmtFloat', () => {
  it('respects decimal count pt-BR', () => {
    expect(fmtFloat(3.14159, 'pt-BR', 2)).toBe('3,14');
  });
  it('keeps trailing zeros', () => {
    expect(fmtFloat(2, 'pt-BR', 2)).toBe('2,00');
  });
});

describe('fmtPct', () => {
  it('uses 1 decimal when >= 1%', () => {
    expect(fmtPct(0.0843, 'pt-BR')).toBe('8,4%');
  });
  it('uses fallback decimals when < 1%', () => {
    expect(fmtPct(0.005, 'pt-BR', 2)).toBe('0,50%');
  });
});

describe('fmtBytes', () => {
  it('renders B / KB / MB IEC', () => {
    expect(fmtBytes(500)).toBe('500 B');
    expect(fmtBytes(15_728_640)).toBe('15,0 MB');
  });
});

describe('fmtDelta', () => {
  it('uses + and typographic minus', () => {
    expect(fmtDelta(12)).toBe('+12');
    expect(fmtDelta(-8)).toBe('−8');
    expect(fmtDelta(0)).toBe('0');
  });
});

describe('fmtCompact', () => {
  it('keeps full digits below threshold', () => {
    expect(fmtCompact(1234, 'pt-BR')).toBe('1.234');
  });
  it('compacts large values', () => {
    expect(fmtCompact(1_500_000, 'pt-BR')).toContain('mi');
  });
});

describe('fmtSci', () => {
  it('handles zero', () => {
    expect(fmtSci(0)).toBe('0');
  });
  it('renders scientific for tiny values', () => {
    expect(fmtSci(0.00000023, 1)).toMatch(/e-?7/i);
  });
});

describe('deltaTone', () => {
  it('treats near-zero as muted', () => {
    expect(deltaTone(0.001, 'good-when-positive')).toBe('muted');
  });
  it('good-when-positive: + → success, − → danger', () => {
    expect(deltaTone(5, 'good-when-positive')).toBe('success');
    expect(deltaTone(-5, 'good-when-positive')).toBe('danger');
  });
  it('bad-when-positive: + → danger, − → success', () => {
    expect(deltaTone(5, 'bad-when-positive')).toBe('danger');
    expect(deltaTone(-5, 'bad-when-positive')).toBe('success');
  });
  it('neutral always muted', () => {
    expect(deltaTone(50, 'neutral')).toBe('muted');
  });
});
