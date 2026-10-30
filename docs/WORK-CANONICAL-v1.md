# Work identity profile: AKG-CBOR-v1

ObjectDigest = BLAKE3-256(DomainObject || CanonicalBytes(UnsignedProjection(x))).
Domains include the terminating NUL: `AKG:WORKINTENT:v1\0`, `AKG:WER:v1\0`.
There is no additional CBOR prefix or profile tag.

The unsigned projection is a definite map with the field names in the Rust structs.
Both current types have no signature, digest, or transport fields to exclude.
The projection enumerates fields explicitly, so adding envelope fields does not
silently alter identity. Integer values use shortest encoding; signed timestamps
include the full i64 range. Digests are 32-byte CBOR byte strings, references are
ordered arrays (duplicates preserved), enum variants are their exact UTF-8 names.
Text is preserved without normalization. Options encode as null or their value;
an empty string is distinct from null. Map entries sort lexicographically by
encoded key bytes (RFC 8949 core deterministic encoding). Floats and indefinite
length values are outside these typed projections.

`operation_id`, authorization references, and episode identifiers remain separate
reference protocols; this change versions the two requested object digests only.
Existing v0-REF object identifiers must be migrated explicitly, not reinterpreted.

## Independent verification

`python scripts/generate_work_vectors.py` generates `tests/golden_vectors.json`
using Python standard library CBOR and the independent BLAKE3 implementation
copied from the frozen Phase-1 generator. It invokes no Rust or hash subprocess.
The Rust golden test compares both CBOR bytes and domain-separated digests.
Regeneration keeps READY only for exactly reproduced previously validated vectors;
new or changed fixtures remain PENDING_RUST_VALIDATION until Rust passes.

`python scripts/cognition_conformance.py` audits boundaries and invokes real
perception, RAG, metacognition, world model, learning, and agent implementations.
Its integration test checks linked evidence and rejection for missing WER,
emergency stop, denied policy and inconclusive policy. This does not establish
all future governance requirements in tests/negative_cases.md.
