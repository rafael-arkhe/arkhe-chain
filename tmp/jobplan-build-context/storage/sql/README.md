# arkhe-sql

`arkhe-sql` is the PostgreSQL persistence/query boundary for Arkhe evidence.

Phase-1 invariants:

1. evidence tables are append-only;
2. runtime roles never receive UPDATE/DELETE/TRUNCATE;
3. tenant-scoped tables use ENABLE + FORCE RLS;
4. runtime roles are NOSUPERUSER/NOBYPASSRLS;
5. missing tenant context fails loudly;
6. idempotency is operation-scoped and immutable;
7. MMR checkpoints bind the frozen `arkhe-mmr@1` ProfileRef;
8. SQLx migrations are immutable after publication;
9. CQRS projections are read-only derivations, not authority.

## P0 scope

This bundle intentionally does **not** introduce time partitioning yet. PostgreSQL
requires partition-key columns to participate in unique constraints on a
partitioned table. That conflicts with the Phase-1 requirement for a global
`(tenant_id, operation_type, idempotency_key)` uniqueness boundary.

Partitioning is therefore deferred until a compatible idempotency design is
benchmarked and frozen. Correctness precedes scale.

## Workspace integration

This module belongs to the single Cargo workspace at the repository root.
Published migrations live only in `storage/sql/migrations`; their source hashes
are locked by `config/migrations.lock.json`. SQL imports the MMR profile from
`arkhe-verify-core` rather than redefining it.

From the repository root:

```powershell
python scripts/live_runtime.py up
```

This provisions PostgreSQL with a restricted LOGIN member of `arkhe_append` and
`arkhe_read`, applies migrations with separate administrative credentials and
runs the real security gates. The NOLOGIN migration roles are not login users.
See [live runtime](../../docs/LIVE-RUNTIME.md) and [architecture](../../docs/ARCHITECTURE.md).

For standalone administrative audits, set DATABASE_URL privately and run the
`arkhe-sql-migrate` binary from this directory so checksum file lookup uses
`migrations/`. All binaries and tests resolve through the root Cargo workspace.
