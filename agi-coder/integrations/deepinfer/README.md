# DeepInfer inference integration

This integration uses DeepInfer's **offline Python API**. The inspected open release does not supply a ready-to-use HTTP inference server. A process bridge is used rather than assuming a REST endpoint.

Engine pin: [`9bd9cf243fc53ef9afbf8f04d391d989117d6ab9`](https://github.com/deepseek-ai/DeepInfer/tree/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9), inspected October 21, 2026. The engine, model weights, compiled kernels, and deployment infrastructure are separate from the Rust client. Public source availability does not establish THEOREM maturity.

## Architecture

```text
Ready planner task -> propose_task -> InferenceProvider -> DeepInferClient
  -> bounded JSON process protocol -> bridge.py
  -> DeepInfer LLM.generate / SamplingParams -> unverified proposal
  -> host-owned independent verification -> signed WER -> gate -> protected executor
```

`InferenceProvider` supports replaceable engines. `agi-coder-cognition::inference::propose_task` requests a proposal without changing task status. A host-owned pipeline worker can use the same provider after admission. Inference never creates passing test evidence or authorization. The built-in pipeline demo remains synthetic.

## Provision on Linux

Upstream prerequisites include Linux, Python 3.12, GCC 13+, and CUDA 13 on NVIDIA SM100 or CANN 9.2 on Ascend 950. Successful mock tests do not establish accelerator compatibility.

1. Run `python scripts/fetch-deepinfer.py` to create the detached checkout pinned by `third_party/deepinfer.lock.json`. It refuses to overwrite existing paths and does not download weights.
2. Follow the pinned upstream build instructions in a dedicated Python 3.12 environment, including dependencies and vendor submodules. Set `DEEPINFER_ACCELERATOR=nvidia` or `ascend` before building.
3. Provision a local DeepSeek checkpoint with `config.json` and the required weights. The bridge requires a local directory and does not initiate checkpoint downloads. Pin and verify model artifacts separately.
4. Copy `engine.example.json` to `engine.local.json`. Configure absolute source/model paths, accelerator, parallel size, context length, and memory allocation. `trust_remote_code` defaults to false; enable it only when the operator explicitly trusts the model's Python code.
5. Copy `client.example.json` to `client.local.json`. Set absolute Python, bridge, and engine-config paths. Keep this executable-selection configuration host-owned.

The lock-and-fetch mechanism is used because the current parent workspace has no Git metadata. No parent repository was initialized. A future Git-managed repository can use a submodule at the same pinned commit instead.

## Run

Metadata preflight without loading weights:

```sh
/opt/deepinfer-env/bin/python integrations/deepinfer/bridge.py \
  --engine-config integrations/deepinfer/engine.local.json --check
```

Actual generation after provisioning:

```sh
cargo run --locked -p agi-coder-cli -- infer \
  --bridge-config integrations/deepinfer/client.local.json \
  --request integrations/deepinfer/request.example.json
```

The request's `model` must equal the resolved absolute configured model directory. Output includes request, response, and generated-text digests plus `verified: false`. There is no signing, test-pass assertion, merge, deployment, or gate authorization. A `length` finish reason means the generation budget was exhausted.

Each call starts and closes one engine and reloads weights. This is an initial auditable integration, not an efficient persistent serving tier. It supports one node, one data-parallel engine, and equal context/expert parallel sizes selected through `parallel_size`. Configure the visible accelerator set before launch. General multi-node orchestration and persistent batching are outside this bridge.

## Sampling

Rust validates finite nonnegative temperature, `top_p` in (0,1], positive `top_k` or -1, positive int32-sized output budgets, optional uint64 seeds, and structured output settings. Schema types `regex`, `json`, and `ebnf` map to upstream `SamplingParams.so_args`; JSON schemas are serialized strings.

Requested deterministic mode requires NVIDIA and a fixed seed. Before engine import, the bridge sets `DEEPINFER_BATCH_INVARIANT=1` and `DEEPINFER_ENABLE_MTP_VARLEN=0`, following upstream instructions. Deterministic repeatability has not been measured here. Structured decoding constraints are requested from the engine; callers must independently validate generated semantics and schema compliance.

## Protocol and trust

One process accepts one UTF-8 JSON request and emits one response. Rust checks protocol version, request digest, model identity, pinned revision, nonempty text, and output-token count. Malformed or duplicate responses, unknown fields, excessive output, failed process exits, and deadlines return errors. Limits: 1 MiB prompt, 256 KiB schema, 2 MiB serialized request, configurable 1 KiB..16 MiB response, and 256 KiB diagnostics.

Python redirects both native and Python stdout to stderr before engine imports and reserves a private descriptor for the final response. Rust captures bounded diagnostics but excludes their contents from errors to avoid returning echoed prompts or secrets.

The bridge checks the local source commit and rejects tracked source changes. This is not hardware attestation and does not establish the identity of compiled extensions, dependencies, untracked files, or weight contents. Host configuration remains trusted. Inference request hashing uses a versioned typed JSON encoding because sampling contains floating point; WER hashing retains its separate integer-only CBOR profile.

Timeout and cancellation kill the direct child, without guaranteeing cleanup of GPU descendants. Use an operator-managed process/container boundary and reconcile resource cleanup before retrying. No automatic retries occur. KV reuse services, prefill/decode disaggregation, and replica routing are outside this integration.

## Contract tests

```sh
cargo test --locked -p agi-coder-tests --test inference
python -m unittest discover -s integrations/deepinfer -p test_bridge.py -v
```

Rust uses a dedicated mock executable. Python injects fake native modules to check argument mapping, deterministic flags, validation, and cleanup. The standard-library Python tests run on Windows and Linux. Neither suite imports a real DeepInfer build, downloads weights, or uses a GPU.

Local client/bridge contracts are LEMMA after passing tests. Real engine initialization, generation, hardware compatibility, memory behavior, reproducibility, and model quality remain PENDING.
