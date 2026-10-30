"""Build a signed object-store export from an already signed/anchored checkpoint.

Does not sign the checkpoint, contact Rekor or read a live database. Export a
transactionally consistent prefix using the application, then run this packager.
"""
import argparse
import base64
import json
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from replicate import DOMAIN, FileStore, canonical, sha, MAX_OBJECT


def export(store, checkpoint, bundle, blocks, key, tenant, stream, sequence, previous):
    snapshot = json.loads(checkpoint)
    if snapshot.get("schema") != "arkhe-replica-bundle-v1" or not snapshot.get("records"):
        raise ValueError("recoverable ReplicaBundle is required; hash-only export is refused")
    if type(snapshot.get("writer_epoch")) is not int or snapshot["writer_epoch"] < 1:
        raise ValueError("snapshot writer epoch is required")
    expected = b"".join(bytes(r["envelope"]["record_hash"]) for r in snapshot["records"])
    if b"".join(blocks) != expected:
        raise ValueError("hash blocks do not match journal entries")
    objects = []
    for data in [checkpoint, bundle, *blocks]:
        if not data or len(data) > MAX_OBJECT:
            raise ValueError("invalid export object size")
        obj = {"key": "objects/" + sha(data), "sha256": sha(data), "size": len(data)}
        store.put_once(obj["key"], data)
        objects.append(obj)
    m = {"schema": "arkhe-replica-v2", "tenant": tenant, "stream": stream,
         "writer_epoch": snapshot["writer_epoch"],
         "sequence": sequence, "previous": previous, "objects": objects}
    raw = canonical({"manifest": m, "signature": base64.b64encode(key.sign(DOMAIN + canonical(m))).decode()})
    manifest_key = "manifests/" + sha(raw) + ".json"
    store.put_once(manifest_key, raw)
    return manifest_key


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--checkpoint", required=True, type=Path, help="Signed recoverable ReplicaBundle JSON, not a bare checkpoint")
    p.add_argument("--bundle", required=True, type=Path)
    p.add_argument("--blocks", nargs="+", type=Path, help="Optional pre-split hashes; default is one immutable hash block per journal record")
    p.add_argument("--signing-key", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--tenant", required=True)
    p.add_argument("--stream", required=True)
    p.add_argument("--sequence", required=True, type=int)
    p.add_argument("--previous", default="0" * 64)
    a = p.parse_args()
    key = serialization.load_pem_private_key(a.signing_key.read_bytes(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("manifest signing key must be Ed25519")
    snapshot = a.checkpoint.read_bytes()
    blocks = ([b.read_bytes() for b in a.blocks] if a.blocks else
              [bytes(r["envelope"]["record_hash"]) for r in json.loads(snapshot)["records"]])
    print(export(FileStore(a.output), snapshot, a.bundle.read_bytes(), blocks,
                 key, a.tenant, a.stream, a.sequence, a.previous))
