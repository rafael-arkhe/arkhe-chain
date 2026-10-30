# PolicyDigestPropagationAudit

Status: `AUDIT SPECIFICATION / BLOCKED BY POLICY DIGEST PROFILE`

Predicate:

`SecurityRelevantPolicyUse => ExactPolicyBindingAvailable`

A PolicyBinding is acceptable only if it is:

1. unambiguous;
2. cryptographically covered by the containing signed/digested object;
3. resolvable without mutable external interpretation.

The audit MUST NOT require a physically duplicated sibling `policy_digest`
inside every nested subobject when the exact binding is inherited from a
cryptographically bound enclosing context.

Contexts to classify:

- VerificationRecord
- EvaluationContext
- IntegrationAssessment
- BranchIntegrationState
- FindingDisposition
- active freshness policy binding
- descriptive/non-decisional policy references

Current blocker:

`PolicyDigestComputationDefined = false`

until a concrete PolicyResolutionProfile defines exact canonical policy bytes
and exact hashing rules.
