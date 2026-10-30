"""Independent stdlib-only CBOR reference for the snapshot profile's types.

Regenerate with: python governance/arkhe-governance/tests/fixtures/generate_snapshot_vectors.py
No Rust encoder or generated Rust output is used.
"""

import json
from pathlib import Path


def head(major, value):
    if value < 24:
        return bytes([(major << 5) | value])
    for extra, width in [(24, 1), (25, 2), (26, 4), (27, 8)]:
        if value < 1 << (8 * width):
            return bytes([(major << 5) | extra]) + value.to_bytes(width, "big")
    raise ValueError("uint64 overflow")


def cbor(value):
    if isinstance(value, int):
        return head(0, value)
    if isinstance(value, bytes):
        return head(2, len(value)) + value
    if isinstance(value, str):
        payload = value.encode("utf-8")
        return head(3, len(payload)) + payload
    if isinstance(value, list):
        return head(4, len(value)) + b"".join(map(cbor, value))
    if isinstance(value, dict):
        pairs = sorted((cbor(k), cbor(v)) for k, v in value.items())
        return head(5, len(pairs)) + b"".join(k + v for k, v in pairs)
    raise TypeError(type(value))


invariant = {
    "hash": bytes([7]) + bytes(31),
    "modality": "obligatory",
    "action": "Pagar",
    "condition": "valor>á",
    "specificity": 4294967295,
    "enacted_at": 18446744073709551615,
}
vectors = []
for label, invariants in [("empty", []), ("utf8-and-uint-boundaries", [invariant])]:
    projection = {"profile": "arkhe-invariant-snapshot-v1", "invariants": invariants}
    vectors.append({"id": label, "canonical_cbor_hex": cbor(projection).hex()})
Path(__file__).with_name("ontology_snapshot_vectors.json").write_text(
    json.dumps(vectors, indent=2) + "\n", encoding="utf-8"
)
