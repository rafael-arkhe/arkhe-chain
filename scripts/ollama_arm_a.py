"""Local Ollama arm-A smoke adapter; no tools, memory or capability grading.

Provider output tokens are capped. Total tokens are observed AFTER generation;
strict total-token admission is unsupported and rejected before any HTTP call.
"""
import argparse
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from generality_pilot import digest
from tool_broker import BudgetExceeded, ToolBroker, natural


class UnsupportedBudget(ValueError):
    pass


class ManifestMismatch(ValueError):
    pass


SAMPLING_SEED = 20261026
SAMPLING_TEMPERATURE = 0


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def local_endpoint(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1")
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ("", "/")):
        raise ValueError("only a loopback HTTP Ollama endpoint is supported")
    return value.rstrip("/")


def request_json(base, route, payload, timeout):
    request = urllib.request.Request(base + route,
        data=json.dumps(payload, allow_nan=False).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=timeout) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("provider response too large")
    return json.loads(raw)


def pinned_model(tags, config):
    found = [m for m in tags.get("models", []) if m.get("name") == config["model"]]
    if len(found) != 1 or found[0].get("digest") != config["model_digest"]:
        raise ValueError("local model tag does not match pinned digest")


def gpu_state():
    """Observe host GPU state as placement evidence; absence is recorded, not fatal."""
    command = ["nvidia-smi", "--query-gpu=name,memory.used,utilization.gpu",
               "--format=csv,noheader,nounits"]
    try:
        process = subprocess.run(command, capture_output=True, timeout=10, check=False,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    except (OSError, subprocess.TimeoutExpired):
        return {"source": "nvidia-smi", "available": False, "gpus": []}
    rows = [line.strip() for line in process.stdout.decode(errors="replace").splitlines() if line.strip()]
    return {"source": "nvidia-smi", "available": process.returncode == 0 and bool(rows), "gpus": rows}


def provider_worker(config, prompt, output_cap, timeout, device_placement="provider-default", response_format=None):
    base = local_endpoint(config["base_url"])
    pinned_model(request_json(base, "/api/tags", None, timeout), config)
    options = {"num_predict": output_cap, "temperature": SAMPLING_TEMPERATURE,
               "seed": SAMPLING_SEED, "num_ctx": config["context_tokens"]}
    if device_placement == "cpu":
        # num_gpu=0 requests CPU-only placement; the server may ignore options,
        # so this is a request, not an attestation of where inference ran.
        options["num_gpu"] = 0
    elif device_placement != "provider-default":
        raise ValueError("device_placement must be provider-default or cpu")
    payload = {"model": config["model"], "prompt": prompt, "stream": False,
               "raw": True, "options": options}
    if response_format is not None:
        payload["format"] = response_format
    result = request_json(base, "/api/generate", payload, timeout)
    # Tag checks constrain trusted local configuration; not cryptographic
    # attestation that these weights actually performed this request.
    pinned_model(request_json(base, "/api/tags", None, timeout), config)
    return {"provider_response": result, "request_sha256": digest(payload),
            "sampling": options, "raw_prompt": True}


def generate(config, prompt, broker, *, output_cap=64, require_hard_total_cap=True,
             device_placement="provider-default", response_format=None):
    if require_hard_total_cap:
        raise UnsupportedBudget("Ollama adapter cannot pre-enforce prompt+output tokens; strict mode refused")
    local_endpoint(config["base_url"])
    if device_placement not in ("provider-default", "cpu"):
        raise ValueError("device_placement must be provider-default or cpu")
    if not isinstance(prompt, str) or not prompt or len(prompt.encode()) > 65536:
        raise ValueError("prompt must be nonempty and at most 64 KiB")
    natural(output_cap, "output_cap")
    natural(config["context_tokens"], "context_tokens")
    if not output_cap or not config["context_tokens"]:
        raise ValueError("output cap and context size must be positive")
    available = broker.max_tokens - broker.usage()["tokens"]
    if available <= 0 or output_cap > available:
        raise ValueError("output cap must fit available total-token accounting budget")
    grant = broker.reserve_tokens(available)
    timeout = broker.remaining_seconds()
    payload = {"config": config, "prompt": prompt, "output_cap": output_cap, "timeout": timeout,
               "device_placement": device_placement, "response_format":response_format}
    try:
        process = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--worker"],
            input=json.dumps(payload, allow_nan=False).encode(), capture_output=True,
            timeout=timeout, check=False,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    except subprocess.TimeoutExpired:
        # The local worker is terminated. Provider-side cancellation is NOT
        # guaranteed; retain unresolved reservation, never claim measured usage.
        broker.reject_budget("timeout")
    if process.returncode:
        raise RuntimeError("provider request failed; token usage unresolved")
    envelope = json.loads(process.stdout)
    result = envelope["provider_response"]
    if result.get("done") is not True or not isinstance(result.get("response"), str):
        raise ValueError("incomplete or malformed provider response")
    prompt_tokens = natural(result["prompt_eval_count"], "prompt_eval_count")
    output_tokens = natural(result["eval_count"], "eval_count")
    observation = {"answer": result["response"], "provider_response": result,
            "model": config["model"], "model_digest": config["model_digest"],
            "identity_trust": "LOCAL_SERVER_TAG_ASSERTION_NOT_ATTESTATION",
            "token_meter": "OLLAMA_SERVER_REPORTED", "token_meter_class": "PROVIDER_REPORTED",
            "total_token_cap": "POSTCHECK_ONLY",
            "output_token_cap": output_cap, "prompt_sha256": digest(prompt),
            "request_sha256": envelope["request_sha256"], "sampling": envelope["sampling"],
            "device_placement_requested": device_placement}
    if response_format is not None:
        observation["response_format_sha256"] = digest(response_format)
    try:
        broker.settle_tokens(grant, prompt_tokens + output_tokens)
        if output_tokens > output_cap or result.get("done_reason") == "length":
            broker.reject_budget("token_limit")
    except BudgetExceeded as error:
        # Retain diagnostic output, never turn a truncated response into success.
        error.provider_observation = observation
        raise
    return observation


def check_matches_manifest(result, manifest):
    """The manifest is frozen before execution; the returned request must match it."""
    frozen = manifest["sampling"]
    if "response_format_sha256" in manifest and result.get("response_format_sha256") != manifest["response_format_sha256"]:
        raise ManifestMismatch("response format differs from frozen manifest")
    if (result["model"] != manifest["config"]["model"]
            or result["model_digest"] != manifest["config"]["model_digest"]
            or result["prompt_sha256"] != manifest["prompt_sha256"]
            or result["output_token_cap"] != manifest["output_cap"]
            or result["device_placement_requested"] != manifest["device_placement_requested"]
            or result["sampling"]["num_predict"] != manifest["output_cap"]
            or result["sampling"]["seed"] != frozen["seed"]
            or result["sampling"]["temperature"] != frozen["temperature"]
            or result["sampling"]["num_ctx"] != frozen["num_ctx"]
            or (manifest["device_placement_requested"] == "cpu")
                != (result["sampling"].get("num_gpu") == 0)):
        raise ManifestMismatch("generation result does not match the frozen manifest")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(__file__).resolve().parents[1] / "config/ollama.json")
    parser.add_argument("--prompt-file", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--max-tokens", type=int, default=1024)
    parser.add_argument("--max-output-tokens", type=int, default=64)
    parser.add_argument("--max-wall-clock", type=float, default=45)
    parser.add_argument("--allow-observed-total", action="store_true")
    parser.add_argument("--device-placement", choices=("provider-default", "cpu"),
                        default="provider-default")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    prompt = args.prompt_file.read_text(encoding="utf-8")
    limits = {"max_tokens": args.max_tokens, "max_tool_calls": 0, "max_wall_clock": args.max_wall_clock}
    broker = ToolBroker(limits)
    args.output_dir.mkdir(parents=True, exist_ok=False)
    manifest = {"phase": "adapter_smoke", "arm": "A", "config": config, "limits": limits,
                "prompt_sha256": digest(prompt), "output_cap": args.max_output_tokens,
                "allow_observed_total": args.allow_observed_total,
                "device_placement_requested": args.device_placement,
                "sampling": {"seed": SAMPLING_SEED, "temperature": SAMPLING_TEMPERATURE,
                             "num_ctx": config["context_tokens"], "raw_prompt": True}}
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    record = {"phase": "adapter_smoke", "arm": "A", "capability_demonstrated": False,
              "grading": "NOT_PERFORMED", "native_wer": "NOT_INTEGRATED", "wormgraph_anchor": "NOT_INTEGRATED",
              "total_token_cap": "POSTCHECK_ONLY", "token_meter": "OLLAMA_SERVER_REPORTED",
              "token_meter_class": "PROVIDER_REPORTED",
              "sandbox": "NOT_QUALIFIED", "provider_cancellation": "NOT_GUARANTEED"}
    exit_code = 0
    gpu_before = gpu_state()
    try:
        record.update(generate(config, prompt, broker, output_cap=args.max_output_tokens,
                               require_hard_total_cap=not args.allow_observed_total,
                               device_placement=args.device_placement))
        check_matches_manifest(record, manifest)
        record["usage"] = broker.finish()
        record["execution_status"] = "COMPLETED_UNGRADED"
    except (BudgetExceeded, ValueError, RuntimeError, KeyError, OSError) as error:
        exit_code = 2
        record.update(execution_status="FAILED", reason=getattr(error, "reason", type(error).__name__),
                      error=str(error), usage=broker.usage())
    record["placement_observation"] = {
        "before": gpu_before, "after": gpu_state(),
        "interpretation": "host GPU state consistent with the requested placement is evidence, not proof"}
    record["broker_events"] = broker.events
    record.setdefault("usage", broker.usage())
    record["usage_complete"] = record["usage"]["reserved_tokens"] == 0
    (args.output_dir / "record.json").write_text(json.dumps(record, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    raise SystemExit(exit_code)


if __name__ == "__main__":
    if sys.argv[1:] == ["--worker"]:
        raw = sys.stdin.buffer.read(131073)
        if len(raw) > 131072:
            raise SystemExit("worker input too large")
        data = json.loads(raw)
        print(json.dumps(provider_worker(**data), allow_nan=False))
    else:
        main()
