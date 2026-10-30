import {createRequire} from 'node:module';
import {generateKeyPairSync,sign,verify} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {canonical,hashedRekord} from '../../apps/arkhe-intra/lib/rekor.mjs';
import {fileURLToPath} from 'node:url';
const wasm=createRequire(import.meta.url)('../../verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js');
export function prepare(checkpoint) {
  const c=checkpoint.checkpoint;
  if(c?.tenant_id!=='synthetic-gov-poc'||c.stream_id!=='cin-evidence-v1'||c.leaf_count!==4||!/^[a-f0-9]{64}$/.test(checkpoint.checkpoint_digest)) throw Error('Only the synthetic PoC checkpoint may be prepared');
  const digest=wasm.blake3_hex(Buffer.concat([Buffer.from('AKG:CHECKPOINT:v1\0'),Buffer.from(checkpoint.checkpoint_cbor_hex,'hex')]));
  if(digest!==checkpoint.checkpoint_digest)throw Error('Checkpoint digest mismatch');
  const statement=canonical({profile:'arkhe-gov-public-checkpoint/v1',checkpointDigest:digest,scope:'synthetic-only'});
  const keys=generateKeyPairSync('ed25519');
  const signed={statement,signature:sign(null,Buffer.from(statement),keys.privateKey).toString('base64'),publicKey:keys.publicKey.export({type:'spki',format:'pem'})};
  if(!verify(null,Buffer.from(statement),keys.publicKey,Buffer.from(signed.signature,'base64')))throw Error('Local signature verification failed');
  return {status:'PREPARED_NOT_PUBLISHED',scope:'Only a synthetic checkpoint commitment; no credential payload or subject; self-signed ephemeral test key is not government identity',signature:signed,entry:hashedRekord(signed)};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const checkpoint=JSON.parse(readFileSync(new URL('./fixtures/besu-checkpoint.json',import.meta.url)));
  const prepared=prepare(checkpoint);
  writeFileSync(new URL('../../docs/evidence/gov/2026-10-21/rekor-proposal.json',import.meta.url),JSON.stringify(prepared,null,2)+'\n');
  console.log('PASS Rekor proposal prepared locally; no network request or publication');
}
