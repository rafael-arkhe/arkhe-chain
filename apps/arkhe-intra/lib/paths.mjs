import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
function workspaceRoot() {
  if (process.env.ARKHE_INSTALL_ROOT) return resolve(process.env.ARKHE_INSTALL_ROOT);
  let directory = process.cwd();
  for (;;) {
    if (existsSync(resolve(directory, 'config/architecture.json')) && existsSync(resolve(directory, 'Cargo.toml'))) return directory;
    const parent = dirname(directory);
    if (parent === directory) throw new Error('Arkhe workspace root not found.');
    directory = parent;
  }
}
export const root = workspaceRoot();
export const local = resolve(process.env.ARKHE_INTRA_DATA_DIR || resolve(root, 'ops/local/intra'));
