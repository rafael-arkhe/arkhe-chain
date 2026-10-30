import { z } from "zod";
import { loadVerifier } from "../utils/wasm.js";

export const VerifyArtifactInput = z.object({
  kind: z.enum(["blake3", "gguf", "c2pa"]),
  payloadHex: z.string().regex(/^(?:[a-fA-F0-9]{2})*$/).optional(),
  json: z.string().optional()
});

export async function verifyArtifact(input: unknown) {
  const args = VerifyArtifactInput.parse(input);
  const wasm = await loadVerifier();

  switch (args.kind) {
    case "blake3": {
      if (args.payloadHex === undefined) throw new Error("payloadHex required");
      const bytes = Uint8Array.from(Buffer.from(args.payloadHex, "hex"));
      return { valid: true, digestHex: wasm.blake3_hex(bytes) };
    }
    case "gguf": {
      if (args.json === undefined) throw new Error("json required");
      return { valid: true, canonicalCborHex: wasm.canonicalize_gguf_json(args.json) };
    }
    case "c2pa": {
      if (args.json === undefined) throw new Error("json required");
      return { valid: true, canonicalCborHex: wasm.canonicalize_c2pa_json(args.json) };
    }
  }
}
