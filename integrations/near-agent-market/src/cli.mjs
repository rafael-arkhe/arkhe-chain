import { readFileSync, mkdirSync, openSync, closeSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client, Store, Worker } from './worker.mjs';
import { execute } from './verification.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const data = resolve(process.env.ARKHE_MARKET_DATA_DIR || resolve(root, 'ops/local/near-agent-market'));
mkdirSync(data, { recursive: true });
const lock = resolve(data, 'worker.lock');
const readOnly = process.argv.includes('--check');
let store, ownsLock = false, stop = false;
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop = true; abort.abort(); });
function status(value) {
  const row = { ...value, pid: process.pid, updatedAt: new Date().toISOString() };
  writeFileSync(resolve(data, 'status.json'), JSON.stringify(row, null, 2));
  console.log(JSON.stringify(row));
}
try {
  if (!readOnly) {
    if (existsSync(lock)) {
      const pid = Number(readFileSync(lock, 'utf8'));
      if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid worker lock; inspect manually');
      let alive = true;
      try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
      if (alive) throw new Error('Another worker is running');
      unlinkSync(lock);
    }
    const fd = openSync(lock, 'wx'); ownsLock = true;
    writeFileSync(fd, String(process.pid)); closeSync(fd);
  }
  // Exercise the deployed WASM before accepting work.
  const preflight = await execute({ operation: 'verify_artifact', input: { kind: 'blake3', payloadHex: '' } });
  if (preflight.digestHex !== 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262') throw new Error('Verifier preflight failed');
  const client = new Client(process.env.NEAR_MARKET_AGENT_TOKEN);
  store = new Store(readOnly ? ':memory:' : resolve(data, 'state.sqlite'));
  const worker = new Worker(client, store);
  if (readOnly) {
    const assignments = await worker.poll({ readOnly: true });
    console.log(JSON.stringify({ event: 'check_ok', wasm: true, authenticated: true, assignments }));
  } else {
    let failures = 0;
    while (!stop) {
      try {
        const assignments = await worker.poll(); failures = 0;
        status({ state: 'running', assignments });
      } catch (error) {
        failures++;
        status({ state: 'error', httpStatus: error.status ?? null, failures });
        if (error.status >= 400 && error.status < 500 && error.status !== 429) { process.exitCode = 78; break; }
      }
      await sleep(Math.min(300000, 30000 * 2 ** Math.min(failures, 4)), undefined, { signal: abort.signal }).catch(() => {});
    }
  }
} catch (error) {
  // Never print arbitrary errors: upstream bodies and URLs may contain secrets.
  console.error(JSON.stringify({ event: 'startup_failed', code: error.code ?? null, httpStatus: error.status ?? null }));
  process.exitCode = 78;
} finally {
  store?.close();
  if (ownsLock) unlinkSync(lock);
}
