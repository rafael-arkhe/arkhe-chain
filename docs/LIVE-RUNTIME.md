# Persistent local runtime

The application exposes an authenticated HTTP API backed by PostgreSQL 16.
`POST /work` authorizes a proposal, then atomically persists its canonical
WorkIntent, canonical WorkerExecutionRecord, and authorization evidence.
The response is a committed authorization receipt. It executes no external effect.
The development resolver rejects every protected intent; deploying this API does
not install production governance or establish AGI conformance.

## Start and verify

Requirements: pinned Rust 1.96.0, cargo-nextest, Python 3, and a running Docker or
Podman engine. Run commands from the repository root. Rust crates share the root
Cargo workspace and lockfile; the authoritative SQL sources are in `storage/sql`.
The Docker build context is this same root. `.dockerignore` excludes archives,
applications, build outputs and local credentials from the runtime image build.

```powershell
# Existing machine created for this environment:
podman machine start arkhe-runtime
python scripts/live_runtime.py up

# Docker alternative:
python scripts/live_runtime.py up --engine docker
```

`up` runs locked kernel compilation, workspace tests, Nextest and real-module
cognition conformance before provisioning. It creates a named PostgreSQL volume,
uses SQLx migration tracking/checksums over the eight arkhe-sql migrations, runs
the original migration CLI checksum/RLS/append-only audits and the real SQL gates,
runs Rust PostgreSQL integration tests, builds a Linux image, and runs live HTTP
conformance. Credentials are generated once under ignored `ops/local/live.json`.
The application receives only its restricted login and API token; admin credentials
are used only by the provisioner/migration process.

```powershell
python scripts/live_runtime.py status
python scripts/live_runtime.py verify
python scripts/live_runtime.py down
```

`verify` tests the running deployment, including restarting the app and briefly
stopping/restarting its dedicated database. `down` stops both managed containers
and preserves `arkhe-live-pgdata`. `up` reuses the same credentials and data.
Containers are labelled `io.arkhe.environment=live-v1`; scripts refuse to replace
unrelated containers with the same names. The old broken Podman machine and its
containers are not modified.

The API is bound to `127.0.0.1:8788`, PostgreSQL to `127.0.0.1:55432`.
To check the API in PowerShell without printing credentials:

```powershell
$liveConfig = Get-Content ops/local/live.json | ConvertFrom-Json
Invoke-RestMethod http://127.0.0.1:8788/health -Headers @{Authorization = "Bearer $($liveConfig.token)"}
```

## API and admission boundary

All routes require `Authorization: Bearer <token>`.

| Route | Behavior |
|---|---|
| `GET /health` | Checks the real evidence table through the tenant read role; 503 when unavailable |
| `POST /work` | Accepts `{intent, worker_record}`; returns hex record/intent/worker digests only after commit |
| `GET /evidence/{hex}` | Returns the typed envelope in this instance's tenant; 404 for absent evidence |
| `GET /objects/{WorkIntent or WorkerExecutionRecord}/{hex}` | Returns the persisted canonical CBOR bytes |

The configured actor (`local-operator`) must match `intent.requested_by`.
`worker_record.input_digest` must equal the actual canonical WorkIntent digest.
All context and evidence parents must already be readable in this tenant.
A tenant is configured per instance (`ARKHE_TENANT_ID=local` in the provisioner);
request headers or JSON cannot select another tenant or change policy.
No HTTP route accepts an arbitrary EvidenceEnvelope as verified evidence.

`work_objects` stores the domain-specific digests and exact AKG-CBOR-v1 bytes.
`wormgraph_records` stores the authorization envelope as JSONB keyed by
`(tenant_id, record_hash)`. Its hash is the existing kernel authorization reference;
this change does not invent or claim a frozen canonical EvidenceEnvelope protocol.
Authorization evidence records a decision about a proposal, not factual verification
of a model output. The generic Rust `append_verified` capability remains restricted
to trusted callers that perform admission outside the store.

