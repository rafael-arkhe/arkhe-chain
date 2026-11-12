"""Encryption helpers for vaultlite."""
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def new_key() -> bytes:
    return AESGCM.generate_key(bit_length=256)


def seal(key: bytes, plaintext: bytes) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, plaintext, None)


def open_sealed(key: bytes, blob: bytes) -> bytes:
    return AESGCM(key).decrypt(blob[:12], blob[12:], None)
