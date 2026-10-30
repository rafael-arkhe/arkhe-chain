 'use client';
import { useState } from 'react';
import { Notice } from './ui';
import { api } from '@/lib/client';
type Outcome={verdict?:string;[key:string]:unknown};
let engine:Promise<typeof import('/pix/arkhe_pix_wasm.js')>|undefined;
function loadEngine(){return engine??=(async()=>{try {const module=await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '/pix/arkhe_pix_wasm.js');await module.default();return module;}catch(error){engine=undefined;throw error;}})();}
export function PixVerifier({enterprise=false}:{enterprise?:boolean}) {
 const [receipt,setReceipt]=useState(''),[key,setKey]=useState(''),[result,setResult]=useState<Outcome|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[source,setSource]=useState('');
 function reset(){setResult(null);setError('');setSource('');}
 async function verify(server=false){setBusy(true);reset();try {
  if(new TextEncoder().encode(receipt).length>32768)throw new Error('Recibo excede 32 KiB.');
  if(server){setResult(await api<Outcome>('enterprise/receipts/verify',{receipt}));setSource('Servidor · chave fixada pelo operador. Evento mínimo na auditoria; recibo não armazenado.');}
  else {if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Informe a chave pública em 64 caracteres hex minúsculos.');const module=await loadEngine();setResult(JSON.parse(module.verify_receipt_json(receipt,key)));setSource('Browser · chave fornecida por você. Recibo não enviado ao servidor.');}
 } catch(cause){setResult(null);setError(cause instanceof Error?cause.message:'Não verificável.');}finally{setBusy(false);}}
 const positive=result?.verdict==='signature_valid_synthetic';
 return <section className="panel pix-panel"><h2>Assinatura do recibo · synthetic-poc</h2>
 <p>Liquidação, identidade das partes e autorização KYA não verificadas. Propósito e passaporte são declarações assinadas; seus hashes não validam os artefactos referenciados.</p>
 <label htmlFor="pix-receipt">Recibo JSON (máximo 32 KiB)</label><textarea id="pix-receipt" rows={14} value={receipt} disabled={busy} onChange={e=>{setReceipt(e.target.value);reset();}} spellCheck={false}/>
 <label htmlFor="pix-key">Chave pública confiável para verificação local (hex minúsculo)</label><input id="pix-key" value={key} disabled={busy} maxLength={64} onChange={e=>{setKey(e.target.value);reset();}} spellCheck={false}/>
 <p>Obtenha a chave por canal independente. A chave pública da fixture permite que qualquer pessoa emita recibos de teste.</p>
 <div className="page-actions"><button className="button" disabled={busy||!receipt} onClick={()=>void verify()}>Verificar localmente</button>{enterprise?<button className="button secondary" disabled={busy||!receipt} onClick={()=>void verify(true)}>Avaliar com política do operador</button>:null}</div>
 {busy?<p role="status">Verificando…</p>:null}
 {error?<Notice error>Não verificável. {error}</Notice>:null}
 {result?<><Notice>{positive?'Assinatura válida · synthetic-poc. Pagamento e autorização KYA não confirmados.':result.decision?'Avaliação do operador · consulte a decisão abaixo. Pagamento e autorização KYA não confirmados.':'Não verificável.'}</Notice><p>{source}</p><pre className="pix-result">{JSON.stringify(result,null,2)}</pre></>:null}
 </section>;
}
