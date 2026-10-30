import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { verifyArtifact, VerifyArtifactInput } from "./tools/verify-artifact.js";
import { verifyMmr, VerifyMmrInput } from "./tools/verify-mmr.js";
import { verifyC2paSignature, VerifyC2paSignatureInput } from "./tools/verify-c2pa-signature.js";

const server = new McpServer({ name: "arkhe-verify", version: "0.2.0" });

server.tool(
  "verify_artifact",
  "Compute a BLAKE3 digest or canonicalize GGUF metadata/C2PA claim JSON using WASM. Does not verify signatures, provenance or authorization.",
  VerifyArtifactInput.shape,
  async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await verifyArtifact(args)) }]
  })
);

server.tool(
  "verify_mmr",
  "Verify Arkhe MMR v1 inclusion against an expected root supplied by the caller. Does not authenticate the checkpoint, establish provenance or authorize execution.",
  VerifyMmrInput.shape,
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(await verifyMmr(args)) }] })
);

server.tool(
  "verify_c2pa_claim_signature",
  "Verify an Arkhe Ed25519 C2PA claim-signature envelope against caller-supplied pinned trust roots. Does not perform standard C2PA/COSE validation, prove trust-root provenance, authenticate the signer or authorize execution.",
  VerifyC2paSignatureInput.shape,
  async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await verifyC2paSignature(args)) }]
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
