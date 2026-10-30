"""Check pinned bytes and static verdicts through the existing Arkhe runner."""
import hashlib
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parent


def main():
    manifest = json.loads((ROOT / "manifest.json").read_bytes())
    for item in manifest:
        if hashlib.sha256((ROOT / item["path"]).read_bytes()).hexdigest() != item["sha256"]:
            raise SystemExit(f"Hash mismatch: {item['path']}")
    jobs = json.loads((ROOT / "arkhe-vectors.json").read_bytes())
    expected = json.loads((ROOT / "expected.json").read_bytes())
    ids = [v["id"] for v in jobs]
    if len(ids) != 8 or len(set(ids)) != len(ids) or ids != [v["id"] for v in expected]:
        raise SystemExit("Expected eight uniquely identified cases in matching order")
    run = subprocess.run(
        ["cargo", "run", "--locked", "-q", "-p", "arkhe-verify-core",
         "--example", "gravit_interop", "--", str(ROOT / "arkhe-vectors.json")],
        cwd=ROOT.parents[2], check=True, capture_output=True, text=True,
    )
    actual = json.loads(run.stdout)
    verdicts = [{"id": v["id"], "accepted": v["accepted"]} for v in expected]
    if actual != verdicts:
        raise SystemExit(f"Verdict mismatch:\nactual={actual}\nexpected={verdicts}")
    print(f"PASS: {len(actual)} pinned Gravit interoperability cases; {len(manifest)} file hashes")


if __name__ == "__main__":
    main()
