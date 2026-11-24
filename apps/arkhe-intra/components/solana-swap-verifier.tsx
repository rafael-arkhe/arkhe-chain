'use client';

import { useState } from 'react';
import { Notice } from './ui';

type WasmModule = {
  default: () => Promise<unknown>;
  evaluate_solana_swap_message_v0: (bytes: Uint8Array, contextJson: string) => string;
  compile_solana_swap_message_v0: (requestJson: string) => string;
  reconcile_solana_swap_confirmation: (requestJson: string) => string;
};

type Tab = 'evaluate' | 'reconcile' | 'gateway';

let wasmPromise: Promise<WasmModule> | undefined;

function loadVerifierWasm(): Promise<WasmModule> {
  return (wasmPromise ??= (async () => {
    try {
      // @ts-expect-error Runtime-served WebAssembly module from /public/verifier
      const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '/verifier/arkhe_verify_wasm.js')) as WasmModule;
      await mod.default();
      return mod;
    } catch (err) {
      wasmPromise = undefined;
      throw err;
    }
  })());
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.trim();
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function SolanaSwapVerifier() {
  const [tab, setTab] = useState<Tab>('evaluate');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [source, setSource] = useState('');

  // Tab 1: Local Rust/WASM Compile & Evaluate
  const [compileInput, setCompileInput] = useState('');
  const [messageB64, setMessageB64] = useState('');
  const [evalContextJson, setEvalContextJson] = useState('');

  // Tab 2: Local Rust/WASM Evidence #3 Reconciliation
  const [reconcileJson, setReconcileJson] = useState('');

  // Tab 3: Server-proxied Gateway /v1/solana/swap/*
  const [receiptId, setReceiptId] = useState('');
  const [bundleJson, setBundleJson] = useState('');

  function clearOutput() {
    setError('');
    setResult(null);
    setSource('');
  }

  async function runWasmCompile() {
    setBusy(true);
    clearOutput();
    try {
      const wasm = await loadVerifierWasm();
      const parsed = JSON.parse(wasm.compile_solana_swap_message_v0(compileInput));
      if (parsed?.compiledMessageBase64) {
        setMessageB64(parsed.compiledMessageBase64);
      }
      setResult(parsed);
      setSource('Browser · arkhe-verify-wasm (compile_solana_swap_message_v0) · 100% offline.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function runWasmEvaluate() {
    setBusy(true);
    clearOutput();
    try {
      const wasm = await loadVerifierWasm();
      const bytes = base64ToBytes(messageB64);
      const parsed = JSON.parse(wasm.evaluate_solana_swap_message_v0(bytes, evalContextJson));
      setResult(parsed);
      setSource('Browser · arkhe-verify-wasm (evaluate_solana_swap_message_v0) · autoridade Rust offline.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function runWasmReconcile() {
    setBusy(true);
    clearOutput();
    try {
      const wasm = await loadVerifierWasm();
      const parsed = JSON.parse(wasm.reconcile_solana_swap_confirmation(reconcileJson));
      setResult(parsed);
      setSource('Browser · arkhe-verify-wasm (reconcile_solana_swap_confirmation · Evidência #3) · 100% offline.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function callGateway(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    clearOutput();
    try {
      const resp = await fetch('/api/solana-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data?.error ? `HTTP ${resp.status}: ${data.error}` : `HTTP ${resp.status}`);
        setResult(data);
      } else {
        if (action === 'bundle') {
          setBundleJson(JSON.stringify(data, null, 2));
        }
        setResult(data);
        setSource(`Gateway /v1/solana/swap/* via proxy autenticado (${action}) · zero credenciais expostas no browser.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel pix-panel">
      <div className="page-actions">
        <button
          type="button"
          className={tab === 'evaluate' ? 'button' : 'button secondary'}
          onClick={() => {
            setTab('evaluate');
            clearOutput();
          }}
        >
          1. Compilar &amp; Avaliar MessageV0 (WASM)
        </button>
        <button
          type="button"
          className={tab === 'reconcile' ? 'button' : 'button secondary'}
          onClick={() => {
            setTab('reconcile');
            clearOutput();
          }}
        >
          2. Reconciliação On-Chain (Evidência #3)
        </button>
        <button
          type="button"
          className={tab === 'gateway' ? 'button' : 'button secondary'}
          onClick={() => {
            setTab('gateway');
            clearOutput();
          }}
        >
          3. Gateway /v1/solana/swap/*
        </button>
      </div>

      <p>
        Modo estritamente <strong>dry-run / verificação offline</strong>: zero assinaturas reais de carteira e zero transmissões em rede.
      </p>

      {tab === 'evaluate' ? (
        <>
          <label htmlFor="swap-compile-json">
            (Opcional) Pedido de compilação MessageV0 JSON (payer, recentBlockhash, swapInstructionsPayload, addressLookupTables)
          </label>
          <textarea
            id="swap-compile-json"
            rows={6}
            value={compileInput}
            disabled={busy}
            onChange={(e) => setCompileInput(e.target.value)}
            spellCheck={false}
          />
          <div className="page-actions">
            <button type="button" className="button secondary" disabled={busy || !compileInput.trim()} onClick={() => void runWasmCompile()}>
              Compilar MessageV0 em Rust/WASM
            </button>
          </div>

          <label htmlFor="swap-msg-b64">MessageV0 compilada (Base64)</label>
          <textarea
            id="swap-msg-b64"
            rows={3}
            value={messageB64}
            disabled={busy}
            onChange={(e) => setMessageB64(e.target.value)}
            spellCheck={false}
          />

          <label htmlFor="swap-eval-ctx">Contexto de avaliação JSON (policy, addressLookupTables, swapInstructionsPayload)</label>
          <textarea
            id="swap-eval-ctx"
            rows={10}
            value={evalContextJson}
            disabled={busy}
            onChange={(e) => setEvalContextJson(e.target.value)}
            spellCheck={false}
          />
          <div className="page-actions">
            <button
              type="button"
              className="button"
              disabled={busy || !messageB64.trim() || !evalContextJson.trim()}
              onClick={() => void runWasmEvaluate()}
            >
              Avaliar política no núcleo Rust/WASM
            </button>
          </div>
        </>
      ) : null}

      {tab === 'reconcile' ? (
        <>
          <label htmlFor="swap-reconcile-json">
            Payload de reconciliação JSON (policy, authorizedSha256, authorizedBlake3, evidence)
          </label>
          <textarea
            id="swap-reconcile-json"
            rows={14}
            value={reconcileJson}
            disabled={busy}
            onChange={(e) => setReconcileJson(e.target.value)}
            spellCheck={false}
          />
          <div className="page-actions">
            <button type="button" className="button" disabled={busy || !reconcileJson.trim()} onClick={() => void runWasmReconcile()}>
              Reconciliar confirmação on-chain (WASM)
            </button>
          </div>
        </>
      ) : null}

      {tab === 'gateway' ? (
        <>
          <div className="page-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void callGateway('health')}>
              Health &amp; Contadores
            </button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void callGateway('policy')}>
              Política Ativa
            </button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void callGateway('public-keys')}>
              Chaves Públicas
            </button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void callGateway('receipts', { limit: 25, offset: 0 })}>
              Listar Recibos
            </button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void callGateway('checkpoint')}>
              Checkpoint MMR
            </button>
          </div>

          <label htmlFor="swap-receipt-id">Receipt ID (para exportar bundle MMR ou consultar confirmação on-chain)</label>
          <input
            id="swap-receipt-id"
            value={receiptId}
            disabled={busy}
            onChange={(e) => setReceiptId(e.target.value)}
            placeholder="rcpt-..."
            spellCheck={false}
          />
          <div className="page-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || !receiptId.trim()}
              onClick={() => void callGateway('bundle', { receiptId: receiptId.trim() })}
            >
              Exportar Bundle Offline
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy || !receiptId.trim()}
              onClick={() => void callGateway('confirmation', { receiptId: receiptId.trim() })}
            >
              Consultar Confirmação On-Chain
            </button>
          </div>

          <label htmlFor="swap-bundle-json">Bundle JSON para validar via /verify-bundle</label>
          <textarea
            id="swap-bundle-json"
            rows={8}
            value={bundleJson}
            disabled={busy}
            onChange={(e) => setBundleJson(e.target.value)}
            spellCheck={false}
          />
          <div className="page-actions">
            <button
              type="button"
              className="button"
              disabled={busy || !bundleJson.trim()}
              onClick={() => {
                try {
                  const payload = JSON.parse(bundleJson);
                  void callGateway('verify-bundle', { payload });
                } catch {
                  setError('Bundle JSON inválido.');
                }
              }}
            >
              Verificar Bundle no Gateway
            </button>
          </div>
        </>
      ) : null}

      {busy ? <p role="status">Processando…</p> : null}
      {error ? <Notice error>{error}</Notice> : null}
      {result ? (
        <>
          {source ? <p>{source}</p> : null}
          <pre className="pix-result">{JSON.stringify(result, null, 2)}</pre>
        </>
      ) : null}
    </section>
  );
}
