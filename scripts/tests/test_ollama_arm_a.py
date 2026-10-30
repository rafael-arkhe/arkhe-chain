import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
import ollama_arm_a as adapter
from tool_broker import BudgetExceeded, ToolBroker


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.config = {"base_url": "http://127.0.0.1:11434", "model": "test:latest",
                       "model_digest": "abc", "context_tokens": 4096}
        self.broker = ToolBroker({"max_tokens": 100, "max_tool_calls": 0, "max_wall_clock": 10})

    def process(self, **overrides):
        response = {"done": True, "done_reason": "stop", "response": "4",
                    "prompt_eval_count": 10, "eval_count": 2, **overrides}
        return subprocess.CompletedProcess([], 0, json.dumps({"provider_response": response,
            "request_sha256": "request", "sampling": {"num_predict": 20,
            "temperature": adapter.SAMPLING_TEMPERATURE, "seed": adapter.SAMPLING_SEED,
            "num_ctx": 4096}}).encode(), b"")

    def test_strict_total_refused_without_request(self):
        with patch.object(adapter.subprocess, "run") as run:
            with self.assertRaises(adapter.UnsupportedBudget):
                adapter.generate(self.config, "2+2", self.broker)
            run.assert_not_called()
        self.assertEqual(self.broker.usage()["tokens"], 0)

    def test_provider_usage_settled_host_side(self):
        with patch.object(adapter.subprocess, "run", return_value=self.process()):
            result = adapter.generate(self.config, "2+2", self.broker, output_cap=20, require_hard_total_cap=False)
        self.assertEqual(self.broker.finish()["tokens"], 12)
        self.assertEqual(result["total_token_cap"], "POSTCHECK_ONLY")

    def test_reservation_exists_before_provider_worker_starts_and_grant_zero_is_id(self):
        def worker(*args,**kwargs):
            usage=self.broker.usage()
            self.assertEqual(usage["reserved_tokens"],100)
            self.assertEqual(self.broker.events[0],{"event":"tokens_reserved","grant":0,"upper_bound":100})
            return self.process()
        with patch.object(adapter.subprocess,"run",side_effect=worker):
            adapter.generate(self.config,"prompt",self.broker,output_cap=20,require_hard_total_cap=False)
        self.assertEqual(self.broker.finish()["tokens"],12)

    def test_post_generation_model_digest_drift_is_rejected(self):
        tags={"models":[{"name":"test:latest","digest":"abc"}]}
        changed={"models":[{"name":"test:latest","digest":"different"}]}
        with patch.object(adapter,"request_json",side_effect=[tags,{"done":True},changed]) as request:
            with self.assertRaises(ValueError):
                adapter.provider_worker(self.config,"prompt",20,1)
        self.assertEqual(request.call_count,3)

    def test_missing_usage_is_not_zero(self):
        process = self.process()
        envelope = json.loads(process.stdout)
        del envelope["provider_response"]["eval_count"]
        process.stdout = json.dumps(envelope).encode()
        with patch.object(adapter.subprocess, "run", return_value=process):
            with self.assertRaises(KeyError):
                adapter.generate(self.config, "2+2", self.broker, output_cap=20, require_hard_total_cap=False)
        self.assertEqual(self.broker.usage()["reserved_tokens"], 100)

    def test_total_overrun_preserves_measured_cost(self):
        with patch.object(adapter.subprocess, "run", return_value=self.process(prompt_eval_count=101)):
            with self.assertRaises(BudgetExceeded):
                adapter.generate(self.config, "2+2", self.broker, output_cap=20, require_hard_total_cap=False)
        self.assertEqual(self.broker.usage()["measured_tokens"], 103)

    def test_timeout_keeps_unknown_usage_reserved(self):
        with patch.object(adapter.subprocess, "run", side_effect=subprocess.TimeoutExpired([], 1)):
            with self.assertRaises(BudgetExceeded) as error:
                adapter.generate(self.config, "2+2", self.broker, output_cap=20, require_hard_total_cap=False)
        self.assertEqual(error.exception.reason, "timeout")
        self.assertEqual(self.broker.usage()["measured_tokens"], 0)
        self.assertEqual(self.broker.usage()["reserved_tokens"], 100)

    def test_output_limit_is_failure_even_with_text(self):
        with patch.object(adapter.subprocess, "run", return_value=self.process(done_reason="length")):
            with self.assertRaises(BudgetExceeded) as error:
                adapter.generate(self.config, "2+2", self.broker, output_cap=20, require_hard_total_cap=False)
        self.assertEqual(error.exception.provider_observation["provider_response"]["done_reason"], "length")
        with self.assertRaises(BudgetExceeded):
            self.broker.finish()

    def test_worker_caps_provider_and_pins_before_and_after(self):
        tags = {"models": [{"name": "test:latest", "digest": "abc"}]}
        response = {"done": True, "response": "4", "prompt_eval_count": 10, "eval_count": 2}
        with patch.object(adapter, "request_json", side_effect=[tags, response, tags]) as request:
            envelope = adapter.provider_worker(self.config, "2+2", 20, 1)
        self.assertEqual(request.call_args_list[1].args[2]["options"]["num_predict"], 20)
        self.assertEqual(request.call_args_list[1].args[2]["prompt"], "2+2")
        self.assertEqual(request.call_count, 3)
        self.assertEqual(envelope["provider_response"], response)

    def test_response_format_is_sent_to_provider(self):
        tags={"models":[{"name":"test:latest","digest":"abc"}]}
        result={"done":True,"response":"{}","prompt_eval_count":1,"eval_count":1}
        schema={"type":"object"}
        with patch.object(adapter,"request_json",side_effect=[tags,result,tags]) as request:
            adapter.provider_worker(self.config,"prompt",20,1,response_format=schema)
        self.assertEqual(request.call_args_list[1].args[2]["format"],schema)

    def test_default_placement_omits_num_gpu(self):
        tags = {"models": [{"name": "test:latest", "digest": "abc"}]}
        response = {"done": True, "response": "4", "prompt_eval_count": 10, "eval_count": 2}
        with patch.object(adapter, "request_json", side_effect=[tags, response, tags]) as request:
            adapter.provider_worker(self.config, "2+2", 20, 1)
        self.assertNotIn("num_gpu", request.call_args_list[1].args[2]["options"])

    def test_cpu_placement_requests_num_gpu_zero_and_is_recorded(self):
        tags = {"models": [{"name": "test:latest", "digest": "abc"}]}
        response = {"done": True, "response": "4", "prompt_eval_count": 10, "eval_count": 2}
        with patch.object(adapter, "request_json", side_effect=[tags, response, tags]) as request:
            adapter.provider_worker(self.config, "2+2", 20, 1, device_placement="cpu")
        self.assertEqual(request.call_args_list[1].args[2]["options"]["num_gpu"], 0)
        with patch.object(adapter.subprocess, "run", return_value=self.process()):
            result = adapter.generate(self.config, "2+2", self.broker, output_cap=20,
                                      require_hard_total_cap=False, device_placement="cpu")
        self.assertEqual(result["device_placement_requested"], "cpu")

    def test_unknown_placement_rejected_before_generation(self):
        tags = {"models": [{"name": "test:latest", "digest": "abc"}]}
        with patch.object(adapter, "request_json", return_value=tags):
            with self.assertRaises(ValueError):
                adapter.provider_worker(self.config, "2+2", 20, 1, device_placement="gpu-max")
        with self.assertRaises(ValueError):
            adapter.generate(self.config, "2+2", self.broker, output_cap=20,
                             require_hard_total_cap=False, device_placement="gpu-max")
        self.assertEqual(self.broker.usage()["tokens"], 0)

    def test_token_meter_class_is_provider_reported(self):
        with patch.object(adapter.subprocess, "run", return_value=self.process()):
            result = adapter.generate(self.config, "2+2", self.broker, output_cap=20,
                                      require_hard_total_cap=False)
        self.assertEqual(result["token_meter_class"], "PROVIDER_REPORTED")

    def test_gpu_state_unavailable_is_recorded_not_fatal(self):
        with patch.object(adapter.subprocess, "run", side_effect=OSError):
            state = adapter.gpu_state()
        self.assertFalse(state["available"])
        self.assertEqual(state["source"], "nvidia-smi")
        self.assertEqual(state["gpus"], [])

    def test_gpu_state_parses_rows(self):
        process = subprocess.CompletedProcess([], 0, b"GPU0, 1404, 0\n", b"")
        with patch.object(adapter.subprocess, "run", return_value=process):
            state = adapter.gpu_state()
        self.assertTrue(state["available"])
        self.assertEqual(state["gpus"], ["GPU0, 1404, 0"])

    def test_manifest_check_accepts_match_and_rejects_drift(self):
        with patch.object(adapter.subprocess, "run", return_value=self.process()):
            result = adapter.generate(self.config, "2+2", self.broker, output_cap=20,
                                      require_hard_total_cap=False)
        manifest = {"config": self.config, "prompt_sha256": result["prompt_sha256"],
                    "output_cap": 20, "device_placement_requested": "provider-default",
                    "sampling": {"seed": adapter.SAMPLING_SEED,
                                 "temperature": adapter.SAMPLING_TEMPERATURE, "num_ctx": 4096}}
        adapter.check_matches_manifest(result, manifest)
        for drift in ({"prompt_sha256": "x"}, {"output_cap": 21},
                      {"device_placement_requested": "cpu"},
                      {"sampling": {"seed": 1, "temperature": 0, "num_ctx": 4096}}):
            with self.assertRaises(adapter.ManifestMismatch):
                adapter.check_matches_manifest(result, {**manifest, **drift})

    def test_usage_boolean_rejected(self):
        with patch.object(adapter.subprocess, "run", return_value=self.process(eval_count=True)):
            with self.assertRaises(ValueError):
                adapter.generate(self.config, "2+2", self.broker, output_cap=20, require_hard_total_cap=False)

    def test_pin_mismatch_prevents_generation(self):
        with patch.object(adapter, "request_json", return_value={"models": []}) as request:
            with self.assertRaises(ValueError):
                adapter.provider_worker(self.config, "2+2", 20, 1)
            self.assertEqual(request.call_count, 1)

    def test_loopback_only(self):
        for url in ("https://example.com", "http://127.0.0.1@evil.com", "http://localhost/path"):
            with self.assertRaises(ValueError):
                adapter.local_endpoint(url)


if __name__ == "__main__":
    unittest.main()
