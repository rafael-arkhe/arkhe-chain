# Status

## Pesquisa e envelope de retrieval — 26/10/2026

[Auditoria de fontes](audits/2026-10-26-research-and-envelope-audit.md),
[roadmap revisado](RESEARCH-ROADMAP-2026-10-26.md) e
[contrato do envelope](EVIDENCE-ENVELOPE.md). Há implementação opt-in de orçamento
GGUF estrito, assinatura Ed25519 do WER e journal local com checkpoint/inclusão
MMR verificáveis offline. O smoke criptográfico real usa fixture histórico e
chaves descartáveis; não autentica a execução original. Revisão organizacional
externa, timestamp externo, custódia de produção e aceite com modelo real do novo
backend permanecem requisitos separados. Evidências anteriores abaixo mantêm
suas datas e escopos.

[Resultados](evidence/2026-10-26-envelope/RESULTS.md): 70 testes Python e 93
execuções Rust passaram, quatro integrações PostgreSQL foram ignoradas; Clippy
do escopo alterado e formatação passaram. O ensaio GGUF real expirou após 180 s,
conservando reserva de 31 tokens; não é uma geração concluída.

## Salesforce CRM Bridge — implementação local de 25/10/2026

Há um repositório dedicado local em `salesforce-arkhe-integration/`, com intenção
de escrita assinada, entregador REST reconciliável, Flow de outbox, processamento
assíncrono e CI/promoção preparados. Passaram 13 testes Rust, 18 Python e oito
gates locais do pacote isolado. Sem compilação/execução em org, deploy ou CI
remoto; autenticação e ambientes reais continuam pendentes.
[Escopo e limites](SALESFORCE-IMPLEMENTATION-2026-10-25.md).

## F0/F1 regulatório — execução local de 24/10/2026

Passaram 296 testes Rust na raiz (3 ignorados), 16 no workspace Pix independente,
formatação/Clippy e o harness HTTP com PostgreSQL 16.15 descartável e 17 migrações.
As rotas /v1 preservam os handlers anteriores; a política consultável informa
366/92 dias e ausência de histórico operacional medido. O gate CERTPIC/CERTPIA
valida seleção por cadastro confiável, sem implementar validação X.509/ICP-Brasil
ou habilitar PSP. [Mapa, fontes oficiais e evidências](REGULATORY-ALIGNMENT-2026-10-24.md).
Não houve CI remoto deste patch ou atestação de conformidade.

## Checklist de produção — execução de 24/10/2026

Build do workspace raiz, 293 testes Rust (3 ignorados por dependência PostgreSQL)
e Clippy em todos os targets padrão com `-D warnings` passaram localmente.
A suíte Node completa do arkhe-intra passou com 101 testes após duas correções
no harness (caminho independente do cwd e lock SQLite com liberação explícita).
Logs anteriores e posteriores foram preservados.

[Reconciliação dos dez itens e limites de produção](PRODUCTION-READINESS-2026-10-24.md).
Não houve deploy ou CI remoto desta execução completa da raiz. O run remoto E02
é uma evidência separada, com snapshot limitado; os três testes PostgreSQL
continuam não executados nesta ronda.

## Reconciliação de features em 22/10/2026

Os [118 itens reconciliados](backlog/BACKLOG.md) distinguem contratos existentes,
alternativas, partes implementadas e bloqueadores de ativação. A execução local
final passou nos 17 gates de [RESULTS](evidence/2026-10-22-feature-backlog/RESULTS.md):
266 testes Rust no principal (2 ignorados), 38 no AGI (3 fixtures ignoradas pelo
harness e exercitadas por campanhas de subprocesso), e 22 na suíte dedicada de
broker/predicados (com sobreposição à principal), além de vetores, Clippy,
formatação, WASM, adapter, SDK e Sigstore. Código/config/scripts permaneceram
iguais durante essa execução; hashes e logs estão no ledger. A tentativa
anterior completa, com caminho TypeScript incorreto corrigido, foi preservada
em `evidence/2026-10-22-feature-backlog/attempt-01`.

Foram acrescentados MMR shape/index/count, negativos GGUF, predicados transparentes
SPDX e ponte AP2 v0.2 por role autenticado, broker com SQLite standalone opcional,
e conversão/registro de conclusão Jules. PostgreSQL e vetores congelados foram
preservados. Veja [escopos e limites](FORMAL-PREDICATES.md).

Não foram executados CI remoto deste patch, PostgreSQL real, Jules live, pagamentos,
role AP2 externo, GPU/TEE ou qualificação do isolamento do host. Os três P0
parciais restantes são de ativação AP2 (11.5), broker isolado (13.1) e sandbox
qualificado (13.5). Software opt-in testado não é produção qualificada.

