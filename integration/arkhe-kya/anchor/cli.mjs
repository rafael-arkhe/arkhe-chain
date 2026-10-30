import { openSync, readSync, closeSync } from 'node:fs';
import { verifyAnchoredPassport } from './verify.mjs';

function read(path, max) {
  const file = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(max + 1);
    let total = 0, count;
    while (total < buffer.length && (count = readSync(file, buffer, total, buffer.length - total, null))) total += count;
    if (total > max) throw new Error('INPUT_TOO_LARGE');
    return buffer.subarray(0, total);
  } finally { closeSync(file); }
}
try {
  const paths = process.argv.slice(2);
  if (paths.length !== 7) throw new Error('usage: node cli.mjs PASSPORT CONTEXT_WITHOUT_ROOT ANCHOR TRUSTED_ROOT LOG_POLICY WITNESS_NOTE WITNESS_POLICY');
  const result = verifyAnchoredPassport(read(paths[0], 32768).toString('utf8'), read(paths[1], 4096).toString('utf8'),
    JSON.parse(read(paths[2], 1024 * 1024)), read(paths[3], 1024 * 1024), JSON.parse(read(paths[4], 8192)),
    read(paths[5], 16384).toString('utf8'), JSON.parse(read(paths[6], 32768)));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.outcome === 'CRYPTOGRAPHIC_CHECKS_PASSED' ? 0 : 1;
} catch (error) {
  console.log(JSON.stringify({ outcome: 'NOT_VERIFIABLE', profile: 'arkhe-kya-experimental@1', label: 'synthetic-poc', reason: error.message }));
  process.exitCode = 1;
}
