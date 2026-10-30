import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
import arkhe_arm_bc as adapter
from generality_pilot import digest
from tool_broker import BudgetExceeded


class BCTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.executable = Path(self.directory.name)/"bridge.fixture"
        self.executable.write_bytes(b"not executed")
        self.config = {"model":"test", "model_digest":"a"*64, "context_tokens":4096}
        self.limits = {"max_tokens":100, "max_tool_calls":0, "max_wall_clock":10}

    def run_adapter(self, arm="C", memory="", persist=None):
        return adapter.execute(self.config, "prompt", memory, arm, self.limits,
                               self.executable, "run", output_cap=20,
                               allow_observed_total=True, persist=persist)

    def generated(self, *args, **kwargs):
        return {"answer":"answer", "prompt_sha256":digest(args[1]),
                "model":"test", "model_digest":"a"*64, "output_token_cap":20,
                "device_placement_requested":"cpu",
                "sampling":{"num_predict":20,"num_gpu":0,"num_ctx":4096,
                            "seed":adapter.SAMPLING_SEED,"temperature":0}}

    def test_c_refuses_memory_before_generation(self):
        with patch.object(adapter, "generate") as generate:
            with self.assertRaises(ValueError):
                self.run_adapter(arm="C", memory="secret")
            generate.assert_not_called()

    def test_preflight_rejection_prevents_model_call(self):
        with patch.object(adapter, "native_call", side_effect=RuntimeError("gate rejected")):
            with patch.object(adapter, "generate") as generate:
                record = self.run_adapter()
                generate.assert_not_called()
        self.assertEqual(record["execution_status"], "FAILED")

    def test_memory_and_preflight_postcheck_binding(self):
        persisted = {}
        with patch.object(adapter, "generate", side_effect=self.generated) as generate:
            with patch.object(adapter, "native_call", side_effect=[{"intent_digest":"same"},
                {"intent_digest":"same","citation_report":{"status":"FAIL_LEXICAL"},"citation_verification":"FAIL_LEXICAL"}]) as native:
                record = self.run_adapter("B", "prior experience", lambda k,v: persisted.update({k:v}))
        self.assertEqual(record["execution_status"], "COMPLETED_UNGRADED")
        self.assertEqual(record["native_wer"], "CANONICAL_UNSIGNED")
        self.assertIn("prior experience", generate.call_args.args[1])
        self.assertEqual(native.call_args_list[0].args[1]["answer"], "")
        self.assertEqual(native.call_args_list[1].args[1]["answer"], "answer")
        self.assertTrue(native.call_args_list[1].args[1]["verify_citations"])
        self.assertEqual(record["citation_verification"], "FAIL_LEXICAL")
        self.assertEqual(persisted["manifest.json"]["memory_sha256"], digest("prior experience"))
        self.assertFalse(record["capability_demonstrated"])

    def test_postcheck_drift_prevents_success_and_preserves_generation(self):
        persisted = {}
        with patch.object(adapter, "generate", side_effect=self.generated):
            with patch.object(adapter, "native_call", side_effect=[{"intent_digest":"one"}, {"intent_digest":"two"}]):
                record = self.run_adapter(persist=lambda k,v: persisted.update({k:v}))
        self.assertEqual(record["execution_status"], "FAILED")
        self.assertIn("generation.json", persisted)

    def test_budget_failure_is_recorded(self):
        with patch.object(adapter, "native_call", return_value={"intent_digest":"same"}):
            with patch.object(adapter, "generate", side_effect=BudgetExceeded("timeout")):
                record = self.run_adapter()
        self.assertEqual(record["reason"], "timeout")
        self.assertEqual(record["execution_status"], "FAILED")
        self.assertEqual(record["native_wer"], "NOT_CREATED")
        self.assertIn("generation_seconds", record["timings"])

    def test_missing_b_citation_report_prevents_completion(self):
        with patch.object(adapter, "generate", side_effect=self.generated):
            with patch.object(adapter, "native_call", side_effect=[{"intent_digest":"same"},{"intent_digest":"same"}]):
                record = self.run_adapter("B", "prior experience")
        self.assertEqual(record["execution_status"], "FAILED")
        self.assertIn("required lexical citation report", record["error"])


if __name__ == "__main__":
    unittest.main()
