#!/usr/bin/env python3
"""Independent Arkhe P0 canonical-CBOR + SHA-256 reference implementation.

Deliberately does not import a CBOR library.
This script is an interoperability oracle for the restricted Arkhe profile,
not a production serializer.
"""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

STRUCTURED_DOMAIN = b"ARKHE-P0-STRUCTURED-DIGEST-V1\x00"
PROFILE = "arkhe.cbor.det.v1"

class CanonicalError(Exception):
    pass

def _head(major: int, value: int) -> bytes:
    p = major << 5
    if value <= 23:
        return bytes([p | value])
    if value <= 0xff:
        return bytes([p | 24, value])
    if value <= 0xffff:
        return bytes([p | 25]) + value.to_bytes(2, "big")
    if value <= 0xffffffff:
        return bytes([p | 26]) + value.to_bytes(4, "big")
    if value <= 0xffffffffffffffff:
        return bytes([p | 27]) + value.to_bytes(8, "big")
    raise CanonicalError("integer too large")

def encode(v: Any) -> bytes:
    if v is None:
        return b"\xf6"
    if v is False:
        return b"\xf4"
    if v is True:
        return b"\xf5"
    if isinstance(v, int):
        if v >= 0:
            return _head(0, v)
        return _head(1, -1-v)
    if isinstance(v, bytes):
        return _head(2, len(v)) + v
    if isinstance(v, str):
        b = v.encode("utf-8")
        return _head(3, len(b)) + b
    if isinstance(v, list):
        return _head(4, len(v)) + b"".join(encode(x) for x in v)
    if isinstance(v, dict):
        items = [(encode(k), encode(val)) for k, val in v.items()]
        items.sort(key=lambda kv: (len(kv[0]), kv[0]))
        for i in range(1, len(items)):
            if items[i-1][0] == items[i][0]:
                raise CanonicalError("duplicate canonical map key")
        return _head(5, len(items)) + b"".join(k+val for k,val in items)
    raise CanonicalError(f"unsupported type: {type(v)!r}")

def sha256_raw(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()

def sha256_structured(value: Any, profile: str = PROFILE) -> bytes:
    p = profile.encode("utf-8")
    if len(p) > 0xffff:
        raise CanonicalError("profile too long")
    material = STRUCTURED_DOMAIN + len(p).to_bytes(2, "big") + p + encode(value)
    return hashlib.sha256(material).digest()

def vector(name: str, value: Any) -> dict:
    cbor = encode(value)
    return {
        "name": name,
        "semantic": json_safe(value),
        "canonical_cbor_hex": cbor.hex(),
        "sha256_raw_canonical_hex": sha256_raw(cbor).hex(),
        "sha256_structured_hex": sha256_structured(value).hex(),
    }

def json_safe(v: Any):
    if isinstance(v, bytes):
        return {"$bytes": v.hex()}
    if isinstance(v, list):
        return [json_safe(x) for x in v]
    if isinstance(v, dict):
        return {"$map": [[json_safe(k), json_safe(val)] for k,val in v.items()]}
    return v

def build_vectors():
    vectors = [
        vector("null", None),
        vector("unsigned-23", 23),
        vector("unsigned-24", 24),
        vector("negative-1", -1),
        vector("bytes-000102", bytes([0,1,2])),
        vector("text-arkhe", "arkhe"),
        vector("array-mixed", [1, "x", bytes([0xaa]), None, True]),
        vector("map-order-a", {"b": 2, "a": 1}),
        vector("map-order-b", {"a": 1, "b": 2}),
        vector("unicode-no-normalization", "é"),
    ]
    return {
        "profile": PROFILE,
        "structured_digest_domain_hex": STRUCTURED_DOMAIN.hex(),
        "algorithm": "sha256",
        "vectors": vectors,
        "invariants": {
            "map_order_equivalent": vectors[7]["canonical_cbor_hex"] == vectors[8]["canonical_cbor_hex"],
            "map_order_digest_equivalent": vectors[7]["sha256_structured_hex"] == vectors[8]["sha256_structured_hex"],
        },
    }

if __name__ == "__main__":
    out = Path(__file__).resolve().parents[2] / "vectors" / "canonicalization-v1.json"
    out.write_text(json.dumps(build_vectors(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(out)
