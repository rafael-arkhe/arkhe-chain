"""Adversarial fixtures. The separate run command audits the real checkout."""
import concurrent.futures
import copy
import json
import os
from pathlib import Path
import secrets
import shutil
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import delegated_audit as audit


class DelegatedAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.root = Path(cls.directory.name)
        repo = Path(__file__).resolve().parents[1]
        target = Path(os.environ.get("CARGO_TARGET_DIR", repo / "target"))
        name = "delegated_audit_ledger" + (".exe" if os.name == "nt" else "")
        cls.binary = target / "debug/examples" / name
        if not cls.binary.is_file():
            raise RuntimeError("build delegated_audit_ledger before running these tests")
        cls.secrets = {name: list(secrets.token_bytes(32)) for name in ["delegate", "mldsa", "validator_a", "validator_b"]}
        public = audit.ledger_call(cls.binary, "keys", cls.secrets)
        cls.authority = audit.Ed25519PrivateKey.generate()
        cls.delegate = audit.Ed25519PrivateKey.from_private_bytes(bytes(cls.secrets["delegate"]))
        cls.trust = {"version": 1, "authority_public": cls.authority.public_key().public_bytes_raw().hex(), "network_keys": public}
        cls.trust_path = cls.root / "trust.json"
        audit.write_json(cls.trust_path, cls.trust)
        cls.pin = audit.digest(cls.trust_path.read_bytes())
        cls.bundle = cls.root / "fixture"
        cls.bundle.mkdir()
        now = int(time.time())
        cls.grant = {
            "version": 1, "task_id": "0" * 32, "source_commit": "a" * 40,
            "source_tree": "b" * 40, "delegate_public": cls.delegate.public_key().public_bytes_raw().hex(),
            "network_keys_digest": audit.digest(audit.canonical(public)), "action": audit.ACTION,
            "max_attempts": 1, "max_seconds": 300, "issued_at": now - 1,
            "expires_at": now + 600, "output_directory": str(cls.bundle),
        }
        cls.envelope = audit.sign(cls.grant, cls.authority)
        cls.plan = {"task_id": cls.grant["task_id"], "action": audit.ACTION, "expected_commit": "a" * 40}
        audit.write_json(cls.bundle / "grant.json", cls.envelope)
        audit.write_json(cls.bundle / "plan.json", cls.plan)
        gate = cls.bundle / "gate"
        gate.mkdir()
        log = b"test result: ok. 1 passed; 0 failed; 0 ignored\n"
        (gate / "cargo-test.log").write_bytes(log)
        # This is deliberately a synthetic fixture, never reported as a real gate run.
        audit.write_json(gate / "manifest.json", {
            "commit": "a" * 40, "tree": "b" * 40, "test_exit_code": 0,
            "checkout_unchanged": True, "command": ["cargo", "test", "--locked", "-p", "arkhe-chain", "--no-fail-fast"],
            "log_sha256": audit.digest(log),
        })
        (cls.bundle / "report.md").write_bytes(b"Synthetic adversarial-test fixture.\n")
        receipt = {
            "version": 1, "task_id": cls.grant["task_id"], "source_commit": "a" * 40,
            "source_tree": "b" * 40, "grant_digest": audit.digest(audit.canonical(cls.envelope)),
            "plan_digest": audit.digest(audit.canonical(cls.plan)),
            "manifest_digest": audit.digest((gate / "manifest.json").read_bytes()),
            "log_digest": audit.digest(log), "report_digest": audit.digest((cls.bundle / "report.md").read_bytes()),
            "counts": {"passed": 1, "failed": 0, "ignored": 0}, "status": "success",
            "started_at": now, "finished_at": now, "planner": "synthetic test fixture",
        }
        audit.write_json(cls.bundle / "receipt.json", audit.sign(receipt, cls.delegate))
        ledger = cls.bundle / "ledger"
        ledger.mkdir()
        cls.receipt_digest = audit.digest((cls.bundle / "receipt.json").read_bytes())
        cls.evidence = audit.ledger_call(cls.binary, "seal", {
            "secrets": cls.secrets, "receipt_digest": cls.receipt_digest,
        }, ledger)
        audit.write_json(ledger / "evidence.json", cls.evidence)

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def validate(self, grant=None, plan=None, commit=None, tree=None, now=None):
        envelope = self.envelope if grant is None else audit.sign(grant, self.authority)
        return audit.validate_grant(envelope, self.trust, plan or self.plan,
            commit or "a" * 40, tree or "b" * 40, self.bundle, now or int(time.time()))

    def ledger_verify(self, evidence=None, keys=None, digest=None):
        return audit.ledger_call(self.binary, "verify", {
            "public_keys": keys or self.trust["network_keys"],
            "receipt_digest": digest or self.receipt_digest,
            "evidence": evidence or self.evidence,
        })

    def altered_bundle(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name) / "bundle"
        shutil.copytree(self.bundle, directory)
        return directory

    def test_public_bundle_verifies_without_private_keys(self):
        verified = audit.verify_bundle(self.bundle, self.trust_path, self.pin, self.binary)
        self.assertTrue(verified["verified"])
        self.assertEqual(verified["ledger"]["certificate_votes"], 2)

    def test_tampered_signature_is_rejected(self):
        envelope = copy.deepcopy(self.envelope)
        envelope["signature"] = "00" * 64
        with self.assertRaises(ValueError):
            audit.verify_signature(envelope, self.trust["authority_public"])

    def test_unknown_authority_is_rejected(self):
        envelope = audit.sign(self.grant, audit.Ed25519PrivateKey.generate())
        with self.assertRaises(ValueError):
            audit.verify_signature(envelope, self.trust["authority_public"])

    def test_expired_delegation_is_rejected(self):
        with self.assertRaises(ValueError):
            self.validate(now=self.grant["expires_at"])

    def test_future_delegation_is_rejected(self):
        with self.assertRaises(ValueError):
            self.validate(now=self.grant["issued_at"] - 1)

    def test_unknown_action_is_rejected(self):
        grant = dict(self.grant, action="send_money")
        with self.assertRaises(ValueError):
            self.validate(grant=grant)

    def test_command_injection_field_is_rejected(self):
        plan = dict(self.plan, command="echo unauthorized")
        with self.assertRaises(ValueError):
            self.validate(plan=plan)

    def test_other_commit_is_rejected(self):
        with self.assertRaises(ValueError):
            self.validate(commit="c" * 40)

    def test_other_tree_is_rejected(self):
        with self.assertRaises(ValueError):
            self.validate(tree="c" * 40)

    def test_other_delegate_is_rejected(self):
        with self.assertRaises(ValueError):
            self.validate(grant=dict(self.grant, delegate_public="00" * 32))

    def test_other_output_is_rejected(self):
        with self.assertRaises(ValueError):
            self.validate(grant=dict(self.grant, output_directory=str(self.root / "elsewhere")))

    def test_invalid_budgets_are_rejected(self):
        for value in [0, -1, True, 4]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.validate(grant=dict(self.grant, max_attempts=value))

    def test_duplicate_json_keys_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.json"
            path.write_bytes(b'{"action":"run_chain_gate","action":"send_money"}')
            with self.assertRaises(ValueError):
                audit.read_json(path)

    def test_reservation_survives_restart_and_refuses_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.sqlite"
            audit.Reservations(path).reserve(self.grant, self.envelope)
            with self.assertRaises(ValueError):
                audit.Reservations(path).reserve(self.grant, self.envelope)

    def test_concurrent_dispatch_has_one_winner(self):
        with tempfile.TemporaryDirectory() as directory:
            reservations = audit.Reservations(Path(directory) / "state.sqlite")
            barrier = threading.Barrier(2)
            def reserve():
                barrier.wait()
                try:
                    reservations.reserve(self.grant, self.envelope)
                    return True
                except ValueError:
                    return False
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: reserve(), range(2)))
            self.assertEqual(sorted(results), [False, True])

    def test_failed_attempt_consumes_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            reservations = audit.Reservations(Path(directory) / "state.sqlite")
            reservations.reserve(self.grant, self.envelope)
            reservations.finish(self.grant["task_id"], False)
            with self.assertRaises(ValueError):
                reservations.reserve(self.grant, self.envelope)

    def test_completed_task_cannot_be_dispatched_again(self):
        with tempfile.TemporaryDirectory() as directory:
            grant = dict(self.grant, max_attempts=2)
            envelope = audit.sign(grant, self.authority)
            reservations = audit.Reservations(Path(directory) / "state.sqlite")
            reservations.reserve(grant, envelope)
            reservations.finish(grant["task_id"], True)
            with self.assertRaises(ValueError):
                reservations.reserve(grant, envelope)

    def test_cancel_before_dispatch_creates_no_log(self):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / "log"
            with self.assertRaises(ValueError):
                audit.run_process([sys.executable, "-c", "raise SystemExit(99)"], directory, log, 10, lambda: True)
            self.assertFalse(log.exists())

    def test_timeout_stops_running_process(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "timeout"):
                audit.run_process([sys.executable, "-c", "import time;time.sleep(10)"], directory, Path(directory) / "log", 0.1)

    def test_cancellation_stops_running_process(self):
        with tempfile.TemporaryDirectory() as directory:
            started = time.monotonic()
            with self.assertRaisesRegex(ValueError, "cancelled"):
                audit.run_process([sys.executable, "-c", "import time;time.sleep(10)"], directory, Path(directory) / "log", 10,
                                  lambda: time.monotonic() - started > 0.1)

    def test_altered_log_is_rejected(self):
        bundle = self.altered_bundle()
        with (bundle / "gate/cargo-test.log").open("ab") as stream:
            stream.write(b"forged success")
        with self.assertRaises(ValueError):
            audit.verify_bundle(bundle, self.trust_path, self.pin, self.binary)

    def test_altered_report_is_rejected(self):
        bundle = self.altered_bundle()
        (bundle / "report.md").write_bytes(b"invented result")
        with self.assertRaises(ValueError):
            audit.verify_bundle(bundle, self.trust_path, self.pin, self.binary)

    def test_altered_receipt_is_rejected(self):
        bundle = self.altered_bundle()
        receipt = audit.read_json(bundle / "receipt.json")
        receipt["body"]["counts"]["passed"] = 999999
        (bundle / "receipt.json").write_bytes(audit.canonical(receipt))
        with self.assertRaises(ValueError):
            audit.verify_bundle(bundle, self.trust_path, self.pin, self.binary)

    def test_substituted_trust_root_is_rejected(self):
        with self.assertRaises(ValueError):
            audit.verify_bundle(self.bundle, self.trust_path, "00" * 32, self.binary)

    def test_altered_block_is_rejected(self):
        evidence = copy.deepcopy(self.evidence)
        evidence["block"][-1] ^= 1
        with self.assertRaises(ValueError):
            self.ledger_verify(evidence=evidence)

    def test_altered_vote_is_rejected(self):
        evidence = copy.deepcopy(self.evidence)
        evidence["signatures"][0][0] ^= 1
        with self.assertRaises(ValueError):
            self.ledger_verify(evidence=evidence)

    def test_missing_quorum_is_rejected(self):
        evidence = copy.deepcopy(self.evidence)
        evidence["signatures"].pop()
        with self.assertRaises(ValueError):
            self.ledger_verify(evidence=evidence)

    def test_altered_mmr_proof_is_rejected(self):
        evidence = copy.deepcopy(self.evidence)
        evidence["mmr_proof"]["leaf_index"] = 1
        with self.assertRaises(ValueError):
            self.ledger_verify(evidence=evidence)

    def test_another_receipt_digest_is_rejected(self):
        with self.assertRaises(ValueError):
            self.ledger_verify(digest="00" * 32)

    def test_duplicate_validator_keys_are_rejected(self):
        keys = copy.deepcopy(self.trust["network_keys"])
        keys["validator_b"] = keys["validator_a"]
        with self.assertRaises(ValueError):
            self.ledger_verify(keys=keys)


if __name__ == "__main__":
    unittest.main()
