# Arkhe P0-0 / P0-1 Executable Specification v1

Status: **executable candidate**. The conceptual architecture is frozen; the public wire/API format is not.

## 1. Scope

This artifact implements the foundation required by all later Arkhe evidence producers:

`Canonicalization -> Digest -> ArtifactEnvelope -> EvidenceRecord`

It deliberately does **not** implement MMR proofs, checkpoints, authorization, signatures, C2PA parsing, or external anchoring.

## 2. P0-0: Canonicalization

Native Arkhe semantic objects use **Arkhe Deterministic CBOR Profile v1**.

The encoder follows RFC 8949 deterministic principles for the supported value set:

- definite lengths only;
- shortest integer encodings;
- unsigned and negative integers;
- exact byte strings;
- UTF-8 text as supplied;
- arrays;
- maps sorted by encoded-key length and then bytewise lexical order;
- duplicate canonical map keys rejected;
- `null` and booleans;
- floating-point values are not part of the profile;
- indefinite-length items are not part of the profile;
- tags are not part of v1.

Unicode normalization is **not** performed. If an application needs normalized text, that normalization is an application/profile rule that must happen before creation of the semantic Arkhe object and must itself be auditable.

### Required invariants

`EquivalentSemanticObject => SameCanonicalBytes`

`DifferentSecurityRelevantMeaning => DifferentCanonicalBytes`

No canonicalizer may silently drop unknown security-relevant fields.

## 3. Protocol-defined evidence exception

External protocols remain authoritative for their own byte representation.

Examples: C2PA evidence, X.509 objects, RATS evidence, SCITT receipts, RFC 3161 tokens.

Arkhe MUST preserve their exact bytes and calculate a **raw digest** over those bytes. Arkhe MUST NOT reserialize external evidence and treat the reserialization as the original evidence.

Therefore v1 defines two distinct digest operations:

### Raw digest

`DigestRaw(algorithm, exact_bytes)`

Used for assets and externally defined evidence.

### Structured Arkhe digest

`DigestCanonical(algorithm, profile_id, ArkheSemanticObject)`

Input to the hash is:

`"ARKHE-P0-STRUCTURED-DIGEST-V1\\0" || u16_be(profile_len) || profile_id || CanonicalCBOR(object)`

The domain and profile binding prevent cross-protocol and cross-version substitution.

## 4. Digest agility

`Digest = (AlgorithmId, DigestBytes)`

v1 algorithm registry:

| ID | Algorithm | Output |
|---:|---|---:|
| 1 | SHA-256 | 32 bytes |
| 2 | BLAKE3-256 | 32 bytes |

An unknown algorithm ID MUST fail closed.

The algorithm identifier is security-relevant. A verifier MUST compare both algorithm ID and digest bytes.

## 5. ArtifactEnvelope candidate

The candidate implementation includes:

- opaque `artifact_id`;
- algorithm-tagged digest;
- 0..N typed causal parents;
- optional authentication evidence reference;
- optional external anchor reference;
- policy reference.

Causal parents are sorted and deduplicated for semantic canonicalization. This is **causal provenance**, not WormGraph append-order state.

## 6. EvidenceRecord candidate

The candidate includes:

- opaque record ID;
- digest of the ArtifactEnvelope;
- `TimeEvidence`;
- optional witness evidence reference.

`LocalClock` is not equivalent to trusted external time evidence.

## 7. Cross-implementation vectors

The vector file is produced by an independent Python implementation that does not import a CBOR library.

The Rust test consumes those Python-produced bytes and hashes.

Required gate before release:

`Python.encode -> Rust.verify`

A future second direction SHOULD be added:

`Rust.encode -> independent implementation verify`

Agreement is necessary but not sufficient. Differential tests against an external RFC 8949 implementation/oracle are recommended before wire v1 freeze.

## 8. Mutation properties

The included tests cover:

- map input-order equivalence;
- security-relevant value mutation;
- algorithm mutation;
- unknown algorithm rejection;
- duplicate map-key rejection.

Future slices add provenance-parent mutation at full-envelope level, MMR mutations, checkpoint mutations, authorization replay, and policy-binding mutations.

## 9. Non-goals

This artifact does not claim:

- C2PA conformance;
- legal timestamp validity;
- MMR conformance;
- public API stability;
- finalized Arkhe wire format.
