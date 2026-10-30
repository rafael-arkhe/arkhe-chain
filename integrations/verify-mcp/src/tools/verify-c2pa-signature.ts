import { z } from "zod";
import { loadVerifier } from "../utils/wasm.js";

export const VerifyC2paSignatureInput = z.object({
  envelopeJson: z.string().min(2).max(65536),
  trustRootsJson: z.string().min(2).max(65536)
}).strict();

/** Arkhe Ed25519 claim-signature profile; not standard C2PA/COSE validation. */
export async function verifyC2paSignature(input: unknown) {
  const args = VerifyC2paSignatureInput.parse(input);
  const wasm = await loadVerifier();
  return JSON.parse(wasm.verify_c2pa_claim_signature(args.envelopeJson, args.trustRootsJson));
}
