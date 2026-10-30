#!/usr/bin/env node
'use strict';

const { Arkhe } = require('./arkhe.js');
const { Telegraph } = require('./telegraph.js');
const TemporalChainDB = require('./temporal-chain-db.js');
const ZkWasmCircom = require('./zkwasm-circom.js');
const CareerCoherenceTracker = require('./career-coherence-tracker.js');
const http = require('http');
const fs = require('fs');
const path = require('path');

const arkhe = new Arkhe();
console.log(`[ARKHE-RUNTIME] Kernel carregado: Φ_interop = ${arkhe.polytope.calculateInterop ? arkhe.polytope.calculateInterop().toFixed(4) : '?'}`);

const telegraph = new Telegraph(7474);
let temporalDB, zkProver, careerTracker;

async function start() {
  console.log('[ARKHE-RUNTIME] ═══════════════════════════════════');
  console.log('[ARKHE-RUNTIME] Inicializando campo ξM...');
  console.log('[ARKHE-RUNTIME] ═══════════════════════════════════');

  await telegraph.start();
  console.log('[ARKHE-RUNTIME] Telegraph ativo: ws://localhost:7474');

  temporalDB = new TemporalChainDB(telegraph, {
    dbPath: path.join(process.cwd(), 'temporal-chain'),
    snapshotInterval: 1000,
  });
  console.log('[ARKHE-RUNTIME] TemporalChainDB ativa: ./temporal-chain/');

  zkProver = new ZkWasmCircom();
  try {
    await zkProver.setup();
    console.log('[ARKHE-RUNTIME] ZkWasmCircom: setup concluído');
  } catch (e) {
    console.log('[ARKHE-RUNTIME] ZkWasmCircom: using HMAC fallback');
  }

  let agents = [];
  try {
    agents = require('./agents.json').agents;
  } catch (e) {
    console.log('[ARKHE-RUNTIME] agents.json not found. Using defaults.');
    agents = generateDefaultAgents();
  }
  careerTracker = new CareerCoherenceTracker(agents, telegraph);
  console.log(`[ARKHE-RUNTIME] CareerCoherenceTracker: ${agents.length} agentes monitorados`);

  startDashboard();
  console.log('[ARKHE-RUNTIME] Chladni Dashboard: http://localhost:7473');

  careerTracker.startPulse(30000);

  telegraph.publish({
    source: 'arkhe-runtime',
    topic: '/signal/phi',
    metric: 'phiInterop',
    value: 0.975,
    unit: 'coherence',
  });

  console.log('[ARKHE-RUNTIME] ═══════════════════════════════════');
  console.log('[ARKHE-RUNTIME] Campo ξM operacional.');
  console.log('[ARKHE-RUNTIME] Press Ctrl+C to shutdown.');
  console.log('[ARKHE-RUNTIME] ═══════════════════════════════════');
}

function generateDefaultAgents() {
  return [
    { id: 1, role: 'AI Solutions Architect', domain: 'governance', coherence: 0.95, skills: ['system design', 'cloud architecture', 'stakeholder communication', 'ξM-field integration'], kuramoto_phase: 0.1, projects_solved: 42 },
    { id: 2, role: 'AI/ML Engineer', domain: 'core', coherence: 0.97, skills: ['PyTorch', 'TensorFlow', 'transformer architectures', 'hyperparameter tuning'], kuramoto_phase: 0.05, projects_solved: 89 },
    { id: 3, role: 'MLOps Engineer', domain: 'parsing', coherence: 0.93, skills: ['Docker', 'Kubernetes', 'CI/CD', 'model monitoring', 'feature stores'], kuramoto_phase: 0.12, projects_solved: 67 },
    { id: 4, role: 'Generative AI Engineer', domain: 'quantum', coherence: 0.96, skills: ['diffusion models', 'GANs', 'LLM fine-tuning', 'RLHF', 'prompt engineering'], kuramoto_phase: 0.08, projects_solved: 55 },
    { id: 5, role: 'AI Product Manager', domain: 'governance', coherence: 0.91, skills: ['product strategy', 'user research', 'agile methodologies', 'data-driven decision making'], kuramoto_phase: 0.15, projects_solved: 38 },
    { id: 6, role: 'Robotics Engineer', domain: 'quantum', coherence: 0.94, skills: ['ROS', 'computer vision', 'control systems', 'sensor fusion', 'embedded systems'], kuramoto_phase: 0.1, projects_solved: 31 },
    { id: 7, role: 'Autonomous Systems Engineer', domain: 'enterprise', coherence: 0.95, skills: ['path planning', 'SLAM', 'reinforcement learning', 'safety-critical systems', 'simulation'], kuramoto_phase: 0.09, projects_solved: 24 },
    { id: 8, role: 'Data Scientist', domain: 'parsing', coherence: 0.92, skills: ['statistics', 'SQL', 'pandas', 'machine learning', 'data visualization'], kuramoto_phase: 0.13, projects_solved: 73 },
    { id: 9, role: 'AI Cybersecurity Specialist', domain: 'core', coherence: 0.98, skills: ['adversarial ML', 'zero-trust architecture', 'cryptography', 'intrusion detection', 'ZK proofs'], kuramoto_phase: 0.03, projects_solved: 56 },
    { id: 10, role: 'Computer Vision Engineer', domain: 'quantum', coherence: 0.95, skills: ['CNNs', 'object detection', 'image segmentation', '3D reconstruction', 'ViTs'], kuramoto_phase: 0.09, projects_solved: 48 },
    { id: 11, role: 'NLP Engineer', domain: 'parsing', coherence: 0.96, skills: ['transformers', 'tokenization', 'semantic search', 'RAG', 'multilingual models'], kuramoto_phase: 0.07, projects_solved: 62 },
    { id: 12, role: 'Edge AI Engineer', domain: 'enterprise', coherence: 0.93, skills: ['TinyML', 'ONNX', 'quantization', 'mobile deployment', 'low-power systems'], kuramoto_phase: 0.12, projects_solved: 29 },
    { id: 13, role: 'Industrial Automation Engineer', domain: 'enterprise', coherence: 0.92, skills: ['PLC', 'SCADA', 'digital twins', 'predictive maintenance', 'IoT'], kuramoto_phase: 0.14, projects_solved: 35 },
    { id: 14, role: 'AI Cloud Engineer', domain: 'core', coherence: 0.96, skills: ['AWS/GCP/Azure', 'Terraform', 'GPU optimization', 'networking', 'distributed systems'], kuramoto_phase: 0.07, projects_solved: 81 },
    { id: 15, role: 'AI Research Scientist', domain: 'governance', coherence: 0.99, skills: ['theory', 'experimentation', 'publication', 'novel architectures', 'mathematical rigor'], kuramoto_phase: 0.02, projects_solved: 103 },
  ];
}

function startDashboard() {
  const {createDashboardServer}=require('./dashboard-http.cjs');
  createDashboardServer({
    publicDir:path.join(__dirname,'dashboard'),
    kernelConfigPath:process.env.ARKHE_KERNEL_CONFIG||null,
    legacyHealth:()=>({status:'ok',reference:true})
  }).listen(7473,'127.0.0.1');
}

async function shutdown() {
  console.log('\n[ARKHE-RUNTIME] Encerrando campo ξM...');
  if (careerTracker) careerTracker.stopPulse();
  if (temporalDB) await temporalDB.close();
  telegraph.stop();
  console.log('[ARKHE-RUNTIME] Campo ξM encerrado.');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch((err) => {
  console.error('[ARKHE-RUNTIME] Falha ao inicializar:', err);
  process.exit(1);
});
