const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const pemBytes = pem => decode(pem.replace(/-----[^-]+-----|\s/g, ''));
const encode = value => new TextEncoder().encode(value);
export async function verifyBundle(bundle, trust, wasm) {
  if (bundle?.format !== 'arkhe-intra/evidence/v1' || !bundle.document || !Array.isArray(bundle.document.signatures)) throw new Error('Formato de evidência desconhecido.');
  const doc = bundle.document;
  const content = JSON.stringify({ domain: 'arkhe-intra/document/v1', id: doc.id, revision: doc.revision, title: doc.title, department: doc.department, body: doc.body, authorId: doc.authorId });
  const integrity = wasm.blake3_hex(encode(content)) === doc.digest;
  const signatures = [];
  const expectedActions = ['submit', 'review', 'approve'];
  const previousStates = ['draft', 'review', 'reviewed'];
  const expectedRoles = ['author', 'reviewer', 'owner'];
  const actors = new Set();
  for (const [index, signature] of doc.signatures.entries()) {
    let valid = false;
    const trusted = trust?.accounts?.find(account => account.id === signature.actorId && account.publicKey === signature.publicKey);
    const expected = JSON.stringify({ domain: 'arkhe-intra/transition/v1', documentId: doc.id, revision: doc.revision, digest: doc.digest, previousState: previousStates[index], action: expectedActions[index], actorId: signature.actorId });
    try {
      const key = await crypto.subtle.importKey('spki', pemBytes(signature.publicKey), { name: 'Ed25519' }, false, ['verify']);
      valid = index < 3 && !actors.has(signature.actorId) && (index !== 0 || signature.actorId === doc.authorId) && expected === signature.statement && await crypto.subtle.verify('Ed25519', key, decode(signature.signature), encode(expected));
    } catch { valid = false; }
    actors.add(signature.actorId);
    signatures.push({ actorId: signature.actorId, action: signature.action, valid: valid && signature.action === expectedActions[index], keyStatus: trusted?.status || (trusted ? 'snapshot-active' : 'unknown'), trusted: Boolean(trusted && trusted.publicKey === signature.publicKey && trusted.role === expectedRoles[index] && (!trusted.status || trusted.status === 'active')) });
  }
  const expectedCount = { draft: 0, review: 1, reviewed: 2, approved: 3, anchoring: 3, published: 3 }[doc.state];
  const validState = expectedCount !== undefined && expectedCount === signatures.length;
  const invalid = !integrity || !validState || signatures.some(sig => !sig.valid);
  const signatureVerdict = signatures.length === 0 ? 'INCONCLUSIVE' : signatures.some(sig => !sig.valid) ? 'FAIL' : signatures.some(sig => !sig.trusted) ? 'INCONCLUSIVE' : 'PASS';
  return { verdict: invalid ? 'FAIL' : 'INCONCLUSIVE', integrity: integrity ? 'PASS' : 'FAIL', state: validState ? 'PASS' : 'FAIL', signatures: signatureVerdict, details: signatures, digest: doc.digest, title: doc.title, checkedAt: new Date().toISOString(), anchor: 'INCONCLUSIVE', scope: 'BLAKE3 e Ed25519 conferidos localmente. Recibo Rekor e checkpoint não são verificados por este verificador offline. PASS de assinatura exige arquivo de confiança obtido por canal independente.' };
}
