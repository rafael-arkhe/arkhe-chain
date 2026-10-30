import { z } from "zod";
import { loadVerifier } from "../utils/wasm.js";

export const VerifyArtifactInput = z.object({
  kind: z.enum(["blake3", "gguf", "c2pa"]),
  payloadHex: z.string().max(131072).regex(/^(?:[a-fA-F0-9]{2})*$/).optional(),
  json: z.string().refine(value => Buffer.byteLength(value, "utf8") <= 65536, "JSON exceeds 64 KiB").optional()
}).strict();

const scope = {
  schema: "arkhe-artifact-operation/v2",
  verification: "NOT_PERFORMED",
  authority: false,
  signatureVerification: "NOT_PERFORMED",
  provenanceVerification: "NOT_PERFORMED",
  policyAuthorization: "NOT_PERFORMED"
} as const;

export async function verifyArtifact(input: unknown) {
  const args = VerifyArtifactInput.parse(input);
  const wasm = await loadVerifier();

  switch (args.kind) {
    case "blake3": {
      if (args.payloadHex === undefined) throw new Error("payloadHex required");
      const bytes = Uint8Array.from(Buffer.from(args.payloadHex, "hex"));
      return { ...scope, operation: "BLAKE3_DIGEST", status: "DIGEST_COMPUTED", digestHex: wasm.blake3_hex(bytes) };
    }
    case "gguf": {
      if (args.json === undefined) throw new Error("json required");
      return { ...scope, operation: "GGUF_METADATA_CANONICALIZATION", status: "CANONICALIZED", canonicalCborHex: wasm.canonicalize_gguf_json(args.json) };
    }
    case "c2pa": {
      if (args.json === undefined) throw new Error("json required");
      return { ...scope, operation: "C2PA_CLAIM_CANONICALIZATION", status: "CANONICALIZED", canonicalCborHex: wasm.canonicalize_c2pa_json(args.json) };
    }
  }
}
