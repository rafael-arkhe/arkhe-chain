import {parseFrame,reconnectDelay,mmrPeaks} from './protocol.js';
'use strict';

// ═══════════════════════════════════════════════════════════════
// STATE — centralized, observable, validated
// ═══════════════════════════════════════════════════════════════
const state = {
  connection: 'disconnected', // disconnected | connecting | connected | reconnecting
  reconnectAttempts: 0,
  lastMessageAt: 0,
  messageRate: 0,
  latencySamples: [],
  phiHistory: [],
  dsaHistory: [],
  confHistory: [],
  latencyHistory: [],
  evidence: {
    count: null,
    verified: null,
    pending: null,
    rejected: null,
    werCount: null,
    lastHash: null,
    linked: null,
    mmrRoot: null,
    mmrLeaves: null,
  },
  gate: {
    status: 'UNKNOWN',
    reason: '',
    failClosed: null,
    authority: 'none',
    updatedAt: 0,
  },
};

const MAX_HISTORY = 60;

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
function toast(message, kind = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  container.appendChild(el);
  while(container.children.length>4)container.firstElementChild.remove();
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(400px)';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ═══════════════════════════════════════════════════════════════
// SPARKLINE RENDERING
// ═══════════════════════════════════════════════════════════════
function renderSparkline(svgEl, values, options = {}) {
  if (!svgEl || values.length < 2) return;
  const w = 100, h = 32, pad = 2;
  const min = options.min !== undefined ? options.min : Math.min(...values);
  const max = options.max !== undefined ? options.max : Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return [x, y];
  });
  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
  const areaD = pathD + ` L${w - pad},${h - pad} L${pad},${h - pad} Z`;
  const paths = svgEl.querySelectorAll('path');
  if (paths[0]) paths[0].setAttribute('d', areaD);
  if (paths[1]) paths[1].setAttribute('d', pathD);
  // Color class based on trend
  const last = values[values.length - 1];
  const first = values[0];
  svgEl.classList.remove('warning', 'danger');
  if (options.invertColor) {
    if (last > first * 1.5) svgEl.classList.add('danger');
    else if (last > first * 1.2) svgEl.classList.add('warning');
  } else {
    if (last < first * 0.5) svgEl.classList.add('danger');
    else if (last < first * 0.8) svgEl.classList.add('warning');
  }
}

function pushHistory(arr, value) {
  arr.push(value);
  if (arr.length > MAX_HISTORY) arr.shift();
}

