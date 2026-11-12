// Rounding helpers (v2: one entry point).
export function round(value, decimals = 2) {
  const f = 10 ** decimals;
  const x = value * f;
  const r = Math.round(x);
  return (Math.abs(x % 1) === 0.5 ? (r % 2 === 0 ? r : r - 1) : r) / f;
}
