import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { verifyC2paSignature } from "../dist/tools/verify-c2pa-signature.js";

const keyModule = await import("../../../verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js");
const seed = Buffer.from("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "hex");
const privateKey = createPrivateKey({
  key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
  format: "der",
  type: "pkcs8"
});
const publicKeyHex = Buffer.from(
  createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32)
).toString("hex");
const profile = "arkhe-c2pa-claim-signature-v1";
const kid = "fixture-signer", issuer = "arkhe.test";

const claim = () => ({
  instanceID: "urn:arkhe:test", claim_generator_info: [], signature: "sha256", created_assertions: []
});

function envelope(claimValue, signerKid = kid, signerIssuer = issuer) {
  const payloadHex = keyModule.c2pa_claim_signing_payload(
    JSON.stringify(claimValue), signerKid, signerIssuer, "Ed25519"
  );
  const signatureHex = sign(null, Buffer.from(payloadHex, "hex"), privateKey).toString("hex");
  return { schema: 1, profile, claim: claimValue, signer: { kid: signerKid, issuer: signerIssuer, alg: "Ed25519" }, signature_hex: signatureHex };
}

const roots = (status = "active", key = publicKeyHex) => ({
  schema: 1, profile, roots: [{ kid, issuer, public_key_hex: key, status }]
});

test("valid Arkhe claim signature verifies without claiming C2PA or authority", async () => {
  const result = await verifyC2paSignature({ envelopeJson: JSON.stringify(envelope(claim())), trustRootsJson: JSON.stringify(roots()) });
  assert.equal(result.status, "SIGNATURE_VALID");
  assert.equal(result.signature_verified, true);
  assert.equal(result.trust_root_status, "ACTIVE");
  assert.equal(result.provenance_verification, "NOT_PERFORMED");
  assert.equal(result.c2pa_standard_validation, "NOT_PERFORMED");
  assert.equal(result.authority, false);
  assert.equal(Object.hasOwn(result, "valid"), false);
});

test("tampered claim, rogue key and revoked root cannot verify", async () => {
  const tampered = claim(); tampered.instanceID = "urn:arkhe:tampered";
  const replayed = envelope(claim());
  assert.equal((await verifyC2paSignature({
    envelopeJson: JSON.stringify({ ...replayed, claim: tampered }), trustRootsJson: JSON.stringify(roots())
  })).status, "SIGNATURE_INVALID");
  assert.equal((await verifyC2paSignature({
    envelopeJson: JSON.stringify(replayed), trustRootsJson: JSON.stringify(roots("active", "00".repeat(32)))
  })).status, "SIGNATURE_INVALID");
  assert.equal((await verifyC2paSignature({
    envelopeJson: JSON.stringify(replayed), trustRootsJson: JSON.stringify(roots("revoked"))
  })).status, "TRUST_ROOT_REJECTED");
});

test("malformed envelopes and oversized tool input are rejected", async () => {
  await assert.rejects(verifyC2paSignature({ envelopeJson: "{}", trustRootsJson: JSON.stringify(roots()) }));
  await assert.rejects(verifyC2paSignature({ envelopeJson: "{", trustRootsJson: JSON.stringify(roots()) }));
  await assert.rejects(verifyC2paSignature({
    envelopeJson: JSON.stringify(envelope(claim())), trustRootsJson: JSON.stringify(roots()), valid: true
  }));
  await assert.rejects(verifyC2paSignature({ envelopeJson: "x".repeat(65537), trustRootsJson: "{}" }));
});