The [five-layer external/code audit](audits/2026-10-22-five-layer-external-and-code-audit.md)
records source verification and the first opt-in
[proof-carrying budget flow](PROOF-CARRYING-BUDGET.md), with an independent bounded
arithmetic checker integrated into admitted gate paths. This is an offline/library
slice, not a production proof transport, Rocq/STL integration, ZK LLM or AGI claim.

For the October 22, 2026 specification audit, verified corrections, and current
validation limits, see [the audit report](audits/2026-10-22-specification-audit.md).
The validation claims below retain their original October 17 scope and date.

Validated locally on 2026-10-17. This is a development/reference environment;
production governance, factual model validity and AGI conformance are not implied.

| Area | State |
|---|---|
| Architecture | PASS: unified root, 19 Rust crates, 4 editable Node packages, registered packaged/historical boundaries |
| Rust compilation | PASS: cargo check --workspace --locked, Rust 1.96.0 |
| Workspace tests | PASS: cargo test --workspace --locked |
| Nextest with PostgreSQL integration | PASS: 16 tests, 0 failures, 0 skips (all PostgreSQL tests enabled) |
| Node workspace | PASS: pnpm install --frozen-lockfile with a single active lockfile |
| Application builds | PASS: preflight and melodic-lab Angular browser/server builds |
| WASM verifier and MCP | PASS: wasm32 build + relocated TypeScript adapter build + 3 verifier Node tests + 1 health HTTP test |
| Node recursive tests | PASS: all four packages executed tests; six cases total |
| Real cognition conformance | PASS: six modules and ContainmentGate rejection cases |
| WorkIntent / WER identity | READY: AKG-CBOR-v1, 17 independent Python vectors verified by Rust |
| PostgreSQL persistence | PASS: eight real arkhe-sql migrations tracked by SQLx |
| SQL security suite | PASS: 13 gates, FORCE RLS on all nine tenant tables |
| Migration CLI audits | PASS: migrate, checksum-verify, rls-audit, append-only-audit |
| Live WormGraph | PASS: persistent authorization records, canonical objects and parent links via HTTP |
| Container runtime | RUNNING: rootless Podman/WSL arkhe-runtime; Linux image built successfully |
| Runtime DB role | Restricted login; runtime refuses superuser/RLS-bypass/admin credentials |
| WorkerExecutionRecord | Canonical identity validated; module semantics remain reference |
| ContainmentGate | Development policy; all protected intents rejected by live service |
| Memory | REFERENCE IMPLEMENTATION |
| Perception/RAG/Metacognition/World/Learning/Agent | REFERENCE IMPLEMENTATIONS |
| Dream-RSI efficacy | CONJECTURE |
| Causal world model validity | CONJECTURE |
| AGI claim | PENDING / NOT DEMONSTRATED |

## Executed validation

- `cargo check --workspace --locked`
- `cargo test --workspace --locked`
- `cargo nextest run --workspace --locked`
- `python scripts/cognition_conformance.py`
- `cargo fmt --all --check`
- Static, configuration, and cognition/work boundary audits
- Independent stdlib Python CBOR/BLAKE3 vector regeneration
- `python scripts/live_runtime.py up` with the local Podman machine
- `python scripts/live_runtime.py up` from the unified root: 16 Nextest tests including previously ignored SQL cases, and live HTTP conformance
- Original `arkhe-sql-migrate` commands against the real migrated application DB:
  `migrate`, `checksum-verify`, `rls-audit`, `append-only-audit`

The runtime emits receipts only after atomic persistence of WorkIntent CBOR,
WER CBOR and authorization evidence. Real database tests exercise eight concurrent
replays, full-envelope conflict detection, missing-parent rollback, reconnection,
parent links, tenant-isolation queries without application filters, rejected
cross-tenant INSERTs, missing tenant context and denied UPDATE/DELETE/TRUNCATE.
They also verify that elevated DB credentials are refused by the runtime.

HTTP tests independently compute CBOR and domain-separated BLAKE3 in Python and
compare the actual bytes returned from PostgreSQL. They verify authentication,
actor/WER binding, protected-policy rejection and exact replay. Records survive
application and PostgreSQL restarts. During a real database outage, health and
admission return 503; after recovery the failed work has no persisted object or
receipt, and previous records and parent links remain readable.

The original seven SQL migrations were preserved. Additive migration
`20261017000008_wormgraph.sql` installs `work_objects` and `wormgraph_records`
with the shared tenant function, FORCE RLS, append-only triggers and explicit
role privileges. The SQL test harness grants access only to its temporary results
table so SET ROLE can record outcomes. No production table privileges were
relaxed. SQLx migration macro support is enabled in the root workspace. SQL imports the
MMR profile from arkhe-verify-core instead of duplicating its definition.

## Running services

