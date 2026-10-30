import { base64, unbase64 } from './client';

export type LocalSigningKey = { key: CryptoKey; publicKey: string; privatePem?: string };
function pem(label: string, bytes: ArrayBuffer) {
  return `-----BEGIN ${label}-----\n${base64(bytes).match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`;
}
export async function generateRegistrationKey(): Promise<LocalSigningKey> {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const privateBytes = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    key: await crypto.subtle.importKey('pkcs8', privateBytes, { name: 'Ed25519' }, false, ['sign']),
    publicKey: pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', pair.publicKey)),
    privatePem: pem('PRIVATE KEY', privateBytes),
  };
}
export async function importRegistrationKey(value: string): Promise<LocalSigningKey> {
  if (value.length > 2048 || !value.includes('-----BEGIN PRIVATE KEY-----')) throw new Error('Selecione uma chave Ed25519 PKCS#8 PEM válida.');
  const privateBytes = unbase64(value.replace(/-----[^-]+-----|\s/g, ''));
  const extractable = await crypto.subtle.importKey('pkcs8', privateBytes, { name: 'Ed25519' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', extractable);
  const publicKey = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: jwk.x, ext: true }, { name: 'Ed25519' }, true, ['verify']);
  return { key: await crypto.subtle.importKey('pkcs8', privateBytes, { name: 'Ed25519' }, false, ['sign']), publicKey: pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', publicKey)) };
}
export async function signPossession(key: CryptoKey, statement: string) {
  return base64(await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(statement)));
}
export function downloadPrivateKey(value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/x-pem-file' }));
  const link = document.createElement('a'); link.href = url; link.download = 'arkhe-signing-key.private.pem'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
