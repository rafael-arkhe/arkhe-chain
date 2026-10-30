# PostgreSQL 16 executable security gate

`tests/postgres16/phase1_security_gates.sql` executes the first requested live gates:

- PostgreSQL major version 16;
- runtime/read roles are not superuser and do not BYPASSRLS;
- ENABLE + FORCE RLS on all tenant-scoped evidence tables;
- tenant A cannot observe tenant B and vice versa;
- missing tenant context raises an explicit error;
- cross-tenant INSERT is rejected by WITH CHECK;
- `arkhe_append` UPDATE is rejected;
- `arkhe_append` DELETE is rejected;
- `arkhe_append` TRUNCATE is rejected;
- superuser UPDATE/DELETE still hit the append-only trigger backstop;
- runtime role has no TRUNCATE grant.

Important: PostgreSQL row-level UPDATE/DELETE triggers do not protect `TRUNCATE`.
The `TRUNCATE` invariant is therefore enforced through privilege revocation for
runtime roles. A PostgreSQL superuser remains outside this DB-local security
boundary and can disable triggers or truncate data; external anchoring is needed
for tamper evidence against DBA-level compromise.
