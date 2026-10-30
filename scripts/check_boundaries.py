import json, subprocess, tomllib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bad=[]

workspace = tomllib.loads((root / "Cargo.toml").read_text(encoding="utf-8"))["workspace"]
for member in sorted(workspace["members"]):
    if not member.startswith("cognition/"):
        continue
    crate = root / member
    cargo=(crate/"Cargo.toml").read_text()
    src="\n".join(p.read_text() for p in (crate/"src").rglob("*.rs"))
    manifest = tomllib.loads(cargo)
    if crate.name != "arkhe-cognition-sdk":
        for group in ["dependencies", "dev-dependencies", "build-dependencies"]:
            for alias, spec in manifest.get(group, {}).items():
                package = spec.get("package", alias) if isinstance(spec, dict) else alias
                if package == "arkhe-core":
                    bad.append(f"{crate.name}: bypasses cognition SDK through {alias}")
    if "arkhe-wormgraph" in cargo:
        bad.append(f"{crate.name}: direct WormGraph dependency")
    for token in ["SigningKey", "Keypair::sign", "ed25519_dalek::Signer"]:
        if token in src:
            bad.append(f"{crate.name}: signing capability token {token}")

work_cargo=(root/"work/arkhe-work/Cargo.toml").read_text()
if "arkhe-wormgraph" in work_cargo:
    bad.append("arkhe-work: direct WormGraph dependency")

# Inspect Cargo's resolved graph, including renamed and transitive dependencies.
# Keep source scanning as defense in depth; it is not the authority boundary.
from cognition_dependencies import audit_cognition_graph

metadata = json.loads(subprocess.check_output(
    ["cargo", "metadata", "--format-version", "1", "--locked"], cwd=root))
approved = json.loads((root/"config/cognition-dependencies.json").read_text())
bad.extend(audit_cognition_graph(metadata, approved, root))

if bad:
    print("\n".join("FAIL "+x for x in bad))
    raise SystemExit(1)

print("PASS cognition/work have no direct WormGraph dependency")
print("PASS cognition source contains no signing capability markers")

print("PASS resolved cognition dependency closure matches reviewed allowlist")
