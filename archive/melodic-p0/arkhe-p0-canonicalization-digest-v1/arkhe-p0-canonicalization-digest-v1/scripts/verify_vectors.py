#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "reference" / "python" / "arkhe_p0_ref.py"
VECTORS = ROOT / "vectors" / "canonicalization-v1.json"

spec = importlib.util.spec_from_file_location("arkhe_ref", REF)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

expected = mod.build_vectors()
actual = json.loads(VECTORS.read_text(encoding="utf-8"))

if actual != expected:
    raise SystemExit("FAIL: checked-in vectors differ from independent reference output")

if not actual["invariants"]["map_order_equivalent"]:
    raise SystemExit("FAIL: map order canonicalization invariant")
if not actual["invariants"]["map_order_digest_equivalent"]:
    raise SystemExit("FAIL: map order digest invariant")

print("PASS: independent Python vectors are reproducible")
print(f"vectors={len(actual['vectors'])}")
