import hashlib
import json
from pathlib import Path
import sys
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen
sys.path.insert(0, str(Path(__file__).resolve().parent))
from catalog_server import make_server

class CatalogTests(unittest.TestCase):
    def test_distribution_is_exact_and_contains_no_trust_endpoint(self):
        root = Path(__file__).resolve().parent.parent
        prepared = root / (root / "akash/PREPARED.txt").read_text().strip()
        artifact = json.loads((prepared / "local-demo/artifact.json").read_text())
        server = make_server(artifact, "127.0.0.1", 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(base + "/artifact.json", timeout=3) as response:
                self.assertEqual(response.headers["Cache-Control"], "no-store")
                received = json.load(response)
            self.assertEqual(received, artifact)
            self.assertEqual(list(hashlib.sha256(bytes(received["bundle"])).digest()), received["manifest"]["bundle_digest"])
            with urlopen(base + "/backend/status", timeout=3) as response:
                self.assertFalse(json.load(response)["signing_authority"])
            with self.assertRaises(HTTPError) as denied:
                urlopen(base + "/trust-root.json", timeout=3)
            self.assertEqual(denied.exception.code, 404)
            denied.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

if __name__ == "__main__":
    unittest.main(verbosity=2)
