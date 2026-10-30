# AKG-RFC-0002 v0.1.3
## Consolidated Normative Snapshot — Pre-Freeze Candidate

Snapshot ID: `AKG-RFC-0002-v0.1.3-PoC-NORM-1`

Status: `PRE-FREEZE NORMATIVE SNAPSHOT`

## 1. Normative surface

This snapshot incorporates the frozen RFC-0001 baseline, RFC-0002 v0.1.3,
Wire Prerequisite Clarifications, and Wire Closure Patches v1–v3.

Excluded from the normative surface:

`historical | superseded | draft | research_note | prior_version`.

Precedence:

`Snapshot > Clarifications > CurrentRFCText > HistoricalText`.

## 2. Authority model

Author declares. Verifier attests. Integrator decides. Policy executes.

Persistent protocol objects:

- `VerificationRecord`
- `IntegrationAssessment`
- `BranchIntegrationState`

Normative separations:

`Evidence != Authority`

`ExplicitOrdering != Evidence`

`Finding != FindingDisposition`

`RecordValidity != EvidenceSufficiency != IntegrationEligibility`

## 3. Canonical identity

For Arkhe objects whose digest is defined by this profile:

`CanonicalBytes(x) = AKGCBORv1(WireProjection_v1(x))`

`ObjectDigest(x) = BLAKE3-256(DomainObject || CanonicalBytes(UnsignedCore(x)))`

The unsigned projection is defined before serialization.
Removing a signature from a serialized full object is not an allowed substitute.

## 4. Policy binding

RFC-0001 PolicyRef remains:

`PolicyRef = { policy_id, version }`

RFC-0002 adds:

`PolicyBinding = (PolicyRef, PolicyDigest)`

`PolicyDigest = DigestAccordingTo(ResolvedPolicyArtifact, PolicyResolutionProfile)`

`ResolvedPolicyDigest != BoundPolicyDigest => REJECT`

`PolicyRef != PolicyDigest`

There is no Arkhe `PolicyCore` in this snapshot.
`DomainPolicy` is deferred from the PoC object-domain registry.

## 5. IdentityRef

`IdentityRef = { scheme, value }`

Equality requires equal scheme and equal value.
The scheme is never inferred from the lexical form of value.

## 6. PropertyRef

`PropertyRef = { name, version }`

Equality is exact name + exact version.
There is no implicit compatible-version rule in PoC.

## 7. ScopeExpr

`ScopeExpr := artifact_set | symbol_set | component(name)`

B.0.2 may encode this closed union with an explicit discriminator.
No fourth variant is admitted in v1.

## 8. SubjectRef

`SubjectRef = DigestRef | IdRef`

Wire semantic forms:

- `{kind:"digest", value:bstr32}`
- `{kind:"id", value:text_id}`

`Finding.subject_ref` is optional.
Absence is represented by omission, never by `null`.

## 9. ClaimRef

PoC wire type:

`ClaimRef = text_id`

B.0.2 creates no new namespace rule.
`QualifiedClaimRef` is not part of the PoC.

## 10. Finding

A Finding is factual:

`Finding = { code, category, subject_ref?, evidence_refs, details_ref? }`

`severity` is not a field of Finding.

## 11. FindingDisposition

`FindingDisposition = { finding_ref, disposition, policy_binding, rationale_ref? }`

PoC dispositions:

`INFO | WARNING | BLOCKING`

Policy classification changes MUST NOT mutate the original Finding.

## 12. Eligibility

Historical rules of the form:

`Finding.severity == BLOCKING => NotEligible`

are superseded.

Current rule:

`exists d: d.disposition == BLOCKING => NotEligible`

where `d` is a valid FindingDisposition under the applicable PolicyBinding.

## 13. EnvironmentDescriptor

`EnvironmentDescriptor = { EnvironmentProfile, Components }`

`EnvironmentComponent = { kind, identity, artifact_digest?, configuration_digest? }`

`ResultRelevantComponent => ComponentBound`

`EnvironmentSufficiencyUnknown => INCONCLUSIVE`

`EnvironmentIndependent != EnvironmentUnspecified`

## 14. VerificationMethod

`VerificationMethod = ContractualVerifier | ExecutableVerifier | FormalVerifier`

### ExecutableVerifier

`{ tool_identity, tool_version, executable_digest?, target_scope, expected_result, actual_result }`

### FormalVerifier

`{ system, system_version, proof_obligation_digest, proof_digest, result }`

`domain_ref` is not present in the PoC FormalVerifier.

### ContractualVerifier

`{`
` verifier_profile: profile_ref,`
` obligations_checked: [+ obligation_ref],`
` input_projection: projection_ref,`
` evaluation_rules: ruleset_ref,`
` expected_results: [+ expected_result],`
` actual_results: [+ actual_result],`
` result_digest: digest`
`}`

