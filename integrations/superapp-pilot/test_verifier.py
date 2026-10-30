"""Run after exporting evidence/demo. Negative tests include validly re-signed lies."""
import copy
import os
import unittest
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import verify_package as v

BASE = Path(__file__).resolve().parent
LATEST = BASE / "evidence/LATEST.txt"
# Default: demo of the last validate.py run, which includes mmr-packages.json.
DEFAULT_DEMO = BASE / LATEST.read_text(encoding="utf-8").strip() / "demo" if LATEST.exists() else BASE / "evidence/demo"
DEMO = Path(os.environ.get("PILOT_DEMO_DIR", str(DEFAULT_DEMO)))

class IndependentVerifierTests(unittest.TestCase):
    def setUp(self):
        self.p = v.load(DEMO / "package.json")
        self.trust = v.load(DEMO / "DEMO-TRUST-NOT-PRODUCTION.json")
        self.now = self.p["evaluated_at"]

    def resign(self):
        # Public demo gate key. Re-signing tests semantic checks beyond authenticity.
        self.p["gate_signature"] = list(Ed25519PrivateKey.from_private_bytes(bytes([33])*32).sign(v.package_bytes(self.p)))

    def verify(self):
        return v.verify_package(self.p, self.trust, self.now)

    def test_valid_package(self):
        self.assertIn("PACKAGE_VERIFIED", self.verify())

    def test_tampered_decision_api_denial_checkpoint_and_proof(self):
        original = copy.deepcopy(self.p)
        mutations = [
            lambda p: p.update(decision="Reject"),
            lambda p: p["events"][0].update(api="contacts"),
            lambda p: p["events"][-1].update(reason="changed"),
            lambda p: p["artifact"]["checkpoint"]["signature"].__setitem__(0, 0),
            lambda p: p["artifact"]["proof"][0]["hash"].__setitem__(0, 0),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                self.p = copy.deepcopy(original)
                mutate(self.p)
                with self.assertRaises(Exception): self.verify()

    def test_resigned_bundle_mismatch(self):
        self.p["artifact"]["bundle"][0] ^= 1
        self.resign()
        with self.assertRaisesRegex(ValueError, "bundle digest"): self.verify()

    def test_resigned_wrong_position(self):
        self.p["artifact"]["leaf_index"] = self.p["artifact"]["checkpoint"]["count"]
        self.resign()
        with self.assertRaisesRegex(ValueError, "MMR position"): self.verify()

    def test_attacker_trust_cannot_be_embedded(self):
        self.p["trust"] = self.trust
        with self.assertRaisesRegex(ValueError, "unexpected fields"): self.verify()

    def test_unpinned_gate(self):
        self.trust["gate_keys"] = []
        with self.assertRaisesRegex(ValueError, "gate not pinned"): self.verify()

    def test_unpinned_publisher(self):
        self.trust["publisher_keys"] = []
        with self.assertRaisesRegex(ValueError, "publisher not pinned"): self.verify()

    def test_unpinned_checkpoint(self):
        self.trust["checkpoint_keys"] = []
        with self.assertRaisesRegex(ValueError, "checkpoint signer not pinned"): self.verify()

    def test_frozen_mmr_interoperability_all_positions(self):
        packages = v.load(DEMO / "mmr-packages.json")
        self.assertEqual(len(packages), 26)
        for package in packages:
            with self.subTest(count=package["artifact"]["checkpoint"]["count"], index=package["artifact"]["leaf_index"]):
                v.verify_package(package, self.trust, self.now)

    def test_expired_and_future(self):
        self.now += 301
        with self.assertRaisesRegex(ValueError, "expired"): self.verify()
        self.now = self.p["evaluated_at"] - 1
        with self.assertRaisesRegex(ValueError, "future"): self.verify()

    def test_resigned_policy_violation(self):
        self.p["events"][0]["api"] = "contacts"
        self.resign()
        with self.assertRaisesRegex(ValueError, "violates policy"): self.verify()

    def test_list_encoding_ambiguity_removed(self):
        self.p["consent"] = ["ab", "c"]
        one = v.package_bytes(self.p)
        self.p["consent"] = ["a", "bc"]
        self.assertNotEqual(one, v.package_bytes(self.p))

    def test_shifted_boundaries_and_empty_entries_encode_distinctly(self):
        seen = set()
        for consent in (["a,b"], ["a", "b"], ["ab", "c"], ["a", "bc"], [], [""], ["", ""]):
            self.p["consent"] = consent
            b = v.package_bytes(self.p)
            self.assertNotIn(b, seen)
            seen.add(b)
        m = self.p["artifact"]["manifest"]
        m["imports"], m["permissions"] = ["a"], []
        one = v.manifest_bytes(m)
        m["imports"], m["permissions"] = [], ["a"]
        self.assertNotEqual(one, v.manifest_bytes(m))
        e = self.p["events"][0]
        e["api"], e["reason"] = "ab", "c"
        one = v.package_bytes(self.p)
        e["api"], e["reason"] = "a", "bc"
        self.assertNotEqual(one, v.package_bytes(self.p))

    def test_duplicate_unknown_and_invalid_bytes(self):
        self.p["unexpected"] = True
        with self.assertRaises(ValueError): self.verify()
        with self.assertRaises(ValueError): v.raw([True])

if __name__ == "__main__":
    unittest.main(verbosity=2)
