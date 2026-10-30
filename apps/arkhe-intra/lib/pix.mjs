import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { root } from './paths.mjs';
import { demand } from './documents.mjs';
import { appendEvent } from './store.mjs';
const require=createRequire(import.meta.url);
export const pixEnabled=()=>process.env.ARKHE_PIX_RECEIPTS==='1';
export function pixPolicy(user) {
 demand(user?.id,401,'Entre com sua conta para continuar.');
 demand(pixEnabled(),404,'Módulo de recibos Pix desativado.');
 const key=process.env.ARKHE_PIX_SIGNER_PUBLIC_HEX || '';
 return {enabled:true,profile:'arkhe-pix-receipt@1',label:'synthetic-poc',signerConfigured:/^[a-f0-9]{64}$/.test(key),
  requireSettlement:process.env.ARKHE_PIX_REQUIRE_SETTLEMENT!=='0',storage:'not-stored',organizationScope:'single-installation',
  tenantIsolation:'NOT_IMPLEMENTED',onboardingEligible:false};
}
export function evaluatePixReceipt(user,input) {
 const policy=pixPolicy(user);
 demand(input && typeof input==='object' && !Array.isArray(input) && Object.keys(input).length===1 && typeof input.receipt==='string',400,'Envie somente receipt como texto JSON.');
 demand(Buffer.byteLength(input.receipt)<=32768,413,'Recibo excede 32 KiB.');
 demand(policy.signerConfigured,503,'Chave pública do operador não configurada.');
 let wasm;
 try {wasm=require(resolve(root,'apps/arkhe-intra/lib/pix-runtime/arkhe_pix_wasm.cjs'));}
 catch {demand(false,503,'Motor Pix WASM indisponível nesta instalação.');}
 const verification=JSON.parse(wasm.verify_receipt_json(input.receipt,process.env.ARKHE_PIX_SIGNER_PUBLIC_HEX));
 const signatureValid=verification.verdict==='signature_valid_synthetic';
 const decision=!signatureValid?'REJECT':policy.requireSettlement?'REJECT_SETTLEMENT_UNVERIFIED':'ACCEPT_SYNTHETIC_ONLY';
 // No receipt, parties, identifiers or raw error text are retained in the audit event.
 appendEvent(user.id,'pix-receipt-evaluated',null,{profile:policy.profile,decision,
  ...(signatureValid?{receiptDigest:verification.receipt_digest}:{})});
 return {verification,decision,onboardingEligible:false,paymentConfirmed:false,storage:'not-stored',
  warning:'Assinatura sintética não confirma liquidação, identidade ou autorização KYA.'};
}
