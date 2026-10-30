'use client';
import Link from 'next/link';
import {useState} from 'react';
import {api} from '@/lib/client';
import {generateRegistrationKey,importRegistrationKey,downloadPrivateKey,signPossession,type LocalSigningKey} from '@/lib/credential-keys';
import {Notice} from '@/components/ui';
export default function Recovery() {
 const [key,setKey]=useState<LocalSigningKey|null>(null),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 return <main className="main-content"><section className="panel"><h1>Recuperar acesso</h1><p>Use o código entregue pela governança. Registre sua nova senha e prove posse da chave que passará a assinar suas decisões.</p>
 {error?<Notice error>{error}</Notice>:null}{success?<Notice>{success}</Notice>:null}
 <button className="button secondary" type="button" disabled={busy} onClick={async()=>{try{setKey(await generateRegistrationKey());setSaved(false);setError('');}catch(cause){setError((cause as Error).message);}}}>Gerar nova chave Ed25519</button>
 <label>Ou importar sua chave (.pem)<input type="file" accept=".pem" disabled={busy} onChange={async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>2048)throw Error('Arquivo de chave muito grande.');setKey(await importRegistrationKey(await file.text()));setSaved(true);setError('');}catch(cause){setKey(null);setSaved(false);setError((cause as Error).message);}}}/></label>
 {key?.privatePem?<button className="button secondary" type="button" disabled={busy} onClick={()=>{downloadPrivateKey(key.privatePem!);setSaved(true);}}>Baixar e guardar a nova chave privada</button>:null}
 {key?<label>Chave pública<textarea readOnly rows={3} value={key.publicKey}/></label>:null}
 <form onSubmit={async event=>{
  event.preventDefault();const form=event.currentTarget,data=new FormData(form);setBusy(true);setError('');setSuccess('');
  try {
   if(!key||!saved)throw Error('Importe uma chave ou gere e guarde a nova chave antes de continuar.');
   const token=data.get('token'),grant=await api<{grantId:string;targetId:string;revision:number;challenge:string}>('recovery/inspect',{token});
   const statement=JSON.stringify({domain:'arkhe-intra/recovery-possession/v1',grantId:grant.grantId,targetId:grant.targetId,revision:grant.revision,challenge:grant.challenge,publicKey:key.publicKey});
   const signature=await signPossession(key.key,statement);
   await api('recovery/request',{token,password:data.get('password'),publicKey:key.publicKey,signature});
   form.reset();setKey(null);setSaved(false);setSuccess('Solicitação enviada. Aguarde a governança conferir sua identidade e aprovar a recuperação.');
  }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
 }}><fieldset disabled={busy}><label>Código de recuperação<input name="token" type="password" required maxLength={43} autoComplete="off"/></label><label>Nova senha<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><button className="button" disabled={busy||!key||!saved}>{busy?'Enviando…':'Solicitar recuperação'}</button></fieldset></form>
 <p>A chave privada fica no seu dispositivo. Este fluxo não ativa a conta nem troca sua chave sem aprovação assinada.</p><Link href="/login">Voltar ao login</Link></section></main>;
}
