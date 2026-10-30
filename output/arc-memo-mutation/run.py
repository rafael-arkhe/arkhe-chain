"""Targeted memo mutation campaign. No mutant is retained in active sources."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import uuid

root = Path(__file__).resolve().parents[2]
output = Path(__file__).parent / uuid.uuid4().hex
output.mkdir()
paths = {
    "memo": root / "verification/crates/arkhe-verify-core/src/memo_reconciliation.rs",
    "recon": root / "verification/crates/arkhe-verify-core/src/reconciliation.rs",
}
originals = {key: path.read_bytes() for key, path in paths.items()}
texts = {key: raw.decode().replace("\r\n", "\n") for key, raw in originals.items()}
for key, raw in originals.items():
    (output / f"{key}-original.rs").write_bytes(raw)

def case(name, test, key, old, new, kind="protection-removal"):
    assert texts[key].count(old) == 1, f"Mutation target changed: {name}"
    changed = texts[key].replace(old, new)
    if b"\r\n" in originals[key]:
        changed = changed.replace("\n", "\r\n")
    return {"name": name, "test": test, "source": key, "kind": kind, "bytes": changed.encode()}

cases = [
    case("reference-prefix-regression", "archived_real_memo_is_decoded_independently", "memo",
         'reference: format!("arc-memo-id:{memo_id}"),', 'reference: memo_id.clone(),', "behavior-regression"),
    case("bypass-memo-layer-on-positive-test", "real_memo_plus_synthetic_invoice_matches_offline", "memo",
         '''    let observation = observe(&bundle.evidence)?;
    if bundle.reconciliation.record.input.transfer != observation.transfer {
        return Err("memo evidence does not derive the exact reconciliation transfer");
    }
    reconciliation::verify(&bundle.reconciliation, trust)''',
         '    reconciliation::verify(&bundle.reconciliation, trust)'),
    case("ignore-invoice-reference", "coherent_invoice_changes_classify_without_weakening_rule", "recon",
         'i.reference == t.reference', 'true'),
    case("remove-derived-transfer-binding", "changed_raw_memo_id_cannot_substitute_committed_evidence", "memo",
         '''    if bundle.reconciliation.record.input.transfer != observation.transfer {
        return Err("memo evidence does not derive the exact reconciliation transfer");
    }''', '    let _ = observation;'),
    case("skip-calldata-hash-check", "altered_calldata_hash_is_rejected_by_decoder", "memo",
         'if data[..32] != hash {', 'if false && data[..32] != hash {'),
    case("skip-receipt-sender-binding", "sender_frame_and_mirror_corruptions_are_rejected", "memo",
         'if normalized(&receipt["from"], 20)? != payer', 'if false && normalized(&receipt["from"], 20)? != payer'),
    case("skip-log-index-uniqueness", "malformed_abi_and_ambiguous_frames_rejected", "memo",
         '|| !indices.insert(log_index(log)?)', '|| { indices.insert(log_index(log)?); false }'),
    case("skip-network-check", "wrong_network_and_unfinalized_block_rejected", "memo",
         'if quantity(&result(&e.chain_response)?)? != 5042002 {', 'if false && quantity(&result(&e.chain_response)?)? != 5042002 {'),
    case("skip-evidence-profile", "unsupported_profile_and_size_are_rejected", "memo",
         'if self.profile != "arkhe/arc-direct-memo-evidence/v1"', 'if false && self.profile != "arkhe/arc-direct-memo-evidence/v1"'),
    case("skip-evidence-size-bound", "unsupported_profile_and_size_are_rejected", "memo",
         '.any(|v| v.is_empty() || v.len() > 1_000_000)', '.any(|v| v.is_empty())'),
    case("skip-finalized-height-bound", "wrong_network_and_unfinalized_block_rejected", "memo",
         '|| block_number > finalized_number', '|| false'),
]
if "--refined" in sys.argv:
    cases = [c for c in cases if c["name"] in ("skip-log-index-uniqueness", "skip-evidence-size-bound", "bypass-memo-layer-on-positive-test")]
    for c in cases:
        c["test"] = {
            "skip-log-index-uniqueness": "duplicate_index_on_unrecognized_event_is_rejected",
            "skip-evidence-size-bound": "oversized_valid_rpc_json_is_rejected_by_size_bound",
            "bypass-memo-layer-on-positive-test": "changed_raw_memo_id_cannot_substitute_committed_evidence",
        }[c["name"]]

def run(label, test=None):
    cmd = ["cargo", "test", "--locked", "-p", "arkhe-verify-core", "--test", "memo_reconciliation"]
    if test:
        cmd.extend([test, "--", "--exact"])
    result = subprocess.run(cmd, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, timeout=120)
    (output / f"{label}.log").write_text("$ " + " ".join(cmd) + "\n" + result.stdout
                                          + f"\nexit_code={result.returncode}\n", encoding="utf-8")
    return result

assert run("baseline").returncode == 0
results = []
try:
    for c in cases:
        path = paths[c["source"]]
        try:
            path.write_bytes(c["bytes"])
            result = run(c["name"], c["test"])
            killed = (result.returncode == 101 and "panicked at" in result.stdout
                      and "test result: FAILED. 0 passed; 1 failed" in result.stdout)
            survived = result.returncode == 0 and "1 passed; 0 failed" in result.stdout
            outcome = "killed" if killed else "survived" if survived else "inconclusive"
            entry = {k: c[k] for k in ("name", "test", "source", "kind")}
            entry.update(outcome=outcome, exit_code=result.returncode)
            if survived:
                full = run(c["name"] + "-whole-memo-suite")
                entry["whole_memo_suite_exit"] = full.returncode
                entry["whole_memo_suite_detected"] = full.returncode == 101 and "panicked at" in full.stdout
            results.append(entry)
            print(json.dumps(entry), flush=True)
        finally:
            if path.read_bytes() not in (originals[c["source"]], c["bytes"]):
                raise RuntimeError(f"Concurrent edit detected; backup at {output}")
            path.write_bytes(originals[c["source"]])
        assert outcome != "inconclusive", "Compilation failure/test-selection issue is not a killed mutant"
finally:
    for key, path in paths.items():
        assert path.read_bytes() == originals[key], f"Source not restored: {key}"
restored = run("restored")
summary = {"refined": "--refined" in sys.argv, "results": results,
           "restored_exit": restored.returncode,
           "hashes": {key: {"before": hashlib.sha256(raw).hexdigest(),
                            "after": hashlib.sha256(paths[key].read_bytes()).hexdigest()}
                      for key, raw in originals.items()},
           "scope": "Selected first-order mutants only; positive-test survival is distinct from whole-suite survival; no exhaustive coverage/independence claim"}
(output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(f"Evidence: {output}", flush=True)
assert restored.returncode == 0
