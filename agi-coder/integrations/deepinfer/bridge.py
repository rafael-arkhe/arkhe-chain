#!/usr/bin/env python3
"""One-request JSON bridge to the pinned DeepInfer offline Python interface.

No weights are downloaded and no HTTP service is assumed. Run in a provisioned
Linux/Python 3.12 environment with supported accelerators. Stdout is protocol only.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys

REVISION = "9bd9cf243fc53ef9afbf8f04d391d989117d6ab9"
MAX_REQUEST = 2 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def integer(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def validate_request(envelope):
    require(isinstance(envelope, dict) and set(envelope) == {"protocol", "request_digest", "request"}, "invalid request envelope")
    require(type(envelope["protocol"]) is int and envelope["protocol"] == 1, "unsupported protocol")
    require(isinstance(envelope["request_digest"], str) and re.fullmatch(r"[a-f0-9]{64}", envelope["request_digest"]), "invalid request digest")
    request = envelope["request"]
    require(isinstance(request, dict) and set(request) == {"model", "prompt", "sampling"}, "invalid inference request")
    require(isinstance(request["model"], str) and request["model"].strip(), "model is required")
    require(isinstance(request["prompt"], str) and request["prompt"].strip() and len(request["prompt"].encode()) <= 1024 * 1024, "invalid prompt")
    sampling = request["sampling"]
    fields = {"temperature", "top_p", "top_k", "max_tokens", "seq_seed", "deterministic", "structured_output"}
    require(isinstance(sampling, dict) and set(sampling) == fields, "invalid sampling fields")
    for key in ("temperature", "top_p"):
        require(type(sampling[key]) in (int, float) and math.isfinite(sampling[key]), "sampling values must be finite numbers")
    require(sampling["temperature"] >= 0 and 0 < sampling["top_p"] <= 1, "invalid temperature or top_p")
    require(integer(sampling["top_k"], -1, 2**31 - 1) and sampling["top_k"] != 0, "invalid top_k")
    require(integer(sampling["max_tokens"], 1, 2**31 - 1), "invalid max_tokens")
    require(sampling["seq_seed"] is None or integer(sampling["seq_seed"], 0, 2**64 - 1), "invalid seq_seed")
    require(type(sampling["deterministic"]) is bool, "deterministic must be boolean")
    require(not sampling["deterministic"] or sampling["seq_seed"] is not None, "deterministic mode requires a fixed seed")
    structured = sampling["structured_output"]
    if structured is not None:
        require(isinstance(structured, dict) and set(structured) == {"schema_type", "schema"}, "invalid structured output")
        require(structured["schema_type"] in ("regex", "json", "ebnf"), "unsupported schema type")
        require(isinstance(structured["schema"], str) and structured["schema"].strip() and len(structured["schema"].encode()) <= 256 * 1024, "invalid schema")
        if structured["schema_type"] == "json":
            schema = json.loads(structured["schema"])
            require(isinstance(schema, (dict, bool)), "JSON schema must be an object or boolean")
    return request


def validate_config(config):
    fields = {"repository", "model_directory", "accelerator", "parallel_size", "max_model_len", "gpu_memory_utilization", "trust_remote_code"}
    require(isinstance(config, dict) and set(config) == fields, "invalid engine configuration fields")
    require(config["accelerator"] in ("nvidia", "ascend"), "unsupported accelerator")
    require(integer(config["parallel_size"], 1, 1024), "invalid parallel size")
    require(integer(config["max_model_len"], 1, 2**31-1), "invalid context limit")
    require(type(config["gpu_memory_utilization"]) in (int, float) and math.isfinite(config["gpu_memory_utilization"]) and 0 < config["gpu_memory_utilization"] < 1, "invalid memory utilization")
    require(type(config["trust_remote_code"]) is bool, "trust_remote_code must be boolean")
    require(isinstance(config["repository"], str) and Path(config["repository"]).is_absolute(), "repository must be absolute")
    require(isinstance(config["model_directory"], str) and Path(config["model_directory"]).is_absolute(), "model directory must be absolute")


def preflight(config):
    validate_config(config)
    require(sys.platform == "linux", "DeepInfer execution requires Linux")
    require(sys.version_info[:2] == (3, 12), "the pinned DeepInfer release requires Python 3.12")
    root = Path(config["repository"]).resolve()
    require((root / "deepinfer/entrypoints/llm.py").is_file(), "DeepInfer source is missing")
    # Refuse a floating checkout or locally modified tracked source. This is local
    # provenance checking, not a hardware attestation or a clean build guarantee.
    actual = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True, timeout=10).strip()
    require(actual == REVISION, "DeepInfer revision does not match the pinned commit")
    tracked = subprocess.check_output(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=no"], text=True, timeout=10)
    require(not tracked.strip(), "DeepInfer tracked source has local changes")
    model = Path(config["model_directory"]).resolve()
    require((model / "config.json").is_file(), "provide a preprovisioned local checkpoint containing config.json")
    return root, model


def sampling_kwargs(sampling):
    return {"temperature": sampling["temperature"], "top_p": sampling["top_p"], "top_k": sampling["top_k"],
            "max_tokens": sampling["max_tokens"], "seq_seed": sampling["seq_seed"], "so_args": sampling["structured_output"]}


def generate(envelope, config):
    request = validate_request(envelope)
    root, model = preflight(config)
    require(request["model"] == str(model), "request model must equal the resolved configured checkpoint directory")
    require(request["sampling"]["max_tokens"] < config["max_model_len"], "output token budget must be below context limit")
    os.environ["DEEPINFER_ACCELERATOR"] = config["accelerator"]
    if request["sampling"]["deterministic"]:
        require(config["accelerator"] == "nvidia", "upstream deterministic sampling is NVIDIA-only")
        os.environ["DEEPINFER_BATCH_INVARIANT"] = "1"
        os.environ["DEEPINFER_ENABLE_MTP_VARLEN"] = "0"
    os.environ.setdefault("RANK", "0")
    os.environ.setdefault("WORLD_SIZE", "1")
    require(os.environ["RANK"] == "0" and os.environ["WORLD_SIZE"] == "1", "this bridge supports a single-node, single-engine deployment")
    os.environ.setdefault("DEEPINFER_SAMPLER_FORCE_TOPK", "4096")
    # Import only after environment configuration. Engine diagnostics are redirected
    # at the file-descriptor level by main(), including native extension output.
    sys.path.insert(0, str(root))
    from deepinfer.entrypoints.llm import LLM
    from deepinfer.sampling_params import SamplingParams

    llm = LLM(model=str(model), trust_remote_code=config["trust_remote_code"],
              expert_parallel_size=config["parallel_size"], context_parallel_size=config["parallel_size"],
              data_parallel_size=1, engine_rank=0, chunked_prefill=True, decode_sequence=False,
              max_model_len=config["max_model_len"], max_num_batched_tokens=config["max_model_len"],
              max_num_seqs=1, gpu_memory_utilization=config["gpu_memory_utilization"])
    try:
        outputs = llm.generate(prompts=[request["prompt"]], sampling_params=SamplingParams(**sampling_kwargs(request["sampling"])), use_tqdm=False)
        require(len(outputs) == 1 and isinstance(outputs[0], list) and outputs[0], "missing token output")
        tokens = outputs[0]
        require(len(tokens) <= request["sampling"]["max_tokens"], "engine exceeded output budget")
        last = tokens[-1]
        require(last.finished and last.finish_reason in ("stop", "length"), "unsupported or unfinished generation")
        text = llm.get_tokenizer().decode([token.token_id for token in tokens], skip_special_tokens=True, clean_up_tokenization_spaces=False)
        require(text.strip(), "empty generated text")
        return {"protocol": 1, "request_digest": envelope["request_digest"], "model": str(model),
                "engine_revision": REVISION, "text": text, "output_tokens": len(tokens), "finish_reason": last.finish_reason}
    finally:
        llm.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine-config", type=Path, required=True)
    parser.add_argument("--check", action="store_true", help="Check source/platform/checkpoint metadata without loading the model")
    args = parser.parse_args()
    # Retain a private protocol descriptor; send all engine/native stdout to stderr.
    protocol_fd = os.dup(sys.stdout.fileno())
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    try:
        config = json.loads(args.engine_config.read_text(encoding="utf-8"))
        if args.check:
            preflight(config)
            result = {"preflight": "passed", "engine_revision": REVISION, "hardware_execution_verified": False}
        else:
            raw = sys.stdin.buffer.read(MAX_REQUEST + 1)
            require(len(raw) <= MAX_REQUEST, "request exceeds bridge limit")
            result = generate(json.loads(raw), config)
        with os.fdopen(protocol_fd, "w", encoding="utf-8") as output:
            output.write(json.dumps(result, allow_nan=False) + "\n")
    except Exception as error:
        # Exception text may contain engine internals or prompt data. Keep protocol
        # errors minimal; trusted operators can diagnose their environment separately.
        print(f"DeepInfer bridge failed ({type(error).__name__}). Check platform, pinned source, checkpoint, sampling, and engine prerequisites.", file=sys.stderr)
        try:
            os.close(protocol_fd)
        except OSError:
            pass
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
