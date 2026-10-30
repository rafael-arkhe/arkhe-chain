/**
 * Adaptador AO VIVO da portaria (Onda 3 Safe Tag) — compartilhado por livemap
 * e guestalerts.
 *
 * D8: as SPAs validadas (Google Maps + UX) são MANTIDAS; só o backend troca. No
 * mundo Firebase a portaria escutava DUAS camadas (Firestore roster + RTDB
 * posição por token) em push. Aqui um ÚNICO EventSource em `/api/stream/live`
 * (same-origin, cookie do operador via `withCredentials`) entrega os mesmos
 * eventos: `position` (token, last_position, is_off_route, …) e `roster`
 * (removed). O AEGIS empurra pelo canal Redis Pub/Sub do tenant (a bridge
 * bus→SSE — a única capacidade nova da fusão).
 *
 * Auth: o operador (porteiro/síndico) LOGA no AEGIS; o cookie httpOnly
 * `aegis_access` flui automático para o EventSource same-origin. Nada de token
 * na URL (o `?jwt=` herdado, nunca validado, sai).
 *
 * Uso:
 *   const live = new AegisLive();
 *   live.on('position', (t) => { ...cria/atualiza marcador/cartão... });
 *   live.on('remove',   (id) => { ...remove marcador/cartão... });
 *   live.on('ready',    () => { ...limpa estado, canal (re)abriu... });
 *   live.start();
 */
export class AegisLive {
  /**
   * @param {object} [opts]
   * @param {string} [opts.url] endpoint SSE (default `${apiBase}/stream/live`)
   */
  constructor(opts = {}) {
    const apiBase = AegisLive.resolveApiBase();
    this.url = opts.url || `${apiBase}/stream/live`;
    this.handlers = { position: [], remove: [], alert: [], ready: [], error: [] };
    /** roster ao vivo: token_id → último payload de position */
    this.roster = new Map();
    this._es = null;
    // Watchdog de stall: EventSource nativo só reconecta quando o socket FECHA;
    // um proxy (Cloudflare/cloudflared) que segura o corpo deixa a conexão OPEN
    // sem dados e SEM `error` → o operador via posição velha até dar refresh. O
    // backend emite `ping` a cada ~15s; se NADA (ping/position/…) chega em
    // _stallMs, tratamos como morta e reabrimos (o `ready` retraz o snapshot).
    this._lastEventAt = 0;
    this._watchdog = null;
    this._stallMs = opts.stallMs || 40000;
  }

  static resolveApiBase() {
    const env =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_AEGIS_API_BASE) ||
      null;
    const qp = new URLSearchParams(location.search).get("api");
    // Default = mesma origem via o proxy Next (/api). ?api= sobrescreve p/ dev.
    return env || qp || "/api";
  }

  on(event, fn) {
    (this.handlers[event] || (this.handlers[event] = [])).push(fn);
    return this;
  }
  _emit(event, arg) {
    for (const fn of this.handlers[event] || []) {
      try { fn(arg); } catch (e) { console.error(`AegisLive handler ${event}:`, e); }
    }
  }

  start() {
    if (this._es) return;
    // withCredentials → manda o cookie httpOnly same-origin ao stream.
    const es = new EventSource(this.url, { withCredentials: true });
    this._es = es;
    this._touch();

    es.addEventListener("ready", () => {
      this._touch();
      this.roster.clear();
      this._emit("ready");
    });

    // Heartbeat observável — só mantém o watchdog ciente de que o canal está
    // VIVO (nada a renderizar). Sem ele, um período quieto (visitante parado)
    // seria confundido com stall e provocaria reconexões à toa.
    es.addEventListener("ping", () => this._touch());

    es.addEventListener("position", (e) => {
      this._touch();
      let p; try { p = JSON.parse(e.data); } catch { return; }
      if (!p || !p.token_id) return;
      this.roster.set(p.token_id, p);
      if (p.finalized) {
        this.roster.delete(p.token_id);
        this._emit("remove", p.token_id);
        return;
      }
      this._emit("position", p);
    });

    es.addEventListener("alert", (e) => {
      this._touch();
      let a; try { a = JSON.parse(e.data); } catch { return; }
      this._emit("alert", a);
    });

    es.addEventListener("roster", (e) => {
      this._touch();
      let r; try { r = JSON.parse(e.data); } catch { return; }
      if (r && r.change === "removed" && r.token_id) {
        this.roster.delete(r.token_id);
        this._emit("remove", r.token_id);
      }
    });

    // Mensagem SSE default (sem `event:`) também conta como vida do canal.
    es.addEventListener("message", () => this._touch());

    // EventSource reconecta sozinho em socket FECHADO; reportamos p/ UI.
    es.onerror = (e) => this._emit("error", e);

    // Watchdog: cobre a conexão morta-mas-aberta (sem `error`, sem dados).
    this._startWatchdog();
    return this;
  }

  _touch() { this._lastEventAt = Date.now(); }

  _startWatchdog() {
    this._stopWatchdog();
    this._watchdog = setInterval(() => {
      if (this._lastEventAt && Date.now() - this._lastEventAt > this._stallMs) {
        this._reconnect();
      }
    }, Math.max(5000, Math.floor(this._stallMs / 4)));
  }

  _stopWatchdog() {
    if (this._watchdog) { clearInterval(this._watchdog); this._watchdog = null; }
  }

  _reconnect() {
    // Fecha o socket estagnado e reabre; o `ready` + snapshot repovoam o roster.
    if (this._es) { try { this._es.close(); } catch { /* noop */ } this._es = null; }
    this._emit("error", { stalled: true });
    this.start();
  }

  stop() {
    this._stopWatchdog();
    if (this._es) { this._es.close(); this._es = null; }
  }
}
