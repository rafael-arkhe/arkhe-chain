"""Public fixture distribution only. No signing keys, managed-wallet key or trust file."""
import hashlib
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


def make_server(artifact, host="0.0.0.0", port=8080):
    artifact_bytes = json.dumps(artifact, separators=(",", ":")).encode()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path == "/artifact.json":
                data = artifact
            elif path == "/catalog.json":
                data = {"version": 1, "demo_only": True, "programs": [{"name": "arkhe-superapp-pilot", "artifact": "/artifact.json", "bundle_sha256": bytes(artifact["manifest"]["bundle_digest"]).hex(), "checkpoint_epoch": artifact["checkpoint"]["epoch"], "trust": "must be provisioned independently"}]}
            elif path in ("/health", "/backend/status"):
                data = {"ready": True, "role": "untrusted-distribution", "signing_authority": False, "artifact_sha256": hashlib.sha256(artifact_bytes).hexdigest(), "checkpoint_epoch": artifact["checkpoint"]["epoch"], "now": int(time.time())}
            elif path == "/":
                data = {"service": "Arkhe pilot public fixture catalog", "routes": ["/health", "/catalog.json", "/artifact.json", "/backend/status"], "demo_only": True}
            else:
                self.send_error(404)
                return
            body = json.dumps(data, separators=(",", ":")).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            # Paths contain no credentials, but avoid echoing arbitrary user input.
            print("catalog request completed", flush=True)

    return HTTPServer((host, port), Handler)


if __name__ == "__main__":
    import base64
    payload = json.loads(base64.b64decode(os.environ["ARKHE_PUBLIC_ARTIFACT_B64"]))
    print("Arkhe demo catalog: no signing authority", flush=True)
    make_server(payload).serve_forever()
