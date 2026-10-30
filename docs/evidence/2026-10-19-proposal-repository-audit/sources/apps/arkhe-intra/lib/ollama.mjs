import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { root } from './paths.mjs';
import { demand } from './documents.mjs';
const execute = promisify(execFile);
let busy = false;
export async function askOllama(prompt) {
  demand(typeof prompt === 'string' && prompt.trim().length > 0 && Buffer.byteLength(prompt) <= 32768, 400, 'Pergunta vazia ou maior que 32 KiB.');
  demand(!busy, 429, 'O modelo está ocupado. Aguarde a resposta atual.');
  busy = true;
  try {
    // Reuses the Rust provider's loopback, digest, timeout and tool-call checks.
    const executable = process.env.ARKHE_OLLAMA_EXECUTABLE || resolve(root, 'target/debug/arkhe-ollama' + (process.platform === 'win32' ? '.exe' : ''));
    const { stdout } = await execute(executable, ['chat', prompt], { cwd: root, env: { ...process.env, ARKHE_OLLAMA_CONFIG: process.env.ARKHE_OLLAMA_CONFIG || resolve(root, 'config/ollama.json') }, windowsHide: true, timeout: 195000, maxBuffer: 1048576 });
    return { answer: stdout.trim(), status: 'UNTRUSTED_PROPOSAL' };
  } finally { busy = false; }
}
