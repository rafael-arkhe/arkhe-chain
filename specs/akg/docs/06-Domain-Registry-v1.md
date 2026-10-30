# AKG-CBOR-v1 Domain Registry

Status: `FREEZE CANDIDATE`

`HexBytes` are normative. Length is derived and MUST be tested.

| Object | Literal | Hex | Length | Construction |
|---|---|---|---:|---|
| VerificationRecord | `AKG:VERIFY:v1\0` | `41 4B 47 3A 56 45 52 49 46 59 3A 76 31 00` | 14 | `BLAKE3-256(DomainVerify || CanonicalBytes(VRCore))` |
| IntegrationAssessment | `AKG:ASSESS:v1\0` | `41 4B 47 3A 41 53 53 45 53 53 3A 76 31 00` | 14 | `BLAKE3-256(DomainAssess || CanonicalBytes(AssessmentCore))` |
| BranchIntegrationState | `AKG:BRANCH:v1\0` | `41 4B 47 3A 42 52 41 4E 43 48 3A 76 31 00` | 14 | `BLAKE3-256(DomainBranch || CanonicalBytes(BranchCore))` |
| Finding | `AKG:FINDING:v1\0` | `41 4B 47 3A 46 49 4E 44 49 4E 47 3A 76 31 00` | 15 | `BLAKE3-256(DomainFinding || CanonicalBytes(Finding))` |
| EnvironmentDescriptor | `AKG:ENV:v1\0` | `41 4B 47 3A 45 4E 56 3A 76 31 00` | 11 | `BLAKE3-256(DomainEnvironment || CanonicalBytes(EnvironmentDescriptor))` |
| EnvironmentComponent | `AKG:ENVCOMP:v1\0` | `41 4B 47 3A 45 4E 56 43 4F 4D 50 3A 76 31 00` | 15 | `BLAKE3-256(DomainEnvironmentComponent || CanonicalBytes(ComponentCore))` |

## Signature domains

| Object | Literal | Hex | Length |
|---|---|---|---:|
| VerificationRecord | `AKG:VERIFY-SIG:v1\0` | `41 4B 47 3A 56 45 52 49 46 59 2D 53 49 47 3A 76 31 00` | 18 |
| IntegrationAssessment | `AKG:ASSESS-SIG:v1\0` | `41 4B 47 3A 41 53 53 45 53 53 2D 53 49 47 3A 76 31 00` | 18 |
| BranchIntegrationState | `AKG:BRANCH-SIG:v1\0` | `41 4B 47 3A 42 52 41 4E 43 48 2D 53 49 47 3A 76 31 00` | 18 |

`DomainPolicy` is DEFERRED in the PoC because no Arkhe `PolicyCore` is normative.

For newly introduced domains in this registry: `Normative source = this profile`.
