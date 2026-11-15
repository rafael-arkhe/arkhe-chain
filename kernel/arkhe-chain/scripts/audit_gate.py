#!/usr/bin/env python3
"""Run the arkhe-chain gate and write evidence outside the monorepo checkout."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

CHAIN = "kernel/arkhe-chain"


def git(repo: Path, *arguments: str) -> str:
    return subprocess.check_output(["git", "-C", str(repo), *arguments], text=True).strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args()
    # scripts/ → arkhe-chain → kernel → monorepo root
    repo = Path(__file__).resolve().parents[2]
    output = arguments.output.resolve()
    if output.is_relative_to(repo):
        parser.error("evidence must be outside the checkout")
    dirty = git(repo, "status", "--porcelain", "--untracked-files=normal", "--", CHAIN)
    if dirty:
        parser.error(f"{CHAIN} must be clean, including untracked source files:\n{dirty}")
    commit = git(repo, "rev-parse", "HEAD")
    tree = git(repo, "rev-parse", "HEAD^{tree}")
    output.mkdir(parents=True, exist_ok=False)
    command = [
        "cargo",
        "test",
        "--locked",
        "-p",
        "arkhe-chain",
        "--no-fail-fast",
        "--",
        "--test-threads=1",
    ]
    manifest = {
        "commit": commit,
        "tree": tree,
        "crate": CHAIN,
        "command": command,
        "started_utc": datetime.now(timezone.utc).isoformat(),
        "platform": sys.platform,
        "python": sys.version,
        "rustc": subprocess.check_output(["rustc", "--version", "--verbose"], text=True),
        "cargo": subprocess.check_output(["cargo", "--version"], text=True).strip(),
    }
    log_path = output / "cargo-test.log"
    with log_path.open("wb") as log:
        result = subprocess.run(command, cwd=repo, stdout=log, stderr=subprocess.STDOUT)
    unchanged = (
        git(repo, "rev-parse", "HEAD") == commit
        and git(repo, "rev-parse", "HEAD^{tree}") == tree
        and not git(repo, "status", "--porcelain", "--untracked-files=normal", "--", CHAIN)
    )
    manifest.update(
        {
            "finished_utc": datetime.now(timezone.utc).isoformat(),
            "test_exit_code": result.returncode,
            "checkout_unchanged": unchanged,
            "log_sha256": hashlib.sha256(log_path.read_bytes()).hexdigest(),
        }
    )
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return result.returncode if unchanged else 1


if __name__ == "__main__":
    raise SystemExit(main())
