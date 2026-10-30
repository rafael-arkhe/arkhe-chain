# Arkhe Python runtime

Executable development integration: Python tool calls pass through the real Rust
`ContainmentGate`; offline MMR proofs use `arkhe-verify-core` compiled to WASM.

The existing `arkhe-verify-wasm` package exposes a JavaScript `wasm-bindgen` ABI.
It cannot be instantiated with an empty import list and Python objects as in the
conceptual proposal. `bridge` adds an import-free, versioned JSON-in-memory ABI
for Wasmtime without changing that browser package or duplicating cryptography.
Wasmtime's Python API is documented at https://bytecodealliance.github.io/wasmtime-py/.

## Build and test

From the repository root (Rust and Python 3.11+ required):

```powershell
rustup target add wasm32-unknown-unknown
cargo build -p arkhe-python-bridge --lib --target wasm32-unknown-unknown --release
cargo build -p arkhe-python-bridge --bin arkhe-python-gate
python -m pip install -e './integrations/arkhe-python-runtime[api,test]'
cargo test -p arkhe-python-bridge
python -m pytest integrations/arkhe-python-runtime/tests -q
```

## Run the FastAPI example

```powershell
$env:ARKHE_GATE_BIN = (Resolve-Path target/debug/arkhe-python-gate.exe).Path
$env:ARKHE_VERIFY_WASM = (Resolve-Path target/wasm32-unknown-unknown/release/arkhe_python_bridge.wasm).Path
# Example-only trust root from the checked-in Rust-generated three-leaf fixture.
$fixture = Get-Content integrations/arkhe-python-runtime/tests/mmr_fixture.json -Raw | ConvertFrom-Json
$env:ARKHE_TRUSTED_ROOT = -join ($fixture.root | ForEach-Object { '{0:x2}' -f $_ })
python -m uvicorn fastapi_agent:create_app --factory --app-dir integrations/arkhe-python-runtime/examples --host 127.0.0.1
```

POST `/agent/simulate` with `{"value":7}` returns `{"simulated_value":14}`
after Rust allows the `Simulate` intent. POST `/verify-mmr-proof` accepts
`leaf_hex`, `leaf_count`, and `proof` (the Rust `ProofStep` list). The leaf is
raw bytes, not a prehashed leaf; the verifier applies the existing domain prefix.
The root must come from trusted application configuration. Inclusion alone does
not establish root provenance, action authority, or correctness of a computation.

## Agent integration

```python
from arkhe_agent_guard import guarded_tool
from arkhe_verify import LocalDevGate

gate = LocalDevGate("/absolute/path/to/arkhe-python-gate")

# With LangChain, put @tool above @guarded_tool, then use tool.ainvoke(...).
@guarded_tool(gate, intent_type="Simulate")
async def simulate(value: int):
    return value * 2
```

The decorator supports JSON-compatible keyword arguments, including defaults.
It snapshots arguments before authorization and executes the same snapshot.
Sync tools run in a worker thread. Rejection, malformed responses, timeouts, and
adapter errors prevent tool execution. The executable is trusted local config;
never obtain its path or the tool-to-intent mapping from an LLM or API caller.

## Explicit limits

The local adapter uses the existing `DevPolicyResolver` and supplies no worker
evidence. It allows only `DraftDocument`, `QueryKnowledgeBase`, and `Simulate`.
Protected actions reject. A tool labelled `Simulate` must have no protected side
effects; the decorator cannot infer a function's semantics. Production requires
a trusted tool registry, actual governance policy, admitted evidence, caller
authentication, and the durable journal before enabling protected actions.

`authorization_ref` is the kernel's digest reference, not a signed authorization
proof. The random per-call request identity does not provide retry idempotency.
This slice does not add a PostgreSQL journal, WormGraph anchoring, HTTP gate
service, native n8n node, or hallucination verification. Structured log entries
correlate authorization references but are not cryptographic execution receipts.

WASM calls have a 64 KiB request cap, 32 MiB memory cap, instruction fuel, no
imports, and a fresh store per call. The supplied WASM file is a trusted build
artifact. ABI v1 returns `1` for valid, `0` for root mismatch, and `-1` for invalid
encoding. Existing core proof semantics are preserved.
