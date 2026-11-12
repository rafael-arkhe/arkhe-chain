"""Fail when a feature README.md promises has no passing test behind it.

Reads the bullets under "## Features" in README.md and the ledger in
readme_claims.toml, then checks that every bullet is mapped to at least one
pytest node id, that those tests exist, and that they pass.

Usage: python scripts/check_readme_claims.py   (from the project root)
Exit code 0 when every claim is backed, 1 otherwise.
"""
from __future__ import annotations

import re
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
README = ROOT / "README.md"
LEDGER = ROOT / "readme_claims.toml"
SECTION = "features"


def readme_claims() -> list[str]:
    claims, in_section = [], False
    for line in README.read_text(encoding="utf-8").splitlines():
        heading = re.match(r"^#{1,6}\s+(.*?)\s*$", line)
        if heading:
            in_section = heading.group(1).strip().lower() == SECTION
            continue
        bullet = re.match(r"^\s*[-*+]\s+(.*?)\s*$", line)
        if in_section and bullet:
            claims.append(bullet.group(1))
    return claims


def collected_tests() -> set[str]:
    out = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider"],
        cwd=ROOT, capture_output=True, text=True,
    )
    return {l.strip() for l in out.stdout.splitlines() if "::" in l}


def main() -> int:
    readme = readme_claims()
    ledger = tomllib.loads(LEDGER.read_text(encoding="utf-8")).get("claim", [])
    by_text = {entry["claim"]: entry.get("tests", []) for entry in ledger}
    problems: list[str] = []

    if not readme:
        problems.append(f'README.md has no bullets under a "## Features" heading')

    for claim in readme:
        if claim not in by_text:
            problems.append(f"README claim not in {LEDGER.name}: {claim!r}")
    for claim in by_text:
        if claim not in readme:
            problems.append(f"{LEDGER.name} entry matches no README bullet (stale): {claim!r}")

    existing = collected_tests()
    to_run: list[str] = []
    for claim in readme:
        tests = by_text.get(claim)
        if tests is None:
            continue
        if not tests:
            problems.append(f"No test backs README claim: {claim!r}")
        for node in tests:
            if node not in existing:
                problems.append(f"Test {node} (for {claim!r}) does not exist")
            elif node not in to_run:
                to_run.append(node)

    if to_run:
        run = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *to_run],
            cwd=ROOT, capture_output=True, text=True,
        )
        if run.returncode != 0:
            print(run.stdout, run.stderr, sep="\n")
            problems.append("Tests backing README claims failed (output above)")

    backed = len(readme) - sum(1 for c in readme if not by_text.get(c))
    print(f"README feature claims mapped to tests: {backed}/{len(readme)}")
    if problems:
        print("README claims check FAILED:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("README claims check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
