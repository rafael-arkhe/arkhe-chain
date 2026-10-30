'use client';
import { useRef, useState } from 'react';
import { Cpu, FileJson, Play, ShieldAlert, ShieldCheck, WifiOff } from 'lucide-react';
import { api } from '@/lib/client';
import { verifyE02Browser } from '@/lib/e02-browser.mjs';
import type { E02VerifierWasm } from '@/lib/e02-browser.mjs';
import { Digest, Notice } from './ui';

import type { E02Result as Result } from '@/lib/e02.mjs';
import { E02ResultDialog } from './e02-result-dialog';

type SlotKey = 'dataset' | 'ref' | 'anchor';
type Engine = 'browser-wasm' | 'server';

const ENGINES: Record<Engine, string> = {
  'browser-wasm': 'arkhe-verify-wasm no browser (offline)',
  server: 'servidor local (Node)',
};

let verifierPromise: Promise<E02VerifierWasm> | null = null;
function loadVerifier(): Promise<E02VerifierWasm> {
  verifierPromise ??= (async () => {
    const mod = await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ '/verifier/arkhe_verify_wasm.js'
    );
    await mod.default();
    return mod;
  })();
  return verifierPromise.catch(cause => { verifierPromise = null; throw cause; });
}

const SLOTS: { key: SlotKey; label: string; hint: string }[] = [
  { key: 'dataset', label: 'Dataset', hint: 'Leaves e root do checkpoint (§4)' },
  { key: 'ref', label: 'Recibo de referência', hint: 'getTransaction da transação REF' },
  { key: 'anchor', label: 'Recibo de âncora', hint: 'getTransaction da transação ANCHOR' },
];
const EMPTY: Record<SlotKey, string> = { dataset: '', ref: '', anchor: '' };

