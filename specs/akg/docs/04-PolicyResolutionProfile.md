# PolicyResolutionProfile — PoC Requirement

Status: `PROPOSED PROFILE CONTRACT — COMPUTATION PROFILE NOT YET SELECTED`

The PoC preserves:

`PolicyRef = {policy_id, version}`

and binds it to:

`PolicyDigest`

through:

`PolicyBinding = (PolicyRef, PolicyDigest)`.

## Required profile properties

Every accepted PolicyResolutionProfile MUST define:

1. how `PolicyRef` resolves to exactly one policy artifact;
2. the exact canonical byte representation of the resolved artifact;
3. the hash algorithm and output encoding;
4. whether any fields are excluded from the digest preimage;
5. malformed/non-canonical handling;
6. mismatch handling.

Normative mismatch rule:

`ResolvedPolicyDigest != BoundPolicyDigest => REJECT`

## PoC restriction

There is no Arkhe `PolicyCore` in the current snapshot.

Accordingly, this profile MUST NOT compute:

`BLAKE3(DomainPolicy || CanonicalBytes(PolicyCore))`

unless a future normative revision explicitly defines PolicyCore.

`DomainPolicy` is deferred from the PoC AKG object-domain registry.

## Freeze condition

`PolicyDigestComputationDefined`

is true only after at least one concrete PolicyResolutionProfile has exact,
reproducible canonicalization and hashing rules.

Current status:

`W02-09 = BLOCKED`
