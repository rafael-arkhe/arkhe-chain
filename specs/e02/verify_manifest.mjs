import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
if (manifest.profile !== 'arkhe-e02@1' || manifest.algorithm !== 'SHA-256' || !Array.isArray(manifest.files)) {
  throw Error('invalid freeze manifest');
}
const seen = new Set();
for (const entry of manifest.files) {
  if (typeof entry.path !== 'string' || seen.has(entry.path)) throw Error('invalid or duplicate path');
  seen.add(entry.path);
  const path = resolve(root, entry.path);
  const rel = relative(root, path);
  if (isAbsolute(entry.path) || isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
    throw Error('manifest path outside workspace');
  }
  const bytes = readFileSync(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== entry.bytes || hash !== entry.sha256) throw Error(`freeze integrity mismatch: ${entry.path}`);
}
console.log(`arkhe-e02@1: ${manifest.files.length} files match the local SHA-256 manifest (not a signed release).`);
