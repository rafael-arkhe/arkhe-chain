import json
import subprocess
import sys
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
import llama_cpp_bounded as adapter
from tool_broker import ToolBroker, BudgetExceeded


class BoundedTests(unittest.TestCase):
    def setUp(self):
        self.config = {"model": "fixture", "model_digest": "a"*64, "context_tokens": 128}
        self.broker = ToolBroker({"max_tokens": 30, "max_tool_calls": 0, "max_wall_clock": 10})

    def process(self, payload):
        return subprocess.CompletedProcess([], 0, json.dumps(payload).encode(), b"")

    def completion(self, **usage):
        return {"choices": [{"text": "answer", "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12, **usage}}

    def test_exact_precheck_precedes_generation_and_settles_actual_cost(self):
        def runtime(*args, **kwargs):
            request = json.loads(kwargs["input"])
            if request["mode"] == "prepare":
                self.assertEqual(self.broker.usage()["reserved_tokens"], 0)
                return self.process({"prompt_tokens": 10})
            self.assertEqual(self.broker.usage()["reserved_tokens"], 30)
            self.assertEqual(request["expected_prompt_tokens"], 10)
            return self.process(self.completion())
        with patch.object(adapter.subprocess, "run", side_effect=runtime):
            result = adapter.generate(self.config, "prompt", self.broker, output_cap=20)
        self.assertEqual(result["total_token_cap"], "PRECHECK_AND_POSTCHECK")
        self.assertEqual(self.broker.finish()["tokens"], 12)

    def test_insufficient_budget_never_starts_inference(self):
        with patch.object(adapter.subprocess, "run", return_value=self.process({"prompt_tokens": 11})) as run:
            with self.assertRaises(BudgetExceeded):
                adapter.generate(self.config, "prompt", self.broker, output_cap=20)
        self.assertEqual(run.call_count, 1)

    def test_overrun_is_measured_terminal_and_output_is_diagnostic_only(self):
        with patch.object(adapter.subprocess, "run", side_effect=[self.process({"prompt_tokens": 10}),
                self.process(self.completion(completion_tokens=21, total_tokens=31))]):
            with self.assertRaises(BudgetExceeded) as error:
                adapter.generate(self.config, "prompt", self.broker, output_cap=20)
        self.assertEqual(self.broker.usage()["measured_tokens"], 31)
        self.assertEqual(error.exception.provider_observation["answer"], "answer")
        with self.assertRaises(BudgetExceeded): self.broker.finish()

    def test_missing_usage_and_timeout_keep_reservation(self):
        for completion in ({"choices": []}, subprocess.TimeoutExpired([], 1)):
            self.setUp()
            with patch.object(adapter.subprocess, "run", side_effect=[self.process({"prompt_tokens": 10}),
                    completion if isinstance(completion, Exception) else self.process(completion)]):
                with self.assertRaises((KeyError, BudgetExceeded)):
                    adapter.generate(self.config, "prompt", self.broker, output_cap=20)
            self.assertEqual(self.broker.usage()["reserved_tokens"], 30)

    def test_changed_tokenizer_count_and_inconsistent_totals_rejected(self):
        for usage in ({"prompt_tokens": 9, "total_tokens": 11}, {"total_tokens": 13}):
            self.setUp()
            with patch.object(adapter.subprocess, "run", side_effect=[self.process({"prompt_tokens": 10}),
                    self.process(self.completion(**usage))]):
                with self.assertRaises(BudgetExceeded):
                    adapter.generate(self.config, "prompt", self.broker, output_cap=20)

    def test_unlimited_output_refused_before_worker(self):
        with patch.object(adapter.subprocess, "run") as run:
            with self.assertRaises(ValueError): adapter.generate(self.config, "prompt", self.broker, output_cap=0)
            run.assert_not_called()

    def test_runtime_receives_exact_tokens_and_positive_cap(self):
        class Model:
            def __init__(self): self.closed = False; self.request = None
            def tokenize(self, raw, **kwargs): return [1, 2, 3]
            def n_ctx(self): return 128
            def create_completion(self, **kwargs): self.request = kwargs; return {"done": True}
            def close(self): self.closed = True
        model = Model()
        package = SimpleNamespace(Llama=lambda **kwargs: model, LlamaGrammar=object)
        with patch.dict(sys.modules, {"llama_cpp": package}), \
             patch.object(adapter.importlib.metadata, "version", return_value="test"), \
             patch.object(adapter, "pinned_file", return_value=Path("fixture.gguf")):
            result = adapter.worker("generate", {**self.config, "runtime_version": "test"}, "prompt", 20,
                                    expected_prompt_tokens=3)
        self.assertEqual(result, {"done": True})
        self.assertEqual(model.request["prompt"], [1, 2, 3])
        self.assertEqual(model.request["max_tokens"], 20)
        self.assertTrue(model.closed)

    def test_runtime_rejects_tokenizer_drift_before_inference(self):
        from unittest.mock import Mock
        model = Mock()
        model.tokenize.return_value = [1, 2, 3]
        package = SimpleNamespace(Llama=lambda **kwargs: model, LlamaGrammar=object)
        with patch.dict(sys.modules, {"llama_cpp": package}), \
             patch.object(adapter.importlib.metadata, "version", return_value="test"), \
             patch.object(adapter, "pinned_file", return_value=Path("fixture.gguf")):
            with self.assertRaises(ValueError):
                adapter.worker("generate", {**self.config, "runtime_version": "test"}, "prompt", 20,
                               expected_prompt_tokens=4)
        model.create_completion.assert_not_called()
        model.close.assert_called_once()

    def test_weight_hash_is_checked_before_loading_model(self):
        import tempfile
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/"fixture.gguf"
            path.write_bytes(b"not a model")
            with self.assertRaises(ValueError):
                adapter.pinned_file({"model_path":str(path),"model_digest":"a"*64})


if __name__ == "__main__": unittest.main()
