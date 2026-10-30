# Arkhe / AKG-RFC-0002 — B.0.2 Pre-Freeze Bundle

Status: **PRE-FREEZE CANDIDATE**

This bundle materializes the current normative state discussed for
`AKG-RFC-0002 v0.1.3` and Appendix `B.0.2`.

It intentionally distinguishes:

- semantic closure;
- wire closure;
- executed propagation audits;
- freeze status.

No file in this bundle should be interpreted as evidence that `B.0.2`
is already frozen. The current gate is:

`VerificationMethodSubtypesClosed`
`∧ ResultDigestPreimageDefined`
`∧ PolicyDigestComputationDefined`
`∧ NormativeSnapshotMaterialized`
`∧ FindingPropagationAudit = PASS`
`∧ PolicyDigestPropagationAudit = PASS`
`∧ AllAKGDomainsByteExact`
`∧ AllFieldMatrixRowsComplete`.

## Files

### Normative / candidate documents
- `docs/01-Consolidated-Normative-Snapshot.md`
- `docs/02-Wire-Closure-Patch-v3.md`
- `docs/03-VerificationMethod-Subtypes-Clarification.md`
- `docs/04-PolicyResolutionProfile.md`
- `docs/05-Appendix-B0.2-Field-Classification-Matrix.md`
- `docs/06-Domain-Registry-v1.md`
- `docs/07-FindingPropagationAudit.md`
- `docs/08-PolicyDigestPropagationAudit.md`
- `docs/09-B0.2-Freeze-Gate.md`
- `docs/10-B1-Conformance-Vector-Schema-DRAFT.md`

### Machine-readable artifacts
- `schemas/akg-cbor-v1.cddl`
- `schemas/b1-vector.schema.json`
- `registry/domain-registry.json`

### Audit tooling
- `audits/audit_snapshot.py`
- `audits/verify_domain_registry.py`

### Integrity
- `MANIFEST.sha256`

## Status vocabulary

- `CLOSED`: exact normative definition exists.
- `WIRE CLOSED`: representation is fixed but no new semantics are implied.
- `PASS CANDIDATE`: the consolidated text is consistent by inspection, but
  an independent/executable audit is still required.
- `BLOCKED`: a freeze prerequisite is missing.
- `FROZEN`: may only be used after every freeze-gate predicate passes.
