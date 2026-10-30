# Repository audit against the supplied Arkhe specifications

Audit date: October 22, 2026. Scope: active root workspace, authorization boundary,
development source snapshots, verifier adapters, and surface inventory. The two
supplied documents mix proposed interfaces, historical code, audit corrections,
and future integrations. Proposed code is not treated as the current contract
when it conflicts with the repository's explicit trust boundaries.

## Verified defects and corrections

| Priority | Finding | Correction and evidence |
|---|---|---|
| P1 | `ContainmentGate::authorize` required admission for only five protected intent types. `Publish`, `ApproveExpense`, `Hire`, `Fire`, and `SignContract` could pass with an arbitrary caller-supplied worker record and an allowing policy. This violates the requirement that protected transitions require verified evidence. | Use the existing protected/unprotected classifier for admission requirements. All ten protected types reject before policy resolution on this entry point. The new regression failed before the correction. Admitted and routed authorization remain the supported protected paths. |
| P2 | The Cargo workspace contained the Python bridge but `config/architecture.json` did not. The architecture checker also omitted the entire `integrations/` tree from Rust discovery. | Register the bridge and scan `integrations/` for active Rust crates. Architecture validation now reports 25 Rust crates, seven Node packages, and 16 unchanged migrations. |
| P2 | The development catalog assumed directory basenames were Cargo package names. The bridge would generate `cargo test -p bridge`, although its package is `arkhe-python-bridge`. | Read the explicit package name from the manifest's package section. Regression checks the bridge package and generated command. |
| P2 | Development snapshots copied a root Cargo manifest referencing the bridge but omitted the bridge source tree. An isolated sandbox could not load the complete workspace. | Include only the bridge's source subtree from `integrations/`; preserve the existing source allowlist and privacy exclusions. Regression checks its manifest is included. |
| P2 | The cognition boundary check crashed on `cognition/arkhe-main`, a non-crate directory matched by its name glob. | Derive active cognition crates from the root Cargo workspace instead of directory names. Missing manifests for declared members still fail rather than being silently skipped. |

The raw authorization API now rejects protected proposals that previously passed
under custom allowing policies. This is an intentional security correction;
callers must supply admitted evidence through `authorize_admitted` or
`authorize_routed_admitted`. The development runtime still supports its three
explicitly unprotected intent types. It does not gain a protected execution API.

## Specification coverage and remaining work

| Specification area | Repository evidence | Assessment |
|---|---|---|
| Unified Rust/TypeScript workspace | Root manifests, locks, architecture registry, architecture checker | Implemented; registry and discovery defects corrected. |
| Protected evidence and review routing | `kernel/arkhe-kernel/src/lib.rs`, typed worker/review records, preview admission, bug-bounty admission | Implemented in specific profiles; generic caller-supplied records no longer authorize protected actions. This audit does not certify every provider or admission producer. |
| Canonical records and MMR | Core canonical encoder, verifier MMR profile, committed vectors | Implemented with executable tests. Inclusion does not authenticate a checkpoint or authorize an action. |
| GGUF verification gates | `verification/crates/arkhe-verify-core/src/gguf/`, `tests/gguf_supply_chain.rs` | Implemented synthetic supply-chain tests; not evidence that arbitrary external model publishers or hardware are trusted. |
| Web console screen map | Intra routes for documents, receipts, audit, credentials, verification, development, and evaluations | Partial coverage. This app is a local document/development workbench, not the specified 24-screen operator console. A dedicated Evidence Detail view with the complete proposed verification chain is not established by this audit. |
| CLI | Verifier CLI and preview CLI | Existing commands do not establish completion of the proposed 12-command interface. |
| MCP | `integrations/verify-mcp/src/index.ts` | Three implemented tools: artifact digest/canonicalization, MMR inclusion, and Arkhe claim-signature verification. The proposed eight-tool interface remains incomplete. |
| Browser verification | Browser WASM package, Intra offline verification, MCP tests against the WASM adapter | Implemented verifier integration; the four proposed reusable widgets are not established as a separate widget library. |
| Desktop | Windows packaging and launcher | Windows distribution exists. No active Tauri configuration was found in the inspected source inventory; the six-screen Tauri vault remains a separate deliverable. |
| SDK/API | Rust contracts, runtime HTTP, Python bridge | Partial implementation; does not establish every proposed SDK contract. |
| External coding agent, GPU attestation, FinOps | Proposals in the supplied architecture text | Not certified by local workspace compilation. Provider credentials, independent admission, real cost accounting, and external service tests require their own implementation evidence. |
| English (US) | Supplied output instruction versus existing Portuguese app and documentation | This audit and new diagnostics are English. Existing product localization remains incomplete; changing established routes and all UI strings requires a localization migration. |

Protocol and provider names are retained where they identify actual compatibility
contracts. The proposal's trademark-renaming rationale is not accepted as a
verified defect or a reason to silently rename public interfaces.

## Validation

- Architecture check: passed, 25 Rust crates / seven Node packages / 16 immutable migrations.
- Initial locked workspace compilation: passed.
- Intra tests after corrections: 45 passed, zero failures or skips.
- Verifier MCP tests against existing built adapter/WASM: 12 passed, zero failures or skips.
- Static golden-vector contract: passed, ten vectors.
- Full locked Rust workspace tests and documentation tests: passed. Database-dependent cases were ignored or feature-gated; this was not a live database validation.
- Focused kernel regression suite after the final additional unprotected-intent test: five passed.
- Cognition boundary check: passed, including the resolved dependency closure allowlist.
- Formatting check for the modified Rust files: passed.

Live database, hardware, external provider, production deployment, and user
usability validation are not inferred from these local tests. Historical status
claims in `docs/STATUS.md` describe their original dates, not fresh execution.
