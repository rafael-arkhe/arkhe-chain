#!/usr/bin/env python3
"""Gera o vetor completo do ExecutionReceiptPayload (arkhe-ritual-receipt-v1)."""
import json, struct
from blake3 import blake3
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

def _major(m, n):
    mt = m << 5
    if n < 24: return bytes([mt | n])
    if n <= 0xFF: return bytes([mt | 24, n])
    if n <= 0xFFFF: return bytes([mt | 25]) + struct.pack('>H', n)
    if n <= 0xFFFFFFFF: return bytes([mt | 26]) + struct.pack('>I', n)
    return bytes([mt | 27]) + struct.pack('>Q', n)

def enc_text(s):
    b = s.encode('utf-8')
    return _major(3, len(b)) + b

def enc_bytes(b):
    return _major(2, len(b)) + b

def enc_uint(n):
    return _major(0, n)

def enc_map(pairs):
    # pairs: list of (encoded_key, encoded_value), sorted by encoded_key
    return _major(5, len(pairs)) + b''.join(k + v for k, v in pairs)

def payload_cbor(p):
    pairs = [
        (enc_text("nonce"), enc_bytes(p["nonce"])),
        (enc_text("domain"), enc_text(p["domain"])),
        (enc_text("effect_id"), enc_bytes(p["effect_id"])),
        (enc_text("challenge_id"), enc_bytes(p["challenge_id"])),
        (enc_text("completed_at"), enc_uint(p["completed_at"])),
        (enc_text("input_digest"), enc_bytes(p["input_digest"])),
        (enc_text("output_digest"), enc_bytes(p["output_digest"])),
        (enc_text("policy_digest"), enc_bytes(p["policy_digest"])),
        (enc_text("attestation_digest"), enc_bytes(p["attestation_digest"])),
        (enc_text("request_commitment"), enc_bytes(p["request_commitment"])),
        (enc_text("authorization_commitment"), enc_bytes(p["authorization_commitment"])),
    ]
    pairs.sort(key=lambda kv: kv[0])  # bytewise by encoded key
    return enc_map(pairs)

# Vetor de teste: todos os digests são 0x00.. para reprodutibilidade.
payload = {
    "domain": "arkhe-ritual-receipt-v1",
    "challenge_id": bytes(32),
    "nonce": bytes(32),
    "request_commitment": bytes(32),
    "policy_digest": bytes(32),
    "effect_id": bytes(32),
    "input_digest": bytes(32),
    "output_digest": bytes(32),
    "attestation_digest": bytes(32),
    "authorization_commitment": bytes(32),
    "completed_at": 42,
}
cbor_bytes = payload_cbor(payload)
digest = blake3(b"AKG:RITUAL:RECEIPT:v1\0" + cbor_bytes).digest()

seed = bytes(range(32))
priv = Ed25519PrivateKey.from_private_bytes(seed)
pub = priv.public_key().public_bytes(
    encoding=serialization.Encoding.Raw,
    format=serialization.PublicFormat.Raw,
)
sig = priv.sign(digest)

print(json.dumps({
    "payload_cbor_hex": cbor_bytes.hex(),
    "payload_cbor_len": len(cbor_bytes),
    "digest_hex": digest.hex(),
    "pubkey_hex": pub.hex(),
    "signature_hex": sig.hex(),
}, indent=2))
