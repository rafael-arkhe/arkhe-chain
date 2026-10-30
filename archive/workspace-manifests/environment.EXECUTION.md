# EXECUTION RECORD

## static_audit.py

Exit code: `0`

```text
PASS workspace exists
PASS containment exists
PASS worker record exists
PASS wormgraph boundary exists
PASS cognition modules complete
PASS work layer exists
PASS governance exists
PASS compose exists
PASS status honesty
```

## check_boundaries.py

Exit code: `0`

```text
PASS cognition/work have no direct WormGraph dependency
PASS cognition source contains no signing capability markers
```

## check_configs.py

Exit code: `0`

```text
PASS fail-closed environment config
PASS cognition authority disabled
PASS transition registry partitions protected/unprotected
```

## Not executed in this artifact build

- cargo test / cargo clippy / rustfmt;
- Docker Compose services;
- PostgreSQL integration;
- live WormGraph persistence;
- KMS/HSM signing;
- external model inference;
- continuity and blast-radius fault injection;
- AGI capability evaluation.

Therefore the correct seal is:

`StaticArchitectureAudit = EXECUTED/PASSED`

`RuntimeIntegration = NOT EXECUTED`

`AGIClaim = NOT DEMONSTRATED`
