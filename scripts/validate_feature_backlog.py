"""Run local reconciliation checks with separate logs, hashes and explicit skips."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/evidence/2026-10-22-feature-backlog"


def snapshot():
    files = {}
    bases = ["kernel", "governance", "verification/crates", "evidence/arkhe-wormgraph",
             "integration/auth-md", "integration/arkhe-bugbounty", "cognition/arkhe-agent",
             "cognition/arkhe-cognition-sdk", "storage/sql/crates", "agi-coder/crates", "scripts", "config", ".github"]
    for base in bases:
        for folder, dirs, names in os.walk(ROOT / base):
            dirs[:] = [d for d in dirs if d not in {"target", "node_modules", "pkg", "__pycache__", "dist"}]
            for name in names:
                path = Path(folder) / name
                if path.suffix in {".rs", ".toml", ".py", ".yml", ".json"}:
                    files[path.relative_to(ROOT).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    for name in ["Cargo.toml", "Cargo.lock", "agi-coder/Cargo.toml", "agi-coder/Cargo.lock"]:
        files[name] = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
    return files


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    before = snapshot()
    node = os.environ.get("ARKHE_NODE", "node")
    gates = [
        ("architecture", ".", [sys.executable, "scripts/check_architecture.py"]),
        ("backlog", ".", [sys.executable, "scripts/check_feature_backlog.py"]),
        ("work-vectors", ".", [sys.executable, "scripts/generate_work_vectors.py", "--check"]),
        ("artifact-vectors", ".", [sys.executable, "verification/scripts/verify-vectors.py"]),
        ("root-format", ".", ["cargo", "fmt", "--all", "--check"]),
        ("agi-format", ".", ["cargo", "fmt", "--manifest-path", "agi-coder/Cargo.toml", "--all", "--check"]),
        ("root-clippy", ".", ["cargo", "clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"]),
        ("broker-clippy", ".", ["cargo", "clippy", "--locked", "-p", "arkhe-kernel", "--features", "sqlite-broker", "--all-targets", "--", "-D", "warnings"]),
        ("root-tests", ".", ["cargo", "test", "--workspace", "--locked"]),
        ("broker-tests", ".", ["cargo", "test", "--locked", "-p", "arkhe-kernel", "--features", "sqlite-broker", "--test", "formal_predicates", "--test", "broker_durable", "--test", "action_broker", "--test", "budget_pco"]),
        ("agi-tests", ".", ["cargo", "test", "--manifest-path", "agi-coder/Cargo.toml", "--workspace", "--locked"]),
        ("agi-clippy", ".", ["cargo", "clippy", "--manifest-path", "agi-coder/Cargo.toml", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"]),
        ("wasm-build", ".", [sys.executable, "scripts/build_verifier.py"]),
        ("adapter-build", ".", [node, "integrations/verify-mcp/node_modules/typescript/bin/tsc", "-p", "integrations/verify-mcp/tsconfig.json"]),
        ("adapter-tests", "integrations/verify-mcp", [node, "--test"]),
        ("agi-sdk-tests", "agi-coder/packages/sdk-ts", [node, "--test"]),
        ("sigstore-tests", "integrations/cosign", [node, "--test"]),
    ]
    results = []
    for name, cwd, command in gates:
        print("RUN " + name, flush=True)
        start = time.monotonic()
        try:
            result = subprocess.run(command, cwd=ROOT / cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            output = result.stdout + result.stderr
            code = result.returncode
        except OSError as error:
            output, code = str(error), 127
        path = OUT / (name + ".log")
        path.write_text(output, encoding="utf-8", newline="\n")
        counts = re.findall(r"test result: ok\. (\d+) passed; \d+ failed; (\d+) ignored", output)
        entry = dict(gate=name, command=command, cwd=cwd, exit_code=code, status="PASS" if code == 0 else "FAIL",
                     duration_seconds=round(time.monotonic() - start, 3), log=path.name,
                     log_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                     rust_passed=sum(int(p) for p, _ in counts), rust_ignored=sum(int(i) for _, i in counts))
        results.append(entry)
        print(entry["status"] + " " + name, flush=True)
        if code:
            print("\n".join(output.splitlines()[-30:]), flush=True)
        (OUT / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    after = snapshot()
    (OUT / "inputs.json").write_text(json.dumps(before, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    unchanged = before == after
    lines = ["# Validação local da reconciliação", "", "Data de escopo: 22/10/2026; término UTC: " + datetime.datetime.now(datetime.timezone.utc).isoformat(), "",
             "Sem CI remoto, PostgreSQL real, GPU/TEE, sandbox nativo qualificado, Jules live ou pagamento real. Testes AP2 qualificam a ponte autenticada com role sintético, não um SDK AP2 externo.", "",
             f"Fontes Rust/config/scripts permaneceram iguais durante a execução: {unchanged}. Hashes em inputs.json e logs por gate em results.json.", "",
             "| Gate | Estado | Exit | Rust passed | Rust ignored | Log |", "|---|---|---|---|---|---|"]
    lines += [f"| {r['gate']} | {r['status']} | {r['exit_code']} | {r['rust_passed']} | {r['rust_ignored']} | [{r['log']}]({r['log']}) |" for r in results]
    (OUT / "RESULTS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    if not unchanged or any(r["exit_code"] for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
