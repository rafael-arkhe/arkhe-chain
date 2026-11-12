# Maturity

Date: October 21, 2026. Status: implementation candidate.

`LEMMA` means implemented and passing relevant local checks. `PENDING` means an external or unimplemented capability. `THEOREM`, as used in the supplied document, requires successful hosted CI for this repository; no component is labeled that way here. These labels are project bookkeeping, not mathematical proofs.

| Component | Status | Evidence or limitation |
| --- | --- | --- |
| Core, kernel, journal | LEMMA | Local Rust security, binding, replay, and transition tests |
| MMR | LEMMA | Independent static Python vectors checked in Rust and TypeScript; tamper rejection |
| Cognition | LEMMA | DAG validation, dependency ordering, bounded retries and resume tests; deterministic planner only |
| Memory | LEMMA | JSON round trip, provenance, and overwrite refusal; no transactional database |
| Verification | LEMMA | Baseline validation, threshold scoring, author separation, actual child-process campaigns |
| Pipeline | LEMMA | Replay, uncertain outcomes, denied evidence, mock provider through gate to MMR |
| Research and cost | LEMMA | Source capture, evidence-required hypothesis resolution, checked integer ledger |
| MCP | LEMMA | Stdio server and `agi mcp` launch entry. Tools verify a caller-supplied MMR proof, sum a caller-supplied ledger, and return GPU attestation unsupported. No session and no execution authority |
| DeepInfer Rust client and Python bridge contracts | LEMMA | CPU mock subprocess and fake-native adapter tests; sampling, bindings, deadlines, and cleanup |
| DeepInfer engine execution | PENDING | `engine_status` pins the revision and reports weights and native generation unloaded |
| PostgreSQL adapter, crash recovery | PENDING | SQL transition codec matches the migration; `open_database` returns unavailable; runtime journal is in memory |
| External transparency anchoring | PENDING | `local_checkpoint` keeps `published` false; a matching witness is not publication |
| GPU/TEE attestation | PENDING | Rust and TypeScript attestation both return `verified: false` |
| Autonomous model planning/editing and production deployment | PENDING | `agi release` writes a local manifest after the plan, cargo test, and the ten faculty files. The deploy stage is inconclusive. `production` and `editor` stay false; no repository editor runs |
| Hosted CI and signed releases | PENDING | `hosted_ci` reports `executed: false`; workflows are authored, not observed |
| Operator console and `agi` binary | LEMMA | Loopback page for the catalog, grid, local-seek, faculty checks, separation, receipt, bundle, plan, and labeled offline demo. Saved checks are recomputed from files. Host commands stay on the terminal |
| Desktop shell | PENDING | `desktop_shell` reports `packaged: false`. No window toolkit is linked |

See [VALIDATION.md](VALIDATION.md) for exact observed commands. Do not infer CI success, SLSA level, or production readiness from local test results.
