"""B/C development smoke: real generation + native unsigned WER and dev gate.

Frozen memory is a caller-provided snapshot, not demonstrated learned memory.
No sandbox, signed admission, durable WormGraph or citation claim is made.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

from generality_pilot import digest
from ollama_arm_a import generate, check_matches_manifest, SAMPLING_SEED, SAMPLING_TEMPERATURE
from tool_broker import BudgetExceeded, ToolBroker


def compose_prompt(arm, prompt, memory):
    if arm not in ("B", "C"):
        raise ValueError("arm must be B or C")
    if arm == "C" and memory:
        raise ValueError("C cannot receive learned memory")
    if not memory:
        return prompt
    return "Frozen prior experience (untrusted context):\n" + memory + "\n\nTask:\n" + prompt


def native_call(executable, payload, broker):
    process = subprocess.run([str(executable)], input=json.dumps(payload, allow_nan=False).encode(),
        capture_output=True, timeout=broker.remaining_seconds(), check=False,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    if process.returncode:
        raise RuntimeError("native pilot bridge rejected input or failed")
    result = json.loads(process.stdout)
    if result.get("gate") != "ALLOW":
        raise RuntimeError("native gate rejected local simulation: " + str(result.get("reason")))
    broker.remaining_seconds()
    return result


def execute(config, prompt, memory, arm, limits, executable, run_id, output_cap=64,
            placement="cpu", allow_observed_total=False, persist=None):
    combined = compose_prompt(arm, prompt, memory)
    broker = ToolBroker(limits)
    timings = {}
    frozen = {"phase":"adapter_smoke", "arm":arm, "config":config, "limits":limits,
              "prompt_sha256":digest(combined), "task_prompt_sha256":digest(prompt),
              "memory_sha256":digest(memory), "output_cap":output_cap,
              "device_placement_requested":placement,
              "sampling":{"seed":SAMPLING_SEED, "temperature":SAMPLING_TEMPERATURE,
                          "num_ctx":config["context_tokens"], "raw_prompt":True},
              "bridge_binary_sha256":hashlib.sha256(executable.read_bytes()).hexdigest(),
              "allow_observed_total":allow_observed_total,
              "citation_mode":"whole-response-vs-memory-lexical-v1" if arm == "B" else "disabled",
              "memory_origin":"CALLER_SNAPSHOT_NOT_LEARNING_EVIDENCE"}
    if persist:
        persist("manifest.json", frozen)
        persist("input-snapshot.json", {"task_prompt":prompt, "memory":memory,
                                        "model_prompt":combined})
    payload = {"run_id":run_id, "arm":arm, "prompt":combined, "memory":memory,
               "model_digest":config["model_digest"], "answer":"", "phase":"preflight",
               "manifest_sha256":digest(frozen),
               "intent_type":"Simulate", "emergency_stop":False}
    payload["verify_citations"] = arm == "B"
    record = {"phase":"adapter_smoke", "arm":arm, "capability_demonstrated":False,
              "input_snapshot":"input-snapshot.json",
              "input_snapshot_sha256":digest({"task_prompt":prompt, "memory":memory, "model_prompt":combined}),
              "grading":"NOT_PERFORMED", "sandbox":"NOT_QUALIFIED",
              "native_wer":"NOT_CREATED",
              "wormgraph_anchor":"NOT_INTEGRATED", "durable_admission":"NOT_INTEGRATED",
              "citation_verification":"NOT_PERFORMED", "memory_isolation":"API_ONLY_NOT_SANDBOX",
              "total_token_cap":"POSTCHECK_ONLY", "execution_status":"FAILED"}
    def timed(name, function, *args, **kwargs):
        started = time.monotonic()
        try:
            return function(*args, **kwargs)
        finally:
            timings[name] = time.monotonic() - started
    try:
        preflight = timed("preflight_seconds", native_call, executable, payload, broker)
        if persist:
            persist("preflight.json", preflight)
        generated = timed("generation_seconds", generate, config, combined, broker, output_cap=output_cap,
                             require_hard_total_cap=not allow_observed_total,
                             device_placement=placement)
        check_matches_manifest(generated, frozen)
        record.update(generated)
        # Preserve completed generation even if the native postcheck fails.
        if persist:
            persist("generation.json", generated)
        native = timed("native_verification_seconds", native_call, executable,
                       {**payload, "answer":generated["answer"], "phase":"record"}, broker)
        if native["intent_digest"] != preflight["intent_digest"]:
            raise RuntimeError("native postcheck intent differs from preflight")
        if arm == "B" and native.get("citation_report") is None:
            raise RuntimeError("native B postcheck did not return the required lexical citation report")
        if persist:
            persist("native-evidence.json", native)
            if native.get("citation_report") is not None:
                persist("citation-report.json", native["citation_report"])
        record.update(native_wer="CANONICAL_UNSIGNED", native_evidence=native,
                      citation_verification=native.get("citation_verification", "NOT_PERFORMED"),
                      usage=broker.finish(), execution_status="COMPLETED_UNGRADED")
    except (BudgetExceeded, ValueError, RuntimeError, KeyError, OSError, subprocess.TimeoutExpired) as error:
        record.update(reason=getattr(error, "reason", type(error).__name__), error=str(error))
        observation = getattr(error, "provider_observation", None)
        if observation is not None:
            record["partial_provider_observation"] = observation
            if persist:
                persist("generation-partial.json", observation)
    finally:
        record.setdefault("usage", broker.usage())
        record["timings"] = timings
        record["usage_complete"] = record["usage"]["reserved_tokens"] == 0
        record["broker_events"] = broker.events
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--arm", required=True, choices=("B", "C"))
    parser.add_argument("--prompt-file", type=Path, required=True)
    parser.add_argument("--memory-file", type=Path)
    parser.add_argument("--bridge-exe", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=Path(__file__).resolve().parents[1]/"config/ollama.json")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--max-tokens", type=int, default=1024)
    parser.add_argument("--max-output-tokens", type=int, default=64)
    parser.add_argument("--max-wall-clock", type=float, default=90)
    parser.add_argument("--device-placement", choices=("cpu", "provider-default"), default="cpu")
    parser.add_argument("--allow-observed-total", action="store_true")
    args = parser.parse_args()
    if args.arm == "C" and args.memory_file:
        parser.error("C cannot receive a memory file")
    if args.arm == "B" and not args.memory_file:
        parser.error("B requires an explicit frozen memory snapshot")
    prompt = args.prompt_file.read_text(encoding="utf-8")
    memory = args.memory_file.read_text(encoding="utf-8") if args.memory_file else ""
    config = json.loads(args.config.read_text(encoding="utf-8"))
    executable = args.bridge_exe.resolve(strict=True)
    args.output_dir.mkdir(parents=True, exist_ok=False)
    def persist(name, value):
        with (args.output_dir / name).open("x", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, allow_nan=False)
            stream.write("\n")
    record = execute(config, prompt, memory, args.arm,
        {"max_tokens":args.max_tokens, "max_tool_calls":0, "max_wall_clock":args.max_wall_clock},
        executable, args.output_dir.name, args.max_output_tokens, args.device_placement,
        args.allow_observed_total, persist)
    persist("record.json", record)
    raise SystemExit(0 if record["execution_status"] == "COMPLETED_UNGRADED" else 2)


if __name__ == "__main__":
    main()
