import { readFileSync, writeFileSync } from 'node:fs';
import { Publication, approvedDocument, intent } from './publication.mjs';

const stencil = JSON.parse(readFileSync(new URL('./stencil.json', import.meta.url)));
const records = [];
for (const scenario of ['valid', 'invalid', 'unavailable', 'stale']) {
  const service = new Publication(stencil);
  service.seed('doc-1', approvedDocument());
  service.setRoles('alice', scenario === 'invalid' ? [] : ['publisher']);
  service.setAvailable(scenario !== 'unavailable');
  const ticket = service.evaluate(intent());
  if (scenario === 'stale') {
    service.seed('doc-1', { ...approvedDocument(), revision: 2 });
  }
  records.push({ scenario, ...service.apply(ticket) });
}
const output = new URL('./evidence.jsonl', import.meta.url);
writeFileSync(output, records.map(record => JSON.stringify(record)).join('\n') + '\n');
console.table(records.map(({ scenario, decision, enforcement, rule, observedEffect }) => ({ scenario, decision, enforcement, rule, observedEffect })));
console.log(`Evidence: ${output.pathname}`);
