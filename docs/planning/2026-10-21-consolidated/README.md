# Arkhe: Consolidated Technical Specification and Implementation Plan

Date: October 21, 2026. Language: English (US). Status: proposal for review.

This package consolidates the two supplied attachments into an implementable design. It reconciles their overlapping drafts and audit corrections with the existing workspace and current primary documentation. It is a specification, not an implementation release, security certification, deployment approval, or claim of AGI.

| Document | Purpose |
| --- | --- |
| [Technical specification](TECHNICAL-SPECIFICATION.md) | Scope, current baseline, trust boundaries, contracts, requirements, and integration architecture |
| [Implementation plan](IMPLEMENTATION-PLAN.md) | Dependency-ordered work packages, owners, deliverables, acceptance tests, and release gates |
| [Claims and decisions](CLAIMS-AND-DECISIONS.md) | Corrections to source claims, unresolved decisions, and source references |
| [Source manifest](source-manifest.json) | SHA-256 fingerprints of attachments and selected local baseline files inspected for this package |

The recommended first delivery is a durable, evidence-gated coding workflow that can survive restart and reconcile uncertain external effects. Besu anchoring extends the existing prototype. Validator attestation, DePIN hardware qualification, Agglayer connectivity, and private policy proofs are separate tracks with their own acceptance gates.

Existing `agi-coder` components use a distinct wire profile from the parent Arkhe workspace. This package does not merge their trust roots, migrations, hash profiles, or maturity claims.

No runtime source, production policy, key, license, migration, or deployment was changed to produce this package. Historical local test results are attributed to their existing reports; no application test suite was rerun for this documentation-only task.
