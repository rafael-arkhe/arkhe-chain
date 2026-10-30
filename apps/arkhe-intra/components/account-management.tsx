'use client';
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api,signLocally} from '@/lib/client';
import {Notice} from './ui';
type Account={id:string;name:string;email:string;role:string;status:string;revision:number};
type Recovery={id:string;targetId:string;publicKey:string;revision:number};
export function AccountManagement() {
 const client=useQueryClient();
 const overview=useQuery({queryKey:['accounts'],queryFn:()=>api<{accounts:Account[];recoveryRequests:Recovery[]}>('accounts')});
 const [selected,setSelected]=useState(''),[action,setAction]=useState('revoke'),[requestId,setRequestId]=useState('');
 const [error,setError]=useState(''),[success,setSuccess]=useState(''),[token,setToken]=useState(''),[busy,setBusy]=useState(false);
 const target=overview.data?.accounts.find(account=>account.id===selected);
 const requests=overview.data?.recoveryRequests.filter(request=>request.targetId===selected&&request.revision===target?.revision)||[];
 const request=requests.find(item=>item.id===requestId);
 return <section className="panel credential-history"><h2>Gestão de contas</h2><p>Revogue acesso ou autorize recuperação de senha e chave. As chaves antigas permanecem no histórico de confiança.</p>
 {overview.error?<Notice error>{overview.error.message}</Notice>:null}{error?<Notice error>{error}</Notice>:null}{success?<Notice>{success}</Notice>:null}
 <form onSubmit={async event=>{
  event.preventDefault();const form=event.currentTarget,file=new FormData(form).get('ownerKey') as File;
  setBusy(true);setError('');setSuccess('');setToken('');
  try {
   if(!file||file.size>2048)throw Error('Selecione sua chave Ed25519 PKCS#8 PEM.');
   const challenge=await api<{id:string;statement:string}>(`accounts/${selected}/challenge`,{action,...(action==='approve-recovery'?{requestId}:{})});
   const signature=await signLocally(await file.text(),challenge.statement);
   const result=await api<{token?:string}>(`accounts/${selected}/execute`,{challengeId:challenge.id,signature});
   setToken(result.token||'');setSuccess(result.token?'Código gerado. Entregue-o por canal independente; vale por 24 horas.':'Decisão assinada registrada. Sessões anteriores foram encerradas.');
   await Promise.all(['accounts','credentials','audit','dashboard'].map(key=>client.invalidateQueries({queryKey:[key]})));
   form.reset();
  }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
 }}><fieldset disabled={busy||overview.isPending}>
 <label>Conta<select required value={selected} onChange={event=>{setSelected(event.target.value);setRequestId('');setToken('');}}><option value="">Selecione uma conta</option>{overview.data?.accounts.filter(account=>account.role!=='owner').map(account=><option key={account.id} value={account.id}>{account.name} · {account.email} · {account.status==='revoked'?'revogada':'ativa'}</option>)}</select></label>
 <label>Ação<select value={action} onChange={event=>{setAction(event.target.value);setToken('');}}><option value="revoke">Revogar conta e sessões</option><option value="issue-recovery">Emitir código de recuperação</option><option value="approve-recovery">Aprovar recuperação solicitada</option></select></label>
 {action==='approve-recovery'?<><label>Solicitação<select required value={requestId} onChange={event=>setRequestId(event.target.value)}><option value="">Selecione uma solicitação</option>{requests.map(item=><option key={item.id} value={item.id}>{item.id}</option>)}</select></label>{request?<label>Nova chave pública — confira por canal independente<textarea readOnly rows={3} value={request.publicKey}/></label>:null}</>:null}
 <label>Sua chave de governança (.pem)<input name="ownerKey" type="file" accept=".pem" required/></label>
 <label className="checkbox"><input type="checkbox" required/>Conferi a identidade e autorizo esta ação.</label><button className="button" disabled={busy||!target}>{busy?'Processando…':'Assinar decisão'}</button>
 </fieldset></form>
 {token?<div><label>Código de uso único<input readOnly type="password" value={token} autoComplete="off"/></label><button type="button" className="button secondary" onClick={async()=>{try{await navigator.clipboard.writeText(token);setSuccess('Código copiado. Oriente a pessoa a abrir /recuperar.');}catch{setError('Não foi possível copiar o código.');}}}>Copiar código</button><p>A recuperação ainda exige sua aprovação assinada após a prova de posse.</p></div>:null}
 <p>Contas de governança exigem recuperação operacional independente e não são alteradas por este fluxo.</p></section>;
}
