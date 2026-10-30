#!/usr/bin/env python3
import json, subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/"tests/golden_vectors.json").read_text())
mmrs=[v for v in data["vectors"] if v["component"]=="WormGraph MMR"]

# Generator itself has BLAKE3 known-answer assertions. Execute and capture for provenance.
proc=subprocess.run([sys.executable, str(ROOT/"scripts/generate_vectors.py")], capture_output=True, text=True)
if proc.returncode:
    print(proc.stdout)
    print(proc.stderr, file=sys.stderr)
    raise SystemExit(proc.returncode)

# Structural checks on committed golden vectors.
for v in mmrs:
    n=v["input"]["leaf_count"]
    proofs=v["expected_output"]["proofs"]
    assert len(proofs)==n, (v["id"], "proof count")
    assert v["status"]=="READY"
    for i,p in enumerate(proofs):
        assert p["target_index"]==i
        assert len(p["inclusion_proof_hashes"])==len(p["inclusion_proof_directions"])==len(p["inclusion_proof_kinds"])
        for h in p["inclusion_proof_hashes"]:
            assert len(h)==64
        for d in p["inclusion_proof_directions"]:
            assert d in ("left","right")
        for k in p["inclusion_proof_kinds"]:
            assert k in ("node","bag")

print("PASS: committed MMR vectors are structurally complete for sizes", [v["input"]["leaf_count"] for v in mmrs])
print(proc.stdout)
