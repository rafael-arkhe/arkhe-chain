# arkhe-ask: verified evidence support and Keycloak identity

The request flow is authenticate -> retrieve -> generate -> verify claims.
The citation verifier checks support against cited chunks, not factual truth
or complete coverage of arbitrary answer text. The development corpus contains
synthetic false facts to make that limitation visible.

## Authentication (Week 3)

The binary defaults to ARKHE_AUTH_MODE=keycloak and requires KEYCLOAK_URL,
KEYCLOAK_REALM and KEYCLOAK_AUDIENCE. Discovery must become operational within
15 seconds or startup fails. Invalid or unavailable auth configuration never
falls back to header authentication. The explicit local-only alternative is
ARKHE_AUTH_MODE=dev-header.

The protected /v1/ask route accepts a bearer access token, validates its
signature using discovered JWKS, audience and expiry with axum-keycloak-auth
0.8.1, and additionally checks exact issuer, nbf, nonempty subject, token type
Bearer, and a nonempty string tenant_id. Version 0.8.1 does not itself enforce
issuer or nbf, so these checks are implemented in auth.rs. Failed authentication
returns generic 401 with WWW-Authenticate: Bearer and no answer. /healthz is
public after successful startup. X-Tenant-Id is ignored in JWT mode.

Tenant identity is propagated into ChunkStore::retrieve(tenant_id, query, k)
and PgVectorStore::insert(tenant_id, id, text). InMemoryStore filters by tenant
as well; the default development corpus belongs only to tenant-a. Empty tenants
are rejected. PostgreSQL retrieval binds WHERE tenant_id = $1 before ordering
and LIMIT. Upserts conflict on (tenant_id, id), allowing equal IDs across tenants.
The pipeline also refuses any returned chunk whose tenant differs from the
authenticated scope. Direct Rust store callers must supply an authorized tenant;
there is no ingestion HTTP endpoint.

This is application-enforced data scoping, not PostgreSQL RLS or database/user
partitioning. Database credentials can read all tenants directly. RBAC and
per-document authorization remain future work. The public router() helper is
explicit development identity; the binary uses router_with_auth() by default.

CitationProof now includes tenant_id and hashes it under AKG:ASK:PROOF:v2.
The digest differs across tenants even for identical chunk IDs and claims.
Older v1 digests remain historical; new outputs are not byte-compatible.

The compose imports ops/jobplan/keycloak/arkhe-realm.json with local-only
client_credentials clients:
- ask-smoke: audience arkhe-ask, tenant-a
- ask-no-tenant: audience arkhe-ask, no tenant
- ask-wrong-audience: audience other-service, tenant-a
- ask-smoke-b: audience arkhe-ask, tenant-b (no development corpus)

The fixed client secret local-smoke-only is a disposable development fixture.
Tenant claims are assigned by Keycloak mappers, not client request headers.
The realm and HTTP Keycloak start-dev configuration are for local verification.
KC_HOSTNAME is http://keycloak:8080, making the issuer/JWKS reachable to Ask on
the compose network. Token requests from the host use the published Keycloak
port; standalone deployments need a stable issuer reachable by the service.

## Azure and pgvector (Week 2)

Azure uses reqwest, a 30-second timeout, api-key authentication and a JSON
answer containing claims. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT,
AZURE_OPENAI_EMBEDDING_DEPLOYMENT, AZURE_OPENAI_API_KEY and optionally
AZURE_OPENAI_API_VERSION (default 2024-10-21). Empty required variables count
as absent. Chat and embeddings need separate deployments.

Embedding requests explicitly request 1536 dimensions. Use a compatible
text-embedding-3 or later model; do not assume older models ignore dimensions.
Returned vectors must contain 1536 finite values. This guarantees shape, not
model identity: deployment names are user-chosen aliases. Matching model spaces
remain a deployment configuration responsibility; metadata is not inspected.
Reference: https://learn.microsoft.com/en-us/rest/api/aifoundry/azureopenai/embeddings

PgVectorStore uses cosine distance (<=>), matching the HNSW vector_cosine_ops
index. Runtime migrations use SQLx tracking for 001_chunks.sql then
002_tenant_chunks.sql. Existing dimensions require a separate migration. Inserts upsert
text and vector together with a single SQL statement.

