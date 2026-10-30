"""Execute checks, preserve logs and identify sources/artifacts. Never deploys."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
OUT = ROOT / "evidence" / ("run-" + stamp)
OUT.mkdir(parents=True)
os.chdir(ROOT)
env = dict(os.environ, PILOT_DEMO_DIR=str(OUT / "demo"))
commands = [
    ("versions-rust", ["rustc", "--version"]),
    ("versions-python", [sys.executable, "--version"]),
    ("versions-python-deps", [sys.executable, "-c", "import importlib.metadata as m, _cffi_backend, sys; print(sys.executable); [print(n, m.version(n)) for n in ('cryptography', 'cffi', 'blake3')]; print('cffi backend:', _cffi_backend.__file__)"]),
    ("format", ["cargo", "fmt", "--check"]),
    ("rust-tests", ["cargo", "test", "--locked", "--", "--nocapture"]),
    ("clippy", ["cargo", "clippy", "--locked", "--all-targets", "--", "-D", "warnings"]),
    ("build-release", ["cargo", "build", "--locked", "--release", "--bins"]),
    ("export", [str(ROOT / "target/release/export-package.exe"), str(OUT / "demo")]),
    ("verify-independent", [sys.executable, "verify_package.py", str(OUT / "demo/package.json"), "--trust", str(OUT / "demo/DEMO-TRUST-NOT-PRODUCTION.json")]),
    ("python-tests", [sys.executable, "-m", "unittest", "-v", "test_verifier"]),
    ("client-cli", [str(ROOT / "target/release/run-client.exe"), str(OUT / "demo/artifact.json"), str(OUT / "demo/DEMO-TRUST-NOT-PRODUCTION.json"), str(OUT / "client-audit.jsonl"), "camera"]),
]
if os.name != "nt":
    for _, command in commands:
        if command[0].endswith(".exe"):
            command[0] = command[0][:-4]
results = []
for name, command in commands:
    print("RUN", name, flush=True)
    result = subprocess.run(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (OUT / (name + ".log")).write_bytes(result.stdout)
    results.append({"check": name, "command": command, "exit_code": result.returncode})
    print(result.stdout.decode("utf-8", errors="replace"), flush=True)
    if result.returncode:
        (OUT / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
        raise SystemExit(f"FAILED: {name}; logs: {OUT}")

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

files = [ROOT / n for n in ["Cargo.toml", "Cargo.lock", "README.md", "verify_package.py", "test_verifier.py", "validate.py", "requirements-verifier.txt"]]
files += list((ROOT / "src").rglob("*.rs")) + list((ROOT / "tests").rglob("*.rs"))
repo = ROOT.parents[1]
for dependency in [repo / "verification/crates/arkhe-verify-core", repo / "kernel/arkhe-core"]:
    files += list((dependency / "src").rglob("*.rs")) + [dependency / "Cargo.toml"]
files += [repo / "Cargo.toml", repo / "rust-toolchain.toml"]
sources = {str(p.relative_to(repo)).replace("\\", "/"): digest(p) for p in sorted(set(files))}
(OUT / "source-hashes.json").write_text(json.dumps(sources, indent=2), encoding="utf-8")
artifacts = list((OUT / "demo").glob("*"))
artifacts += [ROOT / "target/release" / (n + (".exe" if os.name == "nt" else "")) for n in ["export-package", "run-client"]]
(OUT / "artifact-hashes.json").write_text(json.dumps({str(p.relative_to(ROOT)).replace("\\", "/"): digest(p) for p in artifacts}, indent=2), encoding="utf-8")
(OUT / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
# Counts come from the logs of this run, never from a hardcoded contract.
rust_log = (OUT / "rust-tests.log").read_text(encoding="utf-8", errors="replace")
python_log = (OUT / "python-tests.log").read_text(encoding="utf-8", errors="replace")
rust_count = sum(int(n) for n in re.findall(r"test result: ok\. (\d+) passed", rust_log))
python_runs = re.findall(r"^Ran (\d+) tests?", python_log, re.M)
if not rust_count or len(python_runs) != 1:
    raise SystemExit(f"FAILED: could not count tests; logs: {OUT}")
python_count = int(python_runs[0])
report = f"""# Aceitação local — Arkhe SuperApp Pilot

Execução: {stamp} (UTC). PASS nos comandos registrados em results.json.

- {rust_count} testes Rust: sete cenários contratuais e {rust_count - 7} regressões de segurança/codificação.
- {python_count} testes Python, incluindo 26 posições/layouts MMR gerados pelo perfil Rust e conferidos pelo verificador Python nesta execução (consistência entre duas implementações do mesmo autor, não interoperabilidade com terceiros).
- Execução WASM real; API permitida de laboratório retorna 1; API não declarada negada e gravada com sync_all.
- HTTP real em loopback: distribuição, admissão, execução e falha após encerramento do servidor.
- Pacote exportado e conferido pela implementação Python separada, sem importar o cliente Rust.
- Build release, formatação e Clippy concluídos. Logs, hashes de fontes e hashes de artefatos acompanham este relatório.

## Sete cenários

| Cenário | Teste Rust | Resultado |
|---|---|---|
| Bundle adulterado | t1 | PASS |
| Assinatura inválida | t2 | PASS |
| Checkpoint vencido, bloqueio de execução e broker | t3 | PASS |
| API não declarada, negação durável | t4 | PASS |
| Provider HTTP indisponível, sem fallback | t5 | PASS |
| Substituição e import real não admitido | t6 | PASS |
| Chaves do atacante contra confiança pinada | t7 | PASS |

## Limites

As chaves são fixtures públicas e determinísticas. O trust file é entrada externa ao pacote, mas foi gerado para a demonstração: não houve cerimônia independente de provisionamento de confiança nem auditor externo humano.
O verificador Python é uma implementação separada, criada nesta mesma execução. Valida assinaturas, bytes, inclusão MMR, política e janela temporal; não prova execução fiel ou completude do log.
Checkpoint único de laboratório, sem quorum de witnesses ou ancoragem externa. Eventos são persistidos em JSONL, append pelo aplicativo; não há proteção contra administrador do host, nem implementação de WormGraph de produção.
Sem interface gráfica: o status EVIDENCE_DEGRADED é exposto pela API e pelo CLI. Sem JS, câmera física, contatos reais ou TCC. APIs de demonstração apenas.
Sem deploy Akash contratado (a tentativa em akash/ fechou sem lances), backend de inferência remoto, ensaio de recuperação entre provedores ou medição de custo. O teste de indisponibilidade cobre o transporte HTTP local de distribuição.
Relógio do host e configuração de confiança pertencem ao host confiável. Revogação offline além do snapshot/política não é alegada.
O diretório D:/arkhe não é um repositório Git; não foi criado commit/tag. Identificação por hashes de fontes e binários, sem alegação de build reproduzível bit a bit.
"""
(OUT / "ACCEPTANCE-REPORT.md").write_text(report, encoding="utf-8")
(ROOT / "evidence/LATEST.txt").write_text(str(OUT.relative_to(ROOT)), encoding="utf-8")
print("VALIDATION_COMPLETE", OUT, flush=True)
