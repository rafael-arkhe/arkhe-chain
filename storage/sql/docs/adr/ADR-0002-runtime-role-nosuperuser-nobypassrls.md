# ADR-0002 — Runtime roles cannot bypass RLS

Status: Accepted.

`arkhe_append` and `arkhe_read` MUST remain:
`NOSUPERUSER NOBYPASSRLS`.

`FORCE ROW LEVEL SECURITY` binds table owners, but not superusers/BYPASSRLS.