Single-connection tests use temporary tables that shadow public.chunks.
Concurrency tests use a unique schema, production migration, HNSW and a shared
pool with two PostgreSQL sessions. They cover concurrent reads and same-ID
upserts; the winning writer is unspecified, and its text/vector must match.
The upsert test has a 10-second deadline. These are not load or latency tests.

The ef_search test uses set_config(..., true), equivalent to SET LOCAL, checks
restoration after commit and rollback on the same reacquired session, and checks
the untouched second connection. Production retrieve sets hnsw.iterative_scan transaction-locally; it never
changes the session default.
Reference: https://github.com/pgvector/pgvector#querying

## Verification and reproduction

    cargo test -p arkhe-ask
    cargo test -p arkhe-ask --test providers pgvector_ -- --ignored

The latter needs DATABASE_URL pointing to a live pgvector database. Tests
serialize extension creation in their process and remove their test schemas.

With real Azure credentials:

    cargo test -p arkhe-ask --test providers azure_generate_returns_text -- --ignored
    cargo test -p arkhe-ask --test providers full_pipeline_real_llm_rejects_hallucination -- --ignored

The adversarial test first observes a real Azure claim containing Sydney, then
replays that unchanged output through the router, pgvector retrieval and the
verifier. It requires 422/unsupported_claim/Sydney and no answer or claims.
It does not generate a second live answer inside the HTTP request. If Azure
does not produce Sydney, PRECONDITION_NOT_EXERCISED marks an inconclusive
experiment (a logical skip). Rust reports a failed assertion; the test never
counts unexercised rejection as a pass. Temperature zero is not determinism.

Compose:

    podman --connection arkhe-runtime compose -f ops/jobplan/docker-compose.yml up -d --build

Optional host ports: ARKHE_JOBPLAN_POSTGRES_PORT (55433),
ARKHE_JOBPLAN_KEYCLOAK_PORT (8180), ARKHE_JOBPLAN_ASK_PORT (3000).
The validation used ports 56590, 8180 and 56591. To verify real JWTs:

    ./ops/jobplan/verify-auth.ps1 -AskPort 56591 -KeycloakPort 8180

The script obtains Keycloak tokens in memory and saves only statuses, never
tokens or secrets. Tests/auth.rs uses an ephemeral mock OIDC/JWKS endpoint and
a test-only RSA fixture to check issuer, signature, audience, expiry, future
nbf, token type, missing/empty/wrong-type tenant, empty subject, header
spoofing and public health.

Current results (see logs for exact runs):
- Local suite: 15 passed, 13 ignored. See verification-local.txt.
- Explicit real pgvector run: 8 passed, on the compose Postgres.
  See verification-pgvector.txt.
- Real Keycloak compose smoke: seven cases passed. Valid token returns 200
  with proof tenant-a; header-only, malformed, tampered, missing tenant and
  wrong audience return 401. Tenant-b returns 502/no evidence and no answer.
  See verification-keycloak.json. The prior missing-config exit-101 check is
  preserved in verification-keycloak-before-tenant.json.
- Azure generation and adversarial replay: pending, credentials absent.
- Atomic claim decomposition, PostgreSQL RLS and role policies: future work.

Historical pre-JWT compose evidence is preserved in verification-compose.json.
Pre-tenant JWT evidence is in verification-keycloak-before-tenant.json. Current
verification-keycloak.json uses real Keycloak and the rebuilt tenant-scoped
InMemoryStore with EchoProvider; Azure generation is still unverified.

On this host the default Docker credential helper referenced an absent Docker
Desktop binary. Verification used DOCKER_CONFIG=tmp/jobplan-docker-config with
an empty config.json, preserving global settings. Root-context transfer stalled,
so the image was built from a reduced copy of workspace sources, manifests and
Cargo.lock in tmp/jobplan-build-context with the same Dockerfile. Compose then
started that image with --no-build. Both image stages use Bookworm; runtime
includes CA certificates and runs as UID 65534. The compose database volume and
built image are preserved. The current observability stack remains running for
inspection; the earlier pre-messaging stacks were stopped after their checks.

## Tenant migration and validation

