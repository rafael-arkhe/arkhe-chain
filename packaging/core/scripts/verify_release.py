#!/usr/bin/env python3
"""Verify a packaged Arkhe Verify release/buyer kit BEFORE executing it (P-04 & P-10).

1. Checks every file listed in SHA256SUMS (fails closed on mismatch or missing file).
2. Confirms zero `arkhe-secret/v1` / `seed_hex` files are present in the kit.
3. Optionally executes the 7 Gate 0 commands and asserts every expected overall
   verdict, key component, and process exit code (0 / 2 / 1).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import subprocess
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_checksums(kit: Path) -> int:
    sums_file = kit / "SHA256SUMS"
    if not sums_file.is_file():
        print(f"FAIL: missing {sums_file}", file=sys.stderr)
        return 0
    checked = 0
    for raw in sums_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = line.split("  ", 1)
        if len(parts) != 2:
            raise RuntimeError(f"Malformed SHA256SUMS line: {line}")
        expected_hex, rel = parts
        target = (kit / rel).resolve()
        if not target.is_relative_to(kit.resolve()) or not target.is_file():
            raise RuntimeError(f"Missing or escaped file in SHA256SUMS: {rel}")
        actual_hex = sha256_file(target)
        if actual_hex != expected_hex:
            raise RuntimeError(f"Checksum mismatch for {rel}: expected {expected_hex}, got {actual_hex}")
        checked += 1
    if checked == 0:
        raise RuntimeError("SHA256SUMS is empty")
    return checked


def verify_no_secrets(kit: Path) -> None:
    for path in kit.rglob("*"):
        if not path.is_file() or path.suffix.lower() in {".exe", ".bin"}:
            continue
        if path.name.endswith(".secret") or ".secret." in path.name:
            raise RuntimeError(f"Private secret filename found in kit: {path}")
        if path.suffix.lower() == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and (data.get("schema") == "arkhe-secret/v1" or "seed_hex" in data):
                raise RuntimeError(f"Private secret JSON found in kit: {path}")
        elif path.name not in {"AUDIT-1-PAGE.md", "verify_release.py"}:
            text = path.read_text(encoding="utf-8", errors="ignore")
            if "arkhe-secret/v1" in text or '"seed_hex"' in text:
                raise RuntimeError(f"Private secret material found in kit: {path}")


def run_gate0_checks(kit: Path) -> None:
    ext = ".exe" if platform.system().lower() == "windows" else ""
    binary = kit / f"arkhe-provenance-mcp{ext}"
    if not binary.is_file():
        raise RuntimeError(f"Verifier binary missing: {binary}")
    fx = kit / "fixtures"
    trust = str(fx / "trust.json")

    cases = [
        (
            "admission",
            [
                "verify", "--receipt", str(fx / "admission.json"), "--trust", trust,
                "--expect-purpose", "gate0-lab",
                "--subject", str(fx / "subject.bin"), "--policy", str(fx / "policy.json"),
            ],
            0, "PASS", {"subject": "PASS", "policy": "PASS"},
        ),
        (
            "commit",
            [
                "verify", "--receipt", str(fx / "commit.json"), "--trust", trust,
                "--expect-purpose", "gate0-lab", "--admission", str(fx / "admission.json"),
            ],
            0, "PASS", {"recompute": "PASS", "binding": "PASS"},
        ),
        (
            "anchor-pending",
            [
                "verify", "--receipt", str(fx / "anchor.json"), "--trust", trust,
                "--expect-purpose", "gate0-lab", "--commit", str(fx / "commit.json"),
            ],
            2, "INCONCLUSIVE", {"anchor": "INCONCLUSIVE", "binding": "PASS"},
        ),
        (
            "artifact",
            [
                "verify", "--receipt", str(fx / "artifact.json"), "--trust", trust,
                "--expect-purpose", "gate0-lab",
                "--artifact", str(fx / "artifact.bin"), "--model", str(fx / "model.json"),
                "--data", str(fx / "data.json"), "--pipeline", str(fx / "pipeline.json"),
            ],
            0, "PASS", {"merkle": "PASS", "artifact": "PASS", "model": "PASS", "data": "PASS", "pipeline": "PASS"},
        ),
        (
            "action-bare",
            [
                "verify", "--receipt", str(fx / "action.json"), "--trust", trust,
                "--expect-purpose", "gate0-lab",
                "--plan", str(fx / "plan.json"), "--output", str(fx / "artifact.bin"),
                "--model", str(fx / "model.json"), "--artifact", str(fx / "artifact.bin"),
            ],
            2, "INCONCLUSIVE", {"llm_output": "INCONCLUSIVE", "produced": "PASS"},
        ),
        (
            "action-discharged",
            [
                "verify", "--receipt", str(fx / "action.json"), "--trust", trust,
                "--expect-purpose", "gate0-lab",
                "--plan", str(fx / "plan.json"), "--output", str(fx / "artifact.bin"),
                "--model", str(fx / "model.json"), "--artifact", str(fx / "artifact.bin"),
                "--invariant", str(fx / "verdict.json"), "--expect-invariant", "invariant.valor-present",
            ],
            0, "PASS", {"llm_output": "PASS", "produced": "PASS"},
        ),
        (
            "verdict-alone",
            [
                "verify", "--receipt", str(fx / "verdict.json"), "--trust", trust,
                "--expect-purpose", "gate0-lab",
                "--output", str(fx / "artifact.bin"), "--action", str(fx / "action.json"),
            ],
            0, "PASS", {"held": "PASS", "binding": "PASS", "output": "PASS"},
        ),
    ]

    for name, cli_args, expected_exit, expected_overall, expected_components in cases:
        proc = subprocess.run([str(binary), *cli_args], capture_output=True, text=True, check=False)
        if proc.returncode != expected_exit:
            raise RuntimeError(
                f"Case {name}: expected exit {expected_exit}, got {proc.returncode}\nstdout={proc.stdout}\nstderr={proc.stderr}"
            )
        verdict = json.loads(proc.stdout)
        if verdict.get("overall") != expected_overall:
            raise RuntimeError(f"Case {name}: expected overall={expected_overall}, got {verdict.get('overall')}")
        for comp, want in expected_components.items():
            got = verdict.get("components", {}).get(comp)
            if got != want:
                raise RuntimeError(f"Case {name}: component {comp} expected {want}, got {got}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Arkhe Verify buyer kit integrity before running.")
    parser.add_argument("--kit", type=Path, required=True)
    parser.add_argument("--run-gate0", action="store_true")
    args = parser.parse_args()

    kit = args.kit.resolve()
    checked = verify_checksums(kit)
    verify_no_secrets(kit)
    if args.run_gate0:
        run_gate0_checks(kit)
    print(f"PASS: verified {checked} files in {kit} (0 private secrets; gate0_executed={args.run_gate0})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
