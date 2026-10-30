// RFC 8785 serialization using the ECMAScript number formatter. No Gravit code.
import { createHash } from 'node:crypto';
let text = '';
for await (const chunk of process.stdin) text += chunk;
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Nonfinite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw new Error('Unsupported JSON type');
}
const results = JSON.parse(text).map(record => ({ ...record,
  decision_id: createHash('sha3-256').update(canonical(record), 'utf8').digest('hex').slice(0, 16)
}));
process.stdout.write(JSON.stringify(results));
