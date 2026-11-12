import pytest
from cryptography.exceptions import InvalidTag
from vaultlite.crypto import new_key, open_sealed, seal


def test_round_trip():
    key = new_key()
    assert open_sealed(key, seal(key, b"s3cret")) == b"s3cret"


def test_nonce_is_fresh():
    key = new_key()
    assert seal(key, b"x") != seal(key, b"x")


def test_tampering_is_rejected():
    key = new_key()
    blob = bytearray(seal(key, b"s3cret"))
    blob[-1] ^= 1
    with pytest.raises(InvalidTag):
        open_sealed(key, bytes(blob))
