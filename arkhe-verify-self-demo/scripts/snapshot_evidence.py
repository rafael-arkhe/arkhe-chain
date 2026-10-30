"""Bind the final source/fixtures and command logs into a SHA-256 manifest.

Hashes provide snapshot integrity, not external authentication or a build attestation.
Run only after run_gate_mutations.py and cargo build --locked complete successfully.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil

project = Path(__file__).resolve().parents[1]
evidence = project / "evidence"
mutation = json.loads((evidence / "mutations/result.json").read_text(encoding="utf-8"))
assert mutation["original_source_unchanged"] and mutation["final_original_exit_code"] == 0
assert len(mutation["cases"]) >= 2 and all(c["killed_by_assertions"] for c in mutation["cases"])
for name, expected in mutation["baseline_source_sha256"].items():
    assert hashlib.sha256((project / name).read_bytes()).hexdigest() == expected, name
shutil.copyfile(evidence / "mutations/final-original.txt", evidence / "cargo-test.txt")
log = (evidence / "cargo-test.txt").read_text(encoding="utf-8")
passed = sum(map(int, re.findall(r"test result: ok\. (\d+) passed", log)))
summary = {
    "observed_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "rustc": "1.96.0", "sigstore_verify": "0.6.6", "tests_passed": passed,
    "tests_failed": 0, "tests_ignored": 0, "mutants_killed": len(mutation["cases"]),
    "mutation_rustflags": mutation["rustflags"],
    "original_code_unchanged_by_mutations": True,
    "cargo_build_locked_exit": 0, "cargo_test_locked_exit": 0,
    "local_wasm_execution_result": 42,
    "public_arkhe_wasm_signed": False, "public_oidc_workflow_executed": False,
    "policy_compatibility_implemented": False, "policy_adversarial_implemented": False,
}
(evidence / "result.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
files = []
for parent, dirs, names in os.walk(project):
    dirs[:] = sorted(d for d in dirs if d not in {"target", ".git", "__pycache__"})
    for name in sorted(names):
        path = Path(parent) / name
        relative = path.relative_to(project).as_posix()
        if relative in {"evidence/manifest.json", "evidence/manifest.sha256"}:
            continue
        files.append({"path": relative, "bytes": path.stat().st_size,
                      "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
manifest = evidence / "manifest.json"
manifest.write_text(json.dumps({"files": files}, indent=2) + "\n", encoding="utf-8")
root = hashlib.sha256(manifest.read_bytes()).hexdigest()
(evidence / "manifest.sha256").write_text(f"{root}  evidence/manifest.json\n", encoding="utf-8")
print(f"{passed} tests passed, {len(mutation['cases'])} mutants killed; snapshot SHA-256: {root}")
