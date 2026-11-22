"""Offline byte-integrity check. Supply a previously trusted Ed25519 public key."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import sys
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


def verify(root, trusted_key):
    manifest = (root / "manifest.json").read_bytes()
    Ed25519PublicKey.from_public_bytes(trusted_key).verify(
        (root / "manifest.sig").read_bytes(), manifest
    )
    document = json.loads(manifest)
    if document["format"] != "arkhe-lab-manifest-1":
        raise ValueError("unsupported format")
    if "report.json" not in document["files"]:
        raise ValueError("report missing from manifest")
    for name, expected in document["files"].items():
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("invalid manifest path")
        path = root / relative
        if path.is_symlink() or root.resolve() not in path.resolve().parents:
            raise ValueError("path outside bundle")
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("digest mismatch: " + name)
    return len(document["files"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--trusted-key-base64", required=True)
    args = parser.parse_args()
    try:
        count = verify(
            args.directory, base64.b64decode(args.trusted_key_base64, validate=True)
        )
        print(
            f"INTEGRITY_VALID: {count} signed files. This does not validate control efficacy or completeness."
        )
    except Exception as error:
        print(f"REJECTED: {type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(1)
