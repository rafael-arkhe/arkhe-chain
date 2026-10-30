"""Export an allowlisted standalone Salesforce repository without local runtime data or secrets."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--destination",required=True,type=Path)
    args=parser.parse_args()
    bridge=Path(__file__).resolve().parents[1]
    arkhe=bridge.parents[1]
    target=args.destination.resolve()
    if target.exists():
        raise SystemExit("Destination already exists; refusing to overwrite a repository")
    target.mkdir(parents=True)
    origins={}

    def copy(source,destination):
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(source,destination)
        origins[destination.relative_to(target).as_posix()]={"source":source.relative_to(arkhe).as_posix(),
            "sha256":hashlib.sha256(source.read_bytes()).hexdigest()}

    ignored={"node_modules","evidence","private",".sf",".sfdx","__pycache__",".git","environment-config"}
    for path in (bridge/"salesforce").rglob("*"):
        relative=path.relative_to(bridge/"salesforce")
        if path.is_file() and not any(part in ignored for part in relative.parts) and (
            path.suffix in {".py",".mjs",".json",".xml",".md",".yml",".yaml",".cls",".trigger"}
            or path.name in {".gitignore",".forceignore"}):
            copy(path,target/relative)
    for relative in ["integration/arkhe-crm-bridge","verification/crates/arkhe-verify-core","kernel/arkhe-core"]:
        source=arkhe/relative
        copy(source/"Cargo.toml",target/"native"/relative/"Cargo.toml")
        folders=["src"] + (["tests","fixtures","examples"] if source==bridge else [])
        for folder in folders:
            for path in (source/folder).rglob("*"):
                if path.is_file() and path.suffix in {".rs",".json"}:
                    copy(path,target/"native"/relative/path.relative_to(source))
    copy(arkhe/"rust-toolchain.toml",target/"rust-toolchain.toml")
    original=(arkhe/"Cargo.toml").read_text(encoding="utf-8")
    dependencies=original.split("[workspace.dependencies]",1)[1]
    native='''[workspace]
resolver = "2"
members = ["integration/arkhe-crm-bridge", "verification/crates/arkhe-verify-core", "kernel/arkhe-core"]
[workspace.package]
edition = "2021"
license = "Apache-2.0 OR MIT"
version = "0.1.0"
[workspace.dependencies]
'''+dependencies
    (target/"native/Cargo.toml").write_text(native,encoding="utf-8")
    copy(arkhe/"Cargo.lock",target/"native/Cargo.lock")
    (target/"SOURCE-MANIFEST.json").write_text(json.dumps({"schema":1,"snapshot_date":"2026-10-25",
        "note":"SHA-256 provenance for copied inputs, not an org validation or production attestation. Native Cargo manifest is a generated minimal workspace; lockfile is normalized after export.",
        "files":origins},indent=2),encoding="utf-8")
    print(f"Exported {len(origins)} allowlisted files to {target}; initialize Git only after local verification")


if __name__=="__main__": main()
