"""One opt-in mutation experiment; always restore the exact source bytes."""
import hashlib
import json
from pathlib import Path
import subprocess
import uuid

root = Path(__file__).resolve().parents[2]
evidence = Path(__file__).parent / uuid.uuid4().hex
evidence.mkdir()
source = root / "verification/crates/arkhe-verify-core/src/reconciliation.rs"
original = source.read_bytes()
(evidence / "source-original.rs").write_bytes(original)
newline = b"\r\n" if b"\r\n" in original else b"\n"
needle = newline.join([
    b"    let decision = evaluate(&r.input)?;",
    b"    if decision != r.decision {",
    b'        return Err("reconciliation predicate does not reproduce recorded decision");',
    b"    }",
])
assert original.count(needle) == 1, "Mutation target changed; refusing to edit"
mutated = original.replace(needle, b"    let decision = r.decision.clone();")
command = ["cargo", "test", "--locked", "-p", "arkhe-verify-core", "--test",
           "arc_reconciliation", "forged_decision_with_consistent_hash_and_membership_still_rejected",
           "--", "--exact"]

def run(label):
    result = subprocess.run(command, cwd=root, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, timeout=120)
    (evidence / f"{label}.log").write_text(
        "$ " + " ".join(command) + "\n" + result.stdout
        + f"\nexit_code={result.returncode}\n", encoding="utf-8")
    print(f"{label}: exit_code={result.returncode}\n{result.stdout}", flush=True)
    return result

baseline = run("baseline")
assert baseline.returncode == 0, "Baseline must pass before mutation"
try:
    source.write_bytes(mutated)
    mutant = run("without-predicate")
finally:
    current = source.read_bytes()
    if current not in (original, mutated):
        raise RuntimeError(f"Concurrent edit detected; original backup at {evidence}")
    source.write_bytes(original)

assert source.read_bytes() == original, "Source restoration mismatch"
restored = run("restored")
discriminates = (
    mutant.returncode == 101
    and "assertion `left == right` failed" in mutant.stdout
    and "left: Ok(" in mutant.stdout
    and "reconciliation predicate does not reproduce recorded decision" in mutant.stdout
    and restored.returncode == 0
)
summary = {
    "command": command,
    "baseline_exit": baseline.returncode,
    "mutated_exit": mutant.returncode,
    "restored_exit": restored.returncode,
    "source_sha256_before": hashlib.sha256(original).hexdigest(),
    "source_sha256_after": hashlib.sha256(source.read_bytes()).hexdigest(),
    "mutation": "Replace predicate evaluation/comparison with recorded decision clone; retain binding and MMR checks",
    "target_test_discriminates": discriminates,
    "scope": "One targeted mutant only; no claim about all twelve tests",
}
(evidence / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(f"Evidence: {evidence}", flush=True)
assert discriminates, "Mutation was not killed in the expected way"
