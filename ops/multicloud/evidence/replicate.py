"""Immutable export replication. Cloud I/O is separate from the verified protocol.

No mutable 'latest' pointer is trusted: the caller supplies an exact manifest key.
The manifest describes the complete prefix; only missing objects are transferred.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

DOMAIN = b"ARKHE:REPLICA:MANIFEST:v1\0"
MAX_MANIFEST = 4 * 1024 * 1024
MAX_OBJECT = 64 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def load_manifest(raw, public_key, tenant, stream):
    if len(raw) > MAX_MANIFEST:
        raise ValueError("manifest too large")
    envelope = json.loads(raw, object_pairs_hook=unique_object)
    if set(envelope) != {"manifest", "signature"}:
        raise ValueError("invalid envelope")
    m = envelope["manifest"]
    Ed25519PublicKey.from_public_bytes(public_key).verify(
        base64.b64decode(envelope["signature"], validate=True), DOMAIN + canonical(m))
    if set(m) != {"schema", "tenant", "stream", "sequence", "previous", "objects", "writer_epoch"}:
        raise ValueError("unknown manifest fields")
    if m["schema"] != "arkhe-replica-v2" or (m["tenant"], m["stream"]) != (tenant, stream):
        raise ValueError("manifest scope mismatch")
    if type(m["writer_epoch"]) is not int or m["writer_epoch"] < 1:
        raise ValueError("invalid writer epoch")
    if type(m["sequence"]) is not int or m["sequence"] < 1:
        raise ValueError("invalid sequence")
    if not re.fullmatch(r"[a-f0-9]{64}", m["previous"]):
        raise ValueError("invalid previous digest")
    if not isinstance(m["objects"], list) or not 3 <= len(m["objects"]) <= 10000:
        raise ValueError("invalid object count")
    names = set()
    for obj in m["objects"]:
        if set(obj) != {"key", "size", "sha256"}:
            raise ValueError("invalid object fields")
        key = obj["key"]
        # Single content-addressed namespace; no arbitrary paths or traversal.
        if not re.fullmatch(r"objects/[a-f0-9]{64}", key) or key in names:
            raise ValueError("unsafe or duplicate object key")
        if key != "objects/" + obj["sha256"]:
            raise ValueError("object key does not bind content")
        if type(obj["size"]) is not int or not 0 < obj["size"] <= MAX_OBJECT:
            raise ValueError("invalid object size")
        names.add(key)
    return m


class FileStore:
    """Local protocol tests and operator rehearsal, not an object-lock emulator."""
    def __init__(self, root):
        self.root = Path(root)

    def path(self, key):
        if not re.fullmatch(r"[a-zA-Z0-9_./-]+", key) or ".." in key or key.startswith("/"):
            raise ValueError("unsafe key")
        return self.root / key

    def get(self, key, limit):
        try:
            with self.path(key).open("rb") as f:
                raw = f.read(limit + 1)
        except FileNotFoundError:
            return None
        if len(raw) > limit:
            raise ValueError("object exceeds size limit")
        return raw

    def put_once(self, key, raw):
        path = self.path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with path.open("xb") as f:
                f.write(raw)
        except FileExistsError:
            if self.get(key, len(raw)) != raw:
                raise ValueError("immutable object collision")


class S3Store:
    def __init__(self, bucket):
        import boto3
        self.client = boto3.client("s3")
        self.bucket = bucket

    def get(self, key, limit):
        from botocore.exceptions import ClientError
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as e:
            if e.response["Error"]["Code"] in {"NoSuchKey", "404"}:
                return None
            raise
        with response["Body"] as body:
            raw = body.read(limit + 1)
        if len(raw) > limit:
            raise ValueError("S3 object exceeds size limit")
        return raw

    def put_once(self, key, raw):
        from botocore.exceptions import ClientError
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=raw,
                                   IfNoneMatch="*", ServerSideEncryption="AES256")
        except ClientError as e:
            if e.response["Error"]["Code"] not in {"PreconditionFailed", "412"}:
                # A 409 is retryable, not proof that the intended object exists.
                raise
            if self.get(key, len(raw)) != raw:
                raise ValueError("immutable S3 collision")


class BlobStore:
    def __init__(self, account_url, container):
        from azure.identity import DefaultAzureCredential
        from azure.storage.blob import ContainerClient
        if not account_url.startswith("https://"):
            raise ValueError("Blob endpoint requires HTTPS")
        self.client = ContainerClient(account_url, container, credential=DefaultAzureCredential())

    def get(self, key, limit):
        from azure.core.exceptions import ResourceNotFoundError
        try:
            blob = self.client.get_blob_client(key)
            props = blob.get_blob_properties()
            if props.size > limit:
                raise ValueError("Blob object exceeds size limit")
            raw = blob.download_blob(length=limit + 1).readall()
            if len(raw) > limit:
                raise ValueError("Blob object exceeds size limit")
            return raw
        except ResourceNotFoundError:
            return None

    def put_once(self, key, raw):
        from azure.core.exceptions import ResourceExistsError, ResourceModifiedError
        try:
            self.client.upload_blob(key, raw, overwrite=False)
        except (ResourceExistsError, ResourceModifiedError):
            if self.get(key, len(raw)) != raw:
                raise ValueError("immutable Blob collision")


def replicate(source, target, manifest_key, public_key, tenant, stream, verifier, previous_key=None):
    """Publish readiness only after exact readback and independent verification.

    verifier(directory, manifest) must verify native SignedCheckpoint, local MMR
    and external transparency evidence. It is trusted code, never manifest input.
    Immutable receipts use sequence numbers; competing forks collide rather than win.
    """
    if verifier is None:
        raise ValueError("independent checkpoint verifier is mandatory")
    raw = source.get(manifest_key, MAX_MANIFEST)
    if raw is None:
        raise ValueError("missing manifest")
    if manifest_key != "manifests/" + sha(raw) + ".json":
        raise ValueError("manifest key must pin the exact envelope digest")
    m = load_manifest(raw, public_key, tenant, stream)
    prefix = f"receipts/{sha(canonical([tenant, stream]))}/"
    if m["sequence"] == 1:
        if m["previous"] != "0" * 64 or previous_key is not None:
            raise ValueError("invalid genesis")
    else:
        expected_key = prefix + str(m["sequence"] - 1) + ".json"
        if previous_key != expected_key:
            raise ValueError("previous receipt required at exact preceding sequence")
        previous = target.get(previous_key, MAX_MANIFEST)
        if previous is None:
            raise ValueError("previous receipt missing")
        receipt = json.loads(previous, object_pairs_hook=unique_object)
        if receipt["manifest_sha256"] != m["previous"]:
            raise ValueError("checkpoint fork")
        # Previous signed manifest must be present and bind every prefix object.
        old_raw = target.get("manifests/" + m["previous"] + ".json", MAX_MANIFEST)
        if old_raw is None or sha(old_raw) != m["previous"]:
            raise ValueError("previous manifest missing or corrupt")
        old = load_manifest(old_raw, public_key, tenant, stream)
        if old["sequence"] != m["sequence"] - 1:
            raise ValueError("sequence gap")
        if m["writer_epoch"] < old["writer_epoch"]:
            raise ValueError("replica epoch regressed")
        # First two objects are checkpoint and Rekor bundle; remaining are immutable blocks.
        if m["objects"][2:2 + len(old["objects"][2:])] != old["objects"][2:]:
            raise ValueError("history prefix was rewritten")
    copied = 0
    with tempfile.TemporaryDirectory(prefix="arkhe-replica-") as directory:
        root = Path(directory)
        (root / "manifest.json").write_bytes(raw)
        for obj in m["objects"]:
            data = target.get(obj["key"], obj["size"])
            if data is None:
                data = source.get(obj["key"], obj["size"])
                if data is None or len(data) != obj["size"] or sha(data) != obj["sha256"]:
                    raise ValueError("source block integrity failure")
                target.put_once(obj["key"], data)
                copied += 1
                data = target.get(obj["key"], obj["size"])
            if data is None or len(data) != obj["size"] or sha(data) != obj["sha256"]:
                raise ValueError("replica readback integrity failure")
            path = root / obj["key"]
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(data)
        verifier(root, m)
    digest = sha(raw)
    target.put_once("manifests/" + digest + ".json", raw)
    receipt = canonical({"schema": "arkhe-replica-receipt-v1", "manifest_sha256": digest,
                         "tenant": tenant, "stream": stream, "sequence": m["sequence"]})
    receipt_key = prefix + str(m["sequence"]) + ".json"
    target.put_once(receipt_key, receipt)
    return {"receipt": receipt_key, "manifest_sha256": digest, "objects_copied": copied}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--account-url", required=True)
    parser.add_argument("--container", default="evidence")
    parser.add_argument("--manifest-key", required=True)
    parser.add_argument("--public-key-hex", required=True)
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--stream", required=True)
    parser.add_argument("--previous-receipt")
    parser.add_argument("--verifier-config", required=True, type=Path,
                        help="Trusted local JSON argv; directory appended as last argument")
    args = parser.parse_args()
    command = json.loads(args.verifier_config.read_text())
    if not isinstance(command, list) or not command or not all(isinstance(s, str) for s in command):
        raise ValueError("verifier configuration must be an argv array")
    def verify(root, _manifest):
        subprocess.run([*command, str(root)], check=True, timeout=300, stdin=subprocess.DEVNULL)
    print(json.dumps(replicate(
        S3Store(args.bucket), BlobStore(args.account_url, args.container),
        args.manifest_key, bytes.fromhex(args.public_key_hex), args.tenant, args.stream,
        verify, args.previous_receipt)))


if __name__ == "__main__":
    main()
