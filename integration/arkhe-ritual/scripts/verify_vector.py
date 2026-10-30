"""Independent CBOR/BLAKE3/Ed25519 check. pip install cbor2 blake3 cryptography"""
import json
from pathlib import Path
import cbor2
from blake3 import blake3
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

path = Path(__file__).resolve().parents[1] / "vectors" / "authorization-v1.json"
vector = json.loads(path.read_text(encoding="utf-8-sig"))
payload = json.loads(vector["json"])
# This fixture contains only text keys, booleans, arrays and positive integers;
# no profile-specific byte-key projections are used.
encoded = cbor2.dumps(payload, canonical=True)
assert encoded.hex() == vector["cbor_hex"], "independent CBOR differs"
message = blake3(bytes.fromhex(vector["domain_hex"]) + encoded).digest()
assert message.hex() == vector["digest_hex"], "digest differs"
key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(vector["public_key_hex"]))
key.verify(bytes.fromhex(vector["signature_hex"]), message)
print(f"OK: independent CBOR ({len(encoded)} bytes), BLAKE3 and Ed25519")
