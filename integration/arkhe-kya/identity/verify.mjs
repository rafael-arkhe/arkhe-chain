import { verifyIcpSignature, checkRevocation } from '@kya-brasil/core';
import { createRequire } from 'node:module';

const fail = reason => { throw new Error(reason); };
function fields(value,names) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==names.length ||
    !names.every(name=>Object.hasOwn(value,name))) fail('INPUT_FIELDS_INVALID');
}
function decode(value,max) {
  if(typeof value!=='string' || value.length>Math.ceil(max/3)*4) fail('EVIDENCE_SIZE_OR_ENCODING_INVALID');
  const bytes=Buffer.from(value,'base64');
  if(bytes.length>max || bytes.toString('base64')!==value) fail('EVIDENCE_SIZE_OR_ENCODING_INVALID');
  return bytes;
}

/** Offline synthetic test-PKI adapter. No fetch; no caller-controlled Checked flag. */
export async function verifySyntheticPrincipal(receiptJson,contextJson,evidence,trust) {
  let stage='INPUT';
  const negative=(reason,revocation='NOT_CHECKED')=>({outcome:'NOT_VERIFIABLE',profile:'arkhe-kya-principal-synthetic@1',
    label:'synthetic-poc',principal_legal_identity:'NOT_VERIFIED',certificate_revocation:revocation,
    registration_status:'NOT_CHECKED',reason,authorization_granted:false});
  try {
    fields(evidence,['cms_base64','crl_base64']);
    fields(trust,['trust_profile','anchors','expected_cnpj','now','max_crl_age_seconds']);
    if(trust.trust_profile!=='synthetic-test-pki@1' || !Array.isArray(trust.anchors) || trust.anchors.length<1 || trust.anchors.length>8 ||
      trust.anchors.some(a=>typeof a!=='string'||a.length===0||a.length>16384) || !/^[0-9]{14}$/.test(trust.expected_cnpj) ||
      !Number.isSafeInteger(trust.now)||trust.now<0||trust.now>8640000000000 ||
      !Number.isSafeInteger(trust.max_crl_age_seconds)||trust.max_crl_age_seconds<1||trust.max_crl_age_seconds>86400) fail('TRUST_POLICY_INVALID');
    if(typeof receiptJson!=='string'||Buffer.byteLength(receiptJson)>32768||typeof contextJson!=='string'||Buffer.byteLength(contextJson)>4096) fail('RECEIPT_CONTEXT_INVALID');
    const wasm=createRequire(import.meta.url)('../pkg/arkhe_kya_experimental.js');
    const prepared=JSON.parse(wasm.principal_authorization_challenge(receiptJson,contextJson));
    if(prepared.outcome!=='CHALLENGE_READY') fail('RECEIPT_CONTEXT_INVALID');
    if(JSON.parse(contextJson).now!==trust.now) fail('CLOCK_POLICY_MISMATCH');
    decode(evidence.cms_base64,512*1024);
    stage='CMS';
    // The application always requires a chain. No requireChain:false escape hatch.
    const proof=await verifyIcpSignature({cmsBase64:evidence.cms_base64,challenge:prepared.challenge,
      expectedCnpj:trust.expected_cnpj,anchors:trust.anchors,now:new Date(trust.now*1000),requireChain:true});
    const before=Date.parse(proof.not_before),after=Date.parse(proof.not_after);
    if(!Number.isFinite(before)||!Number.isFinite(after)||trust.now*1000<before||trust.now*1000>=after) fail('CERTIFICATE_TIME_INVALID');
    if(!proof.issuer_certificate) fail('ISSUER_CERTIFICATE_UNAVAILABLE');
    if(evidence.crl_base64===null) return negative('CRL_UNAVAILABLE');
    const der=decode(evidence.crl_base64,1024*1024);
    stage='CRL';
    const revocation=await checkRevocation({crlDer:der,serial:proof.serial_number,
      issuerCertificate:proof.issuer_certificate,now:new Date(trust.now*1000)});
    const start=Date.parse(revocation.crl_this_update),end=Date.parse(revocation.crl_next_update);
    if(!revocation.crl_next_update || !Number.isFinite(start)||!Number.isFinite(end)||
      start>trust.now*1000||trust.now*1000>=end||end<=start||(trust.now*1000-start)>trust.max_crl_age_seconds*1000) fail('CRL_TIME_INVALID');
    if(revocation.revoked) return negative('CERTIFICATE_REVOKED','REVOKED');
    return {outcome:'SYNTHETIC_CMS_CHAIN_AND_CRL_PASSED',profile:'arkhe-kya-principal-synthetic@1',label:'synthetic-poc',
      principal_legal_identity:'NOT_VERIFIED',certificate_revocation:'CHECKED_NOT_REVOKED',registration_status:'NOT_CHECKED',
      certificate_sha256:proof.certificate_sha256,evaluated_at:trust.now,
      crl_this_update:revocation.crl_this_update,crl_next_update:revocation.crl_next_update,
      receipt_challenge:prepared.challenge,authorization_granted:false,
      warning:'Throwaway test CA, not authenticated ICP-Brasil anchors. No legal identity, Receita check, runtime attestation, production VERIFIED or authorization grant. CMS signed_at from this API is evaluation time, not an authenticated signing timestamp.'};
  } catch(error) {
    const own=new Set(['INPUT_FIELDS_INVALID','EVIDENCE_SIZE_OR_ENCODING_INVALID','TRUST_POLICY_INVALID','RECEIPT_CONTEXT_INVALID',
      'CLOCK_POLICY_MISMATCH','CERTIFICATE_TIME_INVALID','ISSUER_CERTIFICATE_UNAVAILABLE','CRL_TIME_INVALID']);
    return negative(own.has(error.message)?error.message:stage==='CMS'?'CMS_SIGNATURE_CHAIN_OR_SUBJECT_INVALID':stage==='CRL'?'CRL_INVALID_OR_UNAVAILABLE':'INPUT_INVALID');
  }
}