`result_value` is not a normative type in this snapshot.

Freeze still requires exact normative definitions/wire projections for:
`profile_ref`, `obligation_ref`, `projection_ref`, `ruleset_ref`,
`expected_result`, `actual_result`, plus exact `result_digest` preimage.

## 15. VerificationRequest

`VerificationRequest = {`
` claims:[+ ClaimRef],`
` properties:[+ PropertyRef],`
` scopes:[+ ScopeExpr],`
` composed_intents:[+ IntentDigest],`
` required_classes:[+ EvidenceClass],`
` reason:FindingCode`
`}`

All five collections are non-empty.

## 16. DependencyEdge

`DependencyEdge = { source:IntentDigest, target:IntentDigest, kind }`

`kind in {STRUCTURAL, SEMANTIC, VERIFICATION}`

`DependencyEdge != IntentCore.Dependency`

## 17. StrongStateCommutationEvidence

PoC proposition:

`StrongStateCommutes(A,B,D) iff forall s in D: B(A(s)) = A(B(s))`

under the applicable CanonicalExecutionStateProfile.

The evidence payload contains only:
`subject_a, subject_b, state_profile, preconditions?, proof`.

Verifier, method, policy, and context remain in the enclosing VerificationRecord.

## 18. Ordering

Explicit ordering is a constraint, not evidence.

`ExplicitOrdering notin CompositionEvidence`

`Cycle(OrderingGraph) => REJECT`

## 19. Composition closure

`CompositionClosure(I,B,F,R,P)`

`U(I,B,F) = {I} U DependencyClosure(I) U BranchInterval(B,F) U DependencyClosure(BranchInterval(B,F))`

`AmbiguousBase => NoCompositionClosure`

Only explicit normative semantic dependencies create normative dependency edges.

`not ProvablyCompositionIndependent => Include`

## 20. VerificationRecord

The unsigned core contains:
`record_version, intent_digest, claim_refs, verifier, verification_method,
evidence, result, evaluation_context, issued_at, PolicyBinding`.

Signature is outside the digest core.

`VRDigest = BLAKE3-256(DomainVerify || CanonicalBytes(VRCore))`

`issued_at` is provenance, not current validity.

## 21. IntegrationAssessment

The core binds candidate intent, exact branch state, exact frontier,
PolicyBinding, assessment dimensions, factual Finding references,
FindingDisposition values, reverification requests, proposed ordering edges,
and final decision.

`AssessmentDigest = BLAKE3-256(DomainAssess || CanonicalBytes(AssessmentCore))`

The exact `DomainAssess` bytes must remain unchanged.

## 22. BranchIntegrationState

The unsigned semantic core is:

`IntentDAG + ExplicitOrderingEdges + IntegrationFrontier + PolicyBinding`

`BranchDigest = BLAKE3-256(DomainBranch || CanonicalBytes(BranchCore))`

`state_digest`, signer, and attestations are outside the preimage.

## 23. BranchAttestation

`BranchAttestation = { branch_digest, signer, signature }`

Attestation is external and optional unless policy requires one.

## 24. Signature profile

PoC permits only:

`AKG-SIG-ED25519-v1`

Signed message:

`SignatureDomain || ObjectDigest`

No application-level prehash.

Public key: 32 bytes.
Signature: 64 bytes.
Unknown profile => REJECT.

## 25. Superseded constructs

Not normative in this snapshot:

- `Finding.severity`
- `QualifiedClaimRef`
- `result_value`
- `FormalVerifier.domain_ref`
- `PolicyRef={digest}`
- Arkhe `PolicyCore` invented only to obtain a digest
- `DomainPolicy` in PoC registry
- signature inside its own digest core
- `assessment_digest` inside its own preimage
- `state_digest` inside its own preimage
- `ExplicitOrdering` as CompositionEvidence
- heuristic semantic dependency inference
- unknown environment treated as environment-independent
- implicit local wall-clock freshness

## 26. Current blockers

`W02-04 = OPEN — VerificationMethod subordinate types + result_digest preimage`

`W02-08 = PASS CANDIDATE — executable audit required`

`W02-09 = BLOCKED — PolicyResolutionProfile must define reproducible PolicyDigest`

`W02-10 = CLOSED excluding deferred DomainPolicy`

## 27. Freeze gate

B.0.2 may be frozen only if:

- VerificationMethodSubtypesClosed
- ResultDigestPreimageDefined
- PolicyDigestComputationDefined
- NormativeSnapshotMaterialized
- FindingPropagationAudit = PASS
- PolicyDigestPropagationAudit = PASS
- AllAKGDomainsByteExact
- AllFieldMatrixRowsComplete
