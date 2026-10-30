import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
// The generated Next server owns HTTP draining. The supervisor bounds its duration.
export function supervise(serverPath, { env = process.env, graceMs = 20000 } = {}) {
  const marker = join(tmpdir(), `arkhe-drain-${process.pid}`);
  const child = spawn(process.execPath, [serverPath], { env: { ...env, ARKHE_DRAIN_FILE: marker }, stdio: 'inherit' });
  let timer;
  const stop = signal => {
    if (timer) return;
    writeFileSync(marker, 'draining');
    child.kill(signal);
    timer = setTimeout(() => child.kill('SIGKILL'), graceMs);
    timer.unref();
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  child.on('error', () => { process.exitCode = 1; });
  child.on('exit', (code, signal) => {
    rmSync(marker, { force: true });
    clearTimeout(timer); process.off('SIGTERM', stop); process.off('SIGINT', stop);
    process.exitCode = code ?? (signal ? 1 : 0);
  });
  return child;
}
