"""Trusted verifier invoked by replicate.py. Requires native gate and Cosign 3.x.

All trust paths are outside the replica. No trust material is downloaded from it.
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile


def verify(root, native_binary, checkpoint_trust, cosign, signer_key, trusted_root):
    root = Path(root)
    envelope = json.loads((root / "manifest.json").read_bytes())
    objects = envelope["manifest"]["objects"]
    checkpoint = root / objects[0]["key"]
    snapshot = json.loads(checkpoint.read_bytes())
    if envelope["manifest"].get("schema") != "arkhe-replica-v2" or snapshot.get("schema") != "arkhe-replica-bundle-v1":
        raise ValueError("recoverable signed snapshot is required")
    if envelope["manifest"].get("writer_epoch") != snapshot.get("writer_epoch"):
        raise ValueError("manifest/snapshot epoch mismatch")
    bundle = root / objects[1]["key"]
    # Require an inclusion proof with signed log checkpoint, never only a SET.
    data = json.loads(bundle.read_bytes())
    entries = data.get("verificationMaterial", {}).get("tlogEntries", [])
    if not entries or any(not e.get("inclusionProof", {}).get("checkpoint", {}).get("envelope")
                          for e in entries):
        raise ValueError("Sigstore bundle requires inclusion proof and signed log checkpoint")
    with tempfile.TemporaryDirectory(prefix="arkhe-records-") as directory:
        records = Path(directory) / "records.bin"
        size = 0
        with records.open("wb") as out:
            for obj in objects[2:]:
                size += obj["size"]
                if size > 32_000_000 or obj["size"] % 32:
                    raise ValueError("record prefix exceeds native verifier profile")
                out.write((root / obj["key"]).read_bytes())
        subprocess.run([str(native_binary), str(checkpoint_trust), str(checkpoint), str(records)],
                       check=True, timeout=120, stdin=subprocess.DEVNULL)
    subprocess.run([
        str(cosign), "verify-blob", "--offline", "--new-bundle-format=true",
        "--key", str(signer_key), "--trusted-root", str(trusted_root),
        "--bundle", str(bundle), str(checkpoint),
    ], check=True, timeout=120, stdin=subprocess.DEVNULL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-binary", required=True, type=Path)
    parser.add_argument("--checkpoint-trust", required=True, type=Path)
    parser.add_argument("--cosign", required=True, type=Path)
    parser.add_argument("--signer-key", required=True, type=Path)
    parser.add_argument("--trusted-root", required=True, type=Path)
    parser.add_argument("directory", type=Path)
    a = parser.parse_args()
    verify(a.directory, a.native_binary, a.checkpoint_trust, a.cosign, a.signer_key, a.trusted_root)
