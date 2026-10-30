# Arkhe Phase A — Metered MCP, free

This patch implements the frozen Phase A product boundary:

- public Streamable HTTP MCP endpoint at `/mcp` using the official Rust `rmcp` SDK;
- exactly two tools: `verify_provenance` and `get_royalty_status`;
- mandatory append-only `UsageEvent` metering from request 1;
- no x402, no invoicing, no settlement, no anchoring;
- `verify_provenance` delegates to the hardened internal preflight service and never anchors;
- `get_royalty_status` is a read-only PostgreSQL projection lookup;
- duplicate `(tenant_id, idempotency_key)` calls are rejected;
- if metering is unavailable, responses are withheld fail-closed.

## Repository observations used for the patch

The current repository already contains an empty `crates/arkhe-provenance-mcp` skeleton, an existing workspace wildcard over `crates/*`, a PostgreSQL `works` table, and a hardened verifier script. The current on-chain royalty implementation is only a scaffold, so this patch does **not** invent an on-chain royalty split. Instead it adds a read-only `royalty_status` projection that an indexer can populate.

## Files to apply

Copy the contents of this package into the repository root. Existing empty MCP files are intentionally replaced.

## Required internal dependency

`ARKHE_PREFLIGHT_URL` must point to the private preflight HTTP service exposing:

- `POST /internal/verify`

and returning the structured v23 evidence envelope (`result`, `mode`, `verifier_version`, `verifier_sha256`, hashes, release gate, hard failures, checks).

The current repository copy of `scripts/arkhe_preflight_v23.py` still emits human-readable CLI output and does not by itself satisfy this HTTP contract. Do not silently fall back to parsing human stdout in the MCP server.

## Apply + test

```bash
# from repository root
cp -R /path/to/arkhe-phase-a/crates/arkhe-provenance-mcp crates/
cp /path/to/arkhe-phase-a/database/migrations/003_phase_a_metering.sql database/migrations/

# update lockfile and compile
cargo check -p arkhe-provenance-mcp
cargo build -p arkhe-provenance-mcp
cargo clippy -p arkhe-provenance-mcp -- -D warnings

# migrate database with your existing migration runner, then
export DATABASE_URL=...
export ARKHE_PREFLIGHT_URL=http://127.0.0.1:8081
export ARKHE_PRICE_BOOK_VERSION=phase-a-free-v1
cargo run -p arkhe-provenance-mcp
```

MCP endpoint: `http://127.0.0.1:8080/mcp`

## Invariants

1. **A1 — Metering completeness:** a successful tool response is never returned unless an append-only usage event was committed.
2. **A2 — No payment:** `billable_amount_usd = 0` throughout Phase A.
3. **A3 — No anchoring side effect:** `verify_provenance` only calls the preflight verifier.
4. **A4 — Idempotency:** `(tenant_id, idempotency_key)` is unique in the ledger.
5. **A5 — Evidence binding:** `usage_events.evidence_hash` is SHA-256 of the exact structured preflight HTTP response bytes, not a re-serialization.
6. **A6 — Fail closed:** malformed preflight evidence or metering failure is not surfaced as PASS.
7. **A7 — Royalty read only:** `get_royalty_status` cannot settle or mutate royalty state.

## Known Phase A limitation

`tenant_id` is caller-supplied because OAuth/workload identity is deliberately deferred. Treat per-tenant analytics as advisory until identity is introduced. The immutable request ID, timing, tool, evidence hash, and cost observations remain useful.

`ARKHE_SOL_PRICE_USD` is an optional measurement snapshot, not a billing oracle. Phase A `verify_provenance` performs no on-chain write, so its Solana transaction-fee component is exactly zero. Do not inject the 5,000-lamport base fee into `verify_provenance` cost estimates. Before any paid/on-chain tool is enabled, replace this snapshot with a trusted runtime price provider and record provider, observation time, transaction count, and signer count in the cost basis.

## Gate before Phase B

Do not enable x402 until you have enough real UsageEvents to estimate at least p50/p95 for:

- cost per tool;
- latency per tool;
- bytes transferred;
- verification failure rate;
- unique tenants/callers (advisory only until OAuth/workload identity);
- demand by tool.
