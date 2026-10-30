# Remote execution — 2026-10-17

**PASS: the dedicated AGI environment workflow completed successfully in GitHub Actions.**

- Repository: `rafael-arkhe/arkhe-os`
- Source: `environments/agi`, branch `ci/agi-environment-execution`
- Tested commit: `241c96e9e915572367ab83143e2aecdd905b6816`
- [Successful run 39054969626](https://github.com/rafael-arkhe/arkhe-os/actions/runs/39054969626)
- [Provider run metadata](evidence/remote-ci/39054969626/run.json)
- [Local evidence verification](evidence/remote-ci/39054969626/verification.json)

| Job | Observed result | Downloaded ledger |
|---|---|---|
| kernel-and-contracts | PASS: 10 gates; architecture, six readiness regression tests, static boundaries, native vectors, format, Cargo check/test, Nextest and six-module cognition | [Kernel](evidence/remote-ci/39054969626/execution-kernel-and-contracts-1/RESULTS.md) |
| surfaces-and-wasm | PASS: five gates; frozen install, WASM, TypeScript adapter, all four Node packages (six tests), both Angular builds | [Surfaces](evidence/remote-ci/39054969626/execution-surfaces-and-wasm-1/RESULTS.md) |
| persistent-runtime | PASS: two gates; eight migrations, 13 SQL security cases, 16 Nextest tests with zero skipped, HTTP conformance and complete Docker Compose stack | [Runtime](evidence/remote-ci/39054969626/execution-persistent-runtime-1/RESULTS.md) |

All 17 recorded gates exited zero. The three job ledgers have one identical active
source identity, unchanged throughout execution, matching the active local sources.
Every downloaded log SHA256 was verified. GitHub run IDs and tested commit IDs
were checked against each ledger. Artifact ZIP hashes are retained in run.json.
The baseline Nextest run intentionally skips two SQL cases; the PostgreSQL-enabled
run executes 16 tests, with none skipped. Independent Python regeneration and
native Rust verification confirm all 17 WorkIntent/WER AKG-CBOR-v1 vectors.

The Docker job verifies Redis PING, MCP operational health/metrics, actual
Prometheus scraping and the authenticated Grafana datasource proxy. It verifies
atomic object/envelope persistence, exact replay, causal parents, application and
database restart durability, and fail-closed behavior during a real DB outage.
The operational MCP HTTP surface has no verification authority; the separate
stdio adapter is exercised with its actual WASM verifier.

## Failures retained and corrected

| Run | Actual failure | Correction |
|---|---|---|
| [39046766768](https://github.com/rafael-arkhe/arkhe-os/actions/runs/39046766768) | HTTP readiness aborted on ConnectionResetError after application restart | Bounded retries for readiness GET transport errors; persistent failure and unhealthy status still fail; application writes are not retried |
| [39048798203](https://github.com/rafael-arkhe/arkhe-os/actions/runs/39048798203) | Migration connection reset while PostgreSQL initialization switched servers | Probe TCP instead of the temporary Unix-only initialization server; Compose waits for PostgreSQL health before starting runtime |

Both failed ledgers and artifact metadata are preserved under evidence/remote-ci.
Six stdlib Python regression tests cover bounded failures and recovery. A new
PostgreSQL container was also tested locally: TCP readiness was followed by a
successful TCP query. The updated full stack passed locally with Podman before
this successful Docker/GitHub execution. Nextest 0.9.148 is installed from its
pinned upstream binary with a fixed SHA256, avoiding repeated tool compilation.

## Scope

The existing arkhe-os workspace and its workflows were preserved. The AGI
workspace is isolated under environments/agi; its root workflow is
.github/workflows/agi-environment.yml. The pre-existing formal.yml workflow still
reports failure before creating jobs. Its blob is unchanged from the original
base commit, as recorded in verification.json. This result certifies the observed
AGI environment execution only; it does not mark every repository workflow green.

C2PA-001 remains CANDIDATE. Cosign publication, real Kubernetes admission and
production conformance remain unexecuted. B.0.2 and the distributed architecture
remain unfrozen. Factual model validity and AGI are not demonstrated by these tests.
The [earlier local execution](EXECUTION.md) remains a separate historical record.
