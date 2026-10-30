# Source reconciliation

The supplied architecture was used as the basis for this Phase-1 bundle.

Two deliberate corrections were applied:

1. **Partitioning is deferred in P0.**
   The source proposes `UNIQUE(tenant_id, idempotency_key)` on a table partitioned
   by `started_at`. PostgreSQL requires partition keys to participate in unique
   constraints on partitioned tables. The generated P0 schema preserves global
   operation-scoped idempotency instead of weakening it for premature partitioning.

2. **Database-admin tamper resistance is not overclaimed.**
   Runtime privilege revocation + triggers defend against application compromise,
   but a malicious PostgreSQL superuser can alter schema/disable triggers.
   External MMR/transparency anchoring remains necessary for tamper evidence beyond
   the database trust boundary.
