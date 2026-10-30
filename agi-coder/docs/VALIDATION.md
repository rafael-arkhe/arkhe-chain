# Local validation

Date: October 21, 2026. Platform: Windows x64. Workspace: `D:\arkhe\agi-coder`.

The latest `scripts/validate.ps1` run, including DeepInfer integration, exited successfully. Toolchain: Rust 1.96.0, cargo-nextest 0.9.148, Python 3.14 on this host (standard-library contract tests only), Node.js 24.13.0, pnpm 11.25.0, TypeScript 5.9.3. Native DeepInfer execution separately requires Python 3.12.

| Check | Observed result |
| --- | --- |
| `cargo build --locked --workspace` | Passed for all 14 Rust crates |
| `cargo test --locked --workspace` | Passed; final functional coverage also run through nextest |
| `cargo nextest run --locked --workspace` | 35 passed, 3 skipped subprocess fixtures; run ID `e4b7b5d6-7d6f-4637-ab0a-e31c57d1b3a0` |
| `cargo clippy --locked --workspace --all-targets -- -D warnings` | Passed |
| `cargo fmt --all --check` | Passed |
| Python DeepInfer bridge contract suite | 5 passed; fake native modules, no engine or accelerator |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm build` | SDK and MCP server compiled |
| `pnpm test` | 5 passed: 4 SDK cases plus a real MCP stdio integration case |
| `cargo run --locked -p agi-coder-cli -- run --demo` | Five stages completed; five sample records; `deployed: false` |
| CLI `verify` with the static WER, separate intent and policy | Authorized; exit 0 |
| CLI `verify` with stale verification time | Rejected; exit 1 |
| CLI `infer` with mock subprocess | Exit 0, pinned revision and `verified: false` |
| CLI `infer` with mismatched response request digest | Rejected; exit 1 |
| SDK `pnpm pack` | Created a local tarball under ignored `output/`; no registry publication |

The three ignored Rust tests are child-process fixtures (pass, fail, and timeout). The two process-runner integration tests invoke them explicitly as subprocesses. They are not unfinished product tests. A first parallel nextest run exposed an unrealistically short 100 ms fixture timeout during Windows process startup; the test now allows 2 seconds while its deliberate slow child sleeps for 10 seconds. The final nextest run passed.

MMR fixtures cover counts 0, 1, 2, 3, 4, 5, 7, 8, 11, 16, and 31. Rust and TypeScript both consume the static independent Python output. Tamper checks cover record values, roots, peak hashes, counts, indices, and extra path elements.

The offline demo's deterministic root is `50ee5dba453b30a98a772da06a0e5fbccfa5d41e5fdfd11555f05340d3644768`. Its public key and synthetic records are demonstration data.

DeepInfer's upstream main revision was resolved with `git ls-remote` to `9bd9cf243fc53ef9afbf8f04d391d989117d6ab9`. The engine source lock, Python bridge, and Rust client use that revision. The fetch helper is supplied but was not run; no new engine checkout, build, model download, or real generation was performed. CPU mocks verify the interface rather than engine execution.

Not executed: hosted GitHub CI, signed release workflow, PostgreSQL migration, Docker build, Kubernetes deployment, live Jules API session, native DeepInfer initialization/inference, hardware attestation, or external transparency anchoring. Docker was not available on this host. The existing parent directory has no Git metadata, so no commit, submodule registration, or pull request was created.
