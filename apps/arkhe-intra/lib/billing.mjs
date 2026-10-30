import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { db, transaction } from './store.mjs';

function check(ok, status, message) { if (!ok) throw Object.assign(new Error(message), { status }); }
const tenant = () => {
  const id = process.env.ARKHE_BILLING_TENANT_ID;
  check(id && /^[a-zA-Z0-9_-]{1,100}$/.test(id), 503, 'Configure ARKHE_BILLING_TENANT_ID no servidor.');
  return id;
};
export function billingStore() {
  const sql = db();
  sql.exec(`CREATE TABLE IF NOT EXISTS tenant_billing (
    tenant_id TEXT PRIMARY KEY, customer_id TEXT UNIQUE NOT NULL,
    subscription_id TEXT, subscription_status TEXT NOT NULL DEFAULT 'incomplete',
    plan_tier TEXT, enterprise_until INTEGER NOT NULL DEFAULT 0, checkout_session_id TEXT);
    CREATE TABLE IF NOT EXISTS billing_events (id TEXT PRIMARY KEY, processed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, status TEXT NOT NULL,
      due_date INTEGER, created INTEGER NOT NULL, valid_until INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS billing_operations (
      id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL);`);
  return sql;
}
export function billingState() {
  const sql = billingStore(), id = tenant();
  const row = sql.prepare('SELECT * FROM tenant_billing WHERE tenant_id=?').get(id);
  const now = Math.floor(Date.now() / 1000);
  const debt = sql.prepare("SELECT id FROM billing_invoices WHERE tenant_id=? AND (status='uncollectible' OR (status='open' AND (due_date IS NULL OR due_date<=?))) LIMIT 1").get(id, now);
  const entitled = row && (row.subscription_status === 'active' || row.enterprise_until > now);
  return { tenantId: id, customerId: row?.customer_id ?? null, plan: row?.plan_tier ?? null,
    status: debt ? 'past_due' : entitled ? 'active' : row?.subscription_status ?? 'unconfigured',
    anchoringAllowed: Boolean(entitled && !debt) };
}
export function requireBillingAccess() {
  if (process.env.ARKHE_BILLING_ENFORCE !== 'true') return;
  check(billingState().anchoringAllowed, 402, 'Ancoragem suspensa: faturamento sem cobertura ativa ou com pendências.');
}
export async function stripeRequest(path, params, key) {
  const secret = process.env.STRIPE_SECRET_KEY;
  check(secret && /^sk_test_/.test(secret), 503, 'Configure STRIPE_SECRET_KEY de teste na memória do processo.');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${secret}`, 'Stripe-Version': '2025-06-30.basil',
      ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(params ? { body: new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) } : {})
  });
  check(response.ok, 502, 'Stripe recusou a operação. Verifique a configuração no Dashboard de teste.');
  return response.json();
}
function operationId(input) {
  check(typeof input.operationId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(input.operationId), 400, 'operationId deve ser estável entre tentativas (8–80 caracteres).');
  return input.operationId;
}
let operations = Promise.resolve();
function operation(name, input, run) {
  const work = operations.then(() => executeOperation(name, input, run));
  operations = work.catch(() => {}); return work;
}
async function executeOperation(name, input, run) {
  const sql = billingStore(), id = `${tenant()}:${name}:${operationId(input)}`;
  const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const saved = sql.prepare('SELECT * FROM billing_operations WHERE id=?').get(id);
  if (saved) {
    check(saved.digest === digest, 409, 'operationId já utilizado com parâmetros diferentes.');
    if (saved.result) return JSON.parse(saved.result);
    check(Date.now() - saved.created_at < 23 * 3600000, 409, 'Operação pendente antiga: reconcilie no Stripe antes de repetir.');
  } else sql.prepare('INSERT INTO billing_operations VALUES(?,?,NULL,?)').run(id, digest, Date.now());
  const result = await run(id);
  sql.prepare('UPDATE billing_operations SET result=? WHERE id=?').run(JSON.stringify(result), id);
  return result;
}
function customer() {
  const row = billingStore().prepare('SELECT * FROM tenant_billing WHERE tenant_id=?').get(tenant());
  check(row, 409, 'Cadastre primeiro o cliente de faturamento.'); return row;
}
const objectId = value => typeof value === 'string' ? value : value?.id;

export async function billingAction(action, input, user, baseUrl) {
  check(user?.role === 'owner', 403, 'Faturamento exige o responsável pela governança.');
  if (action === 'customer') {
    check(typeof input.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) && input.email.length <= 254, 400, 'E-mail inválido.');
    return operation('customer', input, async key => {
      const existing = billingState().customerId;
      if (existing) return { customerId: existing };
      const result = await stripeRequest('customers', { email: input.email, 'metadata[tenant_id]': tenant() }, key);
      billingStore().prepare('INSERT INTO tenant_billing(tenant_id,customer_id) VALUES(?,?)').run(tenant(), result.id);
      return { customerId: result.id };
    });
  }
  const row = customer();
  if (action === 'checkout') {
    check(['starter', 'pro'].includes(input.plan), 400, 'Plano inválido.');
    const price = process.env[`STRIPE_PRICE_${input.plan.toUpperCase()}`];
    check(price && /^price_/.test(price), 503, 'Configure o preço recorrente do plano.');
    return operation('checkout', input, async key => {
      const current = customer();
      if (current.checkout_session_id) {
        const pending = await stripeRequest(`checkout/sessions/${current.checkout_session_id}`);
        if (pending.metadata?.arkhe_operation === key) return { id: pending.id, url: pending.url };
        check(pending.status === 'expired', 409, 'Checkout existente: conclua ou aguarde expiração antes de criar outro.');
      }
      check(!['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(current.subscription_status) || !current.subscription_id, 409, 'Assinatura existente: utilize o portal.');
      const result = await stripeRequest('checkout/sessions', { mode: 'subscription', customer: row.customer_id,
        'line_items[0][price]': price, 'line_items[0][quantity]': 1,
        ...(process.env.STRIPE_PRICE_ANCHORING ? { 'line_items[1][price]': process.env.STRIPE_PRICE_ANCHORING } : {}),
        'subscription_data[metadata][tenant_id]': tenant(), 'subscription_data[metadata][plan_tier]': input.plan,
        'metadata[arkhe_operation]': key,
        client_reference_id: tenant(), success_url: `${baseUrl}/?billing=success`, cancel_url: `${baseUrl}/?billing=canceled` }, key);
      billingStore().prepare('UPDATE tenant_billing SET checkout_session_id=? WHERE tenant_id=?').run(result.id, tenant());
      return { id: result.id, url: result.url };
    });
  }
  if (action === 'portal') return operation('portal', input, async key => {
    const result = await stripeRequest('billing_portal/sessions', { customer: row.customer_id, return_url: baseUrl }, key);
    return { url: result.url };
  });
  if (action === 'invoice') {
    check(Number.isSafeInteger(input.amountInCents) && input.amountInCents > 0 && input.amountInCents <= 100000000, 400, 'Valor inválido em centavos.');
    check(['usd', 'brl'].includes(input.currency), 400, 'Moeda inválida.');
    check(typeof input.description === 'string' && input.description.length > 0 && input.description.length <= 500, 400, 'Descrição inválida.');
    check(Number.isSafeInteger(input.coverageUntil) && input.coverageUntil > Date.now() / 1000 && input.coverageUntil < Date.now() / 1000 + 366 * 86400, 400, 'coverageUntil deve ser um timestamp futuro, até 366 dias.');
    return operation('invoice', input, async key => {
      // Bind each item to its own invoice; never consume unrelated pending items.
      const invoice = await stripeRequest('invoices', { customer: row.customer_id, collection_method: 'send_invoice',
        days_until_due: 30, auto_advance: false, pending_invoice_items_behavior: 'exclude',
        'metadata[tenant_id]': tenant(), 'metadata[coverage_until]': input.coverageUntil,
        'metadata[plan_tier]': 'enterprise' }, `${key}:draft`);
      await stripeRequest('invoiceitems', { customer: row.customer_id, invoice: invoice.id,
        amount: input.amountInCents, currency: input.currency, description: input.description }, `${key}:item`);
      await stripeRequest(`invoices/${invoice.id}/finalize`, { auto_advance: false }, `${key}:finalize`);
      const sent = await stripeRequest(`invoices/${invoice.id}/send`, {}, `${key}:send`);
      return { id: sent.id, url: sent.hosted_invoice_url, pdf: sent.invoice_pdf };
    });
  }
  if (action === 'usage') {
    requireBillingAccess();
    check(Number.isSafeInteger(input.batchQuantity) && input.batchQuantity > 0 && input.batchQuantity <= 1000000, 400, 'Quantidade de lotes inválida.');
    check(process.env.STRIPE_METER_EVENT_NAME, 503, 'Configure STRIPE_METER_EVENT_NAME.');
    return operation('usage', input, async key => {
      const identifier = createHash('sha256').update(key).digest('hex');
      await stripeRequest('billing/meter_events', { event_name: process.env.STRIPE_METER_EVENT_NAME,
        'payload[stripe_customer_id]': row.customer_id, 'payload[value]': input.batchQuantity, identifier }, key);
      return { identifier, batchQuantity: input.batchQuantity };
    });
  }
  check(false, 404, 'Operação de faturamento não encontrada.');
}

export function verifyStripeEvent(raw, signature, now = Date.now()) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  check(secret, 503, 'Configure STRIPE_WEBHOOK_SECRET.');
  const parts = (signature || '').split(',').map(part => part.split('='));
  const stamp = parts.find(([name]) => name === 't')?.[1];
  check(/^\d+$/.test(stamp || '') && Math.abs(now / 1000 - Number(stamp)) <= 300, 400, 'Assinatura Stripe inválida ou expirada.');
  const expected = createHmac('sha256', secret).update(`${stamp}.`).update(raw).digest();
  check(parts.some(([name, value]) => name === 'v1' && /^[a-f0-9]{64}$/.test(value || '') && timingSafeEqual(expected, Buffer.from(value, 'hex'))), 400, 'Assinatura Stripe inválida.');
  let event; try { event = JSON.parse(raw.toString('utf8')); } catch { check(false, 400, 'Evento inválido.'); }
  check(event && /^evt_/.test(event.id) && event.data?.object && event.livemode === false, 400, 'Evento de teste inválido.');
  return event;
}

// Reconcile current Stripe state rather than trusting an old delivery snapshot.
// A single installation uses one Node process and a durable SQLite event ledger.
let queue = Promise.resolve();
export function processStripeEvent(event, api = stripeRequest) {
  const work = queue.then(async () => {
    const sql = billingStore();
    if (sql.prepare('SELECT id FROM billing_events WHERE id=?').get(event.id)) return { received: true, duplicate: true };
    const object = event.data.object;
    const supported = ['invoice.paid', 'invoice.payment_failed', 'invoice.updated', 'invoice.voided', 'invoice.marked_uncollectible',
      'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'checkout.session.completed'];
    if (!supported.includes(event.type)) return { received: true, ignored: true };
    const row = sql.prepare('SELECT * FROM tenant_billing WHERE customer_id=?').get(objectId(object.customer) || '');
    check(row, 503, 'Cliente Stripe ainda não vinculado; reenvie o evento após o cadastro.');
    const subscriptions = await api(`subscriptions?customer=${encodeURIComponent(row.customer_id)}&status=all&limit=100`);
    check(!subscriptions.has_more, 503, 'Reconciliação exige paginação de assinaturas.');
    const active = subscriptions.data.find(s => s.status === 'active') ?? subscriptions.data[0];
    let invoice;
    if (event.type.startsWith('invoice.')) invoice = await api(`invoices/${object.id}`);
    transaction(() => {
      if (invoice) {
        check(objectId(invoice.customer) === row.customer_id, 400, 'Cliente da fatura divergente.');
        const until = Number(invoice.metadata?.coverage_until || 0);
        sql.prepare(`INSERT INTO billing_invoices VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,due_date=excluded.due_date,valid_until=excluded.valid_until`)
          .run(invoice.id, row.tenant_id, invoice.status || 'draft', invoice.due_date ?? null, invoice.created,
            invoice.metadata?.tenant_id === row.tenant_id && invoice.metadata?.plan_tier === 'enterprise' && Number.isSafeInteger(until) ? until : 0);
      }
      const until = sql.prepare("SELECT MAX(valid_until) AS value FROM billing_invoices WHERE tenant_id=? AND status='paid'").get(row.tenant_id).value || 0;
      sql.prepare('UPDATE tenant_billing SET subscription_id=?,subscription_status=?,plan_tier=?,enterprise_until=? WHERE tenant_id=?')
        .run(active?.id ?? null, active?.status ?? 'canceled', until > Date.now() / 1000 ? 'enterprise' : active?.metadata?.plan_tier ?? null, until, row.tenant_id);
      sql.prepare('INSERT INTO billing_events VALUES(?,?)').run(event.id, Date.now());
    });
    return { received: true };
  });
  queue = work.catch(() => {}); return work;
}

export async function stripeWebhook(request) {
  const reader = request.body?.getReader(); check(reader, 400, 'Corpo ausente.');
  let size = 0; const chunks = [];
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > 262144) { await reader.cancel(); check(false, 413, 'Evento excede 256 KiB.'); }
    chunks.push(value);
  }
  return processStripeEvent(verifyStripeEvent(Buffer.concat(chunks), request.headers.get('stripe-signature')));
}
