# Arkhe / Gravit primitive interop profile, draft 1

This is a small exchange profile, not a claim that the two governance systems are equivalent.
Inputs are in `arkhe-vectors.json`; expected verdicts are the matching IDs in
`expected.json`. `true` means acceptance of this check, not a Verified Fact.
The remaining jobs in `jobs.json` are extracted Gravit primitive checks.

## Common encoding

JSON objects; hexadecimal fields encode raw bytes (two lowercase characters per byte).
Integers are JSON unsigned integers fitting u64. All fields shown in a vector are
required for its kind. Reject missing fields, invalid encoding, wrong lengths,
unsupported kinds and out-of-range values. Fields not in this profile confer no authority.
No JSON serialization is implicitly signed: `message_hex` is the complete signed input.
IDs label cases and have no cryptographic significance.

## Inclusion

`leaf_hex` is the unhashed leaf. Hash with SHA-256: leaf = H(0x00 || leaf bytes),
node = H(0x01 || left hash || right hash). The RFC 6962 section 2.1 tree divides
at the largest power of two strictly below its size. `size` is the number of
leaves; `index` is zero-based. `path` contains 32-byte sibling hashes, bottom-up;
`root_hex` is the expected 32-byte root. Require size > 0, index < size, exactly
the needed siblings, and equality to the expected root. One leaf needs no sibling.
An empty tree cannot establish inclusion. The Arkhe runner calls the existing
`gguf::supply_chain::verify_inclusion` function.

## Signature

Ed25519, without prehash or context: verify `signature_hex` (64 bytes) over
`message_hex`, with `key_hex` (32 bytes). The Arkhe runner uses ed25519-dalek
2.2.0 `verify_strict`. These cases do not establish agreement on all adversarial
point encodings or all Ed25519 implementations.

## Witness quorum (proposed policy)

This policy is implemented in the interop example, not exposed here as a previously
existing Arkhe production quorum implementation. `trusted` is out-of-band trusted
configuration containing unique witness `id`, key and non-empty `operator`.
`threshold` must be positive. Every submitted witness must resolve to this configuration
and supply a valid Ed25519 signature over the same `message_hex`. Reject the
entire input on unknown identity, invalid signature, repeated public key, or repeated
operator. Require at least `threshold` distinct keys and configured operators.
An operator label is a trust assumption, not proof of real-world independence.

The shared message is UTF-8 `arkhe-interop-witness-v1` followed by LF and the raw
32-byte Merkle root. The small set covers insufficient quorum, duplicate identity,
key aliases, shared operator, unknown witness, changed message and zero threshold.

## Gravit mapping and limits

The pinned upstream registry file is signed as `gravit-registry-v1` + LF + exact
file bytes. Each golden evidence signature covers eight LF-separated UTF-8 fields,
without a trailing LF: `gravit-evidence-v1`, artifact ID (vector name), record ID,
theta with exactly six fractional digits, result (`true`, `false`, `null`), timestamp,
provenance and integrity hash. Malformed records and unsigned, unknown or revoked
keys are screened before cryptographic checks. The nine frozen screening comparisons
are separate from the Rust signature checks.

The hosted head signature covers sorted-key compact UTF-8 JSON of `head`, as
specified by the pinned publisher. This captured head contains only strings and an
integer; no general RFC 8785 numeric conformance is asserted. Its anchored digest
is H(canonical head bytes || ASCII base64 signature). The service key was fetched
from the same service over HTTPS; it is a captured trust input, not an independent
trust anchor. RFC 3161 tokens and claims in `time` are not verified in this round.
