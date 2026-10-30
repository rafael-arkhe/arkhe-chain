"""Run deliberate vulnerabilities only in disposable copies, never in shipped code.

Uses the downloaded Cargo registry source for sigstore-verify 0.6.6, with a
path patch in the isolated mutant only. Mutant locks preserve all versions and
dependency edges; tests use --locked. A nonzero exit counts only with the named Rust assertion
failure, never a compiler/dependency error. Saves logs, mutations and source hashes.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tomllib

PROJECT = Path(__file__).resolve().parents[1]
EVIDENCE = PROJECT / "evidence" / "mutations"
EVIDENCE.mkdir(parents=True, exist_ok=True)
TARGET = PROJECT / "target"

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(args, cwd, log):
    # Do not inherit different ancestor .cargo/config flags in temporary copies.
    # An explicit value applies equally to baseline and mutants.
    env = dict(os.environ, CARGO_TARGET_DIR=str(TARGET), CARGO_TERM_COLOR="never",
               RUSTFLAGS=os.environ.get("RUSTFLAGS", ""))
    result = subprocess.run(args, cwd=cwd, env=env, text=True, encoding="utf-8", errors="replace",
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log.write_text(result.stdout, encoding="utf-8")
    print(f"{log.name}: exit={result.returncode}", flush=True)
    return result

def replace_once(path, before, after):
    text = path.read_text(encoding="utf-8")
    if text.count(before) != 1:
        raise RuntimeError(f"Expected one mutation anchor in {path}, found {text.count(before)}")
    path.write_text(text.replace(before, after), encoding="utf-8")

def copy_project(destination):
    shutil.copytree(PROJECT, destination, ignore=shutil.ignore_patterns("target", "evidence", "__pycache__"))

registry = Path(os.environ.get("CARGO_HOME", str(Path.home() / ".cargo"))) / "registry" / "src"
candidates = list(registry.glob("*/sigstore-verify-0.6.6"))
if not candidates:
    raise RuntimeError("Run cargo test --locked first to download exact registry source")
upstream = candidates[0]
source_before = {p.relative_to(PROJECT).as_posix(): digest(p)
                 for p in [PROJECT / "src/lib.rs", PROJECT / "Cargo.toml", PROJECT / "Cargo.lock", PROJECT / "tests/negative.rs"]}
summary = {"baseline_source_sha256": source_before,
           "upstream_verify_rs_sha256": digest(upstream / "src/verify.rs"),
           "rustflags": os.environ.get("RUSTFLAGS", ""), "cases": []}
baseline = run(["cargo", "test", "--locked"], PROJECT, EVIDENCE / "baseline.txt")
if baseline.returncode != 0:
    raise RuntimeError("Baseline must pass before evaluating any mutant")

# TemporaryDirectory removes only its own freshly-created verified workspace.
with tempfile.TemporaryDirectory(prefix="arkhe-verifier-mutations-") as temporary:
    work = Path(temporary)
    for name in ["remove_rekor_binding", "remove_hash_gate"]:
        mutant = work / name
        copy_project(mutant)
        if name == "remove_rekor_binding":
            vendor = mutant / "vendor" / "sigstore-verify"
            shutil.copytree(upstream, vendor)
            before = "crate::verify_impl::verify_hashedrekord_entries(bundle, &artifact)?;"
            after = "// MUTATION ONLY: hashedrekord artifact/signature binding deliberately removed."
            changed = vendor / "src/verify.rs"
            replace_once(changed, before, after)
            with (mutant / "Cargo.toml").open("a", encoding="utf-8") as f:
                f.write('\n[patch.crates-io]\nsigstore-verify = { path = "vendor/sigstore-verify" }\n')
            # Do not re-resolve: offline Cargo may downgrade uncached packages
            # for other target platforms. Only convert this exact registry entry
            # to its path-patched equivalent; --locked validates that edit.
            lock_parts = (mutant / "Cargo.lock").read_text(encoding="utf-8").split("[[package]]")
            patched_entries = 0
            for i, part in enumerate(lock_parts):
                if '\nname = "sigstore-verify"\nversion = "0.6.6"\n' in part:
                    lock_parts[i] = "\n".join(line for line in part.split("\n")
                        if not line.startswith(("source = ", "checksum = ")))
                    patched_entries += 1
            if patched_entries != 1:
                raise RuntimeError("Expected one exact locked registry entry")
            (mutant / "Cargo.lock").write_text("[[package]]".join(lock_parts), encoding="utf-8")
            (EVIDENCE / f"{name}-resolve.txt").write_text(
                "No resolver run: only source/checksum of sigstore-verify 0.6.6 changed to a path dependency.\n",
                encoding="utf-8")
            baseline_lock = tomllib.loads((PROJECT / "Cargo.lock").read_text(encoding="utf-8"))
            mutant_lock = tomllib.loads((mutant / "Cargo.lock").read_text(encoding="utf-8"))
            def normalized_packages(lock):
                packages = []
                for p in lock["package"]:
                    p = dict(p)
                    if p["name"] == "sigstore-verify":
                        p.pop("source", None)
                        p.pop("checksum", None)
                    packages.append(p)
                return sorted(packages, key=lambda p: (p["name"], p["version"]))
            if normalized_packages(baseline_lock) != normalized_packages(mutant_lock):
                (EVIDENCE / "dependency-graph-difference.json").write_text(json.dumps({
                    "baseline": normalized_packages(baseline_lock), "mutant": normalized_packages(mutant_lock)
                }, indent=2), encoding="utf-8")
                raise RuntimeError("Mutant dependency graph changed beyond the intended registry-to-path patch")
            shutil.copyfile(mutant / "Cargo.lock", EVIDENCE / f"{name}.Cargo.lock")
            args = ["cargo", "test", "--locked", "--test", "negative", "unrelated_rekor_entry_rejected", "--", "--exact"]
            expected_failures = ["unrelated_rekor_entry_rejected"]
            expected_panic = "expected artifact binding rejection, got Ok("
        else:
            before = "if sha256_hex(wasm_bytes) != EXPECTED_WASM_SHA256 {"
            after = "if false { // MUTATION ONLY: build-pinned hash gate deliberately disabled."
            changed = mutant / "src/lib.rs"
            replace_once(changed, before, after)
            args = ["cargo", "test", "--locked", "--test", "negative"]
            expected_failures = ["unapproved_but_validly_signed_module_rejected_by_hash_pin", "tampered_wasm_rejected_before_compile"]
            expected_panic = "unapproved_but_validly_signed_module_rejected_by_hash_pin"
        (EVIDENCE / f"{name}.patch.txt").write_text(f"- {before}\n+ {after}\n", encoding="utf-8")
        outcome = run(args, mutant, EVIDENCE / f"{name}.txt")
        killed = (outcome.returncode == 101 and "test result: FAILED" in outcome.stdout
                  and expected_panic in outcome.stdout
                  and all(f"{test} ... FAILED" in outcome.stdout for test in expected_failures))
        summary["cases"].append({"mutation": name, "command": args, "exit_code": outcome.returncode,
            "killed_by_assertions": killed, "expected_failed_tests": expected_failures,
            "dependency_graph_unchanged_except_intended_path_patch": True,
            "mutated_source_sha256": digest(changed)})
        if not killed:
            (EVIDENCE / "result.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
            raise RuntimeError(f"Mutant {name} was not killed by the intended test assertions")

assert all(digest(PROJECT / path) == value for path, value in source_before.items()), "Original source changed"
restored = run(["cargo", "test", "--locked"], PROJECT, EVIDENCE / "final-original.txt")
summary["original_source_unchanged"] = True
summary["final_original_exit_code"] = restored.returncode
(EVIDENCE / "result.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
if restored.returncode != 0:
    raise RuntimeError("Final tests on unmodified original must pass")
print("Both mutants killed; original source unchanged; final tests passed.", flush=True)