Migration 002 adds tenant_id without guessing ownership of existing chunks.
Legacy rows retain NULL tenant_id and are invisible to every scoped retrieval.
A NOT VALID check constraint enforces non-null/nonblank tenants on all new or
updated rows while preserving those legacy rows. The old global ID primary key
is replaced by the unique B-tree index (tenant_id, id). Its leading tenant column
also supports filtering. HNSW stays a separate vector_cosine_ops index; a combined
tenant-plus-vector HNSW is not supported. Approximate filtered retrieval can return
fewer than k matches; this is a recall limitation, not permission to use other
tenants' chunks. Reference: https://github.com/pgvector/pgvector#filtering

Administrators must backfill legacy tenant ownership explicitly, resolving any
(tenant_id,id) conflicts, then validate chunks_tenant_required. No default tenant,
row deletion or automatic ownership assignment is performed. Updates of legacy
rows must assign the tenant in the same statement. Existing external foreign keys
to the old primary key require a separately planned migration; a dependency error
rolls back the migration rather than cascading deletion.

The 7 real pgvector tests include same-ID tenant separation and legacy migration
preservation/backfill. One additional ignored auth test passed with real Postgres
and signed JWTs from a loopback OIDC/JWKS fixture; see verification-tenant-http.txt.
It routes two tenants through HTTP and verifies distinct evidence plus the proof's
tenant_id despite a spoofed header. This run does not use a real Keycloak issuer.
The local suite additionally rejects a deliberately leaking store and checks
distinct proof digests for identical tenant-local evidence.

The Keycloak smoke script now also checks proof.tenant_id and that a valid
tenant-b token cannot access tenant-a's default corpus (502/no evidence, no answer).

## Filtered HNSW retrieval

PgVectorStore now requires pgvector 0.8+ for iterative HNSW scans (the verified
compose extension is 0.8.7). Every retrieve starts a transaction and applies
SET LOCAL hnsw.iterative_scan = relaxed_order on the same connection used by
the SELECT. A materialized CTE limits tenant-filtered candidates; the outer
ORDER BY distance + 0 restores increasing distance order among those candidates.
Commit or rollback restores the previous session setting.
Reference: https://github.com/pgvector/pgvector#iterative-index-scans

This improves filtered recall, but does not guarantee k results for all data.
Scan limits, scan memory, approximate search and the number of eligible indexed
vectors still matter. max_scan_tuples and scan_mem_multiplier remain defaults.
Zero vectors are not in a cosine HNSW index. No fallback to another tenant is
allowed. The numerical selectivity estimates in the review are not measured
service-wide recall guarantees.

The discriminating test uses 1000 closer vectors for a large tenant and 10
farther vectors for a small tenant. Only in its disposable schema, it removes
the B-tree alternative and disables sequential scans; EXPLAIN must select
chunks_embedding_idx. Without iteration it returned 0; production retrieve
returned all 10 in distance order. The test reacquires the same backend and
checks iterative_scan is off after success and an input-conversion error inside
the transaction. Other pool connections and public.chunks are untouched.
See verification-hnsw-recall.txt. This is a controlled fixture, not a production
recall or latency benchmark.

While chunks_tenant_required is NOT VALID it is not a trusted global invariant
for existing rows. After explicit ownership backfill, VALIDATE CONSTRAINT makes
that invariant available for planner reasoning where applicable. This does not
promise a particular query plan; the tenant equality predicate can still use
the B-tree independently of constraint validation.

## Legacy ownership backfill status

The local jobplan database was inspected after the recall changes. It has no
public.chunks table and no real legacy rows to assign. The only remaining chunks
table was an empty disposable schema from an interrupted test. No real tenant
ownership was inferred, assigned or changed.

The existing legacy test already exercised explicit ownership assignment. It now
also proves that VALIDATE CONSTRAINT fails while the preserved row is unassigned,
keeps convalidated=false after that failure, and succeeds with convalidated=true
after the explicit assignment. See verification-legacy-backfill.txt. This is
procedure validation on a test fixture, not a completed production data backfill.

