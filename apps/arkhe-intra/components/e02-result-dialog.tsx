'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { isCompleteE02Report } from '@/lib/e02-report.mjs';
import type { E02Result } from '@/lib/e02.mjs';

export function E02ResultDialog({ result, engine, isDemo, close, download, restoreFocus }: {
  restoreFocus: HTMLElement | null;
  result: E02Result; engine: string; isDemo: boolean; close: () => void; download: () => void;
}) {
  const verified = result.checks ? isCompleteE02Report(result) : result.outcome === 'VERIFIED';
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previous = restoreFocus;
    element?.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, [restoreFocus]);
  return <dialog ref={dialog} className="e02-dialog" aria-labelledby="e02-result-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <header><p className="eyebrow">E02 · {details ? 'M20 · PROVA' : 'M3 · RESULTADO'}</p>
      <button type="button" className="button secondary" autoFocus onClick={close} aria-label="Fechar resultado"><X size={18} /></button></header>
    <h2 id="e02-result-title">{details ? 'Detalhes da prova' : verified ? 'Compromisso verificado' : 'Não verificável'}</h2>
    <p><span className={`badge ${verified ? 'pass' : 'fail'}`}>{verified ? 'VERIFIED' : 'NOT_VERIFIABLE'}</span></p>
    <p>Motor: {engine}</p>
    {result.complete !== undefined ? <p>Execução: {result.complete ? 'Completa' : `Interrompida no check ${result.aborted}`}</p> : null}
    {isDemo ? <p className="e02-warning">Demonstração com recibos sintéticos. Não representa ancoragem real.</p> : null}
    <p>{result.statement}</p>
    {result.reason ? <p role="alert">Falha: <code>{result.reason}</code>. Corrija o pacote e verifique novamente.</p> : null}
    <p className="e02-warning">{result.observation_warning}</p>
    <button type="button" className="button secondary" aria-expanded={details} aria-controls="e02-proof-details" onClick={() => setDetails(value => !value)}>
      {details ? 'Voltar ao resultado' : 'Ver detalhes da prova'}
    </button>
    <h3>Cadeia de verificações</h3>
    {result.checks ? <ol className="e02-checks">{result.checks.map(check => <li key={check.id}>
      <span>{check.label}</span><strong className={check.status === 'PASS' ? 'e02-pass' : check.status === 'FAIL' ? 'e02-fail' : ''}>
        {check.status === 'PASS' ? 'Confirmado' : check.status === 'FAIL' ? 'Falhou' : 'Não executado'}
      </strong>{check.reason ? <code>{check.reason}</code> : null}
    </li>)}</ol> : <p>Este motor não fornece etapas individuais. Execute no browser para inspecionar a cadeia WASM.</p>}
    <p>Assinaturas dos recibos RPC e assinatura de proveniência não são autenticadas neste fluxo. A presença de uma assinatura não significa validação criptográfica.</p>
    <section id="e02-proof-details" hidden={!details}>
      <h3>Valores observados pelo verificador</h3>
      <dl className="e02-facts">{Object.entries(result.observed).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value === null ? 'Não disponível' : String(value)}</dd></div>)}</dl>
      <h3>Caminho MMR, hashes e referências</h3>
      <p>Valores parciais de uma execução que falhou não constituem uma prova válida.</p>
      <pre>{JSON.stringify(result.proof_details ?? { aviso: 'Detalhes indisponíveis neste motor.' }, null, 2)}</pre>
      <details><summary>Laudo JSON completo</summary><pre>{JSON.stringify({ engine, ...result }, null, 2)}</pre></details>
    </section>
    <footer><button type="button" className="button secondary" onClick={download}>Baixar laudo JSON</button><button type="button" className="button" onClick={close}>Concluir</button></footer>
  </dialog>;
}
