// Start `next dev` for the Intra from any working directory, without going
// through pnpm's dependency status check (used by .claude/launch.json).
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const next = join(app, 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [next, 'dev', '--hostname', '127.0.0.1', '--port', '3003'], { cwd: app, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