All writes use transactions with `SET LOCAL ROLE arkhe_append` and the shared
`arkhe_sql::tenant::set_tenant`; reads use `arkhe_read`. The new tables have ENABLE
and FORCE RLS, explicit grants/revokes and the original append-only trigger.
The login cannot bypass RLS, create roles or databases, or act as superuser.
The service refuses elevated DB credentials at startup. Schema migration is an
explicit `arkhe-runtime migrate` deployment command, never an HTTP operation.

Exact replay returns the existing receipt without changing rows. A collision with
any different envelope field or canonical bytes fails. The atomic transaction
rolls back objects when parent checks or envelope persistence fail. Parent links
are ordered and preserved; only already committed parents may be referenced.
A missing database yields no receipt. This is not an exactly-once external-effect
or MMR checkpoint/inclusion-proof implementation.

## Verification coverage

`tests/postgres_live.rs` covers atomic rollback, eight concurrent replays,
conflicting envelope metadata, connection reopening, graph parent links,
isolation and rejected cross-tenant writes through PostgreSQL itself (without
application tenant filters), missing tenant context, denied mutation operations,
rejection of elevated credentials, protected-policy rejection and WER binding.
It is enabled with `--features arkhe-runtime/postgres-integration` and requires
real runtime/admin URLs, supplied privately by `live_runtime.py`.

`live_http_conformance.py` independently computes CBOR and BLAKE3 in Python,
compares actual persisted bytes through HTTP, tests authentication and actor binding,
replays work, reads parent links, restarts the app and database, and verifies real
database-outage behavior. The original SQL suite checks 13 gates and forced RLS
on all nine tenant tables. Static cognition/work boundaries remain enforced.


## Full local Compose stack

After `python scripts/live_runtime.py up` has compiled the kernel, applied the
real migrations and passed SQL security tests, run `python scripts/full_stack.py`.
This executes the `podman-compose` provider for `build` and `up -d` against the
`arkhe-runtime` connection. It adopts only owned containers and preserves the
external `arkhe-live-pgdata` volume. Generated Compose credentials remain under
ignored `ops/local`; do not publish that directory.

The six services are PostgreSQL 16 (55432), runtime (8788), Redis 7 (6379), MCP
health/metrics (8787), Prometheus (9090), and Grafana (3002), bound to localhost.
`python scripts/full_stack.py --verify` checks Redis PING, service health,
Prometheus scraping, the authenticated Grafana datasource proxy, and persistent
HTTP admission/replay/restart/outage conformance. The HTTP MCP service exposes
operational health/metrics only; artifact verification uses the independently
tested stdio MCP adapter in `integrations/verify-mcp`.

On Windows, the installed podman-compose 1.5 mistakes drive-letter build paths
for Git URLs. `scripts/compose_local.py` corrects that classifier in its own
process without changing the installed provider. Connection selection uses
`CONTAINER_CONNECTION`; it does not change the global Podman default.

For lifecycle commands set `$env:CONTAINER_CONNECTION="arkhe-runtime"`, then run
`podman-compose --env-file ops/local/compose.env -p arkhe_environment -f docker-compose.yml stop`.
Stop preserves volumes. Kernel-only `live_runtime.py down`
stops the application and database, leaving telemetry running.


## Docker and clean PostgreSQL startup

On Linux with Docker, run `python scripts/live_runtime.py up --engine docker`,
then `python scripts/full_stack.py --engine docker`. The first command executes
the kernel and SQL gates; the second builds and verifies the six-service stack.
Readiness probes PostgreSQL over TCP, because its initialization server accepts
Unix sockets before the final server starts. Compose uses the same TCP healthcheck
and waits for service_healthy before starting the runtime. HTTP readiness retries
bounded transport interruptions during restarts; proposal writes are never retried
by that helper. Run regressions with `python -m unittest discover -s scripts/tests -v`.
Remote execution evidence is linked in [REMOTE-CI](REMOTE-CI.md).
