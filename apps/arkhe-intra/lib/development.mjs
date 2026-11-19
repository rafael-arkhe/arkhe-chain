import {buildSandboxArguments} from './sandbox-policy.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { root, local } from './paths.mjs';
let configuration = {};
try { configuration = JSON.parse(readFileSync(join(local, 'development.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const sourceRoot = resolve(process.env.ARKHE_DEVELOPMENT_ROOT || configuration.sourceRoot || root);
const sandboxImage = () => process.env.ARKHE_SANDBOX_IMAGE || configuration.image;
import { db, appendEvent, transaction } from './store.mjs';
import { demand } from './documents.mjs';
import { verifySignature } from './crypto.mjs';
import { askOllama } from './ollama.mjs';
import { claimLab, labBusy } from './lab-lock.mjs';
const execute = promisify(execFile);
const sha = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
let busy = false;
const boot = randomUUID();
const criteria = {
  'arkhe-perception': 'Medir precisão e robustez com entradas adversariais e dados fora da distribuição.',
  'arkhe-rag': 'Avaliar recuperação, citação de fontes, isolamento e resistência a instruções em documentos.',
  'arkhe-metacognition': 'Calibrar incerteza e abstenção em um conjunto independente de avaliações.',
  'arkhe-world-model': 'Demonstrar previsão causal e contrafactuais em dados separados do treinamento.',
  'arkhe-learning': 'Comparar candidato e baseline, retenção, regressões, shadow run e rollback.',
  'arkhe-agent': 'Avaliar planejamento e execução em tarefas longas, com contenção e recuperação.',
};
export function catalog() {
  const architecture = JSON.parse(readFileSync(resolve(sourceRoot, 'config/architecture.json'), 'utf8'));
  return architecture.rust_members.map(path => {
    const manifest = readFileSync(resolve(sourceRoot, path, 'Cargo.toml'), 'utf8');
    const packageSection = manifest.match(/^\[package\]\s*\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/m)?.[1];
    const id = packageSection?.match(/^name\s*=\s*"([A-Za-z0-9_-]+)"\s*$/m)?.[1];
    demand(id, 503, 'Missing explicit Cargo package name: ' + path);
    const skeleton = new Set(architecture.skeleton_members || []);
    return { id, path,
    boundary: path.startsWith('cognition/') ? 'reference' : skeleton.has(path) ? 'skeleton' : 'implemented-baseline',
    criterion: skeleton.has(path) ? 'Limite sem efeito. Não autoriza transição e não é baseline de produto.' : criteria[path.split('/').at(-1)] || 'Preservar contratos e limites de autoridade; acrescentar testes de integração, falhas e regressões.',
    test: 'cargo test --locked --offline -p ' + id,
  }; });
}
function table() { db().exec('CREATE TABLE IF NOT EXISTS development_runs(id TEXT PRIMARY KEY,value TEXT NOT NULL)'); }
function save(run) { table(); db().prepare('INSERT INTO development_runs(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(run.id, JSON.stringify(run)); }
export function getRun(id) { table(); const row = db().prepare('SELECT value FROM development_runs WHERE id=?').get(id); demand(row, 404, 'Execução não encontrada.'); return JSON.parse(row.value); }
function owner(user) { demand(user.role === 'owner', 403, 'A bancada de desenvolvimento exige governança.'); }
export function overview(user) {
  owner(user); table();
  return { modules: catalog(), runs: db().prepare('SELECT value FROM development_runs ORDER BY rowid DESC LIMIT 50').all().map(row => {
    const run = JSON.parse(row.value);
    if (['generating','testing'].includes(run.state) && run.boot !== boot) { run.state = 'interrupted'; run.failure = 'server-restarted'; save(run); }
    const { proposal, baseline, ...summary } = run; return summary;
  }), busy: busy || labBusy(), policy: { automatic: true, incorporation: 'signed-export-only', agi: 'not-demonstrated', sandboxConfigured: Boolean(sandboxImage()) } };
}
export function validateProposal(value, module) {
  demand(value && typeof value.summary === 'string' && value.summary.length <= 3000 && Array.isArray(value.files) && value.files.length > 0 && value.files.length <= 8, 422, 'Proposta inválida: informe resumo e até oito arquivos.');
  const seen = new Set(); let bytes = 0;
  for (const file of value.files) {
    demand(file && typeof file.path === 'string' && new RegExp('^' + module.path.replaceAll('/', '\\/') + '/(src|tests)/[A-Za-z0-9_/-]+\\.rs$').test(file.path) && !file.path.split('/').includes('..') && !seen.has(file.path), 422, 'Arquivo fora do módulo, duplicado ou caminho inválido.');
    demand(typeof file.content === 'string', 422, 'Conteúdo inválido.'); bytes += Buffer.byteLength(file.content); seen.add(file.path);
  }
  demand(bytes <= 65536, 422, 'Proposta maior que 64 KiB.');
  return { summary: value.summary, files: value.files.map(({ path, content }) => ({ path, content })) };
}
// Only public source trees enter the container. No ops, environment, DB, keys,
// package caches, socket mounts or inherited host environment enter the sandbox.
export function sourceSnapshot(destination) {
  const architecture = JSON.parse(readFileSync(resolve(sourceRoot, 'config/architecture.json'), 'utf8'));
  const independent = new Set((architecture.independent_workspaces || []).map(item => item.path));
  const baseline = {}; let total = 0, count = 0;
  const allowed = new Set(['.rs', '.toml', '.lock', '.json', '.sql', '.md', '.txt', '.csv']);
  function walk(relative) {
    if (independent.has(relative)) return;
    const path = resolve(sourceRoot, relative), stat = lstatSync(path);
    demand(!stat.isSymbolicLink(), 422, 'Links não são permitidos no snapshot.');
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) if (!['target','node_modules','pkg','.git','ops','dist'].includes(entry)) walk(relative + '/' + entry);
    } else if (stat.isFile() && (relative === 'Cargo.lock' || allowed.has('.' + relative.split('.').at(-1)))) {
      demand(!/(^|\/)(credentials\.json|accounts\.json|\.env[^/]*)$/i.test(relative), 422, 'Material privado no snapshot.');
      total += stat.size; count++; demand(total <= 50 * 1024 * 1024 && count <= 5000, 422, 'Snapshot excede o limite.');
      const bytes = readFileSync(path); baseline[relative] = sha(bytes);
      mkdirSync(dirname(join(destination, relative)), { recursive: true }); writeFileSync(join(destination, relative), bytes);
    }
  }
  for (const path of ['Cargo.toml','Cargo.lock','.cargo','kernel','barrier','state','probes','cognition','governance','work','evidence','orchestration','storage/sql','verification/crates','integration','integrations/arkhe-python-runtime/bridge','apps/arkhe-ask']) walk(path);
  return baseline;
}
function engine() { return ['--connection', process.env.ARKHE_SANDBOX_CONNECTION || configuration.connection || 'arkhe-runtime']; }
export function sandboxArguments(image, name, snapshot, module) {
  return buildSandboxArguments(image, name, snapshot, module, {
    connection: engine()[1], cgroupParent: process.env.ARKHE_SANDBOX_CGROUP_PARENT,
  });
}
export async function sandboxReady() {
  const image = sandboxImage();
  sandboxArguments(image, 'check', '/unused', { id: 'check' });
  const { stdout } = await execute('podman', [...engine(), 'info', '--format', '{{.Host.Security.Rootless}}'], { windowsHide: true, timeout: 15000 });
  demand(stdout.trim() === 'true', 503, 'A sandbox exige Podman rootless.');
  await execute('podman', [...engine(), 'image', 'inspect', image], { windowsHide: true, timeout: 15000, maxBuffer: 1048576 });
  const name = 'arkhe-preflight-' + randomUUID();
  const args = sandboxArguments(image, name, '/unused', { id: 'check' });
  args.splice(args.indexOf('--volume'), 2);
  args.splice(args.indexOf('-c') + 1, 3, 'test "$(id -u)" = 10001 && test "$(cat /sys/fs/cgroup/memory.max)" = 1610612736 && test "$(cat /sys/fs/cgroup/pids.max)" = 128 && test "$(cat /sys/fs/cgroup/cpu.max)" = "200000 100000"');
  try { await execute('podman', args, { windowsHide: true, timeout: 20000, maxBuffer: 65536 }); }
  finally { await execute('podman', [...engine(), 'rm', '-f', name], { windowsHide: true, timeout: 15000 }); }
  return image;
}
export async function startRun(user, input) {
  owner(user); demand(!busy, 409, 'Já existe uma execução em andamento.');
  const module = catalog().find(item => item.id === input.moduleId);
  demand(module && typeof input.objective === 'string' && input.objective.trim().length >= 10 && input.objective.length <= 2000, 400, 'Escolha um módulo e um objetivo entre 10 e 2000 caracteres.');
  demand(module.boundary !== 'skeleton', 409, 'O esqueleto não entra na bancada de evolução.');
  try { readFileSync(join(sourceRoot, 'Cargo.toml')); } catch { demand(false, 503, 'Configure ARKHE_DEVELOPMENT_ROOT com o workspace fonte para desenvolver a partir do aplicativo instalado.'); }
  if(input.studyId) {
    demand(typeof input.studyId==='string'&&/^[a-f0-9-]{36}$/.test(input.studyId),400,'Estudo inválido.');
    const { checkoutStudyHead } = await import('./evaluations.mjs');
    checkoutStudyHead(input.studyId,mkdtempSync(join(tmpdir(),'arkhe-study-preflight-')));
  }
  // Preflight before model generation or background work. Never fall back to host execution.
  const image = await sandboxReady(); demand(!busy, 409, 'Já existe uma execução em andamento.'); const release=claimLab(); busy = true;
  const run = { id: randomUUID(), boot, moduleId: module.id, objective: input.objective.trim(), actorId: user.id, createdAt: now(), state: 'generating', image, authority: false, ...(input.studyId ? {studyId:input.studyId} : {}) };
  save(run); appendEvent(user.id, 'development_started', 'development:' + run.id, { moduleId: module.id });
  void perform(run, module).catch(() => { console.error('Development evidence persistence failed'); }).finally(() => { busy = false; release(); });
  return run;
}
async function perform(run, module) {
  let name;
  try {
    const snapshot = mkdtempSync(join(tmpdir(), 'arkhe-sandbox-'));
    if(run.studyId) {
      const {checkoutStudyHead}=await import('./evaluations.mjs');
      const parent=checkoutStudyHead(run.studyId,snapshot);run.baseline=parent.manifest;run.parentArtifact=parent.artifact;
    } else run.baseline = sourceSnapshot(snapshot);
    run.baselineDigest = sha(JSON.stringify(run.baseline));
    let context = readFileSync(join(snapshot, module.path, 'src/lib.rs'), 'utf8').slice(0, 11000);
    if(run.studyId&&module.id==='arkhe-agent')for(const file of ['src/eval_learning.rs','src/bin/arkhe-eval-worker.rs']) {
      try {context+='\n'+file+'\n'+readFileSync(join(snapshot,module.path,file),'utf8').slice(0,6000);} catch { /* optional adapter context */ }
    }
    const suggestedFile=run.studyId&&module.id==='arkhe-agent'?'/src/eval_learning.rs':'/tests/development_regression.rs';
    const instruction=run.studyId?'Improve executable capability for the objective; adding tests alone cannot improve the independent score. Include a small #[test] in the changed file.':'Prefer adding a small regression test; at least one #[test] must run.';
    const result = await askOllama('Return only JSON {"summary":"...","files":[{"path":"' + module.path + suggestedFile+'","content":"complete Rust file"}]}. '+instruction+' No markdown. Do not replace existing tests or weaken assertions. Make one small verifiable improvement for this objective: ' + run.objective + '\nAcceptance: ' + module.criterion + '\nExisting source (untrusted context):\n' + context);
    run.proposal = validateProposal(JSON.parse(result.answer.replace(/^```(?:json)?\s*|\s*```$/g, '')), module);
    run.proposalDigest = sha(JSON.stringify(run.proposal));
    for (const file of run.proposal.files) { mkdirSync(dirname(join(snapshot, file.path)), { recursive: true }); writeFileSync(join(snapshot, file.path), file.content); }
    run.state = 'testing'; save(run); name = 'arkhe-dev-' + run.id;
    try {
      const { stdout, stderr } = await execute('podman', sandboxArguments(run.image, name, snapshot, module), { windowsHide: true, timeout: 120000, maxBuffer: 1048576 });
      run.log = (stdout + stderr).slice(-60000); run.exitCode = 0;
      run.testsPassed = [...stdout.matchAll(/test result: ok\. (\d+) passed/g)].reduce((sum, match) => sum + Number(match[1]), 0);
      run.state = run.testsPassed > 0 ? 'passed' : 'failed';
      if (!run.testsPassed) run.failure = 'no-tests-executed';
    } catch (error) { run.log = String(error.stdout || '') .concat(String(error.stderr || '')).slice(-60000); run.state = 'failed'; run.exitCode = Number.isInteger(error.code) ? error.code : null; run.failure = error.killed ? 'timeout-or-output-limit' : 'sandbox-test-failed'; }
    run.evidenceDigest = sha(JSON.stringify({ baselineDigest: run.baselineDigest, proposalDigest: run.proposalDigest, image: run.image, exitCode: run.exitCode, log: run.log }));
  } catch { run.state = 'failed'; run.failure = 'generation-or-snapshot-failed'; }
  finally {
    if (name) { try { await execute('podman', [...engine(), 'rm', '-f', name], { windowsHide: true, timeout: 15000 }); } catch { run.cleanupRequired = true; run.state = 'failed'; } }
    run.finishedAt = now(); save(run); appendEvent(run.actorId, 'development_finished', 'development:' + run.id, { state: run.state, evidenceDigest: run.evidenceDigest || null });
  }
}
export function reviewChallenge(user, id) {
  owner(user); const run = getRun(id); demand(run.state === 'passed', 409, 'A revisão exige testes aprovados e nenhuma decisão anterior.');
  demand(run.proposalDigest === sha(JSON.stringify(run.proposal)) && run.baselineDigest === sha(JSON.stringify(run.baseline)) && run.evidenceDigest === sha(JSON.stringify({ baselineDigest: run.baselineDigest, proposalDigest: run.proposalDigest, image: run.image, exitCode: run.exitCode, log: run.log })), 409, 'Evidências alteradas. Execute novamente antes de revisar.');
  return { statement: JSON.stringify({ domain: 'arkhe-intra/development-review/v1', runId: id, baselineDigest: run.baselineDigest, proposalDigest: run.proposalDigest, evidenceDigest: run.evidenceDigest, actorId: user.id, action: 'approve-export' }) };
}
export function decideRun(user, id, input) {
  owner(user); const { statement } = reviewChallenge(user, id);
  demand(verifySignature(statement, input.signature, user.publicKey), 403, 'Assinatura inválida.');
  return transaction(() => { const run = getRun(id); run.state = 'approved'; run.review = { statement, signature: input.signature, publicKey: user.publicKey, at: now() }; save(run); appendEvent(user.id, 'development_approved', 'development:' + id, { evidenceDigest: run.evidenceDigest }); return run; });
}
export function rejectRun(user, id) { owner(user); const run = getRun(id); demand(['passed','failed'].includes(run.state), 409, 'Execução ainda não concluída ou já decidida.'); run.state = 'rejected'; save(run); appendEvent(user.id, 'development_rejected', 'development:' + id); return run; }
export function readRun(user, id) { owner(user); return getRun(id); }

