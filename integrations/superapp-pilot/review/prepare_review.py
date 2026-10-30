"""Assemble existing evidence and reproduce HTTP failure without changing the pilot."""
import datetime
import hashlib
import http.server
import json
from pathlib import Path
import subprocess
import sys
import threading
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
RUN = ROOT / (ROOT / "evidence/LATEST.txt").read_text().strip()
STAMP = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
OUT = ROOT / "review" / ("run-" + STAMP)
OUT.mkdir()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def command(label, args):
    result = subprocess.run([str(x) for x in args], cwd=ROOT, capture_output=True, text=True)
    body = "COMMAND_JSON: " + json.dumps([str(x) for x in args]) + "\nEXIT_CODE: " + str(result.returncode) + "\nSTDOUT:\n" + result.stdout + "\nSTDERR:\n" + result.stderr
    (OUT / (label + ".log")).write_text(body, encoding="utf-8")
    print(label, "exit=", result.returncode, flush=True)
    return result

# Verify existing snapshots rather than treating the written report as proof.
checks = []
for manifest, base in [(RUN / "source-hashes.json", REPO), (RUN / "artifact-hashes.json", ROOT)]:
    for name, expected in json.loads(manifest.read_text()).items():
        actual = sha(base / name)
        checks.append({"path": name, "expected": expected, "actual": actual, "match": actual == expected})
(OUT / "hash-checks.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
if not all(c["match"] for c in checks):
    raise SystemExit("Snapshot mismatch; inspect hash-checks.json")

package = json.loads((RUN / "demo/package.json").read_text())
historical = command("historical-verification", [sys.executable, "verify_package.py", RUN / "demo/package.json", "--trust", RUN / "demo/DEMO-TRUST-NOT-PRODUCTION.json", "--historical-at", package["evaluated_at"]])
if historical.returncode:
    raise SystemExit("historical verification failed")

fresh = OUT / "fresh-demo"
export = command("fresh-export", [ROOT / "target/release/export-package.exe", fresh])
if export.returncode:
    raise SystemExit("fresh export failed")
artifact = (fresh / "artifact.json").read_bytes()

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(artifact)))
        self.end_headers()
        self.wfile.write(artifact)
    def log_message(self, fmt, *args):
        pass

server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
url = f"http://127.0.0.1:{server.server_port}/artifact.json"
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
args = [ROOT / "target/release/run-client.exe", url, fresh / "DEMO-TRUST-NOT-PRODUCTION.json", OUT / "http-audit.jsonl", "camera"]
try:
    online = command("http-online", args)
finally:
    server.shutdown()
    server.server_close()
    thread.join()
before = sha(OUT / "http-audit.jsonl") if (OUT / "http-audit.jsonl").exists() else None
offline = command("http-offline", args)
after = sha(OUT / "http-audit.jsonl") if (OUT / "http-audit.jsonl").exists() else None
assert online.returncode == 0 and "WASM_EXECUTED result=1" in online.stdout
assert offline.returncode != 0 and "no fallback" in offline.stderr
assert "WASM_EXECUTED" not in offline.stdout and before == after
(OUT / "http-result.json").write_text(json.dumps({"url": url, "online_exit": online.returncode, "offline_exit": offline.returncode, "audit_unchanged_after_failure": before == after, "scope": "local HTTP distribution; not remote compute or Akash"}, indent=2), encoding="utf-8")

guide = f"""# Material para revisão interna

Snapshot original: {RUN.name}. Complemento: {OUT.name}.

Os logs originais e o trust file já existiam no workspace; agora estão reunidos
no ZIP, com fontes e binários Windows. Não há PR aberto nem commit/tag.

- original-run/results.json: comandos e códigos de saída originais.
- original-run/rust-tests.log e python-tests.log: 12 e 13 testes, respectivamente.
- original-run/demo/: pacote, trust DEMO, audit JSONL e 26 pacotes MMR.
- original-run/verify-independent.log: verificação atual realizada naquela execução.
- supplement/historical-verification.log: nova conferência no instante histórico explícito.
- supplement/hash-checks.json: conferência dos hashes originais contra arquivos atuais.
- supplement/http-online.log e http-offline.log: comando exato, stdout, stderr e códigos de saída da reprodução HTTP.
- supplement/http-result.json: servidor encerrado, falha de conexão e log sem nova execução.
- docs/SCHEMA-v1.md: schema e mensagens assinadas.
- sources/: arquivos identificados pelo manifesto de hashes original, preservando caminhos.
- bin/: executáveis Windows release identificados pelo manifesto original.

Reprodução histórica, na raiz do ZIP após extrair:

```powershell
python sources/integrations/superapp-pilot/verify_package.py original-run/demo/package.json --trust original-run/demo/DEMO-TRUST-NOT-PRODUCTION.json --historical-at {package['evaluated_at']}
```

Instale as dependências Python listadas em sources/integrations/superapp-pilot/requirements-verifier.txt.
O snapshot de fontes inclui apenas o piloto e seus crates locais necessários,
não todos os membros do monorepo. Para rebuild Cargo com o manifesto raiz
original, aplique o snapshot em um checkout completo do Arkhe correspondente.
Os executáveis Windows e o verificador Python podem ser conferidos diretamente.

Os hashes de transporte detectam alteração de arquivos, não autenticam a origem:
o próprio inventário precisa de canal confiável. Chaves DEMO são públicas e
determinísticas. Não houve cerimônia independente de confiança, auditor externo
humano, deploy Akash, TCC ou comprovação de execução fiel. O estado permanece
validação interna executada, disponível para revisão externa.
"""
(OUT / "REVIEW.md").write_text(guide, encoding="utf-8")
archive = ROOT / "review" / ("arkhe-superapp-review-" + STAMP + ".zip")
entries = {}
for file in RUN.rglob("*"):
    if file.is_file(): entries["original-run/" + file.relative_to(RUN).as_posix()] = file
for file in OUT.rglob("*"):
    if file.is_file(): entries["supplement/" + file.relative_to(OUT).as_posix()] = file
for name in json.loads((RUN / "source-hashes.json").read_text()):
    entries["sources/" + name] = REPO / name
for name in ["export-package.exe", "run-client.exe"]:
    entries["bin/" + name] = ROOT / "target/release" / name
entries["docs/SCHEMA-v1.md"] = ROOT / "review/SCHEMA-v1.md"
entries["docs/prepare_review.py"] = Path(__file__)
entries["REVIEW.md"] = OUT / "REVIEW.md"
inventory = {name: sha(path) for name, path in sorted(entries.items())}
with zipfile.ZipFile(archive, "x", zipfile.ZIP_DEFLATED) as z:
    for name, path in sorted(entries.items()): z.write(path, name)
    z.writestr("SHA256SUMS.json", json.dumps(inventory, indent=2))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for name, expected in inventory.items():
        assert hashlib.sha256(z.read(name)).hexdigest() == expected
(archive.with_suffix(".zip.sha256")).write_text(sha(archive) + "  " + archive.name + "\n", encoding="ascii")
print("REVIEW_ARCHIVE", archive)
print("SHA256", sha(archive))
print("VERIFIED_FILES", len(inventory))
