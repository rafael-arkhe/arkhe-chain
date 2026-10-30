# ADR-0005 — CQRS materialized views are derived state

Status: Accepted.

Materialized views are rebuildable read models and are not protocol authority.
The append-only event/evidence tables remain the persistence source of truth.
