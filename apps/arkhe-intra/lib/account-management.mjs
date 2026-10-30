import {randomBytes,randomUUID,createPublicKey,scryptSync} from 'node:crypto';
import {accounts,publicUser} from './auth.mjs';
import {stateHash} from './account-state.mjs';
import {db,transaction,appendEvent} from './store.mjs';
import {verifySignature} from './crypto.mjs';
const check=(condition,status,message)=>{if(!condition)throw Object.assign(new Error(message),{status});};
const owner=user=>check(user?.role==='owner',403,'Esta ação exige governança.');
function target(id) {const user=accounts().find(user=>user.id===id);check(user,404,'Conta não encontrada.');check(user.role!=='owner',403,'Raízes de governança exigem recuperação operacional independente.');return user;}
function normalizeKey(value) {
 check(typeof value==='string'&&value.length<=512,400,'Chave pública inválida.');
 try {const key=createPublicKey(value);check(key.asymmetricKeyType==='ed25519',400,'Use Ed25519.');return key.export({type:'spki',format:'pem'}).toString();} catch {throw Object.assign(Error('Chave pública Ed25519 inválida.'),{status:400});}
}
export function accountOverview(user) {
 owner(user);
 return {accounts:accounts().map(account=>({...publicUser(account),revision:account.revision,status:account.revoked?'revoked':'active'})),recoveryRequests:db().prepare("SELECT id,target_id AS targetId,revision,public_key AS publicKey,status FROM account_recovery_requests WHERE status='pending'").all()};
}
function grant(token) {
 check(typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token),400,'Recuperação inválida ou expirada.');
 const row=db().prepare('SELECT * FROM account_recovery_grants WHERE token_hash=?').get(stateHash(token));
 check(row&&!row.consumed&&row.expires>Date.now(),400,'Recuperação inválida ou expirada.');
 const account=target(row.target_id);check(account.revision===row.revision,409,'A conta mudou. Solicite nova recuperação.');return row;
}
function throttle() {
 const now=Date.now(),subject='account-recovery';
 const row=db().prepare('SELECT * FROM login_attempts WHERE subject=?').get(subject);
 check(!(row&&row.until_ms>now&&row.count>=60),429,'Muitas tentativas de recuperação. Aguarde 15 minutos.');
 db().prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)').run(subject,row&&row.until_ms>now?row.count+1:1,now+900000);
}
export function recoveryPossession(row,publicKey) {
 return JSON.stringify({domain:'arkhe-intra/recovery-possession/v1',grantId:row.id,targetId:row.target_id,revision:row.revision,challenge:row.challenge,publicKey});
}
export function inspectRecovery(input) {throttle();const row=grant(input.token);return {grantId:row.id,targetId:row.target_id,revision:row.revision,challenge:row.challenge,expiresAt:row.expires};}
export function submitRecovery(input) {
 throttle();check(Object.keys(input).every(key=>['token','password','publicKey','signature'].includes(key)),400,'Campos de recuperação inválidos.');
 check(typeof input.password==='string'&&input.password.length>=12&&input.password.length<=128&&Buffer.byteLength(input.password)<=512,400,'Use uma senha de 12 a 128 caracteres.');
 const publicKey=normalizeKey(input.publicKey),row=grant(input.token);
 check(verifySignature(recoveryPossession(row,publicKey),input.signature,publicKey),422,'Prova de posse inválida.');
 check(!accounts().some(user=>user.id!==row.target_id&&(user.publicKey===publicKey||user.keyHistory.some(key=>key.publicKey===publicKey))),409,'Chave vinculada a outra identidade.');
 const salt=randomBytes(16).toString('hex'),passwordHash=scryptSync(input.password,salt,64).toString('hex');
 return transaction(()=>{
  grant(input.token);const id=randomUUID();
  db().prepare('INSERT INTO account_recovery_requests(id,grant_id,target_id,revision,public_key,salt,password_hash,proof) VALUES(?,?,?,?,?,?,?,?)').run(id,row.id,row.target_id,row.revision,publicKey,salt,passwordHash,input.signature);
  db().prepare('UPDATE account_recovery_grants SET consumed=1 WHERE id=?').run(row.id);
  appendEvent(row.target_id,'account-recovery-requested','account:'+row.target_id,{requestId:id,publicKey});
  return {id,status:'pending',message:'A recuperação exige aprovação assinada da governança.'};
 });
}
function pending(id,account) {
 const row=db().prepare("SELECT * FROM account_recovery_requests WHERE id=? AND status='pending'").get(id);
 check(row&&row.target_id===account.id&&row.revision===account.revision,409,'Solicitação indisponível ou conta alterada.');
 const g=db().prepare('SELECT * FROM account_recovery_grants WHERE id=?').get(row.grant_id);
 check(g&&g.consumed&&g.expires>Date.now()&&g.target_id===account.id&&g.revision===account.revision&&verifySignature(recoveryPossession(g,row.public_key),row.proof,row.public_key),422,'Evidência de recuperação inválida ou expirada.');return row;
}
export function accountChallenge(user,id,input) {
 owner(user);const account=target(id);check(['revoke','issue-recovery','approve-recovery'].includes(input.action),400,'Ação inválida.');
 let value={action:input.action};
 if(input.action==='revoke')check(!account.revoked,409,'Conta já revogada.');
 if(input.action==='approve-recovery') {
  const request=pending(input.requestId,account);
  value={action:'recover',publicKey:request.public_key,salt:request.salt,passwordHash:request.password_hash};
 }
 const nonce=randomUUID(),expires=Date.now()+600000;
 const statement=JSON.stringify({domain:'arkhe-intra/account-action/v1',targetId:id,revision:account.revision,action:input.action,requestId:input.requestId||null,stateCommitment:stateHash(JSON.stringify(value)),actorId:user.id,nonce,expires});
 db().prepare('INSERT INTO account_actions VALUES(?,?,?,?,?,?,?,0)').run(nonce,id,account.revision,input.action,statement,JSON.stringify(value),expires);
 return {id:nonce,statement,action:input.action,targetId:id,expires};
}
export function executeAccountAction(user,id,input) {
 owner(user);
 return transaction(()=>{
  const account=target(id),action=db().prepare('SELECT * FROM account_actions WHERE id=?').get(input.challengeId);
  check(action&&!action.consumed&&action.target_id===id&&action.revision===account.revision&&action.expires>Date.now(),409,'Autorização expirada, utilizada ou conta alterada.');
  const statement=JSON.parse(action.statement);
  check(statement.targetId===id&&statement.revision===account.revision&&statement.action===action.action&&statement.nonce===action.id&&statement.expires===action.expires&&statement.stateCommitment===stateHash(action.payload)&&statement.actorId===user.id&&verifySignature(action.statement,input.signature,user.publicKey),422,'A ação exige a assinatura da governança autenticada.');
  if(action.action==='issue-recovery') {
   const token=randomBytes(32).toString('base64url'),expires=Date.now()+86400000;
   db().prepare('UPDATE account_recovery_grants SET expires=0 WHERE target_id=? AND consumed=0').run(id);
   db().prepare('INSERT INTO account_recovery_grants VALUES(?,?,?,?,?,?,0)').run(action.id,id,account.revision,stateHash(token),randomBytes(32).toString('base64url'),expires);
   db().prepare('UPDATE account_actions SET consumed=1 WHERE id=?').run(action.id);
   appendEvent(user.id,'account-recovery-issued','account:'+id,{statement:action.statement,signature:input.signature});
   return {token,targetId:id,expiresAt:expires};
  }
  if(action.action==='approve-recovery') {
   const request=pending(statement.requestId,account);
   check(stateHash(action.payload)===stateHash(JSON.stringify({action:'recover',publicKey:request.public_key,salt:request.salt,passwordHash:request.password_hash})),409,'A solicitação mudou.');
   db().prepare("UPDATE account_recovery_requests SET status='approved',salt='',password_hash='' WHERE id=?").run(request.id);
  }
  db().prepare('INSERT INTO account_lifecycle(account_id,revision,payload,statement,signature) VALUES(?,?,?,?,?)').run(id,account.revision+1,action.payload,action.statement,input.signature);
  db().prepare('UPDATE account_actions SET consumed=1 WHERE id=?').run(action.id);
  db().prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  appendEvent(user.id,action.action==='revoke'?'account-revoked':'account-recovered','account:'+id,{revision:account.revision+1,statement:action.statement,signature:input.signature});
  return {status:action.action==='revoke'?'revoked':'active',revision:account.revision+1};
 });
}
