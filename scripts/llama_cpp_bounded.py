"""Opt-in local GGUF inference with exact prompt admission and bounded output.

Requires llama-cpp-python in the selected Python environment. No model download.
The local library/tokenizer is trusted software, not hardware attestation.
"""
import hashlib
import importlib.metadata
import json
import subprocess
import sys
from pathlib import Path

from generality_pilot import digest
from ollama_arm_a import SAMPLING_SEED, SAMPLING_TEMPERATURE
from tool_broker import BudgetExceeded, natural


def pinned_file(config):
    path = Path(config["model_path"]).resolve(strict=True)
    expected = config["model_digest"]
    if len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
        raise ValueError("GGUF model_digest must be lowercase SHA256")
    with path.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != expected:
        raise ValueError("GGUF digest differs from pinned model")
    return path


def worker(mode, config, prompt, output_cap, expected_prompt_tokens=None, response_format=None):
    from llama_cpp import Llama, LlamaGrammar
    if importlib.metadata.version("llama-cpp-python") != config["runtime_version"]:
        raise ValueError("llama-cpp-python version differs from frozen runtime_version")
    if mode not in ("prepare", "generate"):
        raise ValueError("unsupported worker phase")
    path = pinned_file(config)
    # Vocabulary-only preparation performs no inference. Generation receives a
    # reservation only after this exact token count has been admitted by parent.
    model = Llama(model_path=str(path), vocab_only=mode == "prepare", n_ctx=config["context_tokens"],
                  n_gpu_layers=0, seed=SAMPLING_SEED, verbose=False)
    try:
        tokens = model.tokenize(prompt.encode("utf-8"), add_bos=True, special=True)
        if mode == "prepare":
            return {"prompt_tokens": len(tokens)}
        if len(tokens) != expected_prompt_tokens:
            raise ValueError("tokenizer changed between preparation and generation")
        if len(tokens) + output_cap > model.n_ctx():
            raise ValueError("prompt+output exceeds actual context size")
        grammar = LlamaGrammar.from_json_schema(json.dumps(response_format)) if response_format is not None else None
        result = model.create_completion(prompt=tokens, max_tokens=output_cap,
            temperature=SAMPLING_TEMPERATURE, seed=SAMPLING_SEED, grammar=grammar, stream=False)
        # Detect accidental replacement during use; this is not protection
        # against a malicious host that controls both file and process.
        pinned_file(config)
        return result
    finally:
        model.close()


def invoke(payload, broker):
    try:
        process = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--worker"],
            input=json.dumps(payload, allow_nan=False).encode(), capture_output=True,
            timeout=broker.remaining_seconds(), check=False,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    except subprocess.TimeoutExpired:
        broker.reject_budget("timeout")
    if process.returncode:
        raise RuntimeError("bounded local provider failed; check dependency/model configuration; usage unresolved after admission")
    if len(process.stdout) > 2_000_000:
        raise ValueError("provider response too large")
    broker.remaining_seconds()
    return json.loads(process.stdout)


def generate(config, prompt, broker, *, output_cap=64, require_hard_total_cap=True,
             device_placement="cpu", response_format=None):
    if device_placement != "cpu":
        raise ValueError("bounded GGUF profile requires CPU placement")
    if not isinstance(prompt, str) or not prompt or len(prompt.encode()) > 65536:
        raise ValueError("prompt must be nonempty and at most 64 KiB")
    natural(output_cap, "output_cap")
    natural(config["context_tokens"], "context_tokens")
    if output_cap == 0 or config["context_tokens"] == 0:
        raise ValueError("positive output cap/context required; zero means unlimited to llama.cpp")
    payload = dict(config=config, prompt=prompt, output_cap=output_cap, response_format=response_format)
    prepared = invoke({**payload, "mode": "prepare"}, broker)
    count = natural(prepared["prompt_tokens"], "prompt_tokens")
    if count == 0 or count + output_cap > config["context_tokens"]:
        raise ValueError("prompt+output does not fit frozen context")
    upper_bound = count + output_cap
    grant = broker.reserve_tokens(upper_bound)
    result = invoke({**payload, "mode": "generate", "expected_prompt_tokens": count}, broker)
    usage = result["usage"]
    measured_prompt = natural(usage["prompt_tokens"], "prompt_tokens")
    measured_output = natural(usage["completion_tokens"], "completion_tokens")
    measured = measured_prompt + measured_output
    natural(usage["total_tokens"], "total_tokens")
    observation = {"answer": result["choices"][0]["text"], "provider_response": result,
        "model": config["model"], "model_digest": config["model_digest"],
        "identity_trust": "LOCAL_GGUF_SHA256_NOT_HARDWARE_ATTESTATION",
        "token_meter": "LOCAL_LLAMA_CPP_TOKENIZER_AND_USAGE", "token_meter_class": "TRUSTED_LOCAL_RUNTIME",
        "total_token_cap": "PRECHECK_AND_POSTCHECK", "token_upper_bound": upper_bound,
        "prompt_tokens_prechecked": count, "output_token_cap": output_cap,
        "prompt_sha256": digest(prompt), "request_sha256": digest(payload),
        "sampling": {"num_predict": output_cap, "num_ctx": config["context_tokens"],
                     "seed": SAMPLING_SEED, "temperature": SAMPLING_TEMPERATURE, "num_gpu": 0},
        "device_placement_requested": "cpu"}
    if response_format is not None:
        observation["response_format_sha256"] = digest(response_format)
    try:
        broker.settle_tokens(grant, measured)
        if measured_prompt != count or measured_output > output_cap or usage["total_tokens"] != measured:
            broker.reject_budget("token_limit")
        if not isinstance(observation["answer"], str) or result["choices"][0]["finish_reason"] not in ("stop", "length"):
            raise ValueError("malformed completion")
        if result["choices"][0]["finish_reason"] == "length":
            broker.reject_budget("token_limit")
    except BudgetExceeded as error:
        error.provider_observation = observation
        raise
    return observation


if __name__ == "__main__":
    if sys.argv[1:] != ["--worker"]:
        raise SystemExit("Import generate; only --worker is supported")
    raw = sys.stdin.buffer.read(262145)
    if len(raw) > 262144:
        raise SystemExit("worker input too large")
    print(json.dumps(worker(**json.loads(raw)), allow_nan=False))
