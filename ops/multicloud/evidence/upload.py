"""Publish one signed export to S3 using conditional writes, manifest last."""
import argparse
from pathlib import Path
from replicate import FileStore, S3Store, MAX_MANIFEST, load_manifest, sha


def upload(source, target, manifest_key, public_key, tenant, stream):
    raw = source.get(manifest_key, MAX_MANIFEST)
    if raw is None or manifest_key != "manifests/" + sha(raw) + ".json":
        raise ValueError("missing or unpinned manifest")
    manifest = load_manifest(raw, public_key, tenant, stream)
    for obj in manifest["objects"]:
        data = source.get(obj["key"], obj["size"])
        if data is None or len(data) != obj["size"] or sha(data) != obj["sha256"]:
            raise ValueError("invalid local export object")
        target.put_once(obj["key"], data)
    target.put_once(manifest_key, raw)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--directory", required=True, type=Path)
    p.add_argument("--bucket", required=True)
    p.add_argument("--manifest-key", required=True)
    p.add_argument("--public-key-hex", required=True)
    p.add_argument("--tenant", required=True)
    p.add_argument("--stream", required=True)
    a = p.parse_args()
    upload(FileStore(a.directory), S3Store(a.bucket), a.manifest_key,
           bytes.fromhex(a.public_key_hex), a.tenant, a.stream)
    print(a.manifest_key)
