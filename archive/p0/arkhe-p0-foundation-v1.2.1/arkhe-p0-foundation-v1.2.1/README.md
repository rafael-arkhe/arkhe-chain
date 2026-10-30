# Arkhe P0 Foundation v1.1

This package closes the pending items from the first executable P0 foundation.

Implemented:

- strict deterministic-CBOR encoder + canonical decoder;
- mutation rejection for duplicate keys, floats, indefinite lengths, non-canonical ordering,
  invalid UTF-8, and non-shortest integers;
- explicit context-specific domain separators;
- algorithm-tagged SHA-256/BLAKE3 digests;
- concrete Rust `ArtifactEnvelope` and `EvidenceRecord`;
- 0..N typed `CausalProvenance`;
- independent Python vectors;
- `VECTOR_SET_DIGEST.sha256`;
- predecessor `FOUNDATION_DIGEST.sha256`.

The public ABI/wire format remains intentionally unfrozen.

Next slice:

`MMRLeaf -> InclusionProof -> Checkpoint -> PendingAnchor/ExternallyFinal`
