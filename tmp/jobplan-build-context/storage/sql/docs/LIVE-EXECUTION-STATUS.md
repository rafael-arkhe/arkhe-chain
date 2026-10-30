# Live execution status — current artifact environment

Attempted on 2026-10-17.

Environment discovery:

- `docker`: unavailable
- `psql`: unavailable
- `postgres`: unavailable
- `initdb`: unavailable
- `cargo`: unavailable
- `rustc`: unavailable
- outbound DNS/package download from the execution container: unavailable

An attempt to obtain PostgreSQL 16.15 from the official PostgreSQL source host
could not resolve `ftp.postgresql.org` from the container. Therefore no actual
PostgreSQL 16 server could be started in this execution environment.

Status:

- `PostgreSQL16ServerStarted = BLOCKED_BY_ENVIRONMENT`
- `DatabaseIntegration = NOT_EXECUTED`
- `RLSIsolation = NOT_EXECUTED`
- `AppendOnlyPrivilegeEnforcement = NOT_EXECUTED`
- `MigrationChecksumLiveVerification = NOT_EXECUTED`

No PASS result is claimed for a gate that was not run.

The runnable gate is now materialized as:

`DATABASE_URL=... scripts/run_postgres16_gates.sh`
