"""Native persistence/replay checks and offline verification of collected evidence."""
import argparse
import base64
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest


class NativeTests(unittest.TestCase):
    binary = None

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.target = self.root / "effect.txt"
        self.fixture = self.root / "fixture.json"
        self.database = self.root / "journal.sqlite"
        self.fixture.write_bytes(
            subprocess.check_output(
                [str(self.binary), "prepare", str(self.target)], timeout=10
            )
        )

    def tearDown(self):
        self.temporary.cleanup()

    def execute(self, mode="normal"):
        return json.loads(
            subprocess.check_output(
                [
                    str(self.binary),
                    "execute",
                    str(self.fixture),
                    str(self.database),
                    mode,
                ],
                timeout=10,
            )
        )

    def test_restart_replays_without_repeating_effect(self):
        first = self.execute()
        stat_before = self.target.stat()
        second = self.execute()
        self.assertTrue(first["effect_completed"])
        self.assertTrue(second["cached_receipt"])
        self.assertFalse(second["effect_completed"])
        self.assertEqual(stat_before.st_mtime_ns, self.target.stat().st_mtime_ns)
        self.assertEqual(first["receipt"], second["receipt"])

    def test_crash_after_reservation_does_not_redispatch(self):
        marker = self.root / "pause"
        process = subprocess.Popen(
            [
                str(self.binary),
                "execute",
                str(self.fixture),
                str(self.database),
                "pause",
                str(marker),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            deadline = time.monotonic() + 10
            while not marker.with_suffix(".ready").exists():
                if time.monotonic() > deadline:
                    self.fail("worker did not reserve")
                time.sleep(0.01)
            process.kill()
            process.communicate(timeout=5)
            retry = self.execute()
            self.assertFalse(retry["ok"])
            self.assertIn("manual reconciliation", retry["error"])
            self.assertFalse(self.target.exists())
            with closing(sqlite3.connect(self.database)) as connection:
                self.assertEqual(
                    connection.execute(
                        "SELECT status FROM broker_dispatch"
                    ).fetchone()[0],
                    "UNCERTAIN",
                )
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=5)

    def test_invalid_signature_never_reserves(self):
        result = self.execute("missing")
        self.assertFalse(result["ok"])
        self.assertFalse(self.target.exists())
        with closing(sqlite3.connect(self.database)) as connection:
            self.assertEqual(
                connection.execute("SELECT count(*) FROM broker_dispatch").fetchone()[0],
                0,
            )

    def test_changed_executor_arguments_leave_uncertainty_not_effect(self):
        changed = self.execute("altered")
        self.assertFalse(changed["ok"])
        self.assertIn("arguments differ", changed["error"])
        retry = self.execute()
        self.assertFalse(retry["ok"])
        self.assertIn("manual reconciliation", retry["error"])
        self.assertFalse(self.target.exists())

    def test_offline_cli_rejects_evidence_modification(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            PublicFormat,
        )

        key = Ed25519PrivateKey.generate()
        payload = b'{"result":"known"}'
        (self.root / "report.json").write_bytes(payload)
        manifest = json.dumps(
            {
                "format": "arkhe-lab-manifest-1",
                "files": {"report.json": hashlib.sha256(payload).hexdigest()},
            }
        ).encode()
        (self.root / "manifest.json").write_bytes(manifest)
        (self.root / "manifest.sig").write_bytes(key.sign(manifest))
        public = base64.b64encode(
            key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        ).decode()
        command = [
            sys.executable,
            str(Path(__file__).with_name("verify.py")),
            str(self.root),
            "--trusted-key-base64",
            public,
        ]
        original = subprocess.run(command, capture_output=True, timeout=10)
        self.assertEqual(original.returncode, 0)
        (self.root / "report.json").write_bytes(payload + b" ")
        modified = subprocess.run(command, capture_output=True, timeout=10)
        self.assertNotEqual(modified.returncode, 0)

    def test_v_agi_02_global_kill_switch_blocks_new_process_under_one_second(self):
        # Engage persisted global kill switch via operator CLI subprocess.
        t0 = time.monotonic()
        engaged = json.loads(
            subprocess.check_output(
                [
                    str(self.binary),
                    "kill-switch",
                    "engage",
                    str(self.database),
                    "ops-cli",
                    "V-AGI-02 test halt",
                ],
                timeout=10,
            )
        )
        self.assertTrue(engaged["engaged"])
        self.assertEqual(engaged["epoch"], 1)

        # Independent process with in-memory emergency_stop=false must block in <1s.
        blocked = self.execute("normal")
        elapsed = time.monotonic() - t0
        self.assertFalse(blocked["ok"])
        self.assertTrue(blocked["error"].startswith("kill_switch_engaged"))
        self.assertFalse(blocked["executor_entered"])
        self.assertFalse(blocked["effect_completed"])
        self.assertFalse(self.target.exists())
        self.assertLess(elapsed, 1.0)

        # Disengage restores execution cleanly and preserves audit trail.
        disengaged = json.loads(
            subprocess.check_output(
                [
                    str(self.binary),
                    "kill-switch",
                    "disengage",
                    str(self.database),
                    "ops-cli",
                    "V-AGI-02 test resume",
                ],
                timeout=10,
            )
        )
        self.assertFalse(disengaged["engaged"])
        self.assertEqual(disengaged["epoch"], 2)

        resumed = self.execute("normal")
        self.assertTrue(resumed["ok"])
        self.assertTrue(resumed["effect_completed"])
        self.assertTrue(self.target.exists())

    def test_global_kill_switch_missing_singleton_fails_closed(self):
        # Initialize schema via status command.
        status = json.loads(
            subprocess.check_output(
                [str(self.binary), "kill-switch", "status", str(self.database)],
                timeout=10,
            )
        )
        self.assertFalse(status["state"]["engaged"])

        # Tamper by deleting the singleton row directly; reopening MUST fail closed.
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("DELETE FROM broker_global_kill_switch WHERE id = 1")
            connection.commit()

        result = self.execute("normal")
        self.assertFalse(result["ok"])
        self.assertIn("kill_switch_state_unavailable", result["error"])
        self.assertFalse(result["effect_completed"])
        self.assertFalse(self.target.exists())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    args, rest = parser.parse_known_args()
    NativeTests.binary = args.binary.resolve()
    unittest.main(argv=[sys.argv[0]] + rest, verbosity=2)
