import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const env = { ...process.env };
if (process.platform === 'win32') {
  const preload = fileURLToPath(new URL('../../../packaging/windows/windows-links.cjs', import.meta.url)).replaceAll('\\', '/');
  env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --require="${preload}"`;
}
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