For a real database, first inventory NULL/blank tenant rows and obtain an
authoritative row-ID-to-tenant mapping from the data owner. Check duplicate
(tenant_id,id) conflicts against already scoped rows. Apply approved assignments
atomically, updating only unassigned rows, and require every intended assignment
to match exactly one row. Unknown ownership must remain unassigned. Once no
violating rows remain, run:

    ALTER TABLE chunks VALIDATE CONSTRAINT chunks_tenant_required;

Verify pg_constraint.convalidated for that table. This validates the check
constraint; it does not create RLS, roles, or a column-level NOT NULL attribute.
No blanket UPDATE assigning all legacy rows to a default tenant is appropriate.


## Week 4: verified-proof outbox and Kafka

With KAFKA_BROKERS configured, HTTP success requires a durable PostgreSQL outbox
write after citation verification. A journal failure returns 503 with no answer.
Rejected/unauthenticated requests do not create proof events. KAFKA_TOPIC defaults
to arkhe.ask.verified.v1. If KAFKA_BROKERS is absent, journaling is explicitly
disabled and logged; the existing test/development router helpers also omit it.

Events carry a UUID, schema version and tenant-bound CitationProof. No query,
answer or claim text is transported. Each accepted HTTP execution gets a new
event UUID: this is not HTTP request idempotency. Re-enqueuing an identical
event UUID/payload is idempotent; changing its payload is an error.

Migration 003 creates ask_verified_outbox, ask_proof_anchors and
ask_kafka_cursors. The relay locks one pending row with SKIP LOCKED, publishes,
and marks published_at only after ACK. Broker operations are bounded by timeouts.
If Kafka accepted a message but the database transaction did not commit, delivery
can repeat. The consumer deduplicates the durable projection by immutable event
ID. This is at-least-once transport, not Kafka exactly-once transactions.

Producer behavior was checked in the pinned rskafka 0.6.0 source
(src/client/partition.rs, build_produce_request): acks=-1 (all current ISR),
is_transactional=false, producer_id=-1, producer_epoch=-1 and base_sequence=-1.
This producer does not enable Kafka producer idempotence or transactions.
enable.idempotence is not a configuration switch exposed by this Rust client;
adding the Java producer property to compose would not enable it here.
The guarantee is at-least-once delivery plus an idempotent consumer/durable
projection. Producer-side deduplication is not implemented, rather than an
unverified enabled feature. With a single broker/replica, acks=all still means
one replica; this is not evidence of replicated failover durability.
Source: https://docs.rs/rskafka/0.6.0/src/rskafka/client/partition.rs.html

Even a Kafka idempotent producer would not by itself deduplicate a new application
publish after the broker ACK but before the outbox transaction commits, especially
after a process restart. The stable event ID and destination-side deduplication
are necessary across that database/Kafka boundary. No change to transport
semantics is made or claimed by this documentation update.

Kafka documents exactly-once processing in defined transactional Kafka/Streams
boundaries; it is inaccurate to call all exactly-once semantics impossible.
This service uses neither Kafka transactions nor a Kafka-coordinated external
database transaction, so its documented guarantee remains the narrower one.
Reference: https://kafka.apache.org/41/design/design/


The consumer checks the exact Kafka payload against the trusted outbox before
admitting it. It commits the proof envelope and partition cursor in one SQL
transaction. An unadmitted/invalid message or retention gap blocks the partition
rather than silently skipping. Deployment/operators must reconcile those cases.
Published outbox rows are retained so reconciliation is possible; no automated
retention or dead-letter policy is implemented.

The existing WormGraph reference implementation receives EvidenceEnvelopes with
the citation record_digest as subject and a tenant-bound event commitment as
record_hash/payload_digest. Durable envelopes are stored in ask_proof_anchors and
rehydrated into a new reference WormGraph on startup. This is an Ask-specific
durable projection, NOT integration with the existing privileged PgWormGraph,
global MMR stream or an external anchor. Neither a Kafka ACK nor this projection
proves factual truth of the answer. Rehydration currently loads all envelopes
into memory, so production capacity/retention still needs design.

