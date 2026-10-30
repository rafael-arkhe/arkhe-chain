import { openSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const log = openSync(join(process.env.ARKHE_INTRA_DATA_DIR, 'server.log'), 'a', 0o600);
process.stdout.write = process.stderr.write = (chunk, encoding, callback) => {
  writeSync(log, chunk instanceof Uint8Array ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
  if (typeof encoding === 'function') encoding();
  if (typeof callback === 'function') callback();
  return true;
};
await import(pathToFileURL(process.env.ARKHE_SERVER_ENTRY).href);