// ═══════════════════════════════════════════════════════════════
// MMR TREE VISUALIZATION
// ═══════════════════════════════════════════════════════════════
function renderMmrTree(canvas, leafCount) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Compute MMR peaks: decompose leafCount into binary
  const peaks = mmrPeaks(leafCount);
  const nodeR = 4;
  const levelH = h / (peaks.length + 1);
  peaks.forEach((p, i) => {
    const y = h - (i + 1) * levelH;
    const xStart = (w / leafCount) * p.pos + nodeR;
    const xEnd = (w / leafCount) * (p.pos + p.size) - nodeR;
    // Draw tree edges
    drawTree(ctx, xStart, xEnd, y, levelH, nodeR);
    // Draw root node
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc((xStart + xEnd) / 2, y, nodeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

function drawTree(ctx, x0, x1, y, levelH, r) {
  if (x1 - x0 < r * 3) return;
  const mid = (x0 + x1) / 2;
  const childY = y + levelH * 0.6;
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0, childY);
  ctx.moveTo(x1, y);
  ctx.lineTo(x1, childY);
  ctx.stroke();
  ctx.fillStyle = 'rgba(34, 211, 238, 0.8)';
  [x0, x1].forEach(x => {
    ctx.beginPath();
    ctx.arc(x, childY, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  });
  drawTree(ctx, x0, mid - r * 0.5, childY, levelH * 0.7, r);
  drawTree(ctx, mid + r * 0.5, x1, childY, levelH * 0.7, r);
}

// ═══════════════════════════════════════════════════════════════
// CHLADNI VISUALIZER — Three.js with particle flow + 2D fallback
// ═══════════════════════════════════════════════════════════════
const canvas = document.getElementById('chladniCanvas');
let ctx2d = null;
let animFrame;
const viz = { time: 0, r: 0.5, phi: 0.8, threat: 0, mode: '2d' };
const cur = { r: 0.5, phi: 0.8, threat: 0 };

function hilbertIndex(x, y, n) {
  let rx, ry, s, d = 0;
  for (s = n >> 1; s > 0; s = s >> 1) {
    rx = (x & s) > 0 ? 1 : 0;
    ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { x = (n - 1) - x; y = (n - 1) - y; }
      const tmp = x; x = y; y = tmp;
    }
  }
  return d;
}

function hilbertXY(d, n) {
  let rx, ry, s, t = d, x = 0, y = 0;
  for (s = 1; s < n; s *= 2) {
    rx = 1 & Math.floor(t / 2);
    ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      const tmp = x; x = y; y = tmp;
    }
    x += s * rx; y += s * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

const SUBSTRATES = {
  227: '227-F Verifier', 233: 'Lagrangian Dynamics', 485: 'Holo-Projector',
  491: 'AGI-Cortex v4.0', 493: 'LYNN-Minimal', 525: 'Skills-Registry',
  546: 'Laser-Photonic v1.1', 557: 'Ising-Braid', 560: 'Glasswing-Bridge',
  561: 'Aetherweave-Bridge', 564: 'MCP-Stateless', 565: 'TLSNotary-Bridge',
  569: 'Teleport-Quantum-Link', 570: 'Claude-Code-Orchestrator', 680: 'KSM680-Torus'
};
function substrateAt(d) {
  const id = Math.min(570, 227 + Math.floor((d / 4095) * 340));
  return SUBSTRATES[id] || ('Substrate S' + id);
}

const threeVertex = `
attribute float aHilbert;
uniform float uTime;
uniform float uCoherence;
uniform float uPhi;
varying float vDispl;
varying float vHilbert;
void main() {
  float k = 8.0 + 4.0 * uCoherence;
  float wave = sin(k * position.x * 3.14159265) *
               cos(k * position.y * 3.14159265 * 0.8) *
               sin(uTime);
  vec3 pos = position;
  pos.z += wave * (0.05 + 0.18 * uCoherence) * (0.55 + 0.45 * uPhi);
  vDispl = wave * 0.5 + 0.5;
  vHilbert = aHilbert;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const threeFragment = `
uniform float uCoherence;
uniform float uPhi;
uniform float uThreat;
varying float vDispl;
varying float vHilbert;
void main() {
  vec3 deep = vec3(0.051, 0.106, 0.165);
  vec3 blue = vec3(0.494, 0.784, 0.890);
  vec3 gold = vec3(0.953, 0.765, 0.137);
  vec3 danger = vec3(0.906, 0.298, 0.235);
  float sweep = smoothstep(0.10, 0.92, vHilbert * (0.30 + 0.70 * uCoherence));
  vec3 col = mix(deep, blue, sweep);
  float goldW = smoothstep(0.40, 0.82, vDispl) * (0.15 + 0.85 * uCoherence);
  col = mix(col, gold, goldW * uPhi);
  col = mix(col, danger, uThreat * 0.9);
  gl_FragColor = vec4(col, 1.0);
}`;
let threeRenderer = null, threeScene = null, threeCamera = null, threeUniforms = null;
let lineUniforms = null, plateMesh = null, particles = null;

const hilbertLineV = `
uniform float uTime;
uniform float uCoherence;
uniform float uPhi;
varying float vHil;
void main() {
  float k = 8.0 + 4.0 * uCoherence;
  float wave = sin(k * position.x * 3.14159265) *
               cos(k * position.y * 3.14159265 * 0.8) *
               sin(uTime);
  vec3 pos = position;
  pos.z += wave * (0.05 + 0.18 * uCoherence) * (0.55 + 0.45 * uPhi) + 0.02;
  vHil = uv.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const hilbertLineF = `
uniform float uCoherence;
varying float vHil;
void main() {
  float alpha = 0.30 + 0.60 * uCoherence * (0.4 + 0.6 * vHil);
  gl_FragColor = vec4(vec3(0.953, 0.765, 0.137), alpha);
}`;

function buildHilbertLine() {
  const n = 64, count = 4096;
  const positions = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let d = 0; d < count; d++) {
    const xy = hilbertXY(d, n);
    positions[d * 3] = -1.05 + (xy[0] / 63) * 2.1;
    positions[d * 3 + 1] = -0.8 + (xy[1] / 63) * 1.6;
    positions[d * 3 + 2] = 0;
    uv[d * 2] = d / (count - 1);
    uv[d * 2 + 1] = 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return new THREE.Line(geo, new THREE.ShaderMaterial({
    uniforms: lineUniforms,
    vertexShader: hilbertLineV,
    fragmentShader: hilbertLineF,
    transparent: true,
    depthWrite: false,
  }));
}

function buildParticles() {
  const count = 200;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const d = Math.floor(Math.random() * 4096);
    const xy = hilbertXY(d, 64);
    pos[i * 3] = -1.05 + (xy[0] / 63) * 2.1;
    pos[i * 3 + 1] = -0.8 + (xy[1] / 63) * 1.6;
    pos[i * 3 + 2] = 0.05;
    phase[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.PointsMaterial({
    color: 0x22d3ee,
    size: 0.015,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function initThree() {
  let gl = null;
  try {
    const tmp = document.createElement('canvas');
    gl = tmp.getContext('webgl') || tmp.getContext('experimental-webgl');
  } catch (e) { gl = null; }
  if (!gl) return false;
  try {
    threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    if (!threeRenderer.getContext()) return false;
  } catch (e) { return false; }
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(55, 1, 0.05, 50);
  threeCamera.position.set(0, -0.42, 1.68);
  threeCamera.lookAt(0, 0.05, 0);

  threeUniforms = {
    uTime: { value: 0 },
    uCoherence: { value: viz.r },
    uPhi: { value: viz.phi },
    uThreat: { value: viz.threat },
  };
  lineUniforms = {
    uTime: threeUniforms.uTime,
    uCoherence: threeUniforms.uCoherence,
    uPhi: threeUniforms.uPhi,
  };
  plateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 1.6, 63, 63),
    new THREE.ShaderMaterial({
      uniforms: threeUniforms,
      vertexShader: threeVertex,
      fragmentShader: threeFragment,
      side: THREE.DoubleSide,
    })
  );
  const pos = plateMesh.geometry.attributes.position;
  const order = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const gx = Math.round(((pos.getX(i) + 1.05) / 2.1) * 63);
    const gy = Math.round((pos.getY(i) + 0.8) / 1.6 * 63);
    order[i] = hilbertIndex(Math.max(0, Math.min(63, gx)), Math.max(0, Math.min(63, gy)), 64) / 4095;
  }
  plateMesh.geometry.setAttribute('aHilbert', new THREE.BufferAttribute(order, 1));
  threeScene.add(plateMesh);
  threeScene.add(buildHilbertLine());
  particles = buildParticles();
  threeScene.add(particles);
  viz.mode = 'three';

  return true;
}

function init2D() {
  ctx2d = canvas.getContext('2d');
  viz.mode = '2d';
}

function onResize() {
  if (viz.mode === 'three' && threeRenderer) {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    threeRenderer.setSize(w, h, false);
    threeCamera.aspect = w / h;
    threeCamera.updateProjectionMatrix();
  } else if (ctx2d) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  const mmrCanvas = document.getElementById('mmr-canvas');
  if (mmrCanvas) renderMmrTree(mmrCanvas, state.evidence.mmrLeaves ?? 0);
}

function initVisualizer() {
  if (typeof THREE !== 'undefined' && initThree()) return;
  init2D();
}

function drawChladni(t, r) {
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;
  const imageData = ctx2d.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w - 0.5, ny = y / h - 0.5;
      const k = 8 + 4 * r;
      const pattern = Math.sin(k * nx * Math.PI) * Math.cos(k * ny * Math.PI * 0.8) * Math.sin(t * 0.001);
      const val = Math.floor(128 + 127 * pattern);
      const idx = (y * w + x) * 4;
      imageData.data[idx] = val * 0.3;
      imageData.data[idx + 1] = val * 0.5;
      imageData.data[idx + 2] = val;
      imageData.data[idx + 3] = 255;
    }
  }
  ctx2d.putImageData(imageData, 0, 0);
}

initVisualizer();
onResize();
window.addEventListener('resize', onResize);

// ═══════════════════════════════════════════════════════════════
// HOVER / CONCEPT TOOLTIP
// ═══════════════════════════════════════════════════════════════
const raycaster = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
const mouseNdc = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;
if (viz.mode === 'three') initHover();
function initHover() {
  if (!raycaster) return;
  const tip = document.getElementById('conceptTip');
  const cardEl = canvas.parentElement;
  if (!tip || !cardEl) return;
  cardEl.addEventListener('mousemove', (e) => {
    const rect = cardEl.getBoundingClientRect();
    mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseNdc, threeCamera);
    const hits = raycaster.intersectObject(plateMesh, false);
    if (hits.length) {
      const uv = hits[0].uv;
      const gx = Math.max(0, Math.min(63, Math.round(uv.x * 63)));
      const gy = Math.max(0, Math.min(63, Math.round(uv.y * 63)));
      const d = hilbertIndex(gx, gy, 64);
      tip.textContent = substrateAt(d)+' (mapa ilustrativo)';
      tip.style.left = (e.clientX - rect.left + 12) + 'px';
      tip.style.top = (e.clientY - rect.top + 12) + 'px';
      tip.style.display = 'block';
    } else {
      tip.style.display = 'none';
    }
  });
  cardEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET — robust reconnection, validation, message rate
// ═══════════════════════════════════════════════════════════════
let ws = null;
let reconnectTimer = null;
let intentionalClose=false, probeStartedAt=null, probeTimer=null, staleTimer=null, connectDeadline=null, openedAt=0;
const replayedTopics=new Set();
const log = document.getElementById('event-log');
const MAX_LOG_ENTRIES = 100;

function addLog(entry, kind = '') {
  const div = document.createElement('div');
  div.className = 'entry' + (kind ? ' ' + kind : '');
  const ts = new Date().toLocaleTimeString();
  div.innerHTML = `<span class="ts">[${ts}]</span> ${escapeHtml(entry)}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > MAX_LOG_ENTRIES) log.removeChild(log.firstChild);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function sendControl(metric, value) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    toast('Not connected — cannot send command', 'error');
    return;
  }
  try {
    ws.send(JSON.stringify({
      action: 'publish',
      signal: {
        source: 'dashboard',
        topic: '/cathedral/control',
        metric,
        value: value || {},
        unit: 'command',
        timestamp: new Date().toISOString(),
      },
    }));
    addLog(`Comando enviado, a aguardar resposta: ${metric}`);
    toast('Comando enviado; execução ainda não confirmada', 'info', 2000);
  } catch (e) {
    addLog(`Send failed: ${e.message}`, 'error');
    toast('Send failed: ' + e.message, 'error');
  }
}

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  clearTimeout(reconnectTimer);
  state.connection = state.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
  updateConnectionUI();
  addLog('Connecting to Telegraph...');

  try {
    const host=location.hostname;
    if(!['localhost','127.0.0.1','[::1]'].includes(host))throw new Error('Dashboard disponível apenas em loopback');
    ws = new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${host}:7474`);
  } catch (e) {
    scheduleReconnect(e.message);
    return;
  }

  const socket=ws;
  clearTimeout(connectDeadline);connectDeadline=setTimeout(()=>{if(socket===ws && socket.readyState===WebSocket.CONNECTING)socket.close();},15000);
  ws.onopen = () => {
    if(socket!==ws)return;
    clearTimeout(connectDeadline);openedAt=Date.now();replayedTopics.clear();
    state.connection = 'connected';

    updateConnectionUI();
    addLog('Connected to Telegraph bus + Cathedral v27.0 topics', 'success');
    toast('Connected to Telegraph', 'success', 2000);
    // Subscribe to topics
    const subs = [
      { action: 'subscribe', topic: '/cathedral/control' },
      { action: 'subscribe', topic: '/cathedral/stats' },
      { action: 'subscribe', topic: '/cathedral/events' },
      { action: 'subscribe', topic: '/signal/phi' },
      { action: 'subscribe', topic: '/coherence/dsa' },
      { action: 'subscribe', topic: '/arkhe/evidence' },
      { action: 'subscribe', topic: '/arkhe/gate' },
      // Replay history
      { action: 'history', topic: '/cathedral/stats', limit: 5 },
      { action: 'history', topic: '/coherence/dsa', limit: 3 },
      { action: 'history', topic: '/signal/phi', limit: 3 },
      { action: 'history', topic: '/arkhe/evidence', limit: 10 },
    ];
    subs.forEach(s => {
      try { socket.send(JSON.stringify(s)); } catch (e) {}
    });
    clearInterval(probeTimer);
    function probe(){
      if(socket!==ws || socket.readyState!==WebSocket.OPEN)return;
      if(probeStartedAt!==null && performance.now()-probeStartedAt>15000){socket.close(4000,'Health probe timeout');return;}
      if(probeStartedAt===null){probeStartedAt=performance.now();socket.send(JSON.stringify({action:'status'}));}
    }
    probe();probeTimer=setInterval(probe,10000);
  };

  ws.onmessage = (evt) => {
    if(socket!==ws)return;
    try {
      const msg = parseFrame(evt.data);
      state.lastMessageAt = Date.now();
      if(Date.now()-openedAt>10000)state.reconnectAttempts=0;
      if(msg.type==='status'&&probeStartedAt!==null){
        const rtt=performance.now()-probeStartedAt;probeStartedAt=null;
        state.latencySamples.push(rtt);if(state.latencySamples.length>60)state.latencySamples.shift();
        document.getElementById('connLatency').textContent=`· RTT ${Math.round(rtt)}ms`;
      }
      if (msg.type === 'status') updateStatus(msg);
      else if (msg.type === 'signal') updateSignal(msg.data);
      else if (msg.type === 'history') updateHistory(msg);
      else if(msg.type==='error'){addLog(msg.message,'error');toast(msg.message,'error');}
    } catch (e) {
      // Ignore malformed messages, but log
      addLog(`Malformed message: ${e.message}`, 'error');
    }
  };

  ws.onerror = () => {
    addLog('WebSocket error', 'error');
  };

  ws.onclose = (evt) => {
    if(socket!==ws)return;
    clearTimeout(connectDeadline);clearInterval(probeTimer);probeStartedAt=null;
    state.connection = 'disconnected';updateConnectionUI();renderGateObservation();
    if(!intentionalClose){addLog(`Disconnected (${evt.code}). Reconnecting...`, 'warn');scheduleReconnect();}
  };
}

function scheduleReconnect(reason) {
  state.reconnectAttempts++;
  clearTimeout(reconnectTimer);
  const delay = reconnectDelay(state.reconnectAttempts);
  state.connection = 'reconnecting';
  updateConnectionUI();
  if (reason) addLog(`Reconnect in ${delay / 1000}s: ${reason}`, 'warn');
  reconnectTimer = setTimeout(connect, delay);
}

function updateConnectionUI() {
  const dot = document.getElementById('connDot');
  const label = document.getElementById('connLabel');
  if (!dot || !label) return;
  document.querySelectorAll('[data-control]').forEach(button=>{button.disabled=state.connection!=='connected';});
  dot.className = 'status-dot ' + (state.connection === 'connected' ? 'active' :
    state.connection === 'reconnecting' ? 'reconnecting' : 'inactive');
  label.textContent = {
    connected: 'Connected',
    connecting: 'Connecting...',
    reconnecting: `Reconnecting (${state.reconnectAttempts})`,
    disconnected: 'Disconnected',
  }[state.connection] || state.connection;
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL HANDLERS
// ═══════════════════════════════════════════════════════════════
function updateStatus(msg) {
  if (!Array.isArray(msg.topics)) return;
  const topicCount = msg.topics.length;
  document.getElementById('topicCount').textContent = topicCount;
  const topicsList = document.getElementById('topicsList');
  topicsList.innerHTML = msg.topics.map(t => `
    <div class="topic-item">
      <span class="name">${escapeHtml(t.topic)}</span>
      <span class="count">${t.subscribers || 0} subs | ${t.signalCount || 0} sigs</span>
      ${t.lastSignal ? `<span class="last-value">${escapeHtml(t.lastSignal.metric)}=${typeof t.lastSignal.value === 'number' ? t.lastSignal.value.toFixed(3) : escapeHtml(t.lastSignal.value)}</span>` : ''}
    </div>
  `).join('');
  for(const topic of msg.topics){if(topic.lastSignal && !replayedTopics.has(topic.topic)){replayedTopics.add(topic.topic);if(replayedTopics.size>100)replayedTopics.delete(replayedTopics.values().next().value);updateSignal(topic.lastSignal);}}
  const chainBlocks = msg.topics.reduce((s, t) => s + (t.signalCount || 0), 0);
  document.getElementById('chainBlocks').textContent = chainBlocks;
  const chainValid = document.getElementById('chainValid');
  chainValid.textContent = msg.chainValid ? 'relatado: válido' : 'relatado: inválido';
  chainValid.style.color = msg.chainValid ? 'var(--success)' : 'var(--danger)';
  const chainStatus = document.getElementById('chainStatus');
  chainStatus.textContent = topicCount > 0 ? 'ACTIVE' : 'STANDBY';
  chainStatus.className = 'value ' + (topicCount > 0 ? 'green' : 'yellow');
}

function updateSignal(data) {
  if (!data || typeof data !== 'object' || !data.topic) return;
  const val = typeof data.value === 'number' ? data.value.toFixed(4) :
    (typeof data.value === 'object' ? JSON.stringify(data.value) : String(data.value));
  addLog(`${data.source || '?'} → ${data.topic}: ${data.metric}=${val}`);

  switch (data.topic) {
    case '/cathedral/stats':
      handleCathedralStats(data);
      break;
    case '/coherence/dsa':
      if (data.metric === 'rTeam' || data.metric === 'r_dsa') {
        const r = typeof data.value === 'number' ? data.value : 0.5;
        viz.r = r;
        document.getElementById('rDSA').textContent = r.toFixed(4);
        document.getElementById('topicDSA').textContent = `r_DSA = ${r.toFixed(4)} · origem: ${data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'sem timestamp'}`;
        pushHistory(state.dsaHistory, r);
        renderSparkline(document.getElementById('dsaSparkline'), state.dsaHistory, { min: 0, max: 1 });
      }
      break;
    case '/signal/phi':
      if (data.metric === 'phiInterop' || data.metric === 'phi') {
        if (typeof data.value === 'number') {
          viz.phi = data.value;
          document.getElementById('phiInterop').textContent = data.value.toFixed(4);
          document.getElementById('phiUpdated').textContent='Origem: '+(data.timestamp?new Date(data.timestamp).toLocaleTimeString():'sem timestamp');
          pushHistory(state.phiHistory, data.value);
          renderSparkline(document.getElementById('phiSparkline'), state.phiHistory, { min: 0, max: 1 });
        }
      }
      break;
    case '/arkhe/evidence':
      handleEvidenceSignal(data);
      break;
    case '/arkhe/gate':
      handleGateSignal(data);
      break;
    case '/cathedral/events':
      handleCathedralEvent(data);
      break;
    case '/cathedral/control':
      if (data.metric && data.metric.endsWith('_response')) {
        const respDiv = document.getElementById('controlResponse');
        const text = typeof data.value === 'object' ? JSON.stringify(data.value, null, 2) : String(data.value);
        respDiv.replaceChildren();
        const copy=document.createElement('button');copy.id='copyResponse';copy.textContent='📋 Copy';copy.addEventListener('click',copyResponse);
        const label=document.createElement('div');label.textContent=data.metric+':';
        const pre=document.createElement('pre');pre.textContent=text;respDiv.append(copy,label,pre);
      }
      break;
  }
}

function handleCathedralStats(data) {
  const m = data.metric, v = data.value;
  const el = (id) => document.getElementById(id);

  // Handle both individual metrics and bundled cycle_stats
  if (m === 'cycle_stats' && v && typeof v === 'object') {
    renderStats(v);
    return;
  }

  switch (m) {
    case 'cycle_count':
      el('cathCycle').textContent = v;
      el('cathCycle').className = 'value green';
      break;
    case 'route':
      el('cathRoute').textContent = String(v).toUpperCase();
      el('cathRoute').className = 'value ' + (v === 'fast' ? 'green' : 'yellow');
      break;
    case 'confidence':
      renderStats({ confidence: v });
      break;
    case 'latency_ms':
      renderStats({ latency_ms: v });
      break;
    case 'prompt_version':
      el('cathPromptVersion').textContent = 'v' + v;
      break;
    case 'safety_approved':
      renderStats({ safety_approved: v });
      break;
    case 'safety_reason':
      el('cathSafetyReason').textContent = v;
      break;
    case 'identity_confidence':
      renderStats({ identity_confidence: v });
      break;
    case 'identity_verified':
      renderStats({ identity_verified: v });
      break;
    case 'identity_ttl':
      el('identityTTL').textContent = v + 's';
      break;
    case 'execution_attestations':
      el('execCount').textContent = v;
      break;
    case 'r2':
      renderStats({ r2: v });
      break;
    case 'r_dsa':
      renderStats({ r_dsa: v });
      break;
    case 'threat_level':
      renderStats({ threat_level: v });
      break;
    case 'orchestrator_status':
      renderStats({ orchestrator_status: v });
      break;
    case 'multiplicity_ambiguity':
      renderStats({ multiplicity_ambiguity: v });
      break;
    case 'multiplicity_discrepancy':
      renderStats({ multiplicity_discrepancy: v });
      break;
    case 'multiplicity_rashomon_capacity':
      renderStats({ multiplicity_rashomon_capacity: v });
      break;
    case 'biometric_status':
      renderStats({ biometric_status: v });
      break;
    case 'deadman_active':
      renderStats({ deadman_active: v });
      break;
    case 'contingency_status':
      renderStats({ contingency_status: v });
      break;
  }
}

function handleEvidenceSignal(data) {
  const m = data.metric, v = data.value;
  const el = (id) => document.getElementById(id);
  switch (m) {
    case 'evidence_count':
      state.evidence.count = v;
      el('evidenceCount').textContent = v;
      break;
    case 'evidence_verified':
      state.evidence.verified = v;
      el('evidenceVerified').textContent = v;
      break;
    case 'evidence_pending':
      state.evidence.pending = v;
      el('evidencePending').textContent = v;
      break;
    case 'evidence_rejected':
      state.evidence.rejected = v;
      el('evidenceRejected').textContent = v;
      break;
    case 'wer_count':
      state.evidence.werCount = v;
      el('werCount').textContent = v;
      break;
    case 'wer_last_hash':
      state.evidence.lastHash = v;
      el('werLastHash').textContent = v;
      el('werLastHash').title=v;
      break;
    case 'wer_linked':
      state.evidence.linked = v;
      el('werLinked').textContent = v ? 'reportado: ligado (não verificado)' : 'reportado: não ligado';
      el('werLinked').style.color = v ? 'var(--success)' : 'var(--danger)';
      break;
    case 'mmr_root':
      state.evidence.mmrRoot = v;
      el('mmrRoot').textContent = v;
      el('mmrRoot').title=v;
      break;
    case 'mmr_leaves':
      state.evidence.mmrLeaves = v;
      el('mmrLeaves').textContent = v;
      renderMmrTree(document.getElementById('mmr-canvas'), v);
      break;
    case 'mmr_profile':
      el('mmrProfile').textContent = v;
      break;
  }
}

function renderGateObservation(){
  const fresh=state.connection==='connected' && state.gate.updatedAt>0 && Date.now()-state.gate.updatedAt<30000;
  const indicator=document.getElementById('failClosedIndicator');indicator.classList.toggle('fail-closed',!fresh || ['FAIL_CLOSED','REJECTED','DENIED'].includes(state.gate.status));
  document.getElementById('gateStatus').textContent=fresh?'Reportado: '+state.gate.status:'DESCONHECIDO';
  indicator.querySelector('span:last-child').textContent=fresh?'Telemetria do gate; não constitui autorização':'Sem observação atual — nenhuma autorização demonstrada';
  document.getElementById('gateReason').textContent=fresh?state.gate.reason:'Gate não reportado ou dados antigos';
}
function handleGateSignal(data) {
  if(data.metric==='gate_status'){state.gate.status=data.value;state.gate.updatedAt=Date.now();}
  if(data.metric==='gate_reason')state.gate.reason=data.value;
  renderGateObservation();
}

function handleCathedralEvent(data) {
  const m = data.metric, v = data.value;
  if (m === 'execution_attestation' && v) {
    if (v.id) document.getElementById('lastExecId').textContent = v.id;
    if (v.policy_compliant !== undefined) {
      const el = document.getElementById('lastExecCompliance');
      el.textContent = v.policy_compliant ? 'reportado: conforme' : 'reportado: não conforme';
      el.style.color = v.policy_compliant ? 'var(--success)' : 'var(--danger)';
    }
  }
  if (m === 'multiplicity_attestation' && v) {
    if (v.ambiguity !== undefined) document.getElementById('multAmbiguity').textContent = v.ambiguity.toFixed(4);
    if (v.discrepancy !== undefined) document.getElementById('multDiscrepancy').textContent = v.discrepancy.toFixed(4);
    if (v.rashomon_capacity !== undefined) document.getElementById('multRashomon').textContent = v.rashomon_capacity.toFixed(4);
    if (v.passed !== undefined) {
      const el = document.getElementById('multStatus');
      el.textContent = v.passed ? 'reportado: passou' : 'reportado: falhou';
      el.style.color = v.passed ? 'var(--success)' : 'var(--danger)';
    }
  }
  if (m === 'identity_attestation' && v) {
    if (v.confidence !== undefined) {
      const pct = (v.confidence * 100).toFixed(1);
      document.getElementById('identityConfidence').textContent = pct + '%';
      document.getElementById('identityBar').style.width = (v.confidence * 100) + '%';
    }
    if (v.passed !== undefined) {
      const el = document.getElementById('identityVerified');
      el.textContent = v.passed ? 'reportado: sim' : 'reportado: não';
      el.style.color = v.passed ? 'var(--success)' : 'var(--danger)';
    }
    if (v.tpm_anchor) {
      const tpm = v.tpm_anchor;
      const el = document.getElementById('identityTpm');
      if (tpm.available && tpm.fingerprint) {
        el.textContent = 'SRK reportada ' + tpm.fingerprint.substring(0, 12) + '…';
        el.style.color = 'var(--success)';
      } else {
        el.textContent = '✖ não selado';
        el.style.color = 'var(--danger)';
      }
    }
    // Hardware attestation badge
    const badge = document.getElementById('identityHwBadge');
    if (badge && v.tpm_signature_verified === true && v.tpm_signature) {
      badge.textContent = 'TPM: ASSINATURA REPORTADA — NÃO VERIFICADA NESTA UI';
      badge.style.borderColor = 'var(--success)';
      badge.style.color = 'var(--success)';
      badge.style.background = 'rgba(46,204,113,0.08)';
    } else if (badge && v.tpm_anchor && v.tpm_anchor.available) {
      badge.textContent = 'TPM REPORTADO — SEM VERIFICAÇÃO LOCAL';
      badge.style.borderColor = 'var(--warning)';
      badge.style.color = 'var(--warning)';
      badge.style.background = 'rgba(241,196,15,0.08)';
    } else if (badge) {
      badge.textContent = 'SEM ATESTAÇÃO DE HARDWARE RECEBIDA';
      badge.style.borderColor = 'var(--danger)';
      badge.style.color = 'var(--danger)';
      badge.style.background = 'rgba(231,76,60,0.08)';
    }
  }
  if (m === 'security_event' && v && v.details) {
    addLog(`Security: ${v.details}`, 'warn');
  }
}

function updateHistory(msg) {
  if (!msg || !Array.isArray(msg.signals)) return;
  msg.signals.forEach(s => {
    if (s && s.topic) updateSignal(s);
  });
}

function renderStats(s) {
  if (!s || typeof s !== 'object') return;
  const el = (id) => document.getElementById(id);
  if (s.cycle !== undefined && s.cycle !== null) {
    el('cathCycle').textContent = s.cycle;
    el('cathCycle').className = 'value green';
  }
  if (s.route) {
    el('cathRoute').textContent = String(s.route).toUpperCase();
    el('cathRoute').className = 'value ' + (s.route === 'fast' ? 'green' : 'yellow');
  }
  if (s.confidence !== undefined && s.confidence !== null) {
    const pct = (s.confidence * 100).toFixed(1);
    el('cathConfidence').textContent = pct + '%';
    el('cathConfidence').className = 'value ' + (s.confidence > 0.7 ? 'green' : s.confidence > 0.4 ? 'yellow' : 'red');
    el('confBar').style.width = (s.confidence * 100) + '%';
    el('confBar').style.background = s.confidence > 0.7 ? 'var(--success)' : s.confidence > 0.4 ? 'var(--warning)' : 'var(--danger)';
    pushHistory(state.confHistory, s.confidence);
    renderSparkline(el('confSparkline'), state.confHistory, { min: 0, max: 1 });
  }
  if (s.latency_ms !== undefined && s.latency_ms !== null) {
    el('cathLatency').textContent = s.latency_ms + 'ms';
    el('cathLatency').className = 'value ' + (s.latency_ms < 50 ? 'green' : s.latency_ms < 200 ? 'yellow' : 'red');
    pushHistory(state.latencyHistory, s.latency_ms);
    renderSparkline(el('latencySparkline'), state.latencyHistory, { invertColor: true });
  }
  if (s.safety_approved !== undefined) {
    el('cathSafety').textContent = s.safety_approved ? '✓ APROVADO' : '✖ BLOQUEADO';
    el('cathSafety').className = 'value ' + (s.safety_approved ? 'green' : 'red');
  }
  if (s.safety_reason) el('cathSafetyReason').textContent = s.safety_reason;
  if (s.prompt_version) el('cathPromptVersion').textContent = 'v' + s.prompt_version;
  if (s.phi_confidence !== undefined && s.phi_confidence !== null) {
    viz.phi = s.phi_confidence;
    el('phiInterop').textContent = s.phi_confidence.toFixed(4);
    pushHistory(state.phiHistory, s.phi_confidence);
    renderSparkline(el('phiSparkline'), state.phiHistory, { min: 0, max: 1 });
  }
  if (s.identity_confidence !== undefined && s.identity_confidence !== null) {
    const pct = (s.identity_confidence * 100).toFixed(1);
    el('identityConfidence').textContent = pct + '%';
    el('identityConfidence').className = 'value ' + (s.identity_confidence > 0.7 ? 'green' : s.identity_confidence > 0.4 ? 'yellow' : 'red');
    el('identityBar').style.width = (s.identity_confidence * 100) + '%';
    el('identityBar').style.background = s.identity_confidence > 0.7 ? 'var(--accent-2)' : s.identity_confidence > 0.4 ? 'var(--warning)' : 'var(--danger)';
  }
  if (s.identity_verified !== undefined) {
    el('identityVerified').textContent = s.identity_verified ? '✓' : '✖';
    el('identityVerified').style.color = s.identity_verified ? 'var(--success)' : 'var(--danger)';
  }
  if (s.identity_ttl !== undefined && s.identity_ttl !== null) {
    el('identityTTL').textContent = s.identity_ttl + 's';
  }
  if (s.execution_attestations !== undefined && s.execution_attestations !== null) {
    el('execCount').textContent = s.execution_attestations;
  }
  if (s.multiplicity_ambiguity !== undefined && s.multiplicity_ambiguity !== null) {
    el('multAmbiguity').textContent = s.multiplicity_ambiguity.toFixed(4);
    el('multAmbiguity').style.color = s.multiplicity_ambiguity < 0.3 ? 'var(--success)' : s.multiplicity_ambiguity < 0.5 ? 'var(--warning)' : 'var(--danger)';
  }
  if (s.multiplicity_discrepancy !== undefined && s.multiplicity_discrepancy !== null) {
    el('multDiscrepancy').textContent = s.multiplicity_discrepancy.toFixed(4);
    el('multDiscrepancy').style.color = s.multiplicity_discrepancy < 0.2 ? 'var(--success)' : s.multiplicity_discrepancy < 0.4 ? 'var(--warning)' : 'var(--danger)';
  }
  if (s.multiplicity_rashomon_capacity !== undefined && s.multiplicity_rashomon_capacity !== null) {
    el('multRashomon').textContent = s.multiplicity_rashomon_capacity.toFixed(4);
    el('multRashomon').style.color = s.multiplicity_rashomon_capacity < 0.4 ? 'var(--success)' : s.multiplicity_rashomon_capacity < 0.6 ? 'var(--warning)' : 'var(--danger)';
  }
  if (s.multiplicity_passed !== undefined) {
    el('multStatus').textContent = s.multiplicity_passed ? '✓ PASSED' : '✖ FAILED';
    el('multStatus').style.color = s.multiplicity_passed ? 'var(--success)' : 'var(--danger)';
  }
  if (s.biometric_status) {
    el('secBiometric').textContent = s.biometric_status;
    el('secBiometric').style.color = s.biometric_status === 'active' ? 'var(--success)' : 'var(--danger)';
  }
  if (s.deadman_active !== undefined) {
    el('secDeadman').textContent = s.deadman_active ? '⚠ ACTIVE' : 'INACTIVE';
    el('secDeadman').style.color = s.deadman_active ? 'var(--danger)' : 'var(--text-dim)';
  }
  if (s.r2 !== undefined && s.r2 !== null) {
    el('cathR2').textContent = (s.r2 * 100).toFixed(2) + '%';
    el('cathR2Verdict').textContent = s.r2 > 0.9 ? 'AUDITORIA: passa' : s.r2 > 0.7 ? 'AUDITORIA: atenção' : 'AUDITORIA: reprova';
    el('cathR2').className = 'value ' + (s.r2 > 0.9 ? 'green' : s.r2 > 0.7 ? 'yellow' : 'red');
  }
  if (s.r_dsa !== undefined && s.r_dsa !== null) {
    viz.r = s.r_dsa;
    el('rDSA').textContent = s.r_dsa.toFixed(4);
    el('topicDSA').innerHTML = `r_DSA = ${s.r_dsa.toFixed(4)} (última leitura)`;
    pushHistory(state.dsaHistory, s.r_dsa);
    renderSparkline(el('dsaSparkline'), state.dsaHistory, { min: 0, max: 1 });
  }
  if (s.threat_level) {
    viz.threat = s.threat_level === 'CRITICAL' ? 1 : s.threat_level === 'ELEVATED' ? 0.5 : 0;
    el('secThreat').textContent = s.threat_level;
    el('secThreat').style.color = s.threat_level === 'CRITICAL' ? 'var(--danger)' : s.threat_level === 'ELEVATED' ? 'var(--warning)' : 'var(--success)';
  }
  if (s.contingency_status) {
    el('secContingency').textContent = s.contingency_status;
    el('secContingency').style.color = s.contingency_status === 'ACTIVE' ? 'var(--danger)' : 'var(--text-dim)';
  }
  if (s.orchestrator_status) {
    el('cathStatus').textContent = s.orchestrator_status;
    el('cathStatus').className = 'value ' + (s.orchestrator_status === 'NOMINAL' ? 'green' : s.orchestrator_status === 'DEGRADED' ? 'red' : 'yellow');
  }
}

// ═══════════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════
let fpsAcc = 0, fpsLast = performance.now();
function animate() {
  const nowForFrame=performance.now();
  viz.time += 1;
  cur.r += (viz.r - cur.r) * 0.06;
  cur.phi += (viz.phi - cur.phi) * 0.06;
  cur.threat += (viz.threat - cur.threat) * 0.06;

  if (viz.mode === 'three' && threeRenderer) {
    threeUniforms.uTime.value = viz.time * 0.02;
    threeUniforms.uCoherence.value = cur.r;
    threeUniforms.uPhi.value = cur.phi;
    threeUniforms.uThreat.value = cur.threat;
    if (particles) {
      const positions=particles.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const d=(nowForFrame*0.012+i*4096/positions.count)%4096;
        const a=hilbertXY(Math.floor(d),64),b=hilbertXY((Math.floor(d)+1)%4096,64),f=d%1;
        const x=-1.05+((a[0]+(b[0]-a[0])*f)/63)*2.1;
        const y=-0.8+((a[1]+(b[1]-a[1])*f)/63)*1.6;
        const k=8+4*cur.r;
        const wave=Math.sin(k*x*Math.PI)*Math.cos(k*y*Math.PI*0.8)*Math.sin(viz.time*0.02);
        positions.setXYZ(i,x,y,wave*(0.05+0.18*cur.r)*(0.55+0.45*cur.phi)+0.035);
      }
      positions.needsUpdate=true;
    }
    threeRenderer.render(threeScene, threeCamera);
  } else if (viz.mode === '2d' && ctx2d) {
    drawChladni(viz.time, viz.r);
  }

  fpsAcc++;
  const now = performance.now();
  if (now - fpsLast >= 1000) {
    const el = document.getElementById('sceneFps');
    if (el) el.textContent = `| ${fpsAcc} fps`;
    renderGateObservation();
    if(state.connection==='connected' && state.lastMessageAt && Date.now()-state.lastMessageAt>20000){document.getElementById('connLatency').textContent='· dados antigos';}
    fpsAcc = 0;
    fpsLast = now;
  }
  animFrame = requestAnimationFrame(animate);
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  // Ignore if typing in an input
  if(e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea,select,button,a,[contenteditable]'))return;
  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      sendControl('start_loop');
      break;
    case 'c':
      sendControl('cycle', { count: 1 });
      break;
    case 'r':
      if (e.shiftKey) {
        sendControl('reset');
      }
      break;
    case 'a':
      sendControl('audit');
      break;
    case 'i':
      sendControl('attest_identity');
      break;
    case 's':
      sendControl('status');
      break;
    case 'e':
      exportState();
      break;
    case 't':
      toggleTheme();
      break;
  }
});

