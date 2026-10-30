"""Independent stdlib CBOR oracle for exact resolver parameter bits."""
import json
import struct
from pathlib import Path


def head(major, n):
    if n < 24:
        return bytes([(major << 5) | n])
    for additional, width in [(24, 1), (25, 2), (26, 4), (27, 8)]:
        if n < 1 << (width * 8):
            return bytes([(major << 5) | additional]) + n.to_bytes(width, "big")
    raise ValueError("uint64 overflow")


def cbor(value):
    if isinstance(value, int):
        return head(0, value)
    if isinstance(value, str):
        payload = value.encode("utf-8")
        return head(3, len(payload)) + payload
    if isinstance(value, dict):
        pairs = sorted((cbor(key), cbor(item)) for key, item in value.items())
        return head(5, len(pairs)) + b"".join(k + v for k, v in pairs)
    raise TypeError(type(value))


def bits(value):
    if value == 0.0:
        value = 0.0
    return struct.unpack(">Q", struct.pack(">d", value))[0]


projection = {
    "profile": "resolver-params-ieee754-canonical-zero-v2",
    "duplicate_threshold_bits": bits(0.85),
    "refinement_threshold_bits": bits(0.7),
    "max_em_iterations": 50,
    "em_tolerance_bits": bits(1e-4),
}
zero_projection = dict(projection, duplicate_threshold_bits=bits(-0.0), refinement_threshold_bits=bits(-0.0))
Path(__file__).with_name("resolver_params_vector.json").write_text(
    json.dumps({"projection": projection, "canonical_cbor_hex": cbor(projection).hex(),
                "zero_projection": zero_projection, "zero_canonical_cbor_hex": cbor(zero_projection).hex()}, indent=2) + "\n",
    encoding="utf-8",
)
