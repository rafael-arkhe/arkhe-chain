import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { verifyArtifact, VerifyArtifactInput } from "./tools/verify-artifact.js";

const server = new McpServer({ name: "arkhe-verify", version: "0.1.0" });

server.tool(
  "verify_artifact",
  "Verify an artifact locally using the Arkhe WASM verifier",
  VerifyArtifactInput.shape,
  async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await verifyArtifact(args)) }]
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
