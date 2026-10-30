"""Run one constrained local inference and one pre-admission rejection."""
import argparse
import hashlib
import importlib.metadata
import json
import time
from pathlib import Path

from llama_cpp_bounded import generate
from tool_broker import BudgetExceeded, ToolBroker


def run(model, output):
    output.mkdir(parents=True, exist_ok=False)
    with model.open("rb") as stream:
        model_digest = hashlib.file_digest(stream, "sha256").hexdigest()
    config = {"provider": "llama_cpp", "model": "local-gguf-smoke", "model_path": str(model.resolve()),
        "model_digest": model_digest, "runtime_version": importlib.metadata.version("llama-cpp-python"), "context_tokens": 128}
    def save(name, data): (output/name).write_text(json.dumps(data, indent=2)+"\n", encoding="utf-8")
    save("config.json", config)
    limits = {"max_tokens": 128, "max_tool_calls": 0, "max_wall_clock": 180}
    broker = ToolBroker(limits)
    prompt = 'Return the JSON string "4". What is 2+2?'
    schema = {"type": "string", "enum": ["4"]}
    start = time.monotonic()
    try:
        result = generate(config, prompt, broker, output_cap=16, response_format=schema)
        result.update(execution_status="COMPLETED_UNGRADED", usage=broker.finish())
    except (BudgetExceeded, ValueError, RuntimeError, KeyError, OSError) as error:
        result = {"execution_status": "FAILED", "error": str(error), "usage": broker.usage(),
            "partial_provider_observation": getattr(error, "provider_observation", None)}
    result.update(events=broker.events, elapsed_seconds=time.monotonic()-start, capability_demonstrated=False,
        scope="CONSTRAINED_LOCAL_INFERENCE_ONLY_NOT_CAPABILITY_GRADING")
    save("generation.json", result)
    rejected_broker = ToolBroker({**limits, "max_tokens": 1})
    rejected = False
    try: generate(config, prompt, rejected_broker, output_cap=16, response_format=schema)
    except BudgetExceeded as error:
        rejected = error.reason == "token_limit"
    rejection = {"pre_admission_rejected": rejected, "usage": rejected_broker.usage(), "events": rejected_broker.events,
        "inference_started": any(e["event"] == "tokens_reserved" for e in rejected_broker.events)}
    save("rejection.json", rejection)
    summary = {"real_inference_completed": result["execution_status"] == "COMPLETED_UNGRADED",
        "pre_admission_rejected": rejected, "capability_demonstrated": False, "model_calls": 1,
        "total_token_cap": result.get("total_token_cap", "NOT_VALIDATED"),
        "runtime_version": config["runtime_version"], "model_digest": model_digest}
    save("result.json", summary)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    result = run(args.model,args.output_dir.resolve())
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["real_inference_completed"] and result["pre_admission_rejected"] else 2)
