import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { loadNodeVerifier } from '../../../scripts/e02_mmr.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const CATALOG = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url)));

// Only explicitly catalogued, already-public synthetic evidence is loaded.
export function createProofService() {
  const wasm = loadNodeVerifier();
  const blobs = new Map();
  for (const item of Object.values(CATALOG.files)) {
    const path = resolve(ROOT, item.path);
    if (!path.startsWith(resolve(ROOT) + sep)) throw new Error('path outside workspace');
    const bytes = readFileSync(path);
    if (bytes.length !== item.size || bytes.length > 16 * 1024 * 1024 ||
        createHash('sha256').update(bytes).digest('hex') !== item.sha256 ||
        wasm.blake3_hex(bytes) !== item.blake3) throw new Error('catalog integrity mismatch');
    blobs.set('/' + item.sha256, bytes);
  }
  const counters = { started_at: new Date().toISOString(), http_deliveries_finished: 0, bytes_written: 0 };
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 }, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Connection', 'close');
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') return json(405, { error: 'read-only service' });
    if (req.url === '/healthz') return json(200, { status: 'ok', profile: CATALOG.profile, label: CATALOG.label });
    if (req.url === '/metrics') return json(200, {
      ...counters, scope: 'local-process',
      warning: 'HTTP finish is not client receipt, cryptographic verification, independent peers or on-chain SLA.',
    });
    const bytes = blobs.get(req.url);
    if (!bytes) return json(404, { error: 'not served by this provider' });
    res.on('finish', () => { counters.http_deliveries_finished++; counters.bytes_written += bytes.length; });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': bytes.length });
    res.end(bytes);
  });
  server.maxConnections = 32;
  server.timeout = 5000;
  server.maxRequestsPerSocket = 1;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.ARKHE_PROOF_HOST ?? '127.0.0.1';
  const port = Number(process.env.ARKHE_PROOF_PORT ?? 8787);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('invalid port');
  const server = createProofService();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log(JSON.stringify({ host, port, label: CATALOG.label, profile: CATALOG.profile })));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
