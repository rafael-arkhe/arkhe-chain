// Stable JSON encoding; report_hash is excluded from its own preimage.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}';
}

export function reportPreimage(report: object): string {
  const body = { ...report } as Record<string, unknown>;
  delete body['report_hash'];
  return canonicalJson(body);
}
