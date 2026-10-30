# Appendix B.0.2 — Field Classification Matrix

Status: `FREEZE CANDIDATE / INCOMPLETE`

This matrix records currently closed wire decisions and explicitly leaves
unresolved semantic types unresolved.

| Type | Field | Wire type | Required | Semantics / notes |
|---|---|---:|---:|---|
| PolicyRef | policy_id | text | yes | RFC-0001 semantic identity |
| PolicyRef | version | uint32 profile bound | yes | exact version |
| IdentityRef | scheme | text | yes | explicit scheme |
| IdentityRef | value | text | yes | opaque under scheme |
| PropertyRef | name | text | yes | exact name |
| PropertyRef | version | uint32 profile bound | yes | exact version |
| SubjectRef | kind | enum text | yes if SubjectRef present | digest or id |
| SubjectRef | value | bstr32 or text | yes if present | selected by kind |
| Finding | code | text | yes | factual |
| Finding | category | closed enum text | yes | factual |
| Finding | subject_ref | SubjectRef | no | omitted when absent |
| Finding | evidence_refs | array EvidenceRef | yes | semantic set |
| Finding | details_ref | bstr32 | no | optional |
| FindingDisposition | finding_ref | bstr32 | yes | refers to Finding digest |
| FindingDisposition | disposition | INFO/WARNING/BLOCKING | yes | policy output |
| FindingDisposition | policy_ref | PolicyRef | yes | exact reference |
| FindingDisposition | policy_digest | bstr32 | yes | exact resolved policy |
| DependencyEdge | source | bstr32 | yes | intent digest |
| DependencyEdge | target | bstr32 | yes | intent digest |
| DependencyEdge | kind | STRUCTURAL/SEMANTIC/VERIFICATION | yes | closed enum |
| VerificationRequest | claims | array ClaimRef | yes | non-empty |
| VerificationRequest | properties | array PropertyRef | yes | non-empty |
| VerificationRequest | scopes | array ScopeExpr | yes | non-empty |
| VerificationRequest | composed_intents | array bstr32 | yes | non-empty |
| VerificationRequest | required_classes | array text | yes | non-empty |
| VerificationRequest | reason | FindingCode | yes | scalar |
| ContractualVerifier | verifier_profile | profile_ref | yes | **wire blocked** |
| ContractualVerifier | obligations_checked | array obligation_ref | yes | non-empty; **wire blocked** if ref unresolved |
| ContractualVerifier | input_projection | projection_ref | yes | **wire blocked** |
| ContractualVerifier | evaluation_rules | ruleset_ref | yes | **wire blocked** |
| ContractualVerifier | expected_results | array expected_result | yes | non-empty; **wire blocked** |
| ContractualVerifier | actual_results | array actual_result | yes | non-empty; **wire blocked** |
| ContractualVerifier | result_digest | digest | yes | **preimage blocked** |
| SignatureEnvelope | algorithm_profile | "AKG-SIG-ED25519-v1" | yes | closed enum |
| SignatureEnvelope | key_ref | IdentityRef | yes | signer key |
| SignatureEnvelope | signature_bytes | bstr64 | yes | exactly 64 bytes |
| BranchAttestation | branch_digest | bstr32 | yes | exact BranchDigest |
| BranchAttestation | signer | IdentityRef | yes | signer |
| BranchAttestation | signature | SignatureEnvelope | yes | external to BranchCore |

Global rules:

- optional absence is omission, not null;
- unknown enum => REJECT;
- semantic sets are sorted according to their per-type sort key;
- self-digests are excluded from their own preimages;
- signatures are excluded from object digest preimages.
