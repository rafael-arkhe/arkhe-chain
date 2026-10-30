# Implementation scope

The pasted attachment contains a proposed `agi-coder` tree, multiple older `arkhe-jules` code drafts, successive audits, and broader research. This repository implements the current architecture using the audit constraints rather than copying contradictory drafts. Everything generated is in English (US).

| Requested area | Delivered | Boundary |
| --- | --- | --- |
| Polyglot monorepo | 14 Rust crates, 2 TypeScript packages, lockfiles | Nested self-contained workspace; parent project not modified |
| Core contracts | BLAKE3, deterministic CBOR, signed WER, exact operation and request binding | New AGI/v1 wire profile; not byte-compatible with historical Arkhe examples |
| Cognitive layers | DAG planner, retries, bounded loop, memory, hypothesis and source contracts | Caller supplies cognitive/model and retrieval implementations |
| Verification | Finite-domain spec oracles; test-command mutation runner | Caller prepares mutants and independent tests; no automatic source mutation generation |
| Pipeline | Worker/executor contracts, stage gates, replay and conflict handling, merge conflict checks | Single-process; durable coordination pending |
| Jules | REST create/get/wait/activities, patch extraction, review routing, full HTTP mock integration | No live API credentials used; approval/post-message/source-list convenience methods deferred |
| DeepInfer | Rust inference provider, sampling validation, bounded Python offline bridge, cognition proposal helper, CLI | Pinned source metadata; real Linux accelerator execution pending |
| MCP and SDK | Real stdio server, proof verification and cost calculation | GPU attestation returns unsupported |
| Golden vectors | Independent Python MMR vectors, static WER fixture | WER generator is not independent; no cryptographic certification claimed |
| Delivery | CI, static-vector and mock workflows, signed candidate workflow, Docker and Kubernetes assets | Authored but not run on GitHub or a cluster |
| Database | SQL migration and checksum | Durable PostgreSQL runtime adapter pending |
| Optional UIs | Deferred | Dashboard and Tauri desktop app do not improve the kernel verification milestone |

Wire-level differences from the attachment are deliberate: hashes serialize as lowercase hex; domain framing includes lengths; CBOR maps use encoded-key length then bytes rather than naive lexical sorting; signatures are actually verified; policy requires separate trusted output and requester bindings; MMR proofs carry exact leaf count and peak position. Empty/skipped tests do not pass, and remote completion never fabricates test evidence.

For production readiness, prioritize a durable admission/outbox transaction, independently captured runner artifacts tied to immutable repository snapshots, a real provider-to-WER adapter owned by the trusted host, reconciled external effects, and external root publication. Each should receive integration tests before its maturity is raised.
