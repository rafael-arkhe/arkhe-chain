import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from tool_broker import BudgetExceeded, ToolBroker
from run_pilot import execute_fixture
from generality_pilot import digest, schedule, summarize


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.limits = {"max_tokens": 10, "max_tool_calls": 2, "max_wall_clock": 10}

    def test_real_worker_and_tool_cap(self):
        broker = ToolBroker(self.limits, {"x": 7})
        self.assertEqual(broker.call("lookup", {"key": "x"}), 7)
        self.assertEqual(broker.call("add", {"values": [2, 3]}), 5)
        with self.assertRaises(BudgetExceeded) as error:
            broker.call("add", {"values": []})
        self.assertEqual(error.exception.reason, "tool_limit")
        self.assertEqual(broker.usage()["tool_calls"], 2)
        with self.assertRaises(BudgetExceeded):
            broker.finish()

    def test_reservation_blocks_before_model_call(self):
        broker = ToolBroker(self.limits)
        broker.reserve_tokens(8)
        with self.assertRaises(BudgetExceeded):
            broker.reserve_tokens(3)
        self.assertEqual(broker.usage()["tokens"], 8)

    def test_settlement_is_single_use(self):
        broker = ToolBroker(self.limits)
        grant = broker.reserve_tokens(8)
        broker.settle_tokens(grant, 5)
        with self.assertRaises(ValueError):
            broker.settle_tokens(grant, 1)
        self.assertEqual(broker.finish()["tokens"], 5)

    def test_unsettled_grant_prevents_success(self):
        broker = ToolBroker(self.limits)
        broker.reserve_tokens(8)
        with self.assertRaises(RuntimeError):
            broker.finish()

    def test_overrun_keeps_actual_cost(self):
        broker = ToolBroker(self.limits)
        grant = broker.reserve_tokens(8)
        with self.assertRaises(BudgetExceeded):
            broker.settle_tokens(grant, 12)
        self.assertEqual(broker.usage()["tokens"], 12)

    def test_deadline_and_terminal_close(self):
        now = [0]
        broker = ToolBroker(self.limits, clock=lambda: now[0])
        now[0] = 10
        with self.assertRaises(BudgetExceeded) as error:
            broker.call("add", {"values": []})
        self.assertEqual(error.exception.reason, "timeout")
        closed = ToolBroker(self.limits)
        closed.finish()
        with self.assertRaises(RuntimeError):
            closed.reserve_tokens(1)

    def test_tools_cannot_read_other_broker_data(self):
        first = ToolBroker(self.limits, {"private": 42})
        second = ToolBroker(self.limits)
        self.assertEqual(first.call("lookup", {"key": "private"}), 42)
        with self.assertRaises(ValueError):
            second.call("lookup", {"key": "private"})

    def test_bad_limits(self):
        for bad in (True, -1, 1.5):
            with self.assertRaises(ValueError):
                ToolBroker({**self.limits, "max_tokens": bad})


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tasks = [{"id": "f1", "axis": "E1", "expected": 5,
                       "fixture_steps": [{"tool": "add", "arguments": {"values": [2, 3]}}]}]
        self.agenda = {"tasks_sha256": digest(self.tasks), "seed": 12,
                       "schedule": schedule(self.tasks, 12)}
        self.limits = {"max_tokens": 0, "max_tool_calls": 1, "max_wall_clock": 10}

    def test_executed_fixture_all_arms_and_schedule(self):
        records, report = execute_fixture(self.tasks, self.agenda, self.limits)
        self.assertEqual(len(records), 3)
        self.assertTrue(all(r["status"] == "SUCCESS" for r in records))
        self.assertTrue(all(r["tokens"] == 0 for r in records))
        self.assertEqual(report["phase"], "fixture")
        self.assertEqual(report["schedule_seed"], 12)
        self.assertEqual(report["schedule_validation"], "MATCHED_RECORD_ORDER")
        self.assertFalse(report["capability_demonstrated"])

    def test_order_tampering_rejected(self):
        records, _ = execute_fixture(self.tasks, self.agenda, self.limits)
        with self.assertRaises(ValueError):
            summarize(self.tasks, records[::-1], agenda=self.agenda)

    def test_independent_arm_budgets(self):
        records, report = execute_fixture(self.tasks, self.agenda, {**self.limits, "max_tool_calls": 0})
        self.assertTrue(all(r["reason"] == "tool_limit" for r in records))
        self.assertTrue(all(report["axes"]["E1"]["arms"][a]["capacity_denominator"] == 1
                            for a in ("A", "B", "C")))

    def test_altered_seed_rejected(self):
        with self.assertRaises(ValueError):
            execute_fixture(self.tasks, {**self.agenda, "tasks_sha256": "wrong"}, self.limits)


if __name__ == "__main__":
    unittest.main()
