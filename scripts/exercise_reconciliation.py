#!/usr/bin/env python3
"""Model a crash window using a copy of a real completed audit bundle."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys

from delegated_audit import digest, read_json, source_identity, write_json


def artifact_hashes(bundle):
    return {str(path.relative_to(bundle)): digest(path.read_bytes())
            for path in sorted(bundle.rglob("*")) if path.is_file()}


def reservation(state):
    with closing(sqlite3.connect(state)) as db:
        rows = db.execute("SELECT attempts,status FROM tasks").fetchall()
    if len(rows) != 1:
        raise ValueError("exercise requires exactly one reservation")
    return rows[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-run", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ledger-binary", required=True, type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    commit, tree = source_identity(repo)
    source = args.source_run.resolve()
    output = args.output.resolve()
    if output.is_relative_to(repo) or output.is_relative_to(source):
        parser.error("exercise output must be outside the source checkout and source run")
    original = read_json(source / "verification.json")
    original_hashes = artifact_hashes(source / "bundle")
    if digest((source / "trust.json").read_bytes()) != original["trust_sha256"]:
        raise ValueError("source trust pin mismatch")
    output.mkdir(parents=True, exist_ok=False)
    copied = output / "copied-run"
    shutil.copytree(source, copied)
    state = copied / "runtime/reservations.sqlite3"
    if reservation(state) != (1, "completed"):
        raise ValueError("exercise source was not completed exactly once")
    # Fault injection is confined to the copied reservation database. The real
    # signed result and its ledger evidence are preserved byte for byte.
    with closing(sqlite3.connect(state)) as db, db:
        db.execute("UPDATE tasks SET status='running'")
    before = reservation(state)
    command = [sys.executable, "-B", str(repo / "scripts/delegated_audit.py"),
               "reconcile", "--output", str(copied), "--trust-sha256", original["trust_sha256"],
               "--ledger-binary", str(args.ledger_binary.resolve())]
    results = []
    for name in ["first", "second"]:
        result = subprocess.run(command, cwd=output, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        if result.returncode:
            raise ValueError("reconciliation failed: " + result.stderr.decode(errors="replace"))
        verified = json.loads(result.stdout)
        write_json(output / f"reconcile-{name}.json", verified)
        results.append(verified)
    after = reservation(state)
    preserved = artifact_hashes(copied / "bundle") == original_hashes == artifact_hashes(source / "bundle")
    if before != (1, "running") or after != (1, "completed") or not preserved:
        raise ValueError("recovery state or artifact preservation failed")
    if not results[0]["reservation_changed"] or results[1]["reservation_changed"]:
        raise ValueError("reconciliation is not idempotent")
    if reservation(source / "runtime/reservations.sqlite3") != (1, "completed"):
        raise ValueError("original reservation changed")
    if source_identity(repo) != (commit, tree):
        raise ValueError("verifier source changed")
    summary = {
        "verifier_commit": commit, "verifier_tree": tree,
        "receipt_source_commit": original["commit"],
        "injection": "copied completed reservation changed to running after ledger publication",
        "before": {"attempts": before[0], "status": before[1]},
        "after": {"attempts": after[0], "status": after[1]},
        "first_changed": results[0]["reservation_changed"],
        "second_changed": results[1]["reservation_changed"],
        "public_artifacts_unchanged": preserved,
        "artifact_sha256": original_hashes,
        "original_run_preserved": True,
        "scope": "modeled completion window, not whole-system power-loss injection",
    }
    write_json(output / "summary.json", summary)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
