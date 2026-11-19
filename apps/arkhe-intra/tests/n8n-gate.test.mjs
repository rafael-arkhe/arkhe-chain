import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { effectAllowed } from '../lib/n8n-gate.mjs';

const intra = fileURLToPath(new URL('..', import.meta.url));
const gate = fileURLToPath(new URL('../scripts/n8n-gate.mjs', import.meta.url));

test('o aviso n8n ignora verdict e exige as três conferências', () => {
  assert.equal(effectAllowed({ integrity: 'PASS', state: 'PASS', signatures: 'PASS', verdict: 'INCONCLUSIVE', anchor: 'INCONCLUSIVE' }), true);
  assert.equal(effectAllowed({ integrity: 'PASS', state: 'PASS', signatures: 'INCONCLUSIVE', verdict: 'PASS' }), false);
  assert.equal(effectAllowed({ integrity: 'FAIL', state: 'PASS', signatures: 'PASS' }), false);
  assert.equal(effectAllowed({ integrity: 'PASS', state: 'FAIL', signatures: 'PASS' }), false);
  assert.equal(effectAllowed(null), false);
});

test('o comando local para o fluxo quando o pacote não confere', () => {
  const data = mkdtempSync(join(tmpdir(), 'arkhe-n8n-gate-'));
  process.env.ARKHE_INTRA_DATA_DIR = data;
  const env = { ...process.env };
  execFileSync(process.execPath, ['scripts/setup.mjs'], { cwd: intra, env, stdio: 'pipe' });
  const credentials = JSON.parse(readFileSync(join(data, 'credentials.json'), 'utf8'));
  const password = role => credentials.find(row => row.email === `${role}@arkhe.local`).password;
  const key = role => readFileSync(join(data, `${role}.private.pem`));

  return (async () => {
    const { login } = await import('../lib/auth.mjs');
    const { createDocument, challenge, transition, exportDocument } = await import('../lib/documents.mjs');
    const { exportTrust } = await import('../lib/credentials.mjs');
    const author = login(`author@arkhe.local`, password('author')).user;
    const reviewer = login(`reviewer@arkhe.local`, password('reviewer')).user;
    const owner = login(`owner@arkhe.local`, password('owner')).user;
    const created = createDocument(author, {
      title: 'Minuta sintética',
      department: 'Piloto',
      body: 'Texto de exemplo. Nenhum documento de cliente entra neste teste.',
    });
    for (const [user, action, pem] of [[author, 'submit', key('author')], [reviewer, 'review', key('reviewer')], [owner, 'approve', key('owner')]]) {
      const current = challenge(user, created.id, action);
      transition(user, created.id, {
        action,
        digest: current.digest,
        revision: current.revision,
        signature: sign(null, Buffer.from(current.statement), pem).toString('base64'),
      });
    }
    const bundle = exportDocument(created.id);
    const trust = exportTrust(owner);
    const bundlePath = join(data, 'bundle.json');
    const trustPath = join(data, 'trust.json');
    writeFileSync(bundlePath, JSON.stringify(bundle));
    writeFileSync(trustPath, JSON.stringify(trust));

    const intact = run(bundlePath, trustPath);
    assert.equal(intact.status, 0);
    assert.equal(intact.report.integrity, 'PASS');
    assert.equal(intact.report.state, 'PASS');
    assert.equal(intact.report.signatures, 'PASS');
    assert.equal(intact.report.verdict, 'INCONCLUSIVE');
    assert.equal(intact.report.anchor, 'INCONCLUSIVE');
    assert.equal(notices(intact.status), 1);

    const tampered = structuredClone(bundle);
    tampered.document.body += ' adulterado';
    const tamperedPath = join(data, 'tampered.json');
    writeFileSync(tamperedPath, JSON.stringify(tampered));
    const broken = run(tamperedPath, trustPath);
    assert.notEqual(broken.status, 0);
    assert.equal(broken.report.verdict, 'FAIL');
    assert.equal(notices(broken.status), 0);

    writeFileSync(join(data, 'empty-trust.json'), JSON.stringify({ format: 'arkhe-intra/trust/v1', accounts: [] }));
    const missingKeys = run(bundlePath, join(data, 'empty-trust.json'));
    assert.notEqual(missingKeys.status, 0);
    assert.equal(missingKeys.report.signatures, 'INCONCLUSIVE');
    assert.equal(notices(missingKeys.status), 0);

    const absent = run(bundlePath, join(data, 'ausente.json'));
    assert.notEqual(absent.status, 0);
    assert.equal(notices(absent.status), 0);
  })();

  function run(bundlePath, trustPath) {
    try {
      const stdout = execFileSync(process.execPath, [gate, bundlePath, trustPath], { cwd: intra, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { status: 0, report: JSON.parse(stdout) };
    } catch (error) {
      const stdout = error.stdout?.toString?.() ?? '';
      return { status: error.status ?? 1, report: stdout ? JSON.parse(stdout) : { error: String(error.message) } };
    }
  }
});

function notices(status) {
  return status === 0 ? 1 : 0;
}
