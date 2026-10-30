# How to audit this code

1. **MCP surface** — `tools/list` must expose only `verify_provenance` and `get_royalty_status`.
2. **Side effects** — grep the MCP crate for Solana signing/transaction submission; there should be none.
3. **Metering fail-closed** — stop PostgreSQL and verify the server withholds tool responses rather than returning unmetered success.
4. **Append-only ledger** — attempt `UPDATE usage_events` and `DELETE FROM usage_events`; both must fail.
5. **Idempotency** — repeat the same `(tenant_id, idempotency_key)` and confirm the second call is rejected.
6. **Verifier protocol** — mutate `release_gate`, `mode`, or `hard_failures` in a test preflight response and confirm `verify_provenance` does not return PASS.
7. **Evidence hash** — recompute SHA-256 over the exact serialized preflight evidence and compare with `usage_events.evidence_hash`.
8. **Royalty read-only** — confirm the tool executes only SELECT statements and cannot mutate `royalty_status` or settlement state.
9. **No billing** — every Phase A event must have `billable_amount_usd = 0`.
10. **Compile gate** — run `cargo build`, `cargo clippy -- -D warnings`, and the MCP Inspector against `/mcp` before merge.


11. **Wire evidence binding:** recompute SHA-256 over the exact preflight HTTP response body and compare it to `usage_events.evidence_hash`; do not hash a pretty-printed or reserialized object.
12. **No false Solana fee attribution:** Phase A `verify_provenance` must perform zero on-chain writes. A Solana base transaction fee must not be included unless a later tool actually submits a transaction.
