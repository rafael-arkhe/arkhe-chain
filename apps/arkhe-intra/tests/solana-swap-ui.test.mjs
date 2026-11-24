import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

test('UI /verificar/solana-swap: arquivos de rota, componente WASM, proxy seguro e link no hub existem', () => {
  const pagePath = resolve(ROOT, 'app/verificar/solana-swap/page.tsx');
  const compPath = resolve(ROOT, 'components/solana-swap-verifier.tsx');
  const apiPath = resolve(ROOT, 'app/api/solana-swap/route.ts');
  const hubPath = resolve(ROOT, 'app/verificar/page.tsx');
  const wasmJs = resolve(ROOT, 'public/verifier/arkhe_verify_wasm.js');
  const wasmBin = resolve(ROOT, 'public/verifier/arkhe_verify_wasm_bg.wasm');

  for (const p of [pagePath, compPath, apiPath, hubPath, wasmJs, wasmBin]) {
    assert.ok(existsSync(p), `expected file to exist: ${p}`);
  }

  const comp = readFileSync(compPath, 'utf8');
  assert.ok(comp.includes('compile_solana_swap_message_v0'));
  assert.ok(comp.includes('evaluate_solana_swap_message_v0'));
  assert.ok(comp.includes('reconcile_solana_swap_confirmation'));
  assert.equal(/ARKHE_SOLANA_SWAP_TOKEN/.test(comp), false, 'client component must never reference server token');

  const api = readFileSync(apiPath, 'utf8');
  assert.ok(api.includes("case 'health':"));
  assert.ok(api.includes("case 'verify-bundle':"));
  assert.ok(api.includes('SAFE_ID'));
  assert.ok(api.includes("Authorization: `Bearer ${cfg.token}`"));

  const hub = readFileSync(hubPath, 'utf8');
  assert.ok(hub.includes('/verificar/solana-swap'));

  const wasmGlue = readFileSync(wasmJs, 'utf8');
  assert.ok(wasmGlue.includes('compile_solana_swap_message_v0'));
  assert.ok(wasmGlue.includes('evaluate_solana_swap_message_v0'));
  assert.ok(wasmGlue.includes('reconcile_solana_swap_confirmation'));
});
