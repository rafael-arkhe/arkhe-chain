// Bounded rebroadcast: one immutable signed transaction, never a replacement.
import {performance} from 'node:perf_hooks';
import {sha256} from './e01_solana_transport.mjs';

export async function deliver({tx,attempt,protocol,call,persist,validateReceipt,
  now=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}) {
  const maxSends=protocol.max_broadcasts_per_transaction;
  if (!Number.isInteger(maxSends)||maxSends<1||maxSends>4
    || !Number.isSafeInteger(attempt.last_valid_block_height)
    || !Number.isInteger(protocol.rebroadcast_interval_ms)||protocol.rebroadcast_interval_ms<1
    || !Number.isInteger(protocol.finalization_timeout_ms)||protocol.finalization_timeout_ms<1
    || !Number.isInteger(protocol.poll_interval_ms)||protocol.poll_interval_ms<1) throw new Error('invalid delivery protocol');
  const wire=tx.bytes.toString('base64'), signature=tx.signature, start=now();
  const delivery={wire_sha256:sha256(tx.bytes),sends:[],observations:[],rpc_errors:[],replacement_transactions:0};
  attempt.delivery=delivery;
  let lastSend=-Infinity;
  async function reconcile() {
    const height=await call('getBlockHeight',[{commitment:'finalized'}]);
    if(!Number.isSafeInteger(height)||height<0)throw new Error('invalid finalized block height');
    const response=await call('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]);
    if(!Array.isArray(response?.value)||response.value.length!==1)throw new Error('invalid signature status response');
    const status=response.value[0];
    if(status!==null && (typeof status!=='object' || !Object.hasOwn(status,'err')))throw new Error('malformed signature status');
    const receipt=await call('getTransaction',[signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);
    const observation={elapsed_ms:now()-start,height,status,receipt_present:receipt!==null};
    delivery.observations.push(observation);await persist();
    return {height,status,receipt};
  }
  function finalized(receipt) {
    attempt.receipt=receipt;attempt.verified=validateReceipt(receipt);
    attempt.finalization_ms=now()-start;attempt.status='FINALIZED_MATCHED';
  }
  async function inspect(snapshot) {
    if(snapshot.receipt!==null) {finalized(snapshot.receipt);await persist();return true;}
    if(snapshot.status?.err!==null && snapshot.status?.err!==undefined) {
      attempt.status='CHAIN_REJECTED';await persist();throw new Error('transaction rejected on chain');
    }
    if(snapshot.height>attempt.last_valid_block_height && snapshot.status===null) {
      attempt.status='EXPIRED_UNOBSERVED';await persist();throw new Error('blockhash expired; no inclusion observed; no replacement signed');
    }
    return false;
  }
  while(now()-start<protocol.finalization_timeout_ms) {
    let snapshot;
    try {snapshot=await reconcile();}
    catch(error) {
      delivery.rpc_errors.push({elapsed_ms:now()-start,message:error.message});await persist();
      await sleep(protocol.poll_interval_ms);continue; // failed reads never authorize a send
    }
    if(await inspect(snapshot))return;
    if(snapshot.status===null && snapshot.height<=attempt.last_valid_block_height
      && delivery.sends.length<maxSends && now()-lastSend>=protocol.rebroadcast_interval_ms
      && now()-start<protocol.finalization_timeout_ms) {
      const send={index:delivery.sends.length,elapsed_ms:now()-start,status:'PENDING',wire_sha256:delivery.wire_sha256};
      delivery.sends.push(send);attempt.status='SUBMISSION_PENDING';await persist();
      lastSend=now();
      let returned;
      try {returned=await call('sendTransaction',[wire,{encoding:'base64',skipPreflight:false,maxRetries:0,preflightCommitment:'finalized'}]);}
      catch(error) {send.status='UNKNOWN';send.error=error.message;await persist();}
      if(returned!==undefined) {
        if(returned!==signature) {send.status='SIGNATURE_MISMATCH';await persist();throw new Error('unexpected returned signature');}
        send.status='ACKNOWLEDGED';attempt.status='SUBMITTED';await persist();
      }
    }
    await sleep(protocol.poll_interval_ms);
  }
  // A deadline stops transmission, but does not itself prove transaction failure.
  let finalSnapshot;
  try {finalSnapshot=await reconcile();}
  catch(error) {delivery.rpc_errors.push({phase:'final-reconciliation',message:error.message});}
  if(finalSnapshot && await inspect(finalSnapshot))return;
  attempt.status='DEADLINE_UNRESOLVED';await persist();
  throw new Error('delivery deadline; signature remains unresolved; no replacement signed');
}
