import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("pilot", Path(__file__).parents[1] / "generality_pilot.py")
pilot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pilot)


class PilotTests(unittest.TestCase):
    def setUp(self):
        self.tasks = [{"id": "t1", "axis": "E1"}, {"id": "t2", "axis": "E1"}]
        self.rows = [{"task_id": t["id"], "arm": a, "attempt": 1,
                      "status": "SUCCESS", "reason": "correct", "tokens": 10,
                      "tool_calls": 0, "wall_seconds": 1} for t in self.tasks for a in pilot.ARMS]

    def test_timeout_counts_against_capacity(self):
        self.rows[0].update(status="FAILURE", reason="timeout")
        report = pilot.summarize(self.tasks, self.rows)
        self.assertEqual(report["axes"]["E1"]["arms"]["A"]["success_rate"], .5)
        self.assertEqual(report["axes"]["E1"]["contrasts"]["B-A"]["gain_pp"], 50)
        self.assertFalse(report["capability_demonstrated"])

    def test_cannot_hide_timeout(self):
        self.rows[0].update(status="INVALID", reason="timeout")
        with self.assertRaises(ValueError):
            pilot.summarize(self.tasks, self.rows)

    def test_cannot_select_best_retry(self):
        self.rows.append({**self.rows[0], "attempt": 2})
        with self.assertRaises(ValueError):
            pilot.summarize(self.tasks, self.rows)

    def test_invalid_retry_preserves_cost(self):
        retry = {**self.rows[0], "attempt": 2}
        self.rows[0].update(status="INVALID", reason="infra")
        self.rows.append(retry)
        arm = pilot.summarize(self.tasks, self.rows)["axes"]["E1"]["arms"]["A"]
        self.assertEqual(arm["invalid_attempts"], 1)
        self.assertEqual(arm["raw_attempts"], 3)
        self.assertEqual(arm["usage_including_invalid"]["tokens"], 30)

    def test_missing_execution_rejected(self):
        with self.assertRaises(ValueError):
            pilot.summarize(self.tasks, self.rows[:-1])

    def test_unresolved_invalid_visible_and_not_paired(self):
        self.rows[0].update(status="INVALID", reason="infra")
        axis = pilot.summarize(self.tasks, self.rows)["axes"]["E1"]
        self.assertEqual(axis["arms"]["A"]["assigned_task_success_rate"], .5)
        self.assertEqual(axis["contrasts"]["B-A"]["paired_tasks"], 1)

    def test_schedule_complete_reproducible(self):
        one = pilot.schedule(self.tasks, 42)
        self.assertEqual(one, pilot.schedule(self.tasks, 42))
        self.assertEqual(len({(r["task_id"], r["arm"]) for r in one}), 6)

    def test_empty_pairs_are_null_not_zero(self):
        for record in self.rows:
            record.update(status="INVALID", reason="infra")
        contrast = pilot.summarize(self.tasks, self.rows)["axes"]["E1"]["contrasts"]["B-A"]
        self.assertEqual(contrast["paired_tasks"], 0)
        self.assertIsNone(contrast["gain_pp"])
        self.assertIsNone(contrast["sample_variance_of_paired_difference"])

    def test_fixture_phase_and_unverified_schedule_explicit(self):
        report = pilot.summarize(self.tasks, self.rows)
        self.assertEqual(report["phase"], "fixture")
        self.assertEqual(report["schedule_validation"], "NOT_VERIFIED")
        self.assertEqual(report["decision_reason"], "confirmatory_inference_not_implemented")

    def test_pilot_requires_schedule(self):
        with self.assertRaises(ValueError):
            pilot.summarize(self.tasks, self.rows, phase="pilot")


if __name__ == "__main__":
    unittest.main()
