import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PROGRAM_FIXTURES, REFERENCE_COMMIT, DAMM_CONFIG } from './meteora-config.mjs';
mkdirSync('output/meteora-fixtures', { recursive: true });
for (const fixture of PROGRAM_FIXTURES) {
  const url = `https://raw.githubusercontent.com/MeteoraAg/dynamic-bonding-curve-sdk/${REFERENCE_COMMIT}/packages/dynamic-bonding-curve/tests/fixtures/${fixture.file}`;
  const response = await fetch(url);
  if (!response.ok) throw Error(`fixture download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== fixture.sha256) throw Error(`fixture digest mismatch: ${fixture.file}`);
  writeFileSync(`output/meteora-fixtures/${fixture.file}`, bytes);
}
writeFileSync('output/meteora-fixtures/manifest.json', JSON.stringify({ referenceCommit: REFERENCE_COMMIT, fixtures: PROGRAM_FIXTURES, dammConfig: DAMM_CONFIG, configSource: 'https://api.devnet.solana.com' }, null, 2));
console.log('Pinned Meteora test fixtures prepared; see METEORA.md for validator startup.');
