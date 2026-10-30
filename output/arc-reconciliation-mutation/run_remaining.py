"""Targeted mutation audit; restores exact verifier bytes after every mutant."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import uuid

root = Path(__file__).resolve().parents[2]
evidence = Path(__file__).parent / uuid.uuid4().hex
evidence.mkdir()
source = root / "verification/crates/arkhe-verify-core/src/reconciliation.rs"
original = source.read_bytes()
(evidence / "source-original.rs").write_bytes(original)
nl = b"\r\n" if b"\r\n" in original else b"\n"
refined = "--refined" in sys.argv
inclusion = nl.join([
    b"    if !verify_proof_at(", b"        &r.leaf_bytes(),",
    b"        trust.leaf_count as usize,", b"        bundle.leaf_index as usize,",
    b"        &bundle.steps,", b"        &trust.root,", b"    )",
    b'    .map_err(|_| "invalid inclusion proof shape")?', b"    {",
    b'        return Err("record absent from trusted checkpoint");', b"    }",
])
cases = [
    ("without-inclusion", inclusion, inclusion.replace(b"if !verify_proof_at", b"if false && !verify_proof_at"), "untrusted_checkpoint_rejected"),
    ("without-intent-input-binding", b"        || r.intent.parameters_digest != r.input.digest()",
     b"", "swapped_invoice_with_refreshed_worker_requires_intent_commitment" if refined else "swapped_invoice_rejected"),
    ("without-operation-binding", b"        || r.input.operation_id != r.intent.operation_id()",
     b"", "foreign_operation_with_consistent_commitments_rejected" if refined else "evidence_from_another_operation_rejected"),
]

def run(label, test=None):
    cmd = ["cargo", "test", "--locked", "-p", "arkhe-verify-core", "--test", "arc_reconciliation"]
    if test:
        cmd += [test, "--", "--exact"]
    result = subprocess.run(cmd, cwd=root, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, timeout=120)
    (evidence / f"{label}.log").write_text(
        "$ " + " ".join(cmd) + "\n" + result.stdout + f"\nexit_code={result.returncode}\n",
        encoding="utf-8")
    print(f"{label}: exit_code={result.returncode}", flush=True)
    return result

assert run("baseline").returncode == 0
results = []
try:
    for label, needle, replacement, test in cases:
        assert original.count(needle) == 1, f"Mutation target changed: {label}"
        mutated = original.replace(needle, replacement)
        try:
            source.write_bytes(mutated)
            result = run(label, test)
        finally:
            if source.read_bytes() not in (original, mutated):
                raise RuntimeError(f"Concurrent edit; backup retained at {evidence}")
            source.write_bytes(original)
        killed = (result.returncode == 101 and "test result: FAILED. 0 passed; 1 failed" in result.stdout
                  and "panicked at" in result.stdout)
        survived = result.returncode == 0 and "1 passed; 0 failed" in result.stdout
        assert killed or survived, "Inconclusive result (compile failure or test not selected)"
        results.append({"mutation": label, "test": test, "exit_code": result.returncode,
                        "outcome": "killed" if killed else "survived"})
finally:
    assert source.read_bytes() == original, "Verifier was not restored"
restored = run("restored")
summary = {"refined_tests": refined, "results": results, "restored_exit": restored.returncode,
           "source_sha256_before": hashlib.sha256(original).hexdigest(),
           "source_sha256_after": hashlib.sha256(source.read_bytes()).hexdigest(),
           "scope": "Targeted guards, not exhaustive mutation coverage or four-condition independence"}
(evidence / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps(summary, indent=2), flush=True)
print(f"Evidence: {evidence}", flush=True)
assert restored.returncode == 0
