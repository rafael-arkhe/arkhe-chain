import sys
from pathlib import Path
import subprocess
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "evidence"))
from failover import STEPS, drill


class FailoverTests(unittest.TestCase):
    def setUp(self):
        self.config = {"environment": "staging", "commands": {s: [s] for s in STEPS},
                       "failover_timeout_seconds": 10}
        self.ran = []

    def run_step(self, step, timeout):
        self.assertGreater(timeout, 0)
        self.ran.append(step)

    def test_promotion_order_and_cleanup(self):
        result = drill(self.config, self.run_step)
        self.assertEqual(self.ran, list(STEPS))
        self.assertIn("assert_writer", result["completed"])

    def test_each_failed_gate_prevents_promotion_and_restores(self):
        for failure in ["inject_fault", "verify_replica", "fence_primary"]:
            self.ran = []
            def run(step, timeout):
                self.run_step(step, timeout)
                if step == failure:
                    raise RuntimeError(failure)
            with self.assertRaises(RuntimeError):
                drill(self.config, run)
            self.assertNotIn("promote_secondary", self.ran)
            self.assertEqual(self.ran[-1], "restore_fault")

    def test_route_timeout_fails_and_restores(self):
        now = [0]
        def run(step, timeout):
            self.run_step(step, timeout)
            if step == "assert_secondary":
                raise subprocess.CalledProcessError(1, step)
        def sleep(seconds):
            now[0] += seconds
        with self.assertRaises(TimeoutError):
            drill(self.config, run, lambda: now[0], sleep)
        self.assertEqual(self.ran[-1], "restore_fault")
        self.assertNotIn("verify_replica", self.ran)

    def test_no_primary_assertion_means_no_injection(self):
        def run(step, timeout):
            self.run_step(step, timeout)
            raise RuntimeError("not primary")
        with self.assertRaises(RuntimeError):
            drill(self.config, run)
        self.assertEqual(self.ran, ["assert_primary"])

    def test_production_and_incomplete_config_are_refused(self):
        self.config["environment"] = "production"
        with self.assertRaises(ValueError):
            drill(self.config, self.run_step)
        self.config["environment"] = "staging"
        del self.config["commands"]["fence_primary"]
        with self.assertRaises(ValueError):
            drill(self.config, self.run_step)
        self.assertEqual(self.ran, [])
