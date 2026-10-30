# Architecture

`arkhe-sql` is an append-only persistence boundary.

Authoritative evidence rows are immutable. Query-side projections may be
refreshed/rebuilt because they are derived state and carry no protocol authority.

Security model:

`AppendOnly = privilege revocation ∧ mutation trigger`

`TenantIsolation = FORCE RLS ∧ NOSUPERUSER ∧ NOBYPASSRLS ∧ explicit tenant context`

`Idempotency = immutable operation-scoped key binding`

`MMRCheckpoint = append-only authenticated snapshot bound to MMRProfile`
