// Ed25519 signature check over the raw manifest bytes (WebCrypto).
export async function verifyManifest(manifest: Uint8Array, signature: Uint8Array, publicKey: CryptoKey): Promise<boolean> {
  try {
    return await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, signature, manifest);
  } catch {
    return false;
  }
}
