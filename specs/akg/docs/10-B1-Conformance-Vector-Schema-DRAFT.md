# B.1 Conformance Vector Schema — DRAFT ONLY

Status: `BLOCKED ON B.0.2 FREEZE`

This file is a structural template only. No normative expected CBOR bytes or
digests are supplied before B.0.2 freezes.

Each future vector MUST contain:

- vector_id
- object_type
- semantic_input
- exact_wire_projection
- expected_canonical_cbor_hex
- expected_object_digest_hex
- expected_signing_message_hex, when applicable
- expected_validation_result
- expected_findings / dispositions
- policy binding
- notes
- provenance of independently derived expected output

Required negative-vector families include:

- duplicate map keys
- non-canonical integer encodings
- indefinite-length CBOR
- unknown enum
- null substituted for omitted optional
- unsorted semantic set
- duplicate semantic-set member
- malformed digest length
- malformed Ed25519 key/signature length
- signature over wrong domain
- self-digest recursion attempt
- ambiguous composition base
- implicit dependency inference attempt
- PARTIAL footprint used as proof of independence
- missing canonical state profile
- explicit ordering cycle
- policy binding mismatch

Expected outputs MUST NOT be generated exclusively by the same implementation
under test.
