import { z } from "zod";
import { loadVerifier } from "../utils/wasm.js";

export const VerifyMmrInput = z.object({
  leafHex: z.string().max(131072).regex(/^(?:[a-fA-F0-9]{2})*$/),
  leafCount: z.number().int().min(1).max(0xffffffff),
  expectedRootHex: z.string().regex(/^[a-fA-F0-9]{64}$/),
  proof: z.array(z.object({
    kind: z.enum(["node", "bag"]),
    direction: z.enum(["left", "right"]),
    hashHex: z.string().regex(/^[a-fA-F0-9]{64}$/)
  }).strict()).max(64)
}).strict();

function matchesShape(leafCount: number, proof: z.infer<typeof VerifyMmrInput>["proof"]): boolean {
  const widths: number[] = [];
  for (let remaining = leafCount; remaining > 0;) {
    const width = 2 ** Math.floor(Math.log2(remaining));
    widths.push(width); remaining -= width;
  }
  // A path has nodes within its perfect peak, optionally the bagged peaks on
  // its right, then one left-bag step per preceding peak. No index is asserted.
  return widths.some((width, peak) => {
    const nodes = Math.log2(width), right = peak < widths.length - 1 ? 1 : 0;
    if (proof.length !== nodes + right + peak) return false;
    if (proof.slice(0, nodes).some(step => step.kind !== "node")) return false;
    if (right && (proof[nodes].kind !== "bag" || proof[nodes].direction !== "right")) return false;
    return proof.slice(nodes + right).every(step => step.kind === "bag" && step.direction === "left");
  });
}

/** Inclusion relative to a caller-supplied root; no trust or authorization grant. */
export async function verifyMmr(input: unknown) {
  const args = VerifyMmrInput.parse(input);
  const wasm = await loadVerifier();
  const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
  const proof = args.proof.map(step => ({
    kind: step.kind, direction: step.direction, hash: Array.from(bytes(step.hashHex))
  }));
  const proofShapeValid = matchesShape(args.leafCount, args.proof);
  const inclusionVerified = proofShapeValid && wasm.verify_mmr(bytes(args.leafHex), args.leafCount,
    JSON.stringify(proof), bytes(args.expectedRootHex));
  return {
    schema: "arkhe-mmr-inclusion-result/v1",
    status: inclusionVerified ? "PROOF_VALID" : "PROOF_INVALID",
    inclusionVerified,
    proofShapeValid,
    expectedRootHex: args.expectedRootHex.toLowerCase(),
    leafCount: args.leafCount,
    checkpointAuthentication: "NOT_PERFORMED",
    provenanceVerification: "NOT_PERFORMED",
    policyAuthorization: "NOT_PERFORMED",
    authority: false
  } as const;
}
