import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function collectTsx(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...collectTsx(full));
    else if (full.endsWith('.tsx')) files.push(full);
  }
  return files;
}

test('UI surfaces: panel classes, isolated signing keys, navigation and offline CSP', () => {
  const tsxFiles = [...collectTsx(join(root, 'app')), ...collectTsx(join(root, 'components'))];
  for (const file of tsxFiles) {
    const text = readFileSync(file, 'utf8');
    assert.equal(
      /className="[^"]*(?:^|\s)card(?:\s|")/.test(text),
      false,
      `orphan .card class found in ${file}; Intra uses .panel`,
    );
  }

  const devPage = readFileSync(join(root, 'app/desenvolvimento/page.tsx'), 'utf8');
  assert.match(devPage, /governancePem/);
  assert.match(devPage, /reviewerPem/);
  assert.equal(/\bconst \[pem,/.test(devPage), false, 'PEM state must be isolated per role');

  const shell = readFileSync(join(root, 'components/shell.tsx'), 'utf8');
  for (const route of ['/govtech', '/enterprise', '/desenvolvimento', '/bancada', '/avaliacoes', '/cockpit']) {
    assert.ok(shell.includes(`'${route}'`), `Shell navigation missing ${route}`);
  }
  assert.match(shell, /Escape/);

  const benchResult = readFileSync(join(root, 'components/bench-result.tsx'), 'utf8');
  assert.equal(benchResult.includes("'pass'"), false, 'Bancada must not define a pass tone');

  const offlineGov = readFileSync(join(root, 'public/govtech/offline.html'), 'utf8');
  assert.ok(offlineGov.includes("connect-src 'none'"));
  assert.ok(offlineGov.includes('focus-visible'));
});
