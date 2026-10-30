import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './paths.mjs';
import { demand } from './documents.mjs';
import { randomUUID } from 'node:crypto';
let busy = false;
export function providerEnvironment(source = process.env) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH']) if (source[key]) env[key] = source[key];
  env.ARKHE_OLLAMA_CONFIG = source.ARKHE_OLLAMA_CONFIG || resolve(root, 'config/ollama.json');
  return env;
}
export function runProvider(executable, prompt, env) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, ['chat-stdin'], { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks = []; let size = 0; let failure;
    const fail = error => { failure = error; child.kill(); };
    const timer = setTimeout(() => fail(new Error('provider_timeout')), 195000);
    child.stdout.on('data', data => { size += data.length; if (size > 1048576) fail(new Error('provider_output_limit')); else chunks.push(data); });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); if (failure || code !== 0) reject(failure || new Error('provider_failed')); else accept(Buffer.concat(chunks).toString('utf8')); });
    child.stdin.end(prompt);
  });
}
export function inferenceEvent(requestId, outcome, durationMs, modelDigest) {
  return { event: 'ai.inference', requestId, provider: 'ollama', outcome,
    durationMs: Math.round(durationMs), modelDigest: /^[a-f0-9]{64}$/i.test(modelDigest || '') ? modelDigest : null };
}
function configuredDigest() {
  try { return JSON.parse(readFileSync(providerEnvironment().ARKHE_OLLAMA_CONFIG, 'utf8')).model_digest; }
  catch { return null; }
}
export async function askOllama(prompt) {
  demand(typeof prompt === 'string' && prompt.trim().length > 0 && Buffer.byteLength(prompt) <= 32768, 400, 'Pergunta vazia ou maior que 32 KiB.');
  demand(!busy, 429, 'O modelo está ocupado. Aguarde a resposta atual.');
  busy = true;
  const requestId = randomUUID(), start = performance.now(); let outcome = 'error';
  try {
    const executable = process.env.ARKHE_OLLAMA_EXECUTABLE || resolve(root, 'target/debug/arkhe-ollama' + (process.platform === 'win32' ? '.exe' : ''));
    const stdout = await runProvider(executable, prompt, providerEnvironment());
    outcome = 'success';
    return { answer: stdout.trim(), status: 'UNTRUSTED_PROPOSAL', requestId };
  } finally {
    busy = false;
    // Fixed schema: never include prompts, answers, user identifiers or exception messages.
    console.info(JSON.stringify(inferenceEvent(requestId, outcome, performance.now() - start, configuredDigest())));
  }
}
