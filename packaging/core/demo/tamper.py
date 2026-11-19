"""One-byte tamper of the public Gate 0 package, including the anchor and the
agent action.

Two contrasts, both of them one bit wide.

The subject: intact admission PASSes, the anchor stays INCONCLUSIVE, and a
flipped subject byte makes the admission FAIL while its signature still PASSes.
The signature covers the old hash, not the file you are holding. The anchor does
not promote the new byte.

The agent action: the same receipt, the same keys, goes from INCONCLUSIVE to PASS
only because a verdict signed by another role accompanies it and the caller named
which invariant it requires. Then a flipped artifact byte takes it back to FAIL —
the verdict names a digest, and it cannot discharge bytes you do not have.
"""

import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKER = "invariant.valor-present"

# Every flag `verify` understands that takes a path, and the fixture file it
# points at. `--artifact` is what storage committed, `--output` what the action
# says it produced: one file here, two claims, and passing both is what makes
# them meet instead of being assumed equal.
PATHS = (
    ("--subject", "subject.bin"),
    ("--policy", "policy.json"),
    ("--admission", "admission.json"),
    ("--commit", "commit.json"),
    ("--artifact", "artifact.bin"),
    ("--model", "model.json"),
    ("--data", "data.json"),
    ("--pipeline", "pipeline.json"),
    ("--plan", "plan.json"),
    ("--output", "artifact.bin"),
    ("--action", "action.json"),
    ("--invariant", "verdict.json"),
)


def binary():
    for name in ("arkhe-provenance-mcp.exe", "arkhe-provenance-mcp"):
        path = ROOT / "target" / "debug" / name
        if path.is_file():
            return path
    raise SystemExit("build packaging/core first: cargo build -p arkhe-provenance-mcp")


def run(args):
    completed = subprocess.run(
        [str(binary()), "verify", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    try:
        verdict = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise SystemExit(completed.stderr or completed.stdout or str(error))
    return verdict


def verify(work, receipt, **links):
    args = [
        "--receipt",
        str(work / receipt),
        "--trust",
        str(work / "trust.json"),
        "--expect-purpose",
        "gate0-lab",
    ]
    for flag, name in PATHS:
        if links.get(flag):
            args.extend([flag, str(work / name)])
    if links.get("--expect-invariant"):
        args.extend(["--expect-invariant", links["--expect-invariant"]])
    return run(args)


def line(label, verdict, *names):
    parts = [f"{label} overall={verdict['overall']}"]
    parts += [f"{name}={verdict['components'][name]}" for name in names]
    return " ".join(parts)


def flip(path, index):
    raw = bytearray(path.read_bytes())
    raw[index] ^= 0x01
    path.write_bytes(raw)


def main():
    started = time.perf_counter()
    action_links = {
        "--plan": True,
        "--output": True,
        "--model": True,
        "--artifact": True,
    }
    with tempfile.TemporaryDirectory() as directory:
        work = Path(directory)
        shutil.copytree(ROOT / "fixtures" / "gate0", work, dirs_exist_ok=True)

        intact = {
            "admission": verify(work, "admission.json", **{"--subject": True, "--policy": True}),
            "commit": verify(work, "commit.json", **{"--admission": True}),
            "anchor": verify(work, "anchor.json", **{"--commit": True}),
        }
        bare = verify(work, "action.json", **action_links)
        named = verify(
            work,
            "action.json",
            **action_links,
            **{"--invariant": True, "--expect-invariant": CHECKER},
        )

        flip(work / "subject.bin", 0)
        tampered = verify(work, "admission.json", **{"--subject": True, "--policy": True})
        anchor = verify(work, "anchor.json", **{"--commit": True})

        flip(work / "artifact.bin", -2)
        swapped = verify(
            work,
            "action.json",
            **action_links,
            **{"--invariant": True, "--expect-invariant": CHECKER},
        )
    elapsed = time.perf_counter() - started

    print("intacto")
    for name, verdict in intact.items():
        print(line(name, verdict, "signature", "subject", "anchor"))
    print(line("action sem veredito", bare, "signature", "output", "llm_output"))
    print(line("action com veredito", named, "signature", "output", "produced", "llm_output"))
    print("1 byte no assunto (byte 0 xor 0x01)")
    print(line("admission", tampered, "signature", "subject"))
    print(line("anchor", anchor, "signature", "anchor"))
    print("1 byte no artefato (penultimo xor 0x01)")
    print(line("action com veredito", swapped, "signature", "output", "produced", "llm_output"))
    print(f"tempo {elapsed:.2f}s")

    expected = (
        intact["admission"]["overall"] == "PASS"
        and intact["commit"]["overall"] == "PASS"
        and intact["anchor"]["overall"] == "INCONCLUSIVE"
        # the same action, the same keys: only the named verdict moves it
        and bare["overall"] == "INCONCLUSIVE"
        and bare["components"]["llm_output"] == "INCONCLUSIVE"
        and named["overall"] == "PASS"
        and named["components"]["llm_output"] == "PASS"
        # a flipped subject byte
        and tampered["overall"] == "FAIL"
        and tampered["components"]["signature"] == "PASS"
        and tampered["components"]["subject"] == "FAIL"
        and anchor["overall"] == "INCONCLUSIVE"
        and anchor["components"]["signature"] == "PASS"
        # a flipped artifact byte: the verdict is about a digest, and the bytes
        # in hand are no longer that digest
        and swapped["overall"] == "FAIL"
        and swapped["components"]["signature"] == "PASS"
        and swapped["components"]["output"] == "FAIL"
        and swapped["components"]["produced"] == "FAIL"
        and swapped["components"]["llm_output"] == "FAIL"
    )
    if not expected:
        return 1
    print(
        "FAILED no byte adulterado; a ancora nao cobre esse byte, "
        "e o veredito nao descarrega bytes que voce nao tem"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