The worker runs in the Ask process and retries while Kafka is unavailable.
Verified requests can still enqueue while a running worker cannot reach Kafka;
database availability is required. Compose startup waits for healthy dependencies.
The compose already explicitly sets KAFKA_PROCESS_ROLES=broker,controller,
KAFKA_CONTROLLER_QUORUM_VOTERS and a CONTROLLER listener. It has no ZooKeeper
service or zookeeper.connect setting; no ZooKeeper-to-KRaft conversion is needed.
The local Apache Kafka 3.9.1 service uses KRaft, a persisted volume, one partition
and PLAINTEXT listeners: kafka:9092 internally, localhost:59092 from host.
ARKHE_JOBPLAN_KAFKA_PORT overrides the published port. The healthcheck provisions
the default single-partition topic. This minimal rskafka consumer uses a durable
Postgres cursor, not Kafka consumer groups or automatic rebalancing. Only one
cluster/topic partition 0 is supported; do not repoint the same cursor at a new
cluster without an explicit replay plan.

No apps/arkhe-fintech exists in this workspace. Existing OperationJournal types
were inspected, but they describe other domain operations. This implementation
reuses their admission-before-effect/idempotency pattern, not their domain types.

Reproduce the real broker tests after starting postgres and kafka:

    ./ops/jobplan/verify-events.ps1

Set DATABASE_URL privately first. The script provisions a unique one-partition
test topic, runs the ignored events tests, saves verification-kafka.txt, and
deletes its topic on success. The test uses an isolated PostgreSQL schema and
exercises HTTP -> durable outbox -> real Kafka -> durable anchor -> WormGraph.
It deliberately simulates lost ACK/database rollback, requires 2 deliveries
but 1 anchor, rehydrates a new graph, and rejects a forged event without advancing
the cursor. No real Azure model participates. RLS/RBAC and the two
credential-dependent Azure tests remain pending. Week 5 is documented below.

Week-4 execution results:
- 14 local tests passed (13 external tests ignored by default).
- Real Postgres/Kafka events tests: 2 passed; see verification-kafka.txt.
- Regression runs: 8 real pgvector tests and 1 HTTP/JWT/Postgres test passed.
- Compose with real Keycloak JWT: a verified request committed one outbox row,
  which was published and projected to one durable anchor; cursor advanced to 1.
  See verification-kafka-compose.json. Generation/store remained Echo/InMemory.
- Lost-ACK replay and graph restart reconstruction are tested against the real
  broker, but an actual broker-stop outage test was NOT executed: automatic
  approval review rejected its command with only "blocked by policy".
  The rejection did not identify the underlying policy or offending sub-operation.
  It is not evidence that all broker stop/restart commands are categorically
  forbidden by a sandbox. Actual broker outage/recovery resilience is PENDING;
  a simulated publication error or lost ACK does not establish that property.
- The test stack was left running after that rejection. No outage/recovery result
  is claimed. Earlier retained failed-test topics/schemas are disposable fixtures.

The earlier legacy-status inspection is historical: Week 4's normal runtime
migration now creates public.chunks alongside its outbox tables if absent.
No legacy row ownership is assigned by these messaging migrations.
The in-process worker/projection is validated as a single-instance deployment;
multi-replica graph-cache coherence is not implemented. PostgreSQL anchors are
the authoritative durable projection. After a commit the local WormGraph mirror
is updated; restart rebuilds it from durable envelopes.


Documentation audit: the compose mode and producer wire configuration were
checked directly in repository/configuration and pinned dependency source.
No runtime behavior changed; tests were not rerun for this documentation edit.
Week 5 was future work at that documentation audit; its implementation follows.


## Production replication configuration

The local Kafka topic uses replication.factor=1. A common production baseline
for tolerating one broker failure is replication.factor>=3,
min.insync.replicas>=2 and acks=all, with replicas placed across independent
failure domains. This is a design recommendation, not a universal durability
guarantee: correlated failures, storage, ISR changes and recovery procedures
still matter. The local single-node tests do not validate this topology.


## Week 5: Prometheus metrics and OpenTelemetry traces

Every service router now exposes public GET /metrics with axum-prometheus
HTTP request counters, response status, pending requests and duration histogram.
URI labels use matched route templates; unmatched paths are grouped as unmatched
instead of including attacker-controlled path fragments. Query strings, bodies,
tokens, tenant IDs and chunk IDs are not metric labels or span attributes.
The process-wide Prometheus recorder is installed once across router instances.
This standalone service owns that recorder; embedding it in another host that
already owns a recorder needs a shared-recorder integration.