- API: `http://127.0.0.1:8788` (Bearer authentication required)
- Application container: `arkhe-live-runtime`, non-root UID 10001
- PostgreSQL: `127.0.0.1:55432`, container `arkhe-live-postgres`
- Durable data: named volume `arkhe-live-pgdata`
- Generated local credentials: ignored `ops/local/live.json`
- Lifecycle/reproduction: [LIVE-RUNTIME.md](LIVE-RUNTIME.md)

The earlier broken `podman-machine-default` was preserved; the separate
`arkhe-runtime` machine has its own WSL-generated ext4.vhdx. Docker CLI itself
was not used; the live image and deployment were tested through Podman.
The old `arkhe-postgres-conformance` container is separate from application data.

## Scope of remaining reference boundaries

Authorization envelopes retain the existing kernel authorization-reference
protocol; this does not freeze a new EvidenceEnvelope canonical identity.
The live endpoint records authorization of unprotected proposals and executes no
external effects. Production protected-transition policy, exactly-once external
effects, MMR checkpoint/proof integration and the broader future governance cases
in `tests/negative_cases.md` are outside this completed persistence integration.

## Unified layout validation on 2026-10-17

All former exported bundle roots have been assigned to a layer. The active
kernel/runtime code is at the repository root; SQL is in `storage/sql`, portable
verification in `verification`, applications in `apps`, adapters in `integrations`,
visual references in `design/stitch`, normative material in `specs` and
`docs/normative-review`, and older P0/Phase A variants in `archive`.
The original path changes are recorded in `docs/architecture/*moves.json`.

Passed after consolidation:

- `python scripts/check_architecture.py`: 19 active crates, 4 editable Node packages,
  no outside local dependencies or obsolete active workspace roots, and eight
  unchanged published migrations
- Unified Cargo check/test/format, cross-module cognition, native READY verification
  vectors and MMR proofs, SQL profile identity, and all 16 live Nextest tests
- `pnpm install --frozen-lockfile`
- `pnpm build:apps`: both Angular applications, including browser and server bundles
- `pnpm verify:wasm`: wasm32-unknown-unknown compilation and NodeJS package generation
- `pnpm build:adapters` and `pnpm test:adapters`: 4 adapter tests passed, 0 skipped
- Runtime Linux image built from the new root context, deployed over the same
  persistent volume, and verified through the authenticated HTTP API including
  restart durability and a real database outage

The melodic-lab production build emits one non-blocking initial-bundle budget
warning (534.78 kB against the 500 kB warning threshold); the build succeeds.
The packaged Paybox retains its own frozen lockfile/toolchain and was preserved,
not silently re-qualified by the root Node tests. Historical Phase A and P0
snapshots remain outside the active build. Standalone application surfaces and
optional Cosign/Kubernetes examples are registered components, not implicitly
connected or production-certified services. The CI configuration is consolidated;
remote GitHub CI execution is not claimed from these local results.


## Re-execution evidence

The complete local command ledger, including earlier failures and corrected
retries, is [RESULTS](evidence/2026-10-17-execution/RESULTS.md).
Each attempt records its exit code, UTC time, duration, source snapshot and
SHA256 of the sanitized log. The baseline Nextest run has 12 passing tests and
two ignored SQL cases; the PostgreSQL-enabled run adds runtime integration
coverage and runs 16 tests with zero skipped. Explicit rejection tests cover
missing WER evidence, EmergencyStop and PolicyDenied. WER integrity tests bind
all unsigned fields and reference order to the object digest.

`pnpm -r test` executes all four packages: one test in each Angular application,
one HTTP health/metrics test, and three verifier adapter tests including real
stdio MCP client/server communication with the built WASM. The application
tests are smoke tests, not complete product-flow qualification.

The independent Python generator now offers `--check`; the committed JSON uses
LF so Windows line endings do not obscure byte-for-byte regeneration. No vector
content, expected digest or READY status changed during normalization.


The full six-service Compose stack is now built, running and verified locally.
PostgreSQL data was preserved during adoption. Redis PING, MCP operational
metrics, Prometheus scraping and the authenticated Grafana datasource query
passed, followed by persistent HTTP replay/restart/database-outage tests.
The Windows provider compatibility wrapper and failed attempts are documented
in the execution ledger. Cosign/Kubernetes/production gates remain unexecuted.


## Remote execution

PASS for the dedicated AGI environment workflow: all three jobs and 17 recorded
gates completed successfully at commit 241c96e9e915572367ab83143e2aecdd905b6816.
See [REMOTE-CI](REMOTE-CI.md) for downloaded ledgers, source/log hash verification,
two corrected startup races, and the separate pre-existing formal.yml failure.
Cosign/Kubernetes/production and C2PA validation remain pending; no freeze is implied.
