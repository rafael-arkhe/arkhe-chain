# agi-coder

An executable Rust and TypeScript foundation for evidence-gated coding agents.
All project documentation and interfaces use English (US).

**Frontier coding agent + autonomous verification + long-horizon planning + cryptographic accountability** is the architectural goal. This repository implements bounded infrastructure for those concerns; it does not demonstrate AGI or unattended production autonomy.

The existing Arkhe workspace remains separate. This project translates the supplied Arkhe/Jules design and audit requirements into a new, independently buildable workspace. It does not claim that the pasted code was already correct, that an upstream kernel was copied unchanged, or that the source document's market and benchmark claims were verified.

## Quick start

Requirements: Rust 1.96.0, Node.js 22 or newer, and pnpm 11.25.0.

```powershell
cd D:\arkhe\agi-coder
cargo build --locked --workspace
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo fmt --all --check
python -m unittest discover -s integrations/deepinfer -p test_bridge.py -v
pnpm install --frozen-lockfile
pnpm build
pnpm test
cargo run --locked -p agi-coder-cli -- run --demo
```

`cargo build --locked -p agi-coder-cli` writes `target/debug/agi.exe` on Windows and `target/debug/agi` elsewhere. Release archives and the CLI image also copy that binary to `agi-coder`. The operator page stays in the foreground:

```powershell
cargo run --locked -p agi-coder-cli -- ui --bind 127.0.0.1:8791
```

Open the printed loopback URL. See [CLI](docs/CLI.md) and [design](design/DESIGN.md).

The offline demo creates five signed sample records through design, implementation, test, audit, and deployment **simulations**. It prints `mode: offline-demo` and `deployed: false`. Its public test key and synthetic test counts must never be trusted by a production policy.

```sh
cargo agi plan "Add a repository feature"
cargo agi --help
node packages/mcp-server/dist/index.js
```

The MCP process speaks JSON-RPC over stdio; it waits for client messages. Configure a client with `command: node` and an absolute path to `packages/mcp-server/dist/index.js` as its argument. Tools: `verify_mmr_inclusion`, `get_cost`, and `attest_gpu`. The GPU tool deliberately returns an unsupported error until a real hardware verifier exists.

## Components

| Rust crate | Implemented behavior |
| --- | --- |
| `agi-coder-core` | Framed BLAKE3 domains, deterministic integer-only CBOR, intent IDs, Ed25519-signed WERs |
| `agi-coder-kernel` | Trusted signer/requester/operation policy, exact intent/output binding, evidence age checks |
| `agi-coder-journal` | Admission before dispatch, replay, conflict detection, terminal states, uncertain-outcome reconciliation |
| `agi-coder-wormgraph` | Append-only in-process MMR, size-bound roots, portable inclusion proofs |
| `agi-coder-cognition` | Dependency DAG validation, bounded retries, explicit perceive/decide/act/verify loop |
| `agi-coder-memory` | Working, episodic, and sourced semantic memory; explicit JSON checkpoints |
| `agi-coder-verification` | Independent-author finite-domain oracles and real process mutation campaigns |
| `agi-coder-pipeline` | Evidence-gated stage execution, replay protection, conflict-aware file result merging |
| `agi-coder-research` | Content-addressed source capture, hypothesis resolution, provider interface |
| `agi-coder-jules` | Typed REST create/get/poll/activity pagination, patch extraction, conservative review routing |
| `agi-coder-inference` | Validated sampling, bounded DeepInfer process bridge, content-addressed unverified proposals |
| `agi-coder-cost` | Checked integer micro-USD accounting with measured/estimated labels |
| `agi-coder-cli` | `agi` and `agi-coder`: `status`, `mcp`, `pending`, `ui`, `plan`, `run --demo`, `infer`, `verify`, `verify-spec`, `anchor`, `mmr`, `cost` |
| `agi-coder-tests` | Security, state machine, mutation, HTTP mock integration, and static golden tests |

TypeScript packages: `@agi-coder/sdk` independently verifies MMR proofs and calculates explicit costs; `@agi-coder/mcp-server` exposes those operations using the official MCP SDK.

## DeepInfer integration

`agi-coder-inference` connects to the upstream offline Python interface, validates sampling and structured-output parameters, and exposes a replaceable provider plus a cognition proposal helper. The `infer` command generates explicitly unverified text. See [provisioning and usage](integrations/deepinfer/README.md). Native inference requires a separately provisioned compatible Linux accelerator host; only CPU contract tests have run here.

## Use real verification

`verify` takes three separate JSON files: a signed record, the expected intent, and the locally trusted policy. Never accept the trust policy from the same untrusted source as the record. `tests/golden/wer_vectors.json` contains an example of each structure and a fixed verification time.

`verify-spec manifest.json` runs a caller-authored `ProcessCampaign` against baseline and prepared mutant directories. The schema is documented in [verification.md](specs/agi-coder/verification.md). Baseline failure, missing commands, timeouts, and inadequate mutation scores return a nonzero CLI exit code. Test commands are trusted input and run directly on the host; use isolated containers for untrusted programs.

## Trust boundaries and limits

A signature proves which configured key attested a record and detects changed bytes. The signer remains responsible for running independent tests against the recorded output. Author strings alone cannot establish organizational independence. A local MMR proves inclusion relative to an independently trusted root; it does not establish external publication, execution truth, hardware identity, or code correctness.

The journal, evidence store, and MMR are single-process and in memory. Restarting loses their state, so this version must not mediate irreversible production actions. The PostgreSQL migration is a contract for a future durable adapter. Research requires a caller-provided retrieval adapter. DeepInfer generation requires separate engine provisioning; there is no built-in LLM planner, autonomous repository editor, source mutation generator, or production deploy executor. `agi ui` serves a loopback operator page for the catalog, the dependency plan, and the labeled demo. It does not expose `infer` or `verify-spec`. A Tauri shell is not packaged.

CI, a manually dispatched signed release-candidate workflow, Dockerfiles, and a one-shot Kubernetes demo Job are included. No release, package publication, database migration, or deployment was performed during implementation. `agi mcp` prints the stdio entry; it does not start the server. See [MATURITY.md](docs/MATURITY.md) and [VALIDATION.md](docs/VALIDATION.md).

## Design and references

- [Architecture](docs/ARCHITECTURE.md), [CLI](docs/CLI.md), [security](docs/SECURITY.md), [formula](docs/AGI-CODER-FORMULA.md), [implementation scope](docs/IMPLEMENTATION.md), and [operator design](design/DESIGN.md).
- [MMR profile](specs/agi-coder/mmr-profile.md), [planning](specs/agi-coder/planning.md), [verification](specs/agi-coder/verification.md), and [pipeline](specs/agi-coder/pipeline.md).
- [Official Jules API](https://developers.google.com/jules/api), [sessions](https://developers.google.com/jules/api/reference/rest/v1alpha/sessions), and [activity artifacts](https://developers.google.com/jules/api/reference/rest/v1alpha/sessions.activities) informed the alpha REST adapter; checked October 21, 2026.
- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) informed the SDK-based server and integration tests.

License: Apache-2.0 OR MIT.
