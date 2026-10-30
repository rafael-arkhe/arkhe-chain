"""Package reviewed source and observed journal evidence, without build products."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[2]
source = root / "output/wasm-policy-release-repo/verification/arkhe-proof-release"
evidence = root / "arkhe-verify-self-demo/evidence/legacy-journal"
archive = root / "arkhe-legacy-journal-20261025.zip"
manifest = json.loads((source / "source-manifest.json").read_text())
files = {}
for entry in manifest["files"]:
    path = source / entry["path"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"], path
    files["source/" + entry["path"]] = path
files["source/source-manifest.json"] = source / "source-manifest.json"
files["workflow/build-verify-wasm.yml"] = root / "output/wasm-policy-release-repo/.github/workflows/build-verify-wasm.yml"
for path in evidence.rglob("*"):
    if path.is_file() and path.name != "archive-manifest.json":
        files["evidence/" + path.relative_to(evidence).as_posix()] = path
for name in ["prepare_public_release.py", "package_legacy_journal.py"]:
    files["scripts/" + name] = root / "arkhe-verify-self-demo/scripts" / name
hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in sorted(files.items())}
(evidence / "archive-manifest.json").write_text(json.dumps({"files": hashes}, indent=2) + "\n")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as package:
    for name, path in sorted(files.items()):
        package.write(path, name)
    package.write(evidence / "archive-manifest.json", "archive-manifest.json")
with zipfile.ZipFile(archive) as package:
    for name, digest in hashes.items():
        assert hashlib.sha256(package.read(name)).hexdigest() == digest, name
print(json.dumps({"archive": str(archive), "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "hashed_files": len(hashes)}))
