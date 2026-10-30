# ADR-0003 — Time partitioning deferred from P0

Status: Accepted.

PostgreSQL unique constraints on partitioned tables must include the partition
key. Arkhe Phase-1 requires global operation-scoped idempotency uniqueness.

Rather than weaken idempotency semantics, P0 keeps evidence tables unpartitioned.
Partitioning may be introduced after benchmarks and a compatible immutable
idempotency registry/partition strategy are frozen.
