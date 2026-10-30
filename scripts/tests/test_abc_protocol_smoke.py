import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).parents[1]))
import abc_protocol_smoke as smoke


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)/"run"
        self.fixture = {"tasks":[{"id":"one","prompt":"prompt"}],"memory":"frozen",
            "seed":1,"limits":{"max_tokens":100,"max_tool_calls":0,"max_wall_clock":10},
            "output_cap":20,"placement":"cpu"}

    def result(self, *args, **kwargs):
        return {"execution_status":"COMPLETED_UNGRADED","usage":{"measured_tokens":5,"reserved_tokens":0}}

    def test_schedule_all_arms_no_grading_and_private_memory_inputs(self):
        with patch.object(smoke,"run_a",side_effect=self.result) as a:
            with patch.object(smoke,"execute",side_effect=self.result) as bc, contextlib.redirect_stdout(io.StringIO()):
                report = smoke.run({},self.fixture,Path("unused"),self.output)
        self.assertEqual(a.call_count,1)
        self.assertEqual(bc.call_count,2)
        inputs = {c.args[3]:c.args[2] for c in bc.call_args_list}
        self.assertEqual(inputs,{"B":"frozen","C":""})
        self.assertEqual(report["assigned_executions"],3)
        self.assertEqual(report["completed_ungraded"],3)
        self.assertFalse(report["capability_demonstrated"])
        self.assertEqual(report["decision"],"INCONCLUSIVE")
        records = [json.loads(line) for line in (self.output/"records.jsonl").read_text().splitlines()]
        self.assertEqual([r["schedule_index"] for r in records],[0,1,2])

    def test_failure_is_retained_without_retry(self):
        failed = {"execution_status":"FAILED","reason":"token_limit",
                  "usage":{"measured_tokens":20,"reserved_tokens":0}}
        with patch.object(smoke,"run_a",return_value=failed) as a:
            with patch.object(smoke,"execute",side_effect=self.result), contextlib.redirect_stdout(io.StringIO()):
                report = smoke.run({},self.fixture,Path("unused"),self.output)
        self.assertEqual(a.call_count,1)
        self.assertEqual(report["failed_executions"],1)
        self.assertEqual(report["by_arm"]["A"]["measured_tokens"],20)

    def test_existing_directory_not_overwritten(self):
        self.output.mkdir()
        with patch.object(smoke,"run_a") as a:
            with self.assertRaises(FileExistsError):
                smoke.run({},self.fixture,Path("unused"),self.output)
            a.assert_not_called()


if __name__ == "__main__":
    unittest.main()
