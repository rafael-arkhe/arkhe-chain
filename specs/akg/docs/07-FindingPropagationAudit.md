# FindingPropagationAudit

Status: `AUDIT SPECIFICATION`

Target: the consolidated normative snapshot only.

## PASS predicates

A1. For every Finding schema, `severity` is absent.

A2. `VerificationResult.findings` contains factual Findings only.

A3. `AssessmentDimension` does not insert policy disposition into a Finding.

A4. Policy classification outputs are represented as `FindingDisposition`.

A5. Any eligibility rule formerly written as
`Finding.severity == BLOCKING`
has been rewritten to operate on
`FindingDisposition.disposition == BLOCKING`.

## Current package status

`PASS CANDIDATE`

This status means the generated snapshot is written consistently with the
predicate. It is not an independent execution result.

Run `audits/audit_snapshot.py` against the snapshot and review every match.
