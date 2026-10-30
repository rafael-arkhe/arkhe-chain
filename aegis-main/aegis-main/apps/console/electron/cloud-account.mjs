import { createManagedDesktopStore } from "./managed-desktop.mjs";
import { CLOUD_MACHINE_CONNECTABLE, parseCloudSummary, parsePairingGrant } from "./cloud-home.mjs";

// 🔴 Safe Core (D7, 30/09/2026). A Cloud do upstream **não é nossa**, e a
// origem de fábrica é `""` — o que **desliga** a conta Cloud.
//
// 🔴 Isto não é uma marca: é **dados a sair**. Uma conta Cloud leva o email, o
// token (`omc_…`), o resumo das máquinas e o par de pareamento para
// `cloud.openmausbot.com` — um servidor que a Safe Core não opera. 🔴 Um
// produto que manda a conversa e a identidade do cliente para um servidor de
// outro não é um produto de marca branca: é um produto que **depende** de outro, e
// a dependência é invisível para quem o usa.
//
// 🔴 **Por que `""` e não um endereço nosso:** o AEGIS não tem Cloud. A ilha é
// do integrador, o agente corre na máquina dele, e a "nuvem" do produto é o
// `tailnet` (a `--tunnel` do `cli.ts` serve em `…openmausbot.com`, e isso
// também é deles — a `--tunnel` é o tijolo 11 e não o do D7). 🔴 Deixar
// "endereço para preencher" seria o pior dos dois: o default de um produto
// empacotado **é** o de produção, e um default que aponta para outro continua a
// funcionar depois de o fork ser entregue.
//
// 🔴 `cloudOrigin` continua a validar o que lhe dão, e a `fixture` continua a
// existir: o que mudou foi o valor de fábrica. 🔴 E o `""` tem de ser
// **recusado** pelo validador, não pode ser aceite como origem — um `new URL("")`
// dá um erro confuso, e o sintoma seria "o serviço de conta está avariado" num
// produto que o desligou de propósito.
export const CLOUD_ORIGIN = "";
const TOKEN = /^omc_[A-Za-z0-9_-]{43}$/;
const CODE = /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/;
const PRIVATE_CODE = /^[A-Za-z0-9_-]{43}$/;
const REFRESH_MS = 60_000;
// Never accept an address from the renderer. Tests explicitly inject loopback.
export function cloudOrigin(value = CLOUD_ORIGIN, fixture = false) {
  // 🔴 O "" é o valor de fábrica do AEGIS e significa **desligado**, e o
  // `new URL("")` de baixo lançaria `Invalid URL` — que o chamador lê como "a
  // origem é inválida", e não como "a Cloud não existe neste produto". 🔴 São
  // coisas opostas, e a diferença é a que manda o operador acrescentar um
  // endereço à pressa para o produto funcionar.
  if (value === "") return value;
  const url = new URL(value);
  // 🔴 `CLOUD_ORIGIN` é `""` neste fork, e a comparação `value !== CLOUD_ORIGIN`
  // passava a ser sempre verdadeira — ou seja, **qualquer** origem passava
  // pela folha de `CLOUD_ORIGIN` e caía só no teste de loopback. Um validador
  // que aceitaria `https://qualquer-coisa` num produto que não tem Cloud é a
  // pior versão desta linha: parece que valida, e não valida nada.
  //
  // 🔴 A regra fica escrita: com a Cloud desligada, **só** o loopback de
  // fixture entra. É o que as provas usam, e é o que a casa mede.
  if (value !== url.origin || !(fixture && url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Invalid OMB Cloud address.");
  }
  return value;
}
// Reuse the encrypted, atomic, serialized record mechanism, not organization identity.
// The caller supplies a DIFFERENT file; no entitlement is persisted in this record.
export const createCloudAccountStore = createManagedDesktopStore;
// oxlint-disable-next-line no-control-regex
const text = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const timestamp = value => Number.isSafeInteger(value) && value > 0;

/** Personal account only. No model provider, organization policy, workspace,
 * local settings or companion state is changed by this client. */
export function createCloudAccountClient({ store, openBrowser, platform, deviceName, appVersion,
  origin = CLOUD_ORIGIN, fixture = false, fetch: fetcher = globalThis.fetch, now = Date.now, onState = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  origin = cloudOrigin(origin, fixture);
  let grant = null, issued = null, cleanup = null, pending = null, cleanupNeeded = false;
  let value = { status: "signed-out" }, generation = 0, timer = null, closed = false, clearing = null, refreshing = null;
  let verifiedUntil = 0, restoring = false, controller = new AbortController();
  const view = (status, message) => ({ status, ...(message ? { message } : {}), ...(grant ? { account: grant.account, deviceId: grant.device.id, expiresAt: grant.expiresAt } : {}) });
  const state = () => structuredClone(value.status === "connected" && now() >= verifiedUntil ? view("unavailable", "verification-expired") : value);
  const publish = next => { value = next; onState(state()); return state(); };
  const stopTimer = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const schedule = (work, delay) => {
    stopTimer();
    if (!closed) { timer = setTimer(() => { timer = null; void work().catch(() => {}); }, Math.max(1, delay)); timer?.unref?.(); }
  };
  const reset = () => { generation++; stopTimer(); controller.abort(); controller = new AbortController(); pending = null; verifiedUntil = 0; return generation; };
  const current = stamp => !closed && generation === stamp;
  async function request(route, { method = "GET", body, token, signal = controller.signal } = {}) {
    const response = await fetcher(`${origin}/api/cloud/desktop/${route}`, {
      method, redirect: "error", credentials: "omit", cache: "no-store",
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    });
    const reader = response.body?.getReader(), chunks = []; let size = 0;
    try {
      if (reader) while (true) {
        const { done, value: chunk } = await reader.read(); if (done) break;
        size += chunk.byteLength; if (size > 64 * 1024) throw new Error("Cloud response too large.");
        chunks.push(chunk);
      }
    } catch (error) { await reader?.cancel().catch(() => {}); throw error; }
    finally { reader?.releaseLock(); }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("Invalid Cloud response."); }
    if (!response.ok) throw Object.assign(new Error("Cloud request failed."), { status: response.status, code: data?.error, interval: data?.interval });
    return data;
  }
  function identity(result) {
    if (result?.cloudContractVersion !== 1 || !timestamp(result.expiresAt) || !text(result.device?.id, 128) ||
      !text(result.account?.id, 128) || !text(result.account?.email, 254)) throw new Error("Invalid Cloud identity.");
    return { expiresAt: result.expiresAt, device: { id: result.device.id }, account: { id: result.account.id, email: result.account.email } };
  }
  function validateGrant(saved) {
    if (saved?.origin !== origin || !TOKEN.test(saved.token)) throw new Error("Invalid Cloud credential.");
    return { origin, token: saved.token, ...identity({ ...saved, cloudContractVersion: 1 }) };
  }
  function entitlement(input) {
    if (!input || !["free", "pro"].includes(input.plan) || !["active", "inactive"].includes(input.status) ||
      !(input.expiresAt === null || timestamp(input.expiresAt)) || !Number.isSafeInteger(input.version) || input.version < 0) throw new Error("Invalid Cloud entitlement.");
    if (input.status === "active" && (input.plan !== "pro" || input.expiresAt === null || input.expiresAt <= now())) throw new Error("Invalid active Cloud entitlement.");
    return { plan: input.plan, status: input.status,
      expiresAt: input.expiresAt, version: input.version };
  }
  async function revoke(previous) {
    try { await request("session", { method: "DELETE", body: {}, token: previous.token, signal: AbortSignal.timeout(20_000) }); }
    catch (error) { if (![401, 403].includes(error?.status)) throw error; }
  }
  /** The verified machine to connect to; null unless a current session
   * reports one that is running. */
  function homeTarget() {
    const current = state();
    const machine = current.status === "connected" ? current.machine : undefined;
    return machine?.origin && CLOUD_MACHINE_CONNECTABLE.includes(machine.status) ? { origin: machine.origin } : null;
  }
  function signOut() {
    if (clearing) return clearing;
    const previous = grant ?? issued ?? cleanup, stamp = reset();
    grant = null; issued = null; cleanup = previous; cleanupNeeded = true;
    publish({ status: "signed-out" });
    const operation = (async () => {
      const [persisted, revoked] = await Promise.allSettled([Promise.resolve().then(() => store.write(null)), previous ? revoke(previous) : Promise.resolve()]);
      if (persisted.status === "fulfilled") { cleanup = null; cleanupNeeded = false; }
      if (!current(stamp)) return state();
      if (persisted.status === "rejected") return publish({ status: "unavailable", message: "signout-storage-failed" });
      return publish({ status: "signed-out", ...(revoked.status === "rejected" ? { message: "signout-local-only" } : {}) });
    })().finally(() => { if (clearing === operation) clearing = null; });
    clearing = operation; return operation;
  }
  async function synchronize(stamp) {
    if (!grant || !current(stamp)) return state();
    if (grant.expiresAt <= now()) return publish(view("reauth-required", "expired"));
    try {
      const previous = grant, result = await request("session", { token: previous.token });
      if (!current(stamp) || grant !== previous) return state();
      const next = identity(result);
      if (next.device.id !== previous.device.id || next.account.id !== previous.account.id || next.account.email !== previous.account.email || next.expiresAt <= now()) {
        throw Object.assign(new Error("Cloud identity changed."), { status: 401 });
      }
      const access = entitlement(result.entitlement);
      // The Admin's state decides what the machine allows (a lapsed payment
      // is "payment-problem", not a hidden machine). A malformed one is none.
      const machine = parseCloudSummary(result.cloud);
      if (next.expiresAt !== previous.expiresAt) {
        const replacement = { ...previous, expiresAt: next.expiresAt };
        await store.write(replacement);
        if (!current(stamp) || grant !== previous) return state();
        grant = replacement;
      }
      verifiedUntil = Math.min(grant.expiresAt, now() + REFRESH_MS,
        access.status === "active" && access.expiresAt !== null ? access.expiresAt : Infinity);
      publish({ ...view("connected"), entitlement: access, ...(machine ? { machine } : {}), verifiedAt: now(), verifiedUntil });
      schedule(async () => { publish(view("unavailable", "verification-expired")); return refresh(); }, verifiedUntil - now());
    } catch (error) {
      if (!current(stamp)) return state();
      verifiedUntil = 0;
      if ([401, 403].includes(error?.status)) return publish(view("reauth-required", "access-ended"));
      publish(view("unavailable", "unreachable"));
      schedule(refresh, Math.min(REFRESH_MS, grant.expiresAt - now()));
    }
    return state();
  }
  function refresh() {
    if (clearing) return clearing;
    if (refreshing?.stamp === generation) return refreshing.operation;
    const entry = { stamp: generation, operation: null };
    entry.operation = synchronize(generation).finally(() => { if (refreshing === entry) refreshing = null; });
    refreshing = entry; return entry.operation;
  }
  async function poll() {
    const attempt = pending, stamp = generation;
    if (!attempt || !current(stamp)) return state();
    if (now() >= attempt.expiresAt) { pending = null; return publish({ status: "signed-out", message: "enrollment-expired" }); }
    try {
      const result = await request("token", { method: "POST", body: { deviceCode: attempt.deviceCode } });
      const next = validateGrant({ origin, token: result.accessToken, ...identity(result) });
      if (!current(stamp)) { await revoke(next).catch(() => {}); return state(); }
      if (next.expiresAt <= now()) throw new Error("Expired Cloud credential.");
      issued = next;
      await store.write(next);
      if (!current(stamp)) return state();
      grant = next; issued = null; pending = null;
      return refresh();
    } catch (error) {
      if (!current(stamp)) return state();
      if (issued) return signOut();
      if (error?.code === "slow_down") attempt.interval = Math.min(60_000, Math.max(attempt.interval + 5000, Number.isSafeInteger(error.interval) ? error.interval * 1000 : 0));
      else if (["access_denied", "expired_token", "invalid_grant"].includes(error?.code)) { pending = null; return publish({ status: "signed-out", message: "enrollment-ended" }); }
      else if (error?.status && error.code !== "authorization_pending" && error.status !== 429) { pending = null; return publish({ status: "signed-out", message: "signin-failed" }); }
      schedule(poll, Math.min(attempt.interval, attempt.expiresAt - now()));
      return state();
    }
  }
  return {
    state,
    async start() {
      const stamp = generation;
      restoring = true; verifiedUntil = 0;
      try {
        const saved = await store.read();
        if (!current(stamp)) return state();
        grant = saved ? validateGrant(saved) : null;
      } catch { if (current(stamp)) { cleanupNeeded = true; return publish({ status: "unavailable", message: "restore-failed" }); } return state(); }
      finally { restoring = false; }
      return refresh();
    },
    async begin() {
      if (closed || restoring || clearing || grant || issued || cleanupNeeded) throw new Error("Sign out before starting another Cloud connection.");
      const stamp = reset();
      publish({ status: "connecting" });
      try {
        if (!text(deviceName, 100) || !["darwin", "win32", "linux"].includes(platform)) throw new Error("Invalid desktop.");
        const result = await request("authorize", { method: "POST", body: { deviceName, platform, ...(text(appVersion, 40) ? { appVersion } : {}) } });
        if (!current(stamp)) return state();
        if (result.cloudContractVersion !== 1 || !PRIVATE_CODE.test(result.deviceCode) || !CODE.test(result.userCode) ||
          result.verificationUriComplete !== `${origin}/cloud/desktop?code=${result.userCode}` || !Number.isSafeInteger(result.expiresIn) || result.expiresIn < 1 || result.expiresIn > 600 ||
          !Number.isSafeInteger(result.interval) || result.interval < 5 || result.interval > 60) throw new Error("Invalid Cloud authorization.");
        pending = { deviceCode: result.deviceCode, verificationUri: result.verificationUriComplete, expiresAt: now() + result.expiresIn * 1000, interval: result.interval * 1000 };
        publish({ status: "connecting", enrollment: { userCode: result.userCode, expiresAt: pending.expiresAt } });
        await openBrowser(pending.verificationUri);
        if (current(stamp)) schedule(poll, pending.interval);
      } catch { if (current(stamp)) { pending = null; publish({ status: "signed-out", message: "signin-failed" }); } }
      return state();
    },
    async reopen() {
      if (pending && value.status === "connecting" && pending.expiresAt > now()) await openBrowser(pending.verificationUri);
      return state();
    },
    cancel: () => pending || value.status === "connecting" ? signOut() : Promise.resolve(state()),
    refresh, signOut,
    async openDashboard() { await openBrowser(`${origin}/cloud`); return state(); },
    homeTarget,
    /** Ask the Admin for one single-use pairing code on that machine. The
     * code is returned to main only, for one navigation; it is not kept. */
    async pairHome() {
      const target = homeTarget(), current = grant;
      if (!target || !current) throw new Error("Your Cloud is not ready to connect yet.");
      const result = await request("pairing", { method: "POST", body: {}, token: current.token });
      const pairing = parsePairingGrant(result, target.origin, now());
      if (!pairing) throw new Error("Invalid Cloud pairing response.");
      return pairing;
    },
    close() { closed = true; reset(); },
  };
}
