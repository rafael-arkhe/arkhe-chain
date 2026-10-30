# ADR-004: Admit before effects; reconcile uncertain outcomes

Status: accepted. Date: October 21, 2026.

The journal reserves a stable operation slot before remote dispatch. The complete requester and parameter digest must match on replay. Completed work replays a receipt; pending, failed, and reconciliation states never silently redispatch. Any ambiguous worker or protected-executor error moves the entry to ManualReconciliationRequired. Gate denial ends in Failed.

Consequences: duplicate dispatch is prevented during a single process lifetime. Durable distributed guarantees require a transactional database, durable evidence and MMR, an outbox, and a reconciler. The current in-memory implementation explicitly does not claim those guarantees across crashes.