HTTP server spans accept W3C trace context. rag.retrieve, rag.generate, rag.verify
and proof.enqueue are child spans on the same request trace. proof.relay and
proof.consume provide independent worker spans. Trace context is not persisted
in the outbox or Kafka headers, so this is not a continuous distributed trace
through the durable messaging boundary. Instrumentation records method, route
and response status; it does not capture authorization headers or request bodies.
The default log filter is arkhe_ask=info with JSON tracing output. Enabling broader
third-party debug logging is outside the sensitive-marker tests.

Set OTEL_EXPORTER_OTLP_TRACES_ENDPOINT to an OTLP HTTP/protobuf URL including
/v1/traces to enable trace export. OTEL_SERVICE_NAME defaults to arkhe-ask.
Without the endpoint, metrics and JSON logging remain available, but OTLP export
is disabled. tracing-opentelemetry bridges spans to the OpenTelemetry SDK.
The SDK batch processor exports on its own background thread with the recommended
reqwest blocking HTTP client; exporter construction and provider shutdown are
run on blocking tasks, outside async reactor work. Ctrl+C/SIGTERM trigger graceful
HTTP shutdown and SDK shutdown/flush. Export queues and retries are bounded:
trace export is best-effort and is not a durable audit log. Request correctness
does not depend on successful export after initialization.

Compose adds OpenTelemetry Collector 0.135.0 and Prometheus 3.5.0, both pinned.
The collector accepts OTLP/HTTP internally and sends spans to its detailed debug
exporter. This verifies receipt in logs; it is not a durable trace backend or a
Jaeger/Grafana trace UI. The Prometheus UI supplies a local metrics explorer.
Configuration files are under ops/jobplan/telemetry/.

Default local endpoints:
- Ask /metrics: http://127.0.0.1:3000/metrics
- Prometheus explorer: http://127.0.0.1:59095/
- Collector OTLP HTTP: http://127.0.0.1:54318/v1/traces

The validation run used Ask port 56591. ARKHE_JOBPLAN_PROMETHEUS_PORT and
ARKHE_JOBPLAN_OTLP_PORT override the monitoring ports. /metrics is public for
scraping; production deployments should expose it only to the monitoring network.
Prometheus scrapes ask:3000/metrics every five seconds on the compose network.

Useful PromQL:
    sum by (status) (rate(axum_http_requests_total{endpoint="/v1/ask"}[5m]))
    histogram_quantile(0.95, sum by (le) (rate(axum_http_requests_duration_seconds_bucket{endpoint="/v1/ask"}[5m])))

Reproduce real scrape/export validation:
    ./ops/jobplan/verify-telemetry.ps1 -AskPort 56591 -KeycloakPort 8180

The script gets a local Keycloak token in memory, sends a known sampled trace ID,
checks HTTP 200 and 401 plus unauthenticated /metrics, waits for Prometheus up=1,
and finds all five request/pipeline span names for that exact trace in collector
logs. It writes no tokens and saves verification-telemetry-compose.json.
The unit test uses an in-memory SDK exporter to assert parent trace/span IDs and
absence of sensitive test markers in metric labels and span attributes.

Latest validation:
- Local suite: 15 passed; 13 credential/infrastructure tests ignored by default.
- Real broker events: 2 passed; pgvector: 8 passed; HTTP/JWT/Postgres: 1 passed.
- Collector: received http.request, rag.retrieve, rag.generate, rag.verify and
  proof.enqueue for the supplied trace ID; Prometheus target up=1.
- Built image: 6016edda89300fc7e921b1b4c3153ad9cdd9d6ba18ee5236a86d67441a8cc11e.
- Compose generation remains EchoProvider/InMemoryStore. Azure tests, global
  PgWormGraph/MMR integration, RLS/RBAC and real broker-stop recovery remain
  pending. No broker interruption was attempted again during this work.
- The stack remains running so the local Prometheus explorer can be inspected.

References:
https://opentelemetry.io/docs/collector/
https://docs.rs/opentelemetry-otlp/0.33.1/opentelemetry_otlp/
https://docs.rs/axum-prometheus/0.10.1/axum_prometheus/
