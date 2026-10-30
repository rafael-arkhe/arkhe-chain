import { supervise } from './enterprise_server_supervisor.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const data = process.env.ARKHE_INTRA_DATA_DIR || '/data';
if (!existsSync(join(data, 'accounts.json'))) {
  const result = spawnSync(process.execPath, ['/app/apps/arkhe-intra/scripts/setup.mjs'], { env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.status !== 0) process.exit(result.status || 1);
}
process.env.HOSTNAME = '0.0.0.0';
delete process.env.NEXT_MANUAL_SIG_HANDLE;
supervise('/app/apps/arkhe-intra/server.js');
