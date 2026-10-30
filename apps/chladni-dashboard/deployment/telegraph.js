#!/usr/bin/env node
const WebSocket = require('ws');
const {verifyClient,validateMessage}=require('./telegraph-security.cjs');
const crypto = require('crypto');
const EventEmitter = require('events');
const TemporalChainLogger = require('./temporal-chain-logger.js');
const ZkWasmProver = require('./zkwasm-prover.js');

const TOPICS = {
  COHERENCE_DSA: '/coherence/dsa',
  COHERENCE_GEO: '/coherence/geo',
  AUDIT_BATCH: '/audit/batch',
  SIM_KURAMOTO: '/sim/kuramoto',
  THEOSIS_REPORT: '/theosis/report',
  EXTERNAL_HUAWEI: '/external/huawei',
  EXTERNAL_ASI: '/external/asi',
  SIGNAL_PHI: '/signal/phi',
  CONVERGENCE_EVENT: '/signal/convergence',
  CANON_PROPOSAL: '/canon/proposal',
  SYSTEM_HEARTBEAT: '/system/heartbeat',
};

class Signal {
  constructor({ source, topic, metric, value, unit = 'coherence', timestamp = null }) {
    this.source = source;
    this.topic = topic;
    this.metric = metric;
    this.value = value;
    this.unit = unit;
    this.timestamp = timestamp || new Date().toISOString();
    this.seal = this._computeSeal();
  }

  _computeSeal() {
    const payload = JSON.stringify({
      source: this.source, topic: this.topic, metric: this.metric,
      value: this.value, unit: this.unit, timestamp: this.timestamp
    });
    return crypto.createHash('sha3-256').update(payload).digest('hex');
  }

  toJSON() {
    return { source: this.source, topic: this.topic, metric: this.metric,
      value: this.value, unit: this.unit, timestamp: this.timestamp, seal: this.seal };
  }

  static fromJSON(json) {
    const s = new Signal(json);
    if (s.seal !== json.seal) throw new Error('Seal mismatch');
    return s;
  }
}

class Telegraph extends EventEmitter {
  constructor(port = 7474) {
    super();
    this.port = port;
    this.topics = new Map();
    this.history = new Map();
    this.clients = new Set();
    this.wss = null;
    this.historyBytes=0;
    this.temporalLogger = new TemporalChainLogger(this);
    this.zkProver = new ZkWasmProver();
  }

  start() {
    this.wss = new WebSocket.Server({ port: this.port, host:'127.0.0.1', maxPayload:65536, perMessageDeflate:false, verifyClient: info => this.clients.size < 64 && verifyClient(info) });
    console.log(`[Telegraph] ξM-field bus active on port ${this.port}`);

    this.wss.on('connection', (ws, req) => {
      const clientId = `client_${Math.random().toString(36).slice(2, 10)}`;
      ws.clientId = clientId;
      this.clients.add(ws);
      console.log(`[Telegraph] Connection: ${clientId} from ${req.socket.remoteAddress}`);

      let windowAt=Date.now(),messageCount=0;
      ws.on('message', (data) => {
        if(Date.now()-windowAt>1000){windowAt=Date.now();messageCount=0;}
        if(++messageCount>100){ws.close(1008,'Message rate exceeded');return;}
        try {
          const msg = validateMessage(JSON.parse(data));
          this._handleMessage(ws, msg);
        } catch (err) {
          ws.send(JSON.stringify({ error: err.message }));
        }
      });

      ws.on('error', () => {}); // Oversized/broken frames close only this client.
      ws.on('close', () => {
        this._unsubscribeAll(ws);
        this.clients.delete(ws);
        console.log(`[Telegraph] Disconnection: ${clientId}`);
      });
    });

    return this;
  }

  _handleMessage(ws, msg) {
    switch (msg.action) {
      case 'publish': this.publish(msg.signal); break;
      case 'subscribe': this.subscribe(ws, msg.topic); break;
      case 'unsubscribe': this.unsubscribe(ws, msg.topic); break;
      case 'status': this._sendStatus(ws); break;
      case 'history': this._sendHistory(ws, msg.topic, msg.limit || 100); break;
      default: ws.send(JSON.stringify({ error: `Unknown action: ${msg.action}` }));
    }
  }

