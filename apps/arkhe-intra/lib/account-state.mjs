import { createHash } from 'node:crypto';
import { db } from './store.mjs';
import { verifySignature } from './crypto.mjs';
export const stateHash = value => createHash('sha256').update(value).digest('hex');
export function applyAccountState(base) {
  const owners=base.filter(user=>user.role==='owner');
  const result=new Map(base.map(user=>[user.id,{...user,revision:0,revoked:false,keyHistory:[]} ]));
  for(const row of db().prepare('SELECT * FROM account_lifecycle ORDER BY seq').all()) {
    const user=result.get(row.account_id), value=JSON.parse(row.payload), statement=JSON.parse(row.statement);
    const owner=owners.find(user=>user.id===statement.actorId);
    if(!user||user.role==='owner'||!owner||statement.domain!=='arkhe-intra/account-action/v1'||statement.targetId!==user.id||statement.revision!==user.revision||row.revision!==user.revision+1||statement.stateCommitment!==stateHash(row.payload)||!verifySignature(row.statement,row.signature,owner.publicKey)) throw Error('Invalid account lifecycle evidence');
    if(value.action==='revoke'&&statement.action==='revoke') user.revoked=true;
    else if(value.action==='recover'&&statement.action==='approve-recovery'&&typeof value.publicKey==='string'&&/^[a-f0-9]{32}$/.test(value.salt)&&/^[a-f0-9]{128}$/.test(value.passwordHash)) {
      if(user.publicKey!==value.publicKey) user.keyHistory.push({publicKey:user.publicKey,status:user.revoked?'revoked':'retired'});
      Object.assign(user,{publicKey:value.publicKey,salt:value.salt,passwordHash:value.passwordHash,revoked:false});
    } else throw Error('Unsupported account lifecycle action');
    user.revision=row.revision;
  }
  return [...result.values()];
}
export function trustAccounts(users) {
  return users.flatMap(user=>[{id:user.id,role:user.role,publicKey:user.publicKey,status:user.revoked?'revoked':'active'},...(user.keyHistory||[]).map(key=>({id:user.id,role:user.role,...key}))]);
}
