"""Isolated gate mutations: only exact named runtime assertion failures count.

Never edits shipped source or Cargo registry cache. All locked dependency edges
and versions are preserved. Baseline/mutants use identical compiler flags.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import tomllib

PROJECT = Path(__file__).resolve().parents[1]
EVIDENCE = PROJECT / "evidence" / "mutations"
EVIDENCE.mkdir(parents=True, exist_ok=True)
TARGET = PROJECT / "target"
REGISTRY = Path(os.environ.get("CARGO_HOME", str(Path.home() / ".cargo"))) / "registry" / "src"

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def run(args, cwd, log):
    env = dict(os.environ, CARGO_TARGET_DIR=str(TARGET), CARGO_TERM_COLOR="never",
               RUSTFLAGS=os.environ.get("RUSTFLAGS", ""))
    out = subprocess.run(args, cwd=cwd, env=env, text=True, encoding="utf-8", errors="replace",
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log.write_text(out.stdout, encoding="utf-8")
    print(f"{log.name}: exit={out.returncode}", flush=True)
    return out

def replace_once(path, before, after):
    text = path.read_text(encoding="utf-8")
    if text.count(before) != 1:
        raise RuntimeError(f"Expected one anchor in {path}, got {text.count(before)}: {before}")
    path.write_text(text.replace(before, after), encoding="utf-8")

def no_op_function(path, name):
    text = path.read_text(encoding="utf-8")
    start = text.index("pub fn " + name + "(")
    brace = text.index("{", start)
    path.write_text(text[:brace+1] + "\n    return Ok(()); // MUTATION ONLY\n" + text[brace+1:], encoding="utf-8")
    return f"{name}: insert unconditional Ok(()) at function entry"

def normalized_lock(path, patched):
    packages = tomllib.loads(path.read_text(encoding="utf-8"))["package"]
    result = []
    for package in packages:
        package = dict(package)
        if package["name"] == patched:
            package.pop("source", None)
            package.pop("checksum", None)
        result.append(package)
    return sorted(result, key=lambda p: (p["name"], p["version"]))

def patch_dependency(mutant, name, case):
    matches = list(REGISTRY.glob(f"*/{name}-0.6.6"))
    if not matches:
        raise RuntimeError(f"Missing cached {name} 0.6.6")
    source = matches[0]
    vendor = mutant / "vendor" / name
    shutil.copytree(source, vendor)
    with (mutant / "Cargo.toml").open("a", encoding="utf-8") as f:
        f.write(f'\n[patch.crates-io]\n{name} = {{ path = "vendor/{name}" }}\n')
    parts = (mutant / "Cargo.lock").read_text(encoding="utf-8").split("[[package]]")
    count = 0
    for i, part in enumerate(parts):
        if f'\nname = "{name}"\nversion = "0.6.6"\n' in part:
            parts[i] = "\n".join(line for line in part.split("\n")
                                 if not line.startswith(("source = ", "checksum = ")))
            count += 1
    assert count == 1
    (mutant / "Cargo.lock").write_text("[[package]]".join(parts), encoding="utf-8")
    assert normalized_lock(PROJECT / "Cargo.lock", name) == normalized_lock(mutant / "Cargo.lock", name)
    shutil.copyfile(mutant / "Cargo.lock", EVIDENCE / f"{case}.Cargo.lock")
    return vendor, source

def case(name, target, tests, mutation, dependency=None, unit=False):
    return dict(name=name, target=target, tests=tests, mutation=mutation, dependency=dependency, unit=unit)

CASES = [
    case("remove_rekor_binding", "negative", ["unrelated_rekor_entry_rejected"], "rekor", "sigstore-verify"),
    case("remove_hash_gate", "negative", ["tampered_wasm_rejected_before_compile", "unapproved_but_validly_signed_module_rejected_by_hash_pin"], "hash"),
    case("remove_freshness_gate", None, ["tests::stale_capture_blocks_the_complete_verifier"], "freshness", unit=True),
    case("remove_warning_gate", None, ["tests::application_rejects_warning_report"], "warnings", unit=True),
    case("remove_success_gate", None, ["tests::application_rejects_unsuccessful_report"], "success", unit=True),
    case("remove_merkle_validation", "negative", ["damaged_merkle_path_rejected"], "merkle", "sigstore-merkle"),
    case("remove_set_validation", "negative", ["forged_set_rejected"], "set", "sigstore-verify"),
    case("remove_checkpoint_validation", "negative", ["forged_checkpoint_rejected"], "checkpoint", "sigstore-verify"),
    case("remove_identity_constraint", "public_cosign", ["wildcard_identity_is_not_authorized"], "identity", "sigstore-verify"),
    case("remove_issuer_constraint", "public_cosign", ["wrong_issuer_is_not_authorized"], "issuer", "sigstore-verify"),
]

source_paths = [p for folder in ["src", "tests"] for p in (PROJECT / folder).rglob("*.rs")]
source_paths += [PROJECT / n for n in ["Cargo.toml", "Cargo.lock", "build.rs", "rust-toolchain.toml"]]
source_before = {p.relative_to(PROJECT).as_posix(): digest(p) for p in sorted(source_paths)}
summary = {"baseline_source_sha256": source_before, "rustflags": os.environ.get("RUSTFLAGS", ""), "cases": []}
baseline = run(["cargo", "test", "--locked"], PROJECT, EVIDENCE / "baseline.txt")
if baseline.returncode != 0:
    raise RuntimeError("Baseline must pass")

with tempfile.TemporaryDirectory(prefix="arkhe-verifier-gate-mutations-") as directory:
    for c in CASES:
        mutant = Path(directory) / c["name"]
        shutil.copytree(PROJECT, mutant, ignore=shutil.ignore_patterns("target", "evidence", "__pycache__"))
        dependency_source = None
        if c["dependency"]:
            vendor, dependency_source = patch_dependency(mutant, c["dependency"], c["name"])
        changed = mutant / "src/lib.rs"
        m = c["mutation"]
        if m == "rekor":
            changed = vendor / "src/verify.rs"
            before = "crate::verify_impl::verify_hashedrekord_entries(bundle, &artifact)?;"
            after = "// MUTATION ONLY: hashedrekord validator group disabled."
        elif m == "hash":
            before = "if sha256_hex(wasm_bytes) != EXPECTED_WASM_SHA256 {"
            after = "if false { // MUTATION ONLY: hash pin disabled"
        elif m == "freshness":
            before = "if age > MAX_ROOT_AGE_SECONDS {"
            after = "if false { // MUTATION ONLY: maximum capture age disabled"
        elif m == "warnings":
            before, after = "if !warnings.is_empty() {", "if false { // MUTATION ONLY: warnings accepted"
        elif m == "success":
            before, after = "if !success {", "if false { // MUTATION ONLY: unsuccessful report accepted"
        elif m == "identity":
            changed = vendor / "src/verify.rs"
            before = "if let Some(ref expected_identity) = policy.identity {"
            after = "if let Some(ref expected_identity) = None::<String> { // MUTATION ONLY"
        elif m == "issuer":
            changed = vendor / "src/verify.rs"
            before = "if let Some(ref expected_issuer) = policy.issuer {"
            after = "if let Some(ref expected_issuer) = None::<String> { // MUTATION ONLY"
        else:
            changed = vendor / ("src/proof.rs" if m == "merkle" else "src/verify_impl/tlog.rs")
            fn = {"merkle": "verify_inclusion_proof", "set": "verify_set", "checkpoint": "verify_checkpoint"}[m]
            before, after = "original function body", no_op_function(changed, fn)
        if m not in {"merkle", "set", "checkpoint"}:
            replace_once(changed, before, after)
        args = ["cargo", "test", "--locked"]
        args += ["--lib"] if c["unit"] else ["--test", c["target"]]
        if len(c["tests"]) == 1:
            args += [c["tests"][0], "--", "--exact"]
        outcome = run(args, mutant, EVIDENCE / f'{c["name"]}.txt')
        failed = sorted(re.findall(r"^test (\S+) \.\.\. FAILED$", outcome.stdout, re.MULTILINE))
        killed = outcome.returncode == 101 and "test result: FAILED" in outcome.stdout and failed == sorted(c["tests"])
        if m == "rekor":
            killed = killed and "expected artifact binding rejection, got Ok(" in outcome.stdout
        (EVIDENCE / f'{c["name"]}.patch.txt').write_text(f"- {before}\n+ {after}\n", encoding="utf-8")
        record = dict(mutation=c["name"], command=args, exit_code=outcome.returncode,
            killed_by_assertions=killed, expected_failed_tests=sorted(c["tests"]), actual_failed_tests=failed,
            dependency_graph_unchanged_except_intended_path_patch=True, mutated_source_sha256=digest(changed),
            dependency_patch=c["dependency"], application_guard_unit_test=c["unit"])
        if dependency_source:
            record["upstream_source_sha256"] = digest(dependency_source / changed.relative_to(vendor))
        summary["cases"].append(record)
        (EVIDENCE / "result.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        if not killed:
            raise RuntimeError(f'Mutant {c["name"]} was not killed by exactly the intended runtime assertions')

assert all(digest(PROJECT / p) == h for p, h in source_before.items()), "Original source changed"
final = run(["cargo", "test", "--locked"], PROJECT, EVIDENCE / "final-original.txt")
summary.update(original_source_unchanged=True, final_original_exit_code=final.returncode)
(EVIDENCE / "result.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
if final.returncode:
    raise RuntimeError("Final original suite failed")
print(f"{len(CASES)} mutants killed; source unchanged; final original suite passed.", flush=True)
