# ADR-0001 — Append-only by privilege revocation plus trigger

Status: Accepted.

The runtime roles receive no UPDATE/DELETE/TRUNCATE privileges.
A BEFORE UPDATE OR DELETE trigger is a defense-in-depth backstop.

This does not claim immutability against a malicious PostgreSQL superuser who
can disable triggers or alter catalog state. External anchoring is required for
tamper evidence beyond the DB trust boundary.
