"""Run explicitly enumerated, hand-written mutants against isolated test copies.

This measures only the listed faults, not general mutation coverage or security.
No original repository file is modified. All fixtures are synthetic.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


MUTANTS = [
    ("candidate_instead_of_context",
     'context = {s["id"] for s in json.loads(row["context"])}',
     'context = set(json.loads(row["candidates"]))',
     "test_candidate_not_provided_is_rejected"),
    ("skip_release_authorization",
     'self._authorize(scope, [s["id"] for s in context], action, now)',
     'pass  # injected fault: no release authorization',
     "test_uncited_dependency_revocation_suppresses_whole_answer"),
    ("check_cited_sources_only",
     'self._authorize(scope, [s["id"] for s in context], action, now)',
     'self._authorize(scope, json.loads(row["citations"]), action, now)',
     "test_uncited_dependency_revocation_suppresses_whole_answer"),
    ("ignore_revocation",
     'if row is None or not row["active"]:',
     'if row is None:',
     "test_revoked_after_context_before_completion"),
    ("accept_expiration_boundary",
     'if not row["valid_from"] <= now < row["valid_until"]:',
     'if not row["valid_from"] <= now <= row["valid_until"]:',
     "test_exact_expiration_denies"),
    ("omit_answer_integrity",
     'if digest(row["answer"].encode()) != row["answer_digest"]:',
     'if False:',
     "test_answer_corruption_denies"),
    ("weaken_writer_transaction",
     'self._db.execute("BEGIN IMMEDIATE")',
     'self._db.execute("BEGIN DEFERRED")',
     "test_two_connections_revocation_cannot_commit_inside_release"),
]


def run(output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=False)
    root = Path(__file__).resolve().parents[1]
    source = (root / "scripts/arkhe_rag_v3.py").read_text(encoding="utf-8")
    results = []
    with tempfile.TemporaryDirectory() as directory:
        copy = Path(directory)
        (copy / "scripts").mkdir()
        (copy / "tests").mkdir()
        # A real package avoids collision with unrelated installed tests packages.
        (copy / "tests/__init__.py").write_text("", encoding="utf-8")
        shutil.copyfile(root / "tests/test_arkhe_rag_v3.py", copy / "tests/test_arkhe_rag_v3.py")
        for name, old, new, test in MUTANTS:
            if source.count(old) != 1:
                raise RuntimeError("mutation anchor is not unique: " + name)
            (copy / "scripts/arkhe_rag_v3.py").write_text(source.replace(old, new), encoding="utf-8")
            # -B prevents stale bytecode across same-size and same-time replacements.
            process = subprocess.run([sys.executable, "-B", "-m", "unittest",
                "tests.test_arkhe_rag_v3.GatewayTests." + test, "-v"], cwd=copy,
                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
            log = process.stdout
            # Import/setup errors are not accepted as successful falsification.
            killed = process.returncode != 0 and "FAIL:" in log and "ERROR:" not in log
            (output / (name + ".log")).write_text(log, encoding="utf-8")
            results.append(dict(mutant=name, test=test, detected=killed,
                                exit_code=process.returncode))
    summary = dict(kind="enumerated-hand-written-mutants", fixture="synthetic",
        source_sha256=hashlib.sha256(source.encode()).hexdigest(),
        total=len(results), detected=sum(item["detected"] for item in results), results=results,
        limitation="Only these enumerated faults; no automatic generator or general coverage claim.")
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    summary = run(args.output)
    print(json.dumps(summary))
    raise SystemExit(0 if summary["detected"] == summary["total"] else 1)
