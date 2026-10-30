"""Verify content/transparency first, then atomically fence and promote in PG."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import re
from replicate import MAX_MANIFEST, MAX_OBJECT, sha, unique_object
from verify import verify


def freeze(source, destination):
    """Pin one exact local byte snapshot across native/anchor/promotion gates."""
    with (source / "manifest.json").open("rb") as stream:
        raw = stream.read(MAX_MANIFEST + 1)
    if len(raw) > MAX_MANIFEST:
        raise ValueError("manifest too large")
    manifest = json.loads(raw, object_pairs_hook=unique_object)["manifest"]
    for obj in manifest["objects"]:
        key = obj["key"]
        if not re.fullmatch(r"objects/[a-f0-9]{64}", key) or not 0 < obj["size"] <= MAX_OBJECT:
            raise ValueError("unsafe promotion object")
        with (source / key).open("rb") as stream:
            data = stream.read(obj["size"] + 1)
        if len(data) != obj["size"] or sha(data) != obj["sha256"] or key != "objects/" + sha(data):
            raise ValueError("promotion object integrity failure")
        target = destination / key
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(data)
    (destination / "manifest.json").write_bytes(raw)
    return manifest

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("native-binary", "checkpoint-trust", "cosign", "signer-key", "trusted-root", "promotion-binary"):
        p.add_argument("--" + name, required=True, type=Path)
    p.add_argument("--new-login", required=True)
    p.add_argument("directory", type=Path)
    a = p.parse_args()
    with tempfile.TemporaryDirectory(prefix="arkhe-promotion-") as directory:
        root = Path(directory)
        m = freeze(a.directory, root)
        verify(root, a.native_binary, a.checkpoint_trust, a.cosign, a.signer_key, a.trusted_root)
        snapshot = root / m["objects"][0]["key"]
        subprocess.run([str(a.promotion_binary), str(a.checkpoint_trust), str(snapshot), a.new_login],
                       check=True, timeout=120, stdin=subprocess.DEVNULL)
