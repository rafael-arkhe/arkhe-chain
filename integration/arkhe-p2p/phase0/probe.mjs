import { readFileSync, appendFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { verifyReference, OBSERVATION_WARNING } from '../../../scripts/e02_verify.mjs';
import { CATALOG, ROOT } from './service.mjs';

export function probe({ origin, binary, ledger }) {
  const url = new URL(origin);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('origin only');
  const temporary = mkdtempSync(join(tmpdir(), 'arkhe-proof-'));
  const record = {
    schema: 'arkhe-retrieval-observation@1', run_id: randomUUID(),
    observed_at: new Date().toISOString(), origin: url.origin,
    profile: CATALOG.profile, label: CATALOG.label,
    outcome: 'NOT_VERIFIABLE', reason: 'RETRIEVAL_FAILED',
    observation_warning: OBSERVATION_WARNING,
    measurement_warning: 'Local unsigned observation; operator independence and on-chain SLA not established.',
    elapsed_ms: 0, integrity_verified_blobs: 0,
  };
  const started = performance.now();
  try {
    for (const [name, pin] of Object.entries(CATALOG.files)) {
      const args = [url.origin + '/', pin.sha256, pin.blake3, join(temporary, name + '.json')];
      if (url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)) args.push('--allow-loopback');
      const fetched = spawnSync(resolve(binary), args, { encoding: 'utf8', timeout: 15000, maxBuffer: 65536 });
      if (fetched.error || fetched.status !== 0) throw new Error('RETRIEVAL_FAILED');
      const result = JSON.parse(fetched.stdout);
      if (result.integrity_verified !== true || result.bytes !== pin.size || result.sha256 !== pin.sha256 || result.blake3 !== pin.blake3) {
        throw new Error('INTEGRITY_FAILED');
      }
      record.integrity_verified_blobs++;
    }
    const receipt = JSON.parse(readFileSync(join(temporary, 'ref.json')));
    const verified = verifyReference({
      signature: receipt.transaction?.signatures?.[0], receipt,
      anchorReceipt: JSON.parse(readFileSync(join(temporary, 'anchor.json'))),
      datasetText: readFileSync(join(temporary, 'dataset.json')),
      cluster: 'devnet', datasetOrigin: url.origin,
    });
    record.outcome = verified.outcome;
    record.reason = verified.reason;
    record.observation_warning = verified.observation_warning;
  } catch {
    // Network/process/parse failures never produce a qualified success.
  } finally {
    record.elapsed_ms = performance.now() - started;
    rmSync(temporary, { recursive: true, force: true });
  }
  if (ledger) {
    let size = 0;
    try { size = statSync(ledger).size; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const line = JSON.stringify(record) + '\n';
    if (size + Buffer.byteLength(line) > 10 * 1024 * 1024) throw new Error('ledger full; rotate explicitly');
    appendFileSync(ledger, line, { encoding: 'utf8', mode: 0o600 });
  }
  return record;
}

export function summarize(path) {
  if (statSync(path).size > 10 * 1024 * 1024) throw new Error('ledger exceeds bound');
  const records = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const unique = new Map();
  for (const record of records) {
    if (record.schema !== 'arkhe-retrieval-observation@1' || typeof record.run_id !== 'string' ||
        !Number.isFinite(Date.parse(record.observed_at)) || !Number.isFinite(record.elapsed_ms) || record.elapsed_ms < 0 ||
        record.profile !== CATALOG.profile || record.label !== 'synthetic-poc' ||
        !['VERIFIED', 'NOT_VERIFIABLE'].includes(record.outcome) ||
        (record.outcome === 'VERIFIED' && (record.integrity_verified_blobs !== 3 || !record.observation_warning))) {
      throw new Error('invalid observation');
    }
    if (unique.has(record.run_id) && JSON.stringify(unique.get(record.run_id)) !== JSON.stringify(record)) throw new Error('conflicting run id');
    unique.set(record.run_id, record);
  }
  const all = [...unique.values()];
  const verified = all.filter(record => record.outcome === 'VERIFIED');
  return {
    attempts: all.length, verified_retrievals_reported: verified.length,
    failed_retrievals_reported: all.length - verified.length,
    origins_observed: [...new Set(all.map(record => record.origin))].length,
    independent_peers: null, demand_gate: 'NOT_ESTABLISHED',
    warning: 'Unsigned local ledger can be fabricated. Origins are not independent operators; repetitions are not demand. No uptime/on-chain SLA claim.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === 'summary') console.log(JSON.stringify(summarize(args[1]), null, 2));
    else if (args.length === 3) {
      const result = probe({ origin: args[0], binary: args[1], ledger: args[2] });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.outcome === 'VERIFIED' ? 0 : 1;
    } else throw new Error('usage: node probe.mjs <origin> <fetch-proof binary> <ledger.jsonl> | summary <ledger.jsonl>');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
