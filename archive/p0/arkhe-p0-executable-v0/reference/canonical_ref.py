#!/usr/bin/env python3
"""Independent reference encoder for Arkhe Canonical CBOR Profile v0.
Restricted subset only; no third-party CBOR library is used.
"""
from __future__ import annotations
import hashlib

DOMAIN = b"ARKHE-P0-CBOR-V0\0"
PROFILE_ID = 0


def _head(major: int, n: int) -> bytes:
    if n < 24:
        return bytes([(major << 5) | n])
    if n <= 0xff:
        return bytes([(major << 5) | 24, n])
    if n <= 0xffff:
        return bytes([(major << 5) | 25]) + n.to_bytes(2, 'big')
    if n <= 0xffffffff:
        return bytes([(major << 5) | 26]) + n.to_bytes(4, 'big')
    return bytes([(major << 5) | 27]) + n.to_bytes(8, 'big')


def uint(n: int) -> bytes:
    assert n >= 0
    return _head(0, n)


def sint(n: int) -> bytes:
    if n >= 0:
        return uint(n)
    return _head(1, -1 - n)


def bstr(b: bytes) -> bytes:
    return _head(2, len(b)) + b


def tstr(s: str) -> bytes:
    b = s.encode('utf-8')
    return _head(3, len(b)) + b


def arr(items: list[bytes]) -> bytes:
    return _head(4, len(items)) + b''.join(items)


def null() -> bytes:
    return b'\xf6'


def framed(body: bytes) -> bytes:
    return bstr(DOMAIN) + uint(PROFILE_ID) + body


def digest(alg: int, raw: bytes) -> bytes:
    return arr([uint(alg), bstr(raw)])


def digest_value(alg: int, payload: bytes) -> bytes:
    if alg == 1:
        return hashlib.sha256(payload).digest()
    if alg == 2:
        # Python stdlib lacks BLAKE3. Pass BLAKE3 digest bytes from fixtures when needed.
        raise ValueError('BLAKE3 calculation not available in stdlib reference')
    raise ValueError('unsupported algorithm')


def canonical_digest_sha256(payload: bytes) -> bytes:
    return framed(digest(1, hashlib.sha256(payload).digest()))


def envelope_sha256_only(artifact_id: str, payload: bytes, parent_payloads: list[tuple[int, bytes]], policy: str) -> bytes:
    artifact_digest = (1, hashlib.sha256(payload).digest())
    parents = [(rel, 1, hashlib.sha256(p).digest()) for rel, p in parent_payloads]
    parents = sorted(set(parents))
    parent_enc = []
    for rel, alg, d in parents:
        parent_enc.append(arr([uint(rel), digest(alg, d)]))
    body = arr([
        tstr(artifact_id),
        digest(*artifact_digest),
        arr(parent_enc),
        null(),
        null(),
        tstr(policy),
    ])
    return framed(body)
