import test from 'node:test';
import { sign, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.ARKHE_ENTERPRISE_PHASE = 'internal';
process.env.ARKHE_INTRA_DATA_DIR = mkdtempSync(join(tmpdir(), 'arkhe-enterprise-'));
const cwd = fileURLToPath(new URL('..', import.meta.url));
execFileSync(process.execPath, ['scripts/setup.mjs'], { cwd, env: process.env, stdio: 'pipe' });
const { handle } = await import('../lib/http.mjs');
const { createMmr, loadNodeVerifier, wasmVerify } = await import('../../../scripts/e02_mmr.mjs');
const mmr = createMmr(bytes => loadNodeVerifier().blake3_hex(bytes));
const { db, auditIntegrity, events } = await import('../lib/store.mjs');
const { suggestSector, resolveSector, CNAE_PRIORITY } = await import('../lib/enterprise-catalog.mjs');
const credentials = JSON.parse(readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR, 'credentials.json')));
const bootstrapPath = join(process.env.ARKHE_INTRA_DATA_DIR, 'accounts.json');
const bootstrap = JSON.parse(readFileSync(bootstrapPath));
bootstrap.push({ ...bootstrap.find(item => item.role === 'owner'), id: 'ownerB', name: 'Owner B', email: 'ownerB@arkhe.local' });
writeFileSync(bootstrapPath, JSON.stringify(bootstrap));
credentials.push({ ...credentials.find(item => item.email.startsWith('owner@')), email: 'ownerB@arkhe.local' });
const origin = 'http://127.0.0.1:3003', cookies = {};
const activeRegistry = { ni: '11222333000181', nomeEmpresarial: 'EMPRESA DE TESTE', situacaoCadastral: { codigo: '2' }, cnaePrincipal: { codigo: '6201501' } };
function configureRegistry(t, answer = activeRegistry) {
  const previous = { key: process.env.ARKHE_SERPRO_CONSUMER_KEY, secret: process.env.ARKHE_SERPRO_CONSUMER_SECRET };
  process.env.ARKHE_SERPRO_CONSUMER_KEY = 'test-consumer-' + Math.random();
  process.env.ARKHE_SERPRO_CONSUMER_SECRET = 'test-secret';
  t.after(() => {
    if (previous.key === undefined) delete process.env.ARKHE_SERPRO_CONSUMER_KEY; else process.env.ARKHE_SERPRO_CONSUMER_KEY = previous.key;
    if (previous.secret === undefined) delete process.env.ARKHE_SERPRO_CONSUMER_SECRET; else process.env.ARKHE_SERPRO_CONSUMER_SECRET = previous.secret;
  });
  return t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    if (url === 'https://gateway.apiserpro.serpro.gov.br/token') return Response.json({ access_token: 'test-bearer' });
    assert.equal(url, 'https://gateway.apiserpro.serpro.gov.br/consulta-cnpj-df/v2/basica/11222333000181');
    return Response.json(answer);
  });
}
async function request(path, role, data, source = origin, headers = {}) {
  const response = await handle(new Request(`${origin}/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: source, 'Content-Type': 'application/json', Cookie: cookies[role] || '', ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }), path.split('/'));
  return { status: response.status, value: await response.json(), response };
}
const configuration = { company: 'Empresa de teste', cnpj: '11.222.333/0001-81', cnae: '6201-5/01', sectorId: 'generic', departments: ['legal', 'engineering'], integrations: ['sso'] };
async function declare(role, preview) {
  const documents = ['constitution', 'identity'].map(kind => ({ kind, sha256: createHash('sha256').update('synthetic document '+kind).digest('hex') }));
  const challenge = await request('enterprise/representation/challenge', role, { previewHash: preview.value.previewHash, capacity: 'administrator', documents });
  assert.equal(challenge.status, 200, challenge.value.error);
  const key = readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR, 'owner.private.pem'));
  const signature = sign(null, Buffer.from(challenge.value.statement), key).toString('base64');
  const record = await request('enterprise/representation/record', role, { challengeId: challenge.value.id, signature });
  assert.equal(record.status, 201, record.value.error);
  assert.equal(record.value.basis.anchor.format, 'arkhe-enterprise/local-wormgraph-representation/v1');
  assert.equal(record.value.basis.powers_verified, false);
  const receipt = record.value.basis.anchor;
  const leaves = receipt.recordHashes.map(value => Buffer.from(value, 'hex'));
  for (let index = 0; index < leaves.length; index++) {
    const proof = mmr.build(leaves, index);
    assert.equal(proof.root.toString('hex'), receipt.root);
    assert.equal(wasmVerify(leaves[index], leaves.length, proof.proof, proof.root), true);
  }
  return record.value.id;
}
test('Enterprise: authenticated onboarding, immutable profile and presentation-only personas', async t => {
  for (const role of ['owner', 'ownerB', 'author', 'reviewer']) {
    const login = await request('login', role, credentials.find(item => item.email.startsWith(role + '@')));
    assert.equal(login.status, 200); cookies[role] = login.response.headers.get('set-cookie').split(';')[0];
  }
  await t.test('catalog requires session; changes require same origin', async () => {
    assert.equal((await request('enterprise')).status, 401);
    assert.equal((await request('enterprise/personas', 'author', { available: ['executive'], active: 'executive' }, 'https://evil.example')).status, 403);
    const result = await request('enterprise', 'author');
    assert.equal(result.value.sectors.length, 13); assert.equal(result.value.personas.length, 8); assert.equal(result.value.canConfigure, false);
    assert.equal(suggestSector('6511-1/01'), 'insurance'); assert.equal(suggestSector('6201-5/01'), 'technology');
  });
  await t.test('executive persona never grants owner privileges or changes another user', async () => {
    assert.equal((await request('enterprise/personas', 'author', { available: ['executive', 'audit'], active: 'executive', role: 'owner' })).status, 200);
    assert.equal((await request('enterprise', 'author')).value.preferences.active, 'executive');
    assert.equal((await request('enterprise', 'reviewer')).value.preferences.active, 'legal');
    assert.equal((await request('me', 'author')).value.role, 'author');
    assert.equal((await request('audit', 'author')).status, 403);
    assert.equal((await request('enterprise/preview', 'author', configuration)).status, 403);
    assert.equal((await request('enterprise/commit', 'reviewer', { confirm: true })).status, 403);
    assert.equal((await request('enterprise/personas', 'author', { available: [], active: 'legal' })).status, 400);
    assert.equal((await request('enterprise/personas', 'author', { available: ['legal'], active: 'owner' })).status, 400);
  });
  await t.test('validates company, CNPJ, CNAE, sector, departments and integrations', async () => {
    for (const invalid of [{ company: '' }, { cnpj: '11111111111111' }, { cnpj: '11222333000182' }, { cnae: '62' }, { sectorId: 'invalid' }, { departments: [] }, { integrations: ['unknown'] }]) {
      assert.equal((await request('enterprise/preview', 'owner', { ...configuration, ...invalid })).status, 400);
    }
    assert.equal((await request('enterprise', 'owner')).value.profile, null);
  });
  await t.test('commit requires exact, unexpired, owner-bound preview and acknowledgement', async () => {
    assert.equal((await request('enterprise/commit', 'owner', { previewHash: 'fake', confirm: true })).status, 409);
    const first = await request('enterprise/preview', 'owner', configuration);
    assert.equal(first.status, 200); assert.equal(first.value.configuration.policyStatus, 'proposed-not-enforced');
    assert.equal((await request('enterprise/commit', 'owner', { previewHash: first.value.previewHash })).status, 400);
    const second = await request('enterprise/preview', 'owner', { ...configuration, integrations: [] });
    assert.notEqual(first.value.previewHash, second.value.previewHash);
    assert.equal((await request('enterprise/commit', 'owner', { previewHash: first.value.previewHash, confirm: true })).status, 409);
    db().prepare('UPDATE enterprise_previews SET expires=0').run();
    assert.equal((await request('enterprise/commit', 'owner', { previewHash: second.value.previewHash, confirm: true })).status, 409);
  });
  await t.test('alphanumeric preview preserves letters; regulated sectors reject self-declaration and forged verification flags', async () => {
    const alpha = await request('enterprise/preview', 'owner', { ...configuration, cnpj: '12.abc.345/01de-35' });
    assert.equal(alpha.status, 200); assert.equal(alpha.value.configuration.cnpj, '12ABC34501DE35');
    for (const sectorId of ['finance', 'health', 'government']) {
      const p = await request('enterprise/preview', 'owner', { ...configuration, sectorId });
      assert.equal((await request('enterprise/representation/challenge', 'owner', { previewHash: p.value.previewHash, capacity: 'administrator', documents: [] })).status, 403);
      assert.equal((await request('enterprise/commit', 'owner', { previewHash: p.value.previewHash, confirm: true, representation_basis: { kind: 'ECnpj', chain_verified: true } })).status, 403);
    }
  });
  await t.test('declaration requires base documents and valid account signature; no identity bytes are stored', async () => {
    const p = await request('enterprise/preview', 'owner', configuration);
    const docs = ['constitution', 'identity'].map((kind, i) => ({ kind, sha256: String(i + 1).repeat(64) }));
    const input = { previewHash: p.value.previewHash, capacity: 'director', documents: docs };
    assert.equal((await request('enterprise/representation/challenge', 'owner', input)).status, 400);
    const challenge = await request('enterprise/representation/challenge', 'owner', { ...input, capacity: 'administrator' });
    assert.equal(challenge.status, 200);
    assert.equal((await request('enterprise/representation/record', 'owner', { challengeId: challenge.value.id, signature: Buffer.alloc(64).toString('base64') })).status, 422);
    assert.equal((await request('enterprise/commit', 'owner', { previewHash: p.value.previewHash, confirm: true })).status, 422);
    process.env.ARKHE_ENTERPRISE_PHASE = 'external';
    assert.equal((await request('enterprise/commit', 'owner', { previewHash: p.value.previewHash, confirm: true })).status, 403);
    process.env.ARKHE_ENTERPRISE_PHASE = 'internal';
  });
  await t.test('preview idempotency replays exactly, rejects key reuse and replaced previews', async () => {
    const headers = { 'Idempotency-Key': 'preview-test-key-001' };
    const first = await request('enterprise/preview','owner',configuration,origin,headers);
    const retry = await request('enterprise/preview','owner',configuration,origin,headers);
    assert.deepEqual(retry.value,first.value);
    assert.equal((await request('enterprise/preview','owner',{...configuration,company:'Changed'},origin,headers)).status,409);
    await request('enterprise/preview','owner',{...configuration,integrations:[]});
    assert.equal((await request('enterprise/preview','owner',configuration,origin,headers)).status,409);
    assert.equal((await request('enterprise/preview','owner',configuration,origin,{'Idempotency-Key':'bad'})).status,400);
    assert.equal((await request('metrics')).status,401);
    assert.equal((await request('metrics','author')).status,403);
    const metrics = await handle(new Request(origin+'/api/metrics',{headers:{Cookie:cookies.owner}}),['metrics']);
    assert.equal(metrics.status,200); assert.match(await metrics.text(),/arkhe_http_requests_total/);
    assert.equal((await request('ready')).status,200);
    const marker = join(process.env.ARKHE_INTRA_DATA_DIR,'draining-test');
    writeFileSync(marker,'draining'); process.env.ARKHE_DRAIN_FILE = marker;
    try { assert.equal((await request('ready')).status,503); assert.equal((await request('health')).status,200); }
    finally { delete process.env.ARKHE_DRAIN_FILE; }
  });
  await t.test('CNPJ gate fails closed without credentials and rejects mismatched, inactive or unavailable registry', async t => {
    delete process.env.ARKHE_SERPRO_CONSUMER_KEY; delete process.env.ARKHE_SERPRO_CONSUMER_SECRET;
    const preview = await request('enterprise/preview', 'owner', configuration);
    const representationId = await declare('owner', preview);
    const input = { previewHash: preview.value.previewHash, representationId, confirm: true };
    assert.equal((await request('enterprise/commit', 'owner', input)).status, 503);
    const fetchMock = configureRegistry(t);
    for (const invalid of [{ ...activeRegistry, ni: '00000000000191' }, { ...activeRegistry, situacaoCadastral: { codigo: '8' } }, { ...activeRegistry, nomeEmpresarial: 'OUTRA EMPRESA' }, { ...activeRegistry, cnaePrincipal: { codigo: '6511101' } }]) {
      fetchMock.mock.mockImplementation(async url => url.endsWith('/token') ? Response.json({ access_token: 'test-bearer' }) : Response.json(invalid));
      assert.equal((await request('enterprise/commit', 'owner', input)).status, 422);
      assert.equal((await request('enterprise', 'owner')).value.profile, null);
    }
    for (const status of [401, 404, 429, 503]) {
      fetchMock.mock.mockImplementation(async url => url.endsWith('/token') ? Response.json({ access_token: 'test-bearer' }) : Response.json({}, { status }));
      assert.equal((await request('enterprise/commit', 'owner', input)).status, status === 404 ? 422 : 503);
    }
    fetchMock.mock.mockImplementation(async () => { throw new Error('private-secret-should-not-leak'); });
    const unavailable = await request('enterprise/commit', 'owner', input);
    assert.equal(unavailable.status, 503); assert.doesNotMatch(unavailable.value.error, /private-secret/);
  });
  await t.test('preview changed during registry lookup cannot be committed', async t => {
    const preview = await request('enterprise/preview', 'owner', configuration);
    const representationId = await declare('owner', preview);
    configureRegistry(t).mock.mockImplementation(async url => {
      if (url.endsWith('/token')) return Response.json({ access_token: 'test-bearer' });
      await request('enterprise/preview', 'owner', { ...configuration, integrations: [] });
      return Response.json(activeRegistry);
    });
    assert.equal((await request('enterprise/commit', 'owner', { previewHash: preview.value.previewHash, representationId, confirm: true })).status, 409);
    assert.equal((await request('enterprise', 'owner')).value.profile, null);
  });
  await t.test('A and B keep independent previews; concurrent commits have one winner and invalidate all previews', async t => {
    configureRegistry(t);
    const a = await request('enterprise/preview', 'owner', configuration);
    const b = await request('enterprise/preview', 'ownerB', { ...configuration, integrations: [] });
    const representationA = await declare('owner', a), representationB = await declare('ownerB', b);
    assert.notEqual(a.value.previewHash, b.value.previewHash);
    assert.equal(db().prepare('SELECT count(*) AS n FROM enterprise_previews').get().n, 2);
    assert.equal((await request('enterprise/commit', 'ownerB', { previewHash: a.value.previewHash, confirm: true })).status, 409);
    const results = await Promise.all([
      request('enterprise/commit', 'owner', { previewHash: a.value.previewHash, representationId: representationA, confirm: true }),
      request('enterprise/commit', 'ownerB', { previewHash: b.value.previewHash, representationId: representationB, confirm: true }),
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    const committed = results.find(result => result.status === 201).value;
    assert.equal(committed.company, configuration.company);
    assert.equal(committed.identityEvidence.cnpj, activeRegistry.ni);
    assert.equal(committed.identityEvidence.representation, 'not-verified');
    assert.equal(committed.identityEvidence.previewHash, committed.previewHash);
    assert.equal(committed.sectorSnapshot.id, 'generic');
    assert.equal((await request('enterprise/preview', 'owner', configuration)).status, 409);
    assert.equal((await request('enterprise/commit', 'owner', { previewHash: a.value.previewHash, confirm: true })).status, 409);
    assert.equal((await request('enterprise', 'reviewer')).value.profile.previewHash, committed.previewHash);
    assert.equal(db().prepare('SELECT count(*) AS n FROM enterprise_previews').get().n, 0);
    assert.equal(events().filter(row => row.event.action === 'enterprise-profile-confirmed').length, 1);
    assert.equal(auditIntegrity(), true);
    assert.throws(() => db().prepare('UPDATE enterprise_profile SET value=?').run('{}'), /immutable/);
    assert.throws(() => db().prepare('DELETE FROM enterprise_profile').run(), /immutable/);
  });
});
test('CNAE: ordered prefixes, overlapping rules, financial edge and explicit generic fallback', () => {
  assert.deepEqual(CNAE_PRIORITY.slice(0, 3).map(rule => rule.prefix), ['65', '64', '66']);
  assert.equal(suggestSector('6499-9/99'), 'finance');
  assert.equal(suggestSector('6511-1/01'), 'insurance');
  assert.equal(suggestSector('6619-3/99'), 'finance');
  assert.equal(suggestSector('9999-9/99'), 'generic'); assert.equal(suggestSector(''), 'generic');
  const overlapping = [{ prefix: '6', sectorId: 'first' }, { prefix: '64', sectorId: 'second' }, { prefix: '649', sectorId: 'third' }];
  assert.equal(resolveSector('6499-9/99', overlapping), 'first');
  assert.equal(resolveSector('6499-9/99', overlapping.toReversed()), 'third');
});
