import http from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Operational health/metrics only: this scaffold exposes no MCP authorization tools.
export function createHealthServer() {
  let requests = 0;
  return http.createServer((req, res) => {
    requests++;
    if (req.method !== "GET") {
      res.writeHead(405, { "content-type": "application/json", allow: "GET" });
      res.end(JSON.stringify({ error: "method_not_allowed" }));
    } else if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "arkhe-agi-mcp", authority: "none" }));
    } else if (req.url === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      res.end("# HELP arkhe_mcp_http_requests_total Health scaffold HTTP requests.\n# TYPE arkhe_mcp_http_requests_total counter\narkhe_mcp_http_requests_total " + requests + "\n");
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MCP_PORT || 8787);
  createHealthServer().listen(port, "0.0.0.0", () => console.log(`arkhe-agi-mcp health scaffold listening on ${port}`));
}
