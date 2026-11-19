import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const intra = fileURLToPath(new URL('..', import.meta.url));
const workflowTemplate = fileURLToPath(new URL('../n8n/arkhe-gate.workflow.json', import.meta.url));
const gateScript = fileURLToPath(new URL('./n8n-gate.mjs', import.meta.url));
const n8nHome = fileURLToPath(new URL('../../../tmp/n8n-local', import.meta.url));
const n8nBin = join(n8nHome, 'node_modules', 'n8n', 'bin', 'n8n');
const userFolder = mkdtempSync(join(tmpdir(), 'arkhe-n8n-user-'));
const work = mkdtempSync(join(tmpdir(), 'arkhe-n8n-flow-'));

if (!existsSync(n8nBin)) {
  console.error(`n8n não está em ${n8nHome}. Instale com: npm install n8n --omit=dev --prefix tmp/n8n-local`);
  process.exit(2);
}

const fixtures = await writeFixtures();
const tampered = runCase('adulterado', fixtures.tampered, fixtures.trust);
const intact = runCase('integro', fixtures.intact, fixtures.trust);

if (tampered.nodes.includes('Avisar') || existsSync(tampered.notice)) {
  fail('O nó Avisar disparou com o pacote adulterado.', tampered);
}
if (!tampered.nodes.includes('Conferir pacote') || !tampered.nodes.includes('Parar')) {
  fail('O ramo de parada não executou no pacote adulterado.', tampered);
}
if (!intact.nodes.includes('Avisar') || !existsSync(intact.notice) || intact.nodes.includes('Parar')) {
  fail('O pacote íntegro não avisou, ou o ramo de parada também correu.', intact);
}

console.log(JSON.stringify({
  adulterado: { nos: tampered.nodes, aviso: false },
  integro: { nos: intact.nodes, aviso: true },
}, null, 2));

async function writeFixtures() {
  const data = mkdtempSync(join(tmpdir(), 'arkhe-n8n-fixtures-'));
  process.env.ARKHE_INTRA_DATA_DIR = data;
  execFileSync(process.execPath, ['scripts/setup.mjs'], { cwd: intra, env: process.env, stdio: 'pipe' });
  const { login } = await import('../lib/auth.mjs');
  const { createDocument, challenge, transition, exportDocument } = await import('../lib/documents.mjs');
  const { exportTrust } = await import('../lib/credentials.mjs');
  const credentials = JSON.parse(readFileSync(join(data, 'credentials.json'), 'utf8'));
  const password = role => credentials.find(row => row.email === `${role}@arkhe.local`).password;
  const pem = role => readFileSync(join(data, `${role}.private.pem`));
  const author = login('author@arkhe.local', password('author')).user;
  const reviewer = login('reviewer@arkhe.local', password('reviewer')).user;
  const owner = login('owner@arkhe.local', password('owner')).user;
  const created = createDocument(author, {
    title: 'Minuta sintética',
    department: 'Piloto',
    body: 'Texto de exemplo para o fluxo n8n.',
  });
  for (const [user, action, key] of [[author, 'submit', pem('author')], [reviewer, 'review', pem('reviewer')], [owner, 'approve', pem('owner')]]) {
    const current = challenge(user, created.id, action);
    transition(user, created.id, {
      action,
      digest: current.digest,
      revision: current.revision,
      signature: sign(null, Buffer.from(current.statement), key).toString('base64'),
    });
  }
  const bundle = exportDocument(created.id);
  const intact = join(work, 'integro.json');
  const tampered = join(work, 'adulterado.json');
  const trust = join(work, 'trust.json');
  writeFileSync(intact, JSON.stringify(bundle));
  const copy = structuredClone(bundle);
  copy.document.body += ' adulterado';
  writeFileSync(tampered, JSON.stringify(copy));
  writeFileSync(trust, JSON.stringify(exportTrust(owner)));
  return { intact, tampered, trust };
}

function runCase(label, bundle, trust) {
  const notice = join(work, `${label}-aviso.txt`);
  rmSync(notice, { force: true });
  const workflow = JSON.parse(readFileSync(workflowTemplate, 'utf8'));
  workflow.nodes.find(node => node.name === 'Conferir pacote').parameters.command = `node "${gateScript}" "${bundle}" "${trust}"`;
  workflow.nodes.find(node => node.name === 'Avisar').parameters.command = `echo avisou>>"${notice}"`;
  const file = join(work, `${label}.workflow.json`);
  writeFileSync(file, JSON.stringify(workflow));
  const output = `${n8n(['import:workflow', `--input=${file}`])}\n${n8n(['execute', '--id=arkheGateWorkflow', '--rawOutput'], true)}`;
  return { nodes: executedNodes(output), notice, output };
}

function n8n(args, allowFailure = false) {
  try {
    return execFileSync(process.execPath, [n8nBin, ...args], {
      encoding: 'utf8',
      env: n8nEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000,
    });
  } catch (error) {
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    if (allowFailure) return output;
    throw new Error(output || error.message);
  }
}

function n8nEnv() {
  return {
    ...process.env,
    N8N_USER_FOLDER: userFolder,
    NODES_EXCLUDE: '[]',
    N8N_ENABLE_EXECUTE_COMMAND: 'true',
    N8N_RUNNERS_ENABLED: 'false',
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
    N8N_PERSONALIZATION_ENABLED: 'false',
  };
}

function executedNodes(output) {
  const names = new Set();
  for (const match of output.matchAll(/"(Conferir pacote|Avisar|Parar)": \[/g)) names.add(match[1]);
  if (names.size === 0) {
    writeFileSync(join(fileURLToPath(new URL('../../../tmp/n8n-last-output.txt', import.meta.url))), output);
    throw new Error('A execução do n8n não nomeou os nós esperados.');
  }
  return [...names];
}

function fail(message, result) {
  console.error(message);
  console.error(JSON.stringify({ nodes: result.nodes, notice: existsSync(result.notice) }));
  console.error(result.output.slice(-4000));
  process.exit(1);
}
