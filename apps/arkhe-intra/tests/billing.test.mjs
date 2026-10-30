import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.ARKHE_INTRA_DATA_DIR = mkdtempSync(join(tmpdir(), 'arkhe-billing-'));
process.env.ARKHE_BILLING_TENANT_ID = 'test-tenant';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture_only';
process.env.ARKHE_BILLING_ENFORCE = 'true';
const { billingStore, billingState, requireBillingAccess, verifyStripeEvent, processStripeEvent, billingAction } = await import('../lib/billing.mjs');
const sql = billingStore();
const stamp = Math.floor(Date.now() / 1000);
const invoice = { id: 'in_fixture', customer: 'cus_fixture', status: 'paid', created: stamp, due_date: null, metadata: {} };
const event = (id, type = 'invoice.paid') => ({ id, type, created: stamp, livemode: false, data: { object: invoice } });
let status = 'active';
const api = async path => path.startsWith('subscriptions?')
  ? { data: [{ id: 'sub_fixture', status, metadata: { plan_tier: 'pro' } }], has_more: false } : invoice;

test('signature authenticates raw bytes, rotated signatures and freshness', () => {
  const raw = Buffer.from(JSON.stringify(event('evt_signed')));
  const signed = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${stamp}.`).update(raw).digest('hex');
  assert.equal(verifyStripeEvent(raw, `t=${stamp},v1=${'0'.repeat(64)},v1=${signed}`).id, 'evt_signed');
  assert.throws(() => verifyStripeEvent(Buffer.from('{}'), `t=${stamp},v1=${signed}`), { status: 400 });
  assert.throws(() => verifyStripeEvent(raw, `t=${stamp},v1=${signed}`, (stamp + 301) * 1000), { status: 400 });
  assert.throws(() => verifyStripeEvent(raw, ''), { status: 400 });
});

test('coverage fails closed, deduplicates, reconciles stale failures, suspends and restores', async () => {
  assert.throws(requireBillingAccess, { status: 402 });
  sql.prepare('INSERT INTO tenant_billing(tenant_id,customer_id) VALUES(?,?)').run('test-tenant', 'cus_fixture');
  await processStripeEvent(event('evt_paid'), api);
  assert.equal(billingState().anchoringAllowed, true);
  assert.equal((await processStripeEvent(event('evt_paid'), () => { throw Error('must not call'); })).duplicate, true);
  // An old failure delivery must reconcile the currently paid invoice.
  await processStripeEvent(event('evt_old_failure', 'invoice.payment_failed'), api);
  assert.equal(billingState().anchoringAllowed, true);
  invoice.status = 'open';
  await processStripeEvent(event('evt_failed', 'invoice.payment_failed'), api);
  assert.equal(billingState().status, 'past_due');
  assert.throws(requireBillingAccess, { status: 402 });
  invoice.status = 'paid';
  await processStripeEvent(event('evt_recovered'), api);
  assert.equal(billingState().anchoringAllowed, true);
  status = 'canceled';
  await processStripeEvent(event('evt_canceled', 'customer.subscription.deleted'), api);
  assert.throws(requireBillingAccess, { status: 402 });
});

test('failed reconciliation remains retryable and does not mark the event processed', async () => {
  await assert.rejects(processStripeEvent(event('evt_retry'), async () => { throw Error('network'); }));
  assert.equal(sql.prepare('SELECT id FROM billing_events WHERE id=?').get('evt_retry'), undefined);
  await processStripeEvent(event('evt_retry'), api);
});

test('an unpaid invoice cannot be overridden by paying a different invoice', async () => {
  status = 'active'; invoice.status = 'open';
  await processStripeEvent(event('evt_debt', 'invoice.payment_failed'), api);
  const other = { ...invoice, id: 'in_other', status: 'paid' };
  await processStripeEvent({ ...event('evt_other'), data: { object: other } }, async path => path.startsWith('subscriptions?') ? api(path) : other);
  assert.equal(billingState().anchoringAllowed, false);
  invoice.status = 'void';
  await processStripeEvent(event('evt_void', 'invoice.voided'), api);
  assert.equal(billingState().anchoringAllowed, true);
});

test('Enterprise grants only paid coverage; cancellation is independent', async () => {
  status = 'canceled'; invoice.status = 'paid';
  invoice.metadata = { tenant_id: 'test-tenant', plan_tier: 'enterprise', coverage_until: String(stamp + 3600) };
  await processStripeEvent(event('evt_enterprise'), api);
  assert.equal(billingState().plan, 'enterprise');
  assert.equal(billingState().anchoringAllowed, true);
});

test('owner, values, stable operation ids and test-only secret are enforced', async () => {
  await assert.rejects(billingAction('invoice', {}, { role: 'author' }, ''), { status: 403 });
  await assert.rejects(billingAction('invoice', { amountInCents: -1 }, { role: 'owner' }, ''), { status: 400 });
  await assert.rejects(billingAction('portal', {}, { role: 'owner' }, ''), { status: 400 });
});

test('REST invoice flow binds its item, finalizes before sending and caches retries', async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_only';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers['Stripe-Version'], '2025-06-30.basil');
    assert.match(options.headers['Idempotency-Key'], /^test-tenant:invoice:invoice-rest-001:/);
    calls.push({ path: new URL(url).pathname, params: Object.fromEntries(options.body) });
    return Response.json({ id: 'in_rest', hosted_invoice_url: 'https://invoice.stripe.com/fixture', invoice_pdf: 'https://invoice.stripe.com/fixture.pdf' });
  };
  try {
    const input = { operationId: 'invoice-rest-001', amountInCents: 200000, currency: 'usd', description: 'Enterprise', coverageUntil: stamp + 86400 };
    const result = await billingAction('invoice', input, { role: 'owner' }, 'http://127.0.0.1:3003');
    assert.equal(result.id, 'in_rest');
    assert.deepEqual(calls.map(c => c.path), ['/v1/invoices', '/v1/invoiceitems', '/v1/invoices/in_rest/finalize', '/v1/invoices/in_rest/send']);
    assert.equal(calls[0].params.pending_invoice_items_behavior, 'exclude');
    assert.equal(calls[0].params.days_until_due, '30');
    assert.equal(calls[1].params.invoice, 'in_rest');
    assert.deepEqual(await billingAction('invoice', input, { role: 'owner' }, ''), result);
    assert.equal(calls.length, 4);
    await assert.rejects(billingAction('invoice', { ...input, amountInCents: 100 }, { role: 'owner' }, ''), { status: 409 });
  } finally { globalThis.fetch = originalFetch; delete process.env.STRIPE_SECRET_KEY; }
});

test('usage uses meters, retries keep the same identifier and changed quantities are rejected', async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_only';
  process.env.STRIPE_METER_EVENT_NAME = 'arkhe_anchoring_batches';
  let count = 0;
  globalThis.fetch = async (url, options) => {
    count++;
    assert.equal(new URL(url).pathname, '/v1/billing/meter_events');
    assert.equal(options.body.get('payload[value]'), '2');
    assert.equal(options.body.get('payload[stripe_customer_id]'), 'cus_fixture');
    return Response.json({ identifier: options.body.get('identifier') });
  };
  try {
    const input = { operationId: 'usage-rest-001', batchQuantity: 2 };
    const first = await billingAction('usage', input, { role: 'owner' }, '');
    assert.deepEqual(await billingAction('usage', input, { role: 'owner' }, ''), first);
    assert.equal(count, 1);
    await assert.rejects(billingAction('usage', { ...input, batchQuantity: 3 }, { role: 'owner' }, ''), { status: 409 });
  } finally { globalThis.fetch = originalFetch; delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_METER_EVENT_NAME; }
});

test('checkout binds a configured recurring price and prevents parallel subscriptions', async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_only';
  process.env.STRIPE_PRICE_STARTER = 'price_fixture';
  process.env.STRIPE_PRICE_ANCHORING = 'price_meter_fixture';
  let count = 0;
  globalThis.fetch = async (url, options) => {
    count++;
    if (new URL(url).pathname === '/v1/checkout/sessions/cs_fixture') return Response.json({ id: 'cs_fixture', status: 'open', metadata: { arkhe_operation: 'test-tenant:checkout:checkout-rest-001' } });
    assert.equal(new URL(url).pathname, '/v1/checkout/sessions');
    assert.equal(options.body.get('line_items[0][price]'), 'price_fixture');
    assert.equal(options.body.get('line_items[1][price]'), 'price_meter_fixture');
    assert.equal(options.body.has('line_items[1][quantity]'), false);
    assert.equal(options.body.get('subscription_data[metadata][tenant_id]'), 'test-tenant');
    return Response.json({ id: 'cs_fixture', url: 'https://checkout.stripe.com/fixture' });
  };
  try {
    const input = { operationId: 'checkout-rest-001', plan: 'starter' };
    const first = await billingAction('checkout', input, { role: 'owner' }, 'http://127.0.0.1:3003');
    assert.equal(first.id, 'cs_fixture');
    assert.deepEqual(await billingAction('checkout', input, { role: 'owner' }, ''), first);
    assert.equal(count, 1);
    await assert.rejects(billingAction('checkout', { ...input, operationId: 'checkout-rest-002' }, { role: 'owner' }, ''), { status: 409 });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ['STRIPE_SECRET_KEY','STRIPE_PRICE_STARTER','STRIPE_PRICE_ANCHORING']) delete process.env[key];
  }
});

test('HTTP webhook bypasses browser Origin only for signature verification; billing remains protected', async () => {
  execFileSync(process.execPath, ['scripts/setup.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: process.env, stdio: 'pipe' });
  const { handle } = await import('../lib/http.mjs');
  const base = 'http://127.0.0.1:3003';
  const missingSignature = await handle(new Request(`${base}/api/billing/webhook`, { method: 'POST', body: '{}' }), ['billing', 'webhook']);
  assert.equal(missingSignature.status, 400);
  const noSession = await handle(new Request(`${base}/api/billing`), ['billing']);
  assert.equal(noSession.status, 401);
  const wrongOrigin = await handle(new Request(`${base}/api/billing/portal`, { method: 'POST', headers: { Origin: 'https://other.invalid' }, body: '{}' }), ['billing', 'portal']);
  assert.equal(wrongOrigin.status, 403);
  const creds = JSON.parse(readFileSync(join(process.env.ARKHE_INTRA_DATA_DIR, 'credentials.json')));
  const credential = creds.find(row => row.email.startsWith('owner@'));
  const login = await handle(new Request(`${base}/api/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(credential) }), ['login']);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const state = await handle(new Request(`${base}/api/billing`, { headers: { Cookie: cookie } }), ['billing']);
  assert.equal(state.status, 200);
  assert.equal((await state.json()).tenantId, 'test-tenant');
});
