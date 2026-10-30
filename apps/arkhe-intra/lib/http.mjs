import { govState, govCreate, govSettings, govChallenge, govAction, govExport, govPilot } from './govtech.mjs';
import { pixPolicy, evaluatePixReceipt } from './pix.mjs';
import { metricsAuthorized, metricsResponse, observeRequest, operationRoute } from './observability.mjs';
import {accountOverview,accountChallenge,executeAccountAction,inspectRecovery,submitRecovery} from './account-management.mjs';
import { login, session, logout } from './auth.mjs';
import { enterpriseState, savePersonas, previewEnterprise, commitEnterprise } from './enterprise.mjs';
import { representationChallenge, recordRepresentation } from './enterprise-representation.mjs';
import { billingAction, billingState, stripeWebhook } from './billing.mjs';
import { readDocument, readAudit, createDocument, updateDocument, challenge, transition, publish, reconcile, exportDocument, requireDocument, verifyDocument, summary, demand, Fault } from './documents.mjs';
import { existsSync } from 'node:fs';
import { readiness } from './store.mjs';
import { events } from './store.mjs';
import { askOllama } from './ollama.mjs';
import { overview as developmentOverview, startRun, readRun, reviewChallenge, decideRun, rejectRun } from './development.mjs';
import {previewStatus,previewChallenge,approvePreview} from './preview.mjs';
import {nativeDraftStatus,registerNativeDraft,nativeDraftRecords} from './native-drafts.mjs';
import { evaluationOverview, readEvaluation, createStudy, createCycle, replayBaseline, evaluationChallenge, decideEvaluation } from './evaluations.mjs';
import { createInvitation, inspectInvitation, requestCredential, credentialOverview, approvalChallenge, approveCredential, rejectCredential, exportTrust, keyFingerprint } from './credentials.mjs';
export const origin = () => process.env.ARKHE_INTRA_ORIGIN || 'http://127.0.0.1:3003';
function cookie(request) { return /(?:^|;\s*)arkhe_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie') || '')?.[1]; }
function json(value, status = 200, headers = {}) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } }); }
async function body(request) {
  demand(request.headers.get('content-type')?.split(';')[0] === 'application/json', 415, 'Envie JSON.');
  const reader = request.body?.getReader(); demand(reader, 400, 'Corpo ausente.');
  const chunks = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 262144) { await reader.cancel(); throw new Fault(413, 'Requisição maior que 256 KiB.'); } chunks.push(value); }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Fault(400, 'JSON inválido.'); }
  demand(value && typeof value === 'object' && !Array.isArray(value), 400, 'Envie um objeto JSON.');
  return value;
}
async function dispatch(request, segments = []) {
  try {
    const path = segments.join('/'), method = request.method;
    demand(['GET', 'POST', 'PUT'].includes(method), 405, 'Método não permitido.');
    if (path === 'metrics' && method === 'GET' && metricsAuthorized(request)) return metricsResponse();
    if (path === 'billing/webhook' && method === 'POST') return json(await stripeWebhook(request));
    if (method !== 'GET') demand(request.headers.get('origin') === origin(), 403, 'Origem inválida. Reabra o endereço local configurado.');
    if (path === 'ready' && method === 'GET') {
      const ready = !(process.env.ARKHE_DRAIN_FILE && existsSync(process.env.ARKHE_DRAIN_FILE)) && readiness();
      return json({ status: ready ? 'ready' : 'not-ready' }, ready ? 200 : 503);
    }
    if (path === 'health' && method === 'GET') return json({ status: 'ok', service: 'arkhe-intra', authority: false });
    if (path === 'registration/invitation' && method === 'POST') return json(inspectInvitation(await body(request)));
    if (path === 'registration' && method === 'POST') return json(requestCredential(await body(request)), 202);
    if (path === 'recovery/inspect' && method === 'POST') return json(inspectRecovery(await body(request)));
    if (path === 'recovery/request' && method === 'POST') return json(submitRecovery(await body(request)),202);
    if (path === 'login' && method === 'POST') {
      const data = await body(request);
      demand(typeof data.email === 'string' && data.email.length <= 254 && typeof data.password === 'string' && data.password.length <= 256, 400, 'Credenciais inválidas.');
      const result = login(data.email, data.password);
      return json(result.user, 200, { 'Set-Cookie': `arkhe_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${origin().startsWith('https:') ? '; Secure' : ''}` });
    }
    const user = session(cookie(request)); demand(user, 401, 'Entre com sua conta para continuar.');
    if (path === 'billing' && method === 'GET') {
      demand(user.role === 'owner', 403, 'Faturamento exige governança.');
      return json(billingState());
    }
    if (segments[0] === 'billing' && segments.length === 2 && method === 'POST') {
      demand(user.role === 'owner', 403, 'Faturamento exige governança.');
      return json(await billingAction(segments[1], await body(request), user, origin()));
    }
    if (path === 'metrics' && method === 'GET') { demand(user.role === 'owner', 403, 'Métricas exigem governança.'); return metricsResponse(); }
    if (path === 'me' && method === 'GET') return json(user);
    if (path === 'govtech' && method === 'GET') return json(govState(user));
    if (path === 'govtech/cases' && method === 'POST') return json(govCreate(user, await body(request)), 201);
    if (path === 'govtech/settings' && method === 'POST') return json(govSettings(user, await body(request)));
    if (path === 'govtech/pilot' && method === 'POST') return json(govPilot(user, await body(request)));
    if (segments[0] === 'govtech' && segments[1] === 'cases' && /^[a-f0-9-]{36}$/.test(segments[2] || '') && segments.length === 4) {
      if (segments[3] === 'challenge' && method === 'GET') return json(govChallenge(user, segments[2]));
      if (segments[3] === 'action' && method === 'POST') return json(govAction(user, segments[2], await body(request)));
      if (segments[3] === 'export' && method === 'GET') return json(govExport(user, segments[2]), 200, { 'Content-Disposition': `attachment; filename="arkhe-govtech-${segments[2]}.json"` });
    }
    if (path === 'enterprise/receipts/policy' && method === 'GET') return json(pixPolicy(user));
    if (path === 'enterprise/receipts/verify' && method === 'POST') return json(evaluatePixReceipt(user,await body(request)));
    if (path === 'enterprise' && method === 'GET') return json(enterpriseState(user));
    if (path === 'enterprise/personas' && method === 'POST') return json(savePersonas(user, await body(request)));
    if (path === 'enterprise/preview' && method === 'POST') return json(previewEnterprise(user, await body(request), request.headers.get('idempotency-key') ?? undefined));
    if (path === 'enterprise/representation/challenge' && method === 'POST') return json(representationChallenge(user, await body(request)));
    if (path === 'enterprise/representation/record' && method === 'POST') return json(await recordRepresentation(user, await body(request)), 201);
    if (path === 'enterprise/commit' && method === 'POST') return json(await commitEnterprise(user, await body(request)), 201);
    if (path === 'evaluations' && method === 'GET') return json(evaluationOverview(user));
    if (path === 'evaluations/studies' && method === 'POST') return json(await createStudy(user,await body(request)),202);
    if (path === 'evaluations/cycles' && method === 'POST') return json(await createCycle(user,await body(request)),202);
    if (path === 'evaluations/replay' && method === 'POST') return json(await replayBaseline(user,await body(request)));
    if (path === 'evaluations/challenge' && method === 'POST') return json(evaluationChallenge(user,await body(request)));
    if (path === 'evaluations/decide' && method === 'POST') return json(decideEvaluation(user,await body(request)));
    if (segments[0] === 'evaluations' && segments[1] === 'studies' && /^[a-f0-9-]{36}$/.test(segments[2] || '') && segments.length === 3 && method === 'GET') return json(readEvaluation(user,segments[2]),200,{'Content-Disposition':`attachment; filename="arkhe-evaluation-${segments[2]}.json"`});
    if (path === 'development' && method === 'GET') return json(developmentOverview(user));
    if (path === 'development/runs' && method === 'POST') return json(await startRun(user, await body(request)), 202);
    if (segments[0] === 'development' && segments[1] === 'runs' && /^[a-f0-9-]{36}$/.test(segments[2] || '')) {
      const id = segments[2];
      if (segments.length === 4 && segments[3] === 'preview' && method === 'GET') return json(await previewStatus(user,id));
      if (segments.length === 4 && segments[3] === 'preview-challenge' && method === 'GET') return json(await previewChallenge(user,id));
      if (segments.length === 4 && segments[3] === 'preview-approve' && method === 'POST') return json(await approvePreview(user,id,await body(request)),202);
      if (segments.length === 3 && method === 'GET') return json(readRun(user, id));
      if (segments.length === 4 && segments[3] === 'challenge' && method === 'GET') return json(reviewChallenge(user, id));
      if (segments.length === 4 && segments[3] === 'approve' && method === 'POST') return json(decideRun(user, id, await body(request)));
      if (segments.length === 4 && segments[3] === 'reject' && method === 'POST') return json(rejectRun(user, id));
    }
    if (path === 'accounts' && method === 'GET') return json(accountOverview(user));
    if (segments[0] === 'accounts' && segments.length === 3 && method === 'POST') {
      if (segments[2] === 'challenge') return json(accountChallenge(user,segments[1],await body(request)));
      if (segments[2] === 'execute') return json(executeAccountAction(user,segments[1],await body(request)));
    }
    if (path === 'credentials/me' && method === 'GET') return json({ ...user, fingerprint: keyFingerprint(user.publicKey), status: 'active' });
    if (path === 'credentials' && method === 'GET') return json(credentialOverview(user));
    if (path === 'credentials/invitations' && method === 'POST') return json(createInvitation(user, await body(request)), 201);
    if (path === 'credentials/trust' && method === 'GET') return json(exportTrust(user), 200, { 'Content-Disposition': 'attachment; filename="arkhe-trust.json"' });
    if (segments[0] === 'credentials' && segments[1] === 'requests' && /^[a-f0-9-]{36}$/.test(segments[2] || '') && segments.length === 4) {
      if (segments[3] === 'challenge' && method === 'GET') return json(approvalChallenge(user, segments[2]));
      if (segments[3] === 'approve' && method === 'POST') return json(approveCredential(user, segments[2], await body(request)));
      if (segments[3] === 'reject' && method === 'POST') return json(rejectCredential(user, segments[2]));
    }
    if (path === 'logout' && method === 'POST') { logout(cookie(request)); return json({ ok: true }, 200, { 'Set-Cookie': 'arkhe_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); }
    if (path === 'dashboard' && method === 'GET') return json(summary(user));
    if (path === 'audit' && method === 'GET') return json(readAudit(user));
    if (path === 'assistant' && method === 'POST') return json(await askOllama((await body(request)).prompt));
    if (path === 'documents' && method === 'POST') return json(createDocument(user, await body(request)), 201);
    if (segments[0] === 'documents' && /^[a-f0-9-]{36}$/.test(segments[1] || '')) {
      const id = segments[1];
      if (segments.length === 2 && method === 'GET') return json(readDocument(user, id));
      if (segments.length === 2 && method === 'PUT') return json(updateDocument(user, id, await body(request)));
      if (segments.length === 3) {
        readDocument(user, id);
        if (segments[2] === 'verify' && method === 'GET') return json(await verifyDocument(id));
        if (segments[2] === 'export' && method === 'GET') return json({...exportDocument(id), nativeDrafts: nativeDraftRecords(id)}, 200, { 'Content-Disposition': `attachment; filename="arkhe-${id}.json"` });
        if (segments[2] === 'native-draft' && method === 'GET') return json(nativeDraftStatus(user,id));
        if (segments[2] === 'native-draft' && method === 'POST') return json(await registerNativeDraft(user,id));
        if (segments[2] === 'challenge' && method === 'POST') return json(challenge(user, id, (await body(request)).action));
        if (segments[2] === 'transition' && method === 'POST') return json(transition(user, id, await body(request)));
        if (segments[2] === 'publish' && method === 'POST') return json(await publish(user, id));
        if (segments[2] === 'reconcile' && method === 'POST') return json(reconcile(user, id, await body(request)));
      }
    }
    throw new Fault(404, 'Rota não encontrada.');
  } catch (error) {
    if (error.status) return json({ error: error.message }, error.status);
    // Do not expose command stderr, filesystem paths, credentials or server stacks.
    // The outer request observer logs a bounded route and status only.
    return json({ error: 'Serviço indisponível. Consulte a configuração e os logs locais antes de tentar novamente.' }, 503);
  }
}

export async function handle(request, segments = []) {
  const started = performance.now();
  const response = await dispatch(request, segments);
  observeRequest({route:operationRoute(segments),method:request.method,status:response.status,duration:(performance.now()-started)/1000});
  return response;
}
