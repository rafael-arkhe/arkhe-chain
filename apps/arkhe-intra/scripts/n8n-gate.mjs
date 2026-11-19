import { readFileSync } from 'node:fs';
import { verifyBundle } from '../public/offline/verify.mjs';
import { digest } from '../lib/crypto.mjs';
import { effectAllowed } from '../lib/n8n-gate.mjs';

const [bundlePath, trustPath] = process.argv.slice(2);
if (!bundlePath || !trustPath) {
  console.error('uso: node scripts/n8n-gate.mjs <bundle.json> <trust.json>');
  process.exit(2);
}

let report;
try {
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const trust = JSON.parse(readFileSync(trustPath, 'utf8'));
  report = await verifyBundle(bundle, trust, { blake3_hex: digest });
} catch (error) {
  report = {
    error: error instanceof Error ? error.message : 'falha ao conferir o pacote',
    integrity: 'FAIL',
    state: 'FAIL',
    signatures: 'FAIL',
    anchor: 'INCONCLUSIVE',
    verdict: 'FAIL',
  };
}

process.stdout.write(JSON.stringify(report));
process.exit(effectAllowed(report) ? 0 : 1);