export function E02Verifier() {
  const returnFocus = useRef<HTMLElement | null>(null);
  const [texts, setTexts] = useState<Record<SlotKey, string>>(EMPTY);
  const [names, setNames] = useState<Record<SlotKey, string>>(EMPTY);
  const [result, setResult] = useState<Result | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [expectedCount, setExpectedCount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = Boolean(texts.dataset && texts.ref && texts.anchor);

  async function load(key: SlotKey, file: File) {
    if (file.size > 262144) {
      setError('Cada ficheiro deve ter no máximo 256 KiB.');
      return;
    }
    const text = await file.text();
    setIsDemo(Object.entries(names).some(([slot, name]) => slot !== key && name.endsWith('(demo)')));
    setTexts((current) => ({ ...current, [key]: text }));
    setNames((current) => ({ ...current, [key]: file.name }));
    setResult(null);
    setDialogOpen(false);
    setError('');
  }

  async function demo() {
    setBusy(true);
    setError('');
    try {
      const [dataset, ref, anchor] = await Promise.all(
        (['dataset', 'ref', 'anchor'] as const).map(async (name) => {
          const response = await fetch(`/e02/fixtures/${name}.json`, { cache: 'no-store' });
          if (!response.ok) throw new Error('Não foi possível carregar a demonstração.');
          return response.text();
        }),
      );
      setIsDemo(true);
      setTexts({ dataset, ref, anchor });
      setNames({ dataset: 'dataset.json (demo)', ref: 'ref.json (demo)', anchor: 'anchor.json (demo)' });
      setResult(null);
      setDialogOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar a demonstração.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyInBrowser() {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusy(true);
    setError('');
    setResult(null);
    setDialogOpen(false);
    try {
      const wasm = await loadVerifier();
      setResult(
        verifyE02Browser(
          { refText: texts.ref, anchorText: texts.anchor, datasetText: texts.dataset, includeDetails: true, expectedLeafCount: expectedCount ? Number(expectedCount) : undefined },
          wasm,
        ),
      );
      setEngine('browser-wasm');
      setDialogOpen(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Falha ao carregar o verificador WASM: ${cause.message}`
          : 'Falha ao carregar o verificador WASM.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusy(true);
    setError('');
    setResult(null);
    setDialogOpen(false);
    try {
      setResult(await api<Result>('e02/verify', { ...texts, expectedLeafCount: expectedCount ? Number(expectedCount) : undefined }));
      setEngine('server');
      setDialogOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao verificar.');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([`${JSON.stringify({ engine, synthetic_demo: isDemo, ...result }, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'laudo-e02.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="editor-layout e02-workspace">
      {result && dialogOpen ? <E02ResultDialog result={result} engine={engine ? ENGINES[engine] : ''}
        restoreFocus={returnFocus.current} isDemo={isDemo} download={download} close={() => setDialogOpen(false)} /> : null}
      <div>
        <form className="panel" onSubmit={submit}>
          <h2>
            <FileJson size={18} aria-hidden="true" /> Ficheiros do compromisso
          </h2>
          <p>
            Carregue o dataset e os dois recibos. A verificação primária corre no seu browser com o
            mesmo WASM do verificador Rust; nada sai da sua máquina. O servidor fica como comparação.
          </p>
          <div className="verification-steps">
            {SLOTS.map((slot) => (
              <label key={slot.key}>
                {slot.label}
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void load(slot.key, file);
                  }}
                />
                <small>{names[slot.key] || slot.hint}</small>
              </label>
            ))}
          </div>
          <label>Contagem de folhas esperada (opcional)
            <input type="number" min="1" max="4096" step="1" value={expectedCount} disabled={busy}
              onChange={event => { setExpectedCount(event.target.value); setResult(null); setDialogOpen(false); }} />
            <small>Use uma contagem obtida de fonte confiável. Sem ela, o E02 confere apenas a consistência entre os ficheiros fornecidos.</small>
          </label>
          {isDemo ? <Notice>Demonstração: artefactos do repositório com recibos sintéticos. Não representa ancoragem real.</Notice> : null}
          {error ? <Notice error>{error}</Notice> : null}
          <div className="page-actions">
            <button className="button" type="button" onClick={verifyInBrowser} disabled={!ready || busy}>
              <Cpu size={16} aria-hidden="true" /> {busy ? 'A verificar…' : 'Verificar no browser'}
            </button>
            <button className="button secondary" type="submit" disabled={!ready || busy}>
              <Play size={16} aria-hidden="true" /> Verificar no servidor
            </button>
            <button className="button secondary" type="button" onClick={demo} disabled={busy}>
              Carregar demonstração
            </button>
          </div>
        </form>

        {result ? (
          <section className="panel" aria-live="polite">
            <button className="button secondary" type="button" onClick={event => { returnFocus.current = event.currentTarget; setDialogOpen(true); }}>
              Resultado e detalhes da prova
            </button>
            <p className="eyebrow">RESULTADO</p>
            <h2>
              {result.outcome === 'VERIFIED' ? (
                <ShieldCheck size={18} aria-hidden="true" />
              ) : (
                <ShieldAlert size={18} aria-hidden="true" />
              )}
              {result.outcome === 'VERIFIED' ? 'Compromisso verificado' : 'Não verificável'}
            </h2>
            <p>
              <span className={`badge ${result.outcome === 'VERIFIED' ? 'pass' : 'fail'}`}>
                {result.outcome}
              </span>
              {result.reason ? <> · <code>{result.reason}</code></> : null}
            </p>
            {engine ? (
              <p>
                <small>Motor: {ENGINES[engine]}</small>
              </p>
            ) : null}
            <p>{result.statement}</p>
            <p>{result.observation_warning}</p>
            <dl>
              <div>
                <dt>Root</dt>
                <dd>{result.observed.root ? <Digest value={result.observed.root} /> : '—'}</dd>
              </div>
              <div>
                <dt>Folhas</dt>
                <dd>{result.observed.n ?? '—'}</dd>
              </div>
              <div>
                <dt>Âncora</dt>
                <dd>{result.observed.anchor_ref ? <Digest value={result.observed.anchor_ref} /> : '—'}</dd>
              </div>
              <div>
                <dt>Slot / pagador</dt>
                <dd>
                  {result.observed.anchor_slot ?? '—'} ·{' '}
                  <span className="mono">
                    {result.observed.anchor_payer ? `${result.observed.anchor_payer.slice(0, 8)}…` : '—'}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Digest do dataset</dt>
                <dd>{result.observed.dataset_digest ? <Digest value={result.observed.dataset_digest} /> : '—'}</dd>
              </div>
              <div>
                <dt>Proveniência</dt>
                <dd>
                  {result.observed.signed
                    ? `declarada · ${result.observed.provenance_kid ?? ''}`
                    : 'não declarada'}
                </dd>
              </div>
            </dl>
            <details>
              <summary>Laudo JSON</summary>
              <pre className="mono break-all">{JSON.stringify(result, null, 2)}</pre>
            </details>
            <button className="button secondary" type="button" onClick={download}>
              Baixar laudo
            </button>
          </section>
        ) : null}
      </div>

      <aside className="panel">
        <h2>
          <WifiOff size={18} aria-hidden="true" /> O que isto prova
        </h2>
        <p>
          Que o pagador da transação de referência comprometeu este artefacto, que ele está incluído na root
          publicada e que o dataset recomputa essa root.
        </p>
        <p>
          <strong>Não prova</strong> autoria, veracidade, qualidade ou valor do artefacto. O token não entra
          neste cálculo.
        </p>
        <p>
          A verificação primária corre <strong>no seu browser</strong>, com o mesmo binário
          WASM (`arkhe-verify-wasm`) que os adapters Rust usam — o leitor é o verificador. O
          botão do servidor existe para comparar os dois motores; divergência é falha.
        </p>
        <p>
          Também pode verificar fora do browser, no CLI:
        </p>
        <pre className="mono break-all">
          node scripts/e02_verify.mjs --receipt ref.json --anchor anchor.json --dataset dataset.json
        </pre>
        <p>
          Entrega mínima: três ficheiros e este veredicto. O recibo diz <code>NOT_VERIFIABLE</code> quando
          qualquer passo falha.
        </p>
      </aside>
    </div>
  );
}
