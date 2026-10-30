# Arkhe P0 Canonicalization + Digest v1

Executable candidate for the first P0 foundation:

`Canonicalization -> Digest -> ArtifactEnvelope -> EvidenceRecord`

## Why this exists

Every later Arkhe mechanism depends on stable byte identity:
- EvidenceBundle raw evidence digests;
- WormGraph/MMR leaves;
- Portable Proof;
- C2PA adapter bindings;
- request binding;
- ToolContractDigest;
- AuthorizationContextDigest;
- golden vectors.

The package intentionally separates **raw external bytes** from **Arkhe-native canonical structured objects**.

## Contents

- Rust candidate crate.
- restricted deterministic-CBOR canonicalizer;
- algorithm-tagged SHA-256/BLAKE3 digest type;
- candidate ArtifactEnvelope/EvidenceRecord types;
- independent Python reference encoder;
- checked-in cross-implementation vectors;
- golden-vector and mutation tests;
- integration guidance.

## Verification status

The Python reference implementation and vector generation were executed successfully in the artifact environment.

Rust compilation is **not claimed** here because `cargo` is not installed in the artifact runtime. The package must pass the repository's locked Rust gates after integration before it can be classified Build-verified.

See `docs/P0_CANONICALIZATION_DIGEST_SPEC.md`.
