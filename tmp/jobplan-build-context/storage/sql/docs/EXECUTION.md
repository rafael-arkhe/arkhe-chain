# Execution record

Executed locally in this artifact build:

```text
PASS runtime NOSUPERUSER
PASS read NOSUPERUSER
PASS FORCE RLS
PASS append-only trigger
PASS explicit revoke
PASS tenant assert
PASS operation idempotency
PASS MMR profile digest
```

Exit code: `0`.

This proves only the static invariant audit over generated SQL.

Not executed here:
- PostgreSQL migrations;
- SQLx runtime integration tests;
- RLS cross-tenant tests;
- native DB privilege tests;
- migration SHA-384 comparison against a live `_sqlx_migrations`;
- MMR checkpoint recomputation against the real WormGraph implementation.

Therefore:

`StaticAudit = EXECUTED/PASSED`

`DatabaseIntegration = NOT EXECUTED`

`RLSIsolation = NOT EXECUTED`

`AppendOnlyPrivilegeEnforcement = NOT EXECUTED`

`MigrationChecksumLiveVerification = NOT EXECUTED`
