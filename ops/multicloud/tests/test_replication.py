import base64
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

EVIDENCE = Path(__file__).resolve().parents[1] / "evidence"
sys.path.insert(0, str(EVIDENCE))
from replicate import DOMAIN, FileStore, canonical, replicate, sha
from export import export
from upload import upload
from promote import freeze


class ReplicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = FileStore(Path(self.temp.name) / "source")
        self.target = FileStore(Path(self.temp.name) / "target")
        self.key = Ed25519PrivateKey.generate()
        self.public = self.key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.block = b"A" * 32
        self.manifest = self.make(1, "0" * 64, [self.block])
        self.calls = 0

    def make(self, sequence, previous, blocks, epoch=1):
        snapshot = canonical({"schema": "arkhe-replica-bundle-v1", "writer_epoch": epoch,
                              "test_checkpoint": sequence,
                              "records": [{"envelope": {"record_hash": list(b)}} for b in blocks]})
        return export(self.source, snapshot, b"rekor" + bytes([sequence]),
                      blocks, self.key, "tenant", "wormgraph", sequence, previous)

    def verifier(self, root, manifest):
        # Test double checks materialization, not cryptographic/Merkle validity.
        self.calls += 1
        self.assertTrue((root / "manifest.json").is_file())
        for obj in manifest["objects"]:
            self.assertEqual(sha((root / obj["key"]).read_bytes()), obj["sha256"])

    def run_replication(self, key=None, previous=None, verifier=None):
        return replicate(self.source, self.target, key or self.manifest, self.public,
                         "tenant", "wormgraph", verifier or self.verifier, previous)

    def receipts(self):
        return list(self.target.root.glob("receipts/**/*.json"))

    def test_idempotent_retry_uses_only_missing_objects(self):
        first = self.run_replication()
        second = self.run_replication()
        self.assertEqual(first["objects_copied"], 3)
        self.assertEqual(second["objects_copied"], 0)
        self.assertEqual(first["receipt"], second["receipt"])
        self.assertEqual(len(self.receipts()), 1)
        self.assertEqual(self.calls, 2)

    def test_upload_commits_manifest_last_and_is_idempotent(self):
        calls = []
        original = self.target.put_once
        def record(key, raw):
            calls.append(key)
            original(key, raw)
        self.target.put_once = record
        for _ in range(2):
            upload(self.source, self.target, self.manifest, self.public, "tenant", "wormgraph")
        self.assertEqual(calls[3], self.manifest)
        self.assertEqual(calls[-1], self.manifest)
        self.assertEqual(self.target.get(self.manifest, 100000), self.source.get(self.manifest, 100000))

    def test_upload_missing_block_does_not_publish_manifest(self):
        self.source.path("objects/" + sha(self.block)).unlink()
        with self.assertRaises(ValueError):
            upload(self.source, self.target, self.manifest, self.public, "tenant", "wormgraph")
        self.assertIsNone(self.target.get(self.manifest, 100000))

    def test_promotion_pins_bytes_and_refuses_modified_sources(self):
        upload(self.source, self.target, self.manifest, self.public, "tenant", "wormgraph")
        raw = self.target.get(self.manifest, 100000)
        (self.target.root / "manifest.json").write_bytes(raw)
        destination = Path(self.temp.name) / "pinned"
        destination.mkdir()
        freeze(self.target.root, destination)
        key = "objects/" + sha(self.block)
        self.target.path(key).write_bytes(b"Z" * 32)
        self.assertEqual((destination / key).read_bytes(), self.block)
        with self.assertRaisesRegex(ValueError, "integrity"):
            freeze(self.target.root, destination)

    def test_incremental_extension_and_strict_predecessor(self):
        first = self.run_replication()
        next_key = self.make(2, first["manifest_sha256"], [self.block, b"B" * 32])
        result = self.run_replication(next_key, first["receipt"])
        self.assertEqual(result["objects_copied"], 3)  # checkpoint, bundle, new block
        self.assertEqual(len(self.receipts()), 2)

    def test_interruption_after_object_write_is_retryable(self):
        original = self.target.put_once
        calls = 0
        def interrupted(key, data):
            nonlocal calls
            original(key, data)
            calls += 1
            if calls == 1:
                raise OSError("crash after write")
        self.target.put_once = interrupted
        with self.assertRaises(OSError):
            self.run_replication()
        self.assertEqual(self.receipts(), [])
        self.target.put_once = original
        self.assertEqual(self.run_replication()["objects_copied"], 2)

    def test_verifier_failure_never_publishes_receipt(self):
        def rejected(*_):
            raise ValueError("MMR or Rekor rejected")
        with self.assertRaises(ValueError):
            self.run_replication(verifier=rejected)
        self.assertEqual(self.receipts(), [])
        self.assertEqual(self.run_replication()["objects_copied"], 0)

    def test_missing_verifier_fails_closed(self):
        with self.assertRaises(ValueError):
            replicate(self.source, self.target, self.manifest, self.public, "tenant", "wormgraph", None)
        self.assertFalse(self.target.root.exists())

    def test_hash_only_export_is_no_longer_accepted(self):
        with self.assertRaisesRegex(ValueError, "recoverable"):
            export(self.source, b'{"leaf_count":1}', b"rekor", [self.block],
                   self.key, "tenant", "wormgraph", 1, "0" * 64)

    def test_content_snapshot_and_hash_blocks_must_match(self):
        raw = canonical({"schema": "arkhe-replica-bundle-v1", "writer_epoch": 1,
                         "records": [{"envelope": {"record_hash": list(self.block)}}]})
        with self.assertRaisesRegex(ValueError, "hash blocks"):
            export(self.source, raw, b"rekor", [b"Z" * 32], self.key,
                   "tenant", "wormgraph", 1, "0" * 64)

    def test_epoch_regression_fails_before_publishing_readiness(self):
        self.manifest = self.make(1, "0" * 64, [self.block], epoch=2)
        first = self.run_replication()
        next_key = self.make(2, first["manifest_sha256"], [self.block, b"B" * 32])
        with self.assertRaisesRegex(ValueError, "epoch regressed"):
            self.run_replication(next_key, first["receipt"])

    def test_missing_or_corrupt_source_block_is_rejected(self):
        obj = json.loads(self.source.get(self.manifest, 100000))["manifest"]["objects"][2]
        self.source.path(obj["key"]).write_bytes(b"C" * 32)
        with self.assertRaises(ValueError):
            self.run_replication()
        self.assertEqual(self.receipts(), [])

    def test_corrupt_existing_replica_is_not_overwritten(self):
        self.run_replication()
        obj = "objects/" + sha(self.block)
        self.target.path(obj).write_bytes(b"C" * 32)
        with self.assertRaises(ValueError):
            self.run_replication()
        self.assertEqual(self.target.get(obj, 32), b"C" * 32)

    def test_wrong_signer_and_scope_are_rejected(self):
        wrong = Ed25519PrivateKey.generate().public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        for public, tenant, stream in [(wrong, "tenant", "wormgraph"),
                                       (self.public, "other", "wormgraph"),
                                       (self.public, "tenant", "other")]:
            with self.assertRaises(Exception):
                replicate(self.source, self.target, self.manifest, public, tenant, stream, self.verifier)
        self.assertFalse(self.target.root.exists())

    def test_manifest_tampering_fails_before_io(self):
        raw = self.source.get(self.manifest, 100000).replace(b'"sequence":1', b'"sequence":2')
        self.source.path(self.manifest).write_bytes(raw)
        with self.assertRaises(Exception):
            self.run_replication()
        self.assertFalse(self.target.root.exists())

    def test_history_rewrite_and_sequence_gap_rejected(self):
        first = self.run_replication()
        for seq, blocks in [(2, [b"B" * 32]), (3, [self.block, b"B" * 32])]:
            next_key = self.make(seq, first["manifest_sha256"], blocks)
            with self.assertRaises(ValueError):
                self.run_replication(next_key, first["receipt"])
        self.assertEqual(len(self.receipts()), 1)

    def test_competing_genesis_cannot_replace_receipt(self):
        self.run_replication()
        fork = self.make(1, "0" * 64, [b"B" * 32])
        with self.assertRaises(ValueError):
            self.run_replication(fork)
        self.assertEqual(len(self.receipts()), 1)

    def test_signed_path_traversal_is_rejected(self):
        envelope = json.loads(self.source.get(self.manifest, 100000))
        envelope["manifest"]["objects"][0]["key"] = "../outside"
        envelope["signature"] = base64.b64encode(
            self.key.sign(DOMAIN + canonical(envelope["manifest"]))).decode()
        raw = canonical(envelope)
        key = "manifests/" + sha(raw) + ".json"
        self.source.put_once(key, raw)
        with self.assertRaisesRegex(ValueError, "unsafe or duplicate"):
            self.run_replication(key)
        self.assertFalse(self.target.root.exists())

    def test_blob_and_s3_missing_is_distinct_from_access_denied(self):
        # SDK adapters must propagate non-404 errors; SDK behavior tested in cloud rehearsal.
        self.assertIsNone(self.source.get("missing", 1))
        with self.assertRaises(ValueError):
            self.source.get(self.manifest, 1)


class VerifierTests(unittest.TestCase):
    def test_set_only_bundle_is_refused_before_native_execution(self):
        spec = importlib.util.spec_from_file_location("replica_verify", EVIDENCE / "verify.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "manifest.json").write_text(json.dumps({"manifest": {"schema": "arkhe-replica-v2", "writer_epoch": 1, "objects": [
                {"key": "checkpoint"}, {"key": "bundle"}, {"key": "records"}]}}))
            (root / "checkpoint").write_text('{"schema":"arkhe-replica-bundle-v1","writer_epoch":1}')
            (root / "bundle").write_text('{"verificationMaterial":{"tlogEntries":[{}]}}')
            with self.assertRaisesRegex(ValueError, "inclusion proof"):
                module.verify(root, "missing", "missing", "missing", "missing", "missing")


if __name__ == "__main__":
    unittest.main()
