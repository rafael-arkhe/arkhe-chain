# arkhe-depin

DePIN receipt normalization and offline inclusion verification:
`ReceiptAdapter` implementations (`Gensyn`, `Filecoin`, `Helium`, `Vangrid`),
`CompositeProof`, and an offline `NrasAttestationPort` fixture verifier.

Run `cargo test -p arkhe-depin` from the workspace root.

Provider DTOs are proposed integration schemas, **not** authenticated upstream
wire formats. Fixtures are synthetic; signatures are deliberately fake where
present. Normalization validates structure and produces deterministic typed JSON
bytes; it does not verify provider signatures or arbitration results. Alternate
JSON representations must first be decoded into the DTO and normalized.

`CompositeProof::anchor` commits all normalized receipt fields and optional
opaque hardware evidence after dispatching validation by `DePINProvider`.
`verify` recomputes that commitment and checks inclusion offline against a
separately trusted `Checkpoint`. A checkpoint carried inside an untrusted proof
is insufficient to establish authenticity. Proofs refer to the snapshot at
creation; later appends do not refresh old proofs. The in-memory builder retains
all leaves and is intended for integration tests and small batches, not
persistent production storage.

Inclusion proves committed bytes, not physical hardware, a real scene, correct
computation, or authenticated provider claims. Hardware evidence is committed
but not validated by `CompositeProof` itself.

## NRAS fixture port

`NrasAttestationPort` verifies HS256 JWTs against a pinned JWKS fixture profile
(`arkhe-nras-fixture-v1`) with nonce and freshness binding. Verdicts are
`Verified`, `Denied`, or `Unsupported`. A decoded JWT alone is never success.
Live NVIDIA NRAS (`nras.attestation.nvidia.com`) is **not** implemented in this
slice; no permissive verification stubs are supplied. PPCIE universal
verification is not adopted.

## Composition

Cross-layer composition with P2P distribution observations lives in
`arkhe-network`. Slashing and kernel admission policy remain out of scope.

Real Verde / Filecoin / Helium / Vangrid interoperability remains pending:
obtain provenance-backed receipts, confirm upstream schemas and signed
transcripts, configure trust roots, and add signature verification before
claiming production integration.
