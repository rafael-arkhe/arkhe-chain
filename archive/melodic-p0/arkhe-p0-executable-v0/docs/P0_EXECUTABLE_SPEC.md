# Arkhe P0 Executable Specification v0

Status: **experimental executable profile**. This does not freeze the public wire/API version.

## Scope

This artifact implements the first executable slice of the frozen conceptual architecture:

`Canonicalization -> Digest -> ArtifactEnvelope -> EvidenceRecord`

MMR inclusion proofs, checkpoints, policy decisions, authorization proofs, signing profiles, and external anchoring are intentionally deferred.

## P0-0 canonicalization gate

The cryptographic surface uses **Arkhe Canonical CBOR Profile v0**. It is a deliberately restricted deterministic-CBOR profile inspired by RFC 8949 deterministic encoding:

- protocol structs are fixed-length arrays, not maps;
- discriminants are unsigned integers;
- lengths are definite;
- floating point is forbidden;
- strings are UTF-8 as supplied;
- byte strings are exact;
- causal parent sets are normalized before encoding;
- the canonical byte stream is domain separated with `ARKHE-P0-CBOR-V0\0` and a profile identifier.

This avoids map-key ordering ambiguity and keeps canonicalization small enough to implement independently.

The two required semantic properties are:

1. Equivalent semantic objects MUST produce identical canonical bytes.
2. Security-relevant semantic differences MUST produce different canonical bytes.

## Digest

`Digest = (AlgorithmId, DigestBytes)`.

V0 algorithms:

- `1 = SHA-256`
- `2 = BLAKE3-256`

Both are encoded with the algorithm identifier; a digest algorithm mutation therefore changes the canonical object.

## ArtifactEnvelope

Contains artifact identity, digest, 0..N typed causal parents, optional authentication evidence, optional anchor reference, and policy reference.

Authentication remains optional at the universal type level; policy/profile enforcement decides whether its absence is valid at a given trust boundary.

## Causal provenance

Parents are a semantic set. Canonical encoding sorts and deduplicates them by `(relation, digest algorithm, digest bytes)`. Input order MUST NOT affect the envelope digest.

This profile does not encode append-order chaining. A future WormGraph profile may add append-order evidence independently from causal provenance.

## EvidenceRecord

The record binds a record identifier to an envelope digest, time evidence, and optional witness evidence.

`LocalClock` is not trusted time evidence. RFC3161/Roughtime/transparency/consensus forms are encoded under distinct discriminants so they cannot be confused cryptographically.

## Invariants covered in this slice

- INV-ARKHE-01: algorithm-identified digests.
- INV-ARKHE-02: causal provenance can carry 0..N typed parents.
- INV-ARKHE-03 groundwork: authentication is separately represented and policy-enforceable.
- INV-ARKHE-15 groundwork: canonicalization mismatch is cryptographically detectable.

## Deferred gates

The next executable slice should add:

- MMRLeaf / InclusionProof / Checkpoint;
- PendingAnchor vs ExternallyFinal state;
- PolicyDecision;
- AuthorizationProof with request, tool-contract and authorization-context binding;
- replay reserve-and-commit semantics;
- cross-implementation vectors.