  publish(signalData) {
    const signal = new Signal(signalData);
    const topic = signal.topic;

    if(!this.history.has(topic) && this.history.size>=128)throw new Error('Topic limit reached');
    if (!this.history.has(topic)) this.history.set(topic, []);
    const hist = this.history.get(topic);
    hist.push(signal);
    this.historyBytes+=Buffer.byteLength(JSON.stringify(signal.toJSON()));
    if(hist.length>1000)this.historyBytes-=Buffer.byteLength(JSON.stringify(hist.shift().toJSON()));
    while(this.historyBytes>16*1024*1024){
      const queue=Array.from(this.history.values()).find(records=>records.length);
      if(!queue)break;
      this.historyBytes-=Buffer.byteLength(JSON.stringify(queue.shift().toJSON()));
    }

    signal.zk_proof = this.zkProver.prove(signal);

    const subscribers = this.topics.get(topic);
    if (subscribers) {
      const payload = JSON.stringify({ type: 'signal', data: signal.toJSON() });
      subscribers.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      });
    }

    this.emit('signal', signal);
    const v = typeof signal.value === 'number' ? signal.value.toFixed(4) : signal.value;
    console.log(`[Telegraph] ${topic}: ${signal.metric}=${v}`);
    return signal;
  }

  subscribe(ws, topic) {
    if(!this.topics.has(topic)&&this.topics.size>=128)throw new Error('Topic limit reached');
    if(Array.from(this.topics.values()).filter(clients=>clients.has(ws)).length>=32 && !this.topics.get(topic)?.has(ws))throw new Error('Subscription limit reached');
    if (!this.topics.has(topic)) this.topics.set(topic, new Set());
    this.topics.get(topic).add(ws);
    ws.send(JSON.stringify({ type: 'subscribed', topic }));
    console.log(`[Telegraph] ${ws.clientId} subscribed to ${topic}`);
  }

  unsubscribe(ws, topic) {
    const subscribers = this.topics.get(topic);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) this.topics.delete(topic);
    }
    ws.send(JSON.stringify({ type: 'unsubscribed', topic }));
  }

  _unsubscribeAll(ws) {
    this.topics.forEach((subscribers, topic) => {
      subscribers.delete(ws);
      if (subscribers.size === 0) this.topics.delete(topic);
    });
  }

  _sendStatus(ws) {
    const status = {
      type: 'status',
      topics: Array.from(this.topics.keys()).map(topic => {
        const hist = this.history.get(topic) || [];
        const last = hist[hist.length - 1];
        return { topic, subscribers: this.topics.get(topic)?.size || 0, signalCount: hist.length, lastSignal: last ? last.toJSON() : null };
      }),
      totalClients: this.clients.size,
      chainValid: this.temporalLogger.verifyChain(),
      uptime: process.uptime()
    };
    ws.send(JSON.stringify(status));
  }

  _sendHistory(ws, topic, limit) {
    const hist = this.history.get(topic) || [];
    const slice = hist.slice(-limit);
    ws.send(JSON.stringify({ type: 'history', topic, signals: slice.map(s => s.toJSON()) }));
  }

  getTemporalChain() { return this.temporalLogger.getChain(); }

  stop() {
    if (this.wss) { this.wss.close(); console.log('[Telegraph] bus stopped'); }
  }
}

class TelegraphClient extends EventEmitter {
  constructor(url = 'ws://localhost:7474') {
    super();
    this.url = url;
    this.ws = null;
    this.subscriptions = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => { console.log(`[TelegraphClient] Connected to ${this.url}`); resolve(this); });
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'signal') this.emit('signal', Signal.fromJSON(msg.data));
          else this.emit(msg.type, msg);
        } catch (err) { this.emit('error', err); }
      });
      this.ws.on('close', () => this.emit('disconnected'));
      this.ws.on('error', reject);
    });
  }

  publish(signalData) { this._send({ action: 'publish', signal: signalData }); }
  subscribe(topic) { this.subscriptions.add(topic); this._send({ action: 'subscribe', topic }); }
  unsubscribe(topic) { this.subscriptions.delete(topic); this._send({ action: 'unsubscribe', topic }); }
  status() { this._send({ action: 'status' }); }
  history(topic, limit = 100) { this._send({ action: 'history', topic, limit }); }
  _send(msg) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }
  disconnect() { if (this.ws) this.ws.close(); }
}

module.exports = { Telegraph, TelegraphClient, Signal, TOPICS };

if (require.main === module) {
  const telegraph = new Telegraph(7474);
  telegraph.start();
  process.on('SIGINT', () => { telegraph.stop(); process.exit(0); });
}