// ═══════════════════════════════════════════════════════════════
// UTILITIES: export, copy, theme
// ═══════════════════════════════════════════════════════════════
function exportState() {
  const snapshot = {
    schema: 'arkhe-dashboard-observation-v27',
    authority: 'none',
    verification: 'not_performed',
    exported_at: new Date().toISOString(),
    connection: state.connection,
    evidence: state.evidence,
    gate: state.gate,
    history: {
      phi: state.phiHistory,
      dsa: state.dsaHistory,
      confidence: state.confHistory,
      latency: state.latencyHistory,
    },
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arkhe-dashboard-state-${Date.now()}.json`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('State exported', 'success', 2000);
}

function copyResponse() {
  const pre = document.querySelector('#controlResponse pre');
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(
    () => toast('Copied to clipboard', 'success', 1500),
    () => toast('Copy failed', 'error', 1500)
  );
}

function toggleTheme() {
  document.body.classList.toggle('light');
  try { localStorage.setItem('arkhe-theme', document.body.classList.contains('light') ? 'light' : 'dark'); } catch (e) {}
}

// Restore theme preference
try {
  if (localStorage.getItem('arkhe-theme') === 'light') document.body.classList.add('light');
} catch (e) {}

// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('themeToggle').setAttribute('aria-label','Alternar tema');
document.querySelectorAll('[data-control]').forEach(button=>button.addEventListener('click',()=>sendControl(button.dataset.control,JSON.parse(button.dataset.value))));
document.querySelectorAll('[data-ui]').forEach(button=>button.addEventListener('click',()=>({exportState,copyResponse})[button.dataset.ui]?.()));
window.addEventListener('pagehide',()=>{intentionalClose=true;clearTimeout(connectDeadline);clearTimeout(reconnectTimer);clearInterval(probeTimer);clearInterval(staleTimer);cancelAnimationFrame(animFrame);ws?.close();});
async function refreshIntegration(){
  try{
    const response=await fetch('/api/integration-health',{signal:AbortSignal.timeout(4000)});if(!response.ok)throw new Error();
    const health=await response.json();
    document.getElementById("deploymentNote").textContent=health.deployment==="installed"?"Serviço v27 instalado · UI de observação sem autoridade":"Pré-visualização v27 em 7475 · serviço 7473/7474 ainda aguarda aplicação por Administrador";
    document.getElementById('integrationStatus').textContent=`Modo: ${health.deployment} · Telegraph legado: ${health.legacy.status} · Kernel Rust: ${health.kernel.status} · Prova criptográfica: não executada · MMR: não integrado`;
  }catch{document.getElementById('integrationStatus').textContent='Integração indisponível · verificação criptográfica não executada';}
}
refreshIntegration();staleTimer=setInterval(refreshIntegration,15000);
connect();
animate();