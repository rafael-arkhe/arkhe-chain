# Execution record — 2026-10-17

All results below were executed locally. The reproducible command ledger is
[RESULTS](evidence/2026-10-17-execution/RESULTS.md), with structured attempts in
[results.json](evidence/2026-10-17-execution/results.json). Logs include real
process output; each attempt records UTC time, exit code, duration, source-file
hashes and log SHA256. Earlier failures remain visible.

| Gate | Observed result |
|---|---|
| Architecture | PASS: 19 Rust crates, four editable Node packages, eight immutable migrations |
| Cargo check/test/fmt | PASS with root locked workspace |
| Baseline Nextest | PASS: 12 tests, two SQL tests skipped as configured |
| PostgreSQL-enabled Nextest | PASS: 16 tests, zero skipped |
| ContainmentGate | PASS: missing WER evidence, EmergencyStop and PolicyDenied rejection |
| WER integrity | PASS: all unsigned fields and reference order are digest-bound |
| Node frozen install / recursive tests | PASS: all four packages executed, six tests passed |
| Angular apps / WASM / TypeScript adapter builds | PASS; melodic initial bundle has a non-blocking budget warning |
| Cognition conformance | PASS: six real modules plus dependency/signing boundary checks |
| WorkIntent/WER vectors | PASS: 17 independently regenerated Python stdlib vectors verified in Rust |
| Artifact vectors / MMR | PASS: native READY contract and MMR proofs; candidate status preserved |
| SQL migrations/security | PASS: eight arkhe-sql migrations, 13 SQL gates, checksum/RLS/append-only audits |
| Full Compose build and deployment | PASS through podman-compose on the arkhe-runtime connection |
| Redis / MCP health / Prometheus / Grafana | PASS: PONG, metrics, real scrape up=1, authenticated datasource proxy query |
| Live WormGraph | PASS: atomic persistence, exact replay, causal parents, restart durability and real DB outage rejection |

The Compose deployment uses PostgreSQL 16, Redis 7, the non-root Rust runtime,
MCP health/metrics, Prometheus and Grafana. The existing PostgreSQL named volume
was retained. The health service is operational only; the separate verification
MCP adapter was tested through the actual stdio protocol and WASM.

Two Compose invocation failures were corrected before adoption: global connection
arguments were misplaced by the provider, then podman-compose 1.5 classified
Windows drive-letter paths as Git URLs. The local wrapper corrects only that
classifier in its own process. The first vector regeneration check also detected
CRLF formatting; LF normalization restored exact regeneration without changing
any vector data, hash or READY status.

The WI/WER object digests use AKG-CBOR-v1 with separate object domains. Existing
operation_id and authorization-reference v0-REF protocols are separate reference
boundaries. C2PA-001 remains CANDIDATE. Cosign publication, Kubernetes policy and
production conformance were not executed or approved. Remote CI, a normative
freeze, factual model validity and AGI are not claimed by this local evidence.
Packaged Paybox and historical snapshots remain outside the active test scope.

Lifecycle and reproduction: [LIVE-RUNTIME](LIVE-RUNTIME.md).
The former artifact-only report is retained under
`archive/workspace-manifests/environment.EXECUTION.md`.


Subsequent remote execution is recorded separately in [REMOTE-CI](REMOTE-CI.md).
