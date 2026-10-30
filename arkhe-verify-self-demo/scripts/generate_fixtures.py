"""Generate cryptographically signed LOCAL TEST DOMAIN fixtures, not public Sigstore evidence.

Requires cryptography==50.0.1. Private CA, signer, CT and Rekor keys are ephemeral
and are never written to disk. Re-running changes signatures/root; review all fixtures.
"""
import base64
import datetime as dt
import hashlib
import json
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID, ObjectIdentifier

OUT = Path(__file__).resolve().parents[1] / "fixtures"
OUT.mkdir(exist_ok=True)
IDENTITY = "https://arkhe.test.invalid/build-verify-wasm.yml@refs/tags/v0.1.0"
ISSUER = "https://issuer.arkhe.test.invalid"
SIGNED = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
TIME = int(SIGNED.timestamp())
CAPTURED = int(dt.datetime.now(dt.timezone.utc).timestamp())

def b64(b):
    return base64.b64encode(b).decode()

def sha(b):
    return hashlib.sha256(b).digest()

def canonical(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":")).encode()

def spki(k):
    return k.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)

def sign(k, b):
    return k.sign(b, ec.ECDSA(hashes.SHA256()))

def u16(b):
    return len(b).to_bytes(2, "big") + b

def der_octet(b):
    n = len(b)
    length = bytes([n]) if n < 128 else bytes([0x80 + ((n.bit_length() + 7) // 8)]) + n.to_bytes((n.bit_length() + 7) // 8, "big")
    return b"\x04" + length + b

ca, signer, ct, rekor = [ec.generate_private_key(ec.SECP256R1()) for _ in range(4)]
ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Arkhe LOCAL TEST CA")])
start = dt.datetime(2020, 1, 1, tzinfo=dt.timezone.utc)
end = dt.datetime(2040, 1, 1, tzinfo=dt.timezone.utc)
ca_cert = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
    .public_key(ca.public_key()).serial_number(1).not_valid_before(start).not_valid_after(end)
    .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
    .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True)
    .sign(ca, hashes.SHA256()))
leaf = (x509.CertificateBuilder().subject_name(x509.Name([])).issuer_name(ca_name)
    .public_key(signer.public_key()).serial_number(2)
    .not_valid_before(SIGNED - dt.timedelta(minutes=5)).not_valid_after(SIGNED + dt.timedelta(minutes=5))
    .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
    .add_extension(x509.KeyUsage(True, False, False, False, False, False, False, False, False), critical=True)
    .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CODE_SIGNING]), critical=False)
    .add_extension(x509.SubjectAlternativeName([x509.UniformResourceIdentifier(IDENTITY)]), critical=True)
    .add_extension(x509.UnrecognizedExtension(ObjectIdentifier("1.3.6.1.4.1.57264.1.1"), ISSUER.encode()), critical=False))
# RFC6962 precertificate signed-entry: SCT extension removed from TBS.
tbs = leaf.sign(ca, hashes.SHA256()).tbs_certificate_bytes
ct_time = (TIME * 1000).to_bytes(8, "big")
sct_input = b"\x00\x00" + ct_time + b"\x00\x01" + sha(spki(ca)) + len(tbs).to_bytes(3, "big") + tbs + b"\x00\x00"
sct_sig = sign(ct, sct_input)
sct = b"\x00" + sha(spki(ct)) + ct_time + b"\x00\x00\x04\x03" + u16(sct_sig)
sct_list = u16(u16(sct))
cert = leaf.add_extension(x509.UnrecognizedExtension(ObjectIdentifier("1.3.6.1.4.1.11129.2.4.2"), der_octet(sct_list)), critical=False).sign(ca, hashes.SHA256())
cert_der = cert.public_bytes(serialization.Encoding.DER)
cert_pem = cert.public_bytes(serialization.Encoding.PEM)

# Binary WASM: export answer() -> i32, return 42. B adds a valid custom section.
wasm_a = bytes.fromhex("0061736d010000000105016000017f03020100070a0106616e7377657200000a06010400412a0b")
wasm_b = wasm_a + b"\x00\x07\x05other\x01"
artifacts = [("arkhe_verify", wasm_a), ("other", wasm_b)]
log_id = sha(spki(rekor))
entries, signatures, bodies = [], [], []
for name, wasm in artifacts:
    signature = sign(signer, wasm)
    body = canonical({"apiVersion": "0.0.1", "kind": "hashedrekord", "spec": {
        "data": {"hash": {"algorithm": "sha256", "value": sha(wasm).hex()}},
        "signature": {"content": b64(signature), "publicKey": {"content": b64(cert_pem)}}}})
    signatures.append(signature)
    bodies.append(body)
leaves = [sha(b"\x00" + b) for b in bodies]
root = sha(b"\x01" + leaves[0] + leaves[1])
note = f"rekor.arkhe.test.invalid\n2\n{b64(root)}\n"
checkpoint = note + "\n— rekor.arkhe.test.invalid " + b64(log_id[:4] + sign(rekor, note.encode())) + "\n"
for i, ((name, wasm), body, signature) in enumerate(zip(artifacts, bodies, signatures)):
    set_payload = canonical({"body": b64(body), "integratedTime": TIME, "logID": log_id.hex(), "logIndex": i})
    entry = {"logIndex": str(i), "logId": {"keyId": b64(log_id)},
        "kindVersion": {"kind": "hashedrekord", "version": "0.0.1"}, "integratedTime": str(TIME),
        "canonicalizedBody": b64(body), "inclusionPromise": {"signedEntryTimestamp": b64(sign(rekor, set_payload))},
        "inclusionProof": {"logIndex": str(i), "rootHash": b64(root), "treeSize": "2",
            "hashes": [b64(leaves[1-i])], "checkpoint": {"envelope": checkpoint}}}
    bundle = {"mediaType": "application/vnd.dev.sigstore.bundle.v0.3+json",
        "verificationMaterial": {"certificate": {"rawBytes": b64(cert_der)}, "tlogEntries": [entry]},
        "messageSignature": {"messageDigest": {"algorithm": "SHA2_256", "digest": b64(sha(wasm))}, "signature": b64(signature)}}
    (OUT / f"{name}.wasm").write_bytes(wasm)
    (OUT / f"{name}.wasm.bundle.json").write_text(json.dumps(bundle, indent=2) + "\n")

def log(k, url):
    return {"baseUrl": url, "hashAlgorithm": "SHA2_256", "publicKey": {
        "rawBytes": b64(spki(k)), "keyDetails": "PKIX_ECDSA_P256_SHA_256",
        "validFor": {"start": "2020-01-01T00:00:00Z"}}, "logId": {"keyId": b64(sha(spki(k)))}}

trust = {"mediaType": "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
    "tlogs": [log(rekor, "https://rekor.arkhe.test.invalid")],
    "ctlogs": [log(ct, "https://ct.arkhe.test.invalid")],
    "certificateAuthorities": [{"subject": {"commonName": "Arkhe LOCAL TEST CA"},
        "uri": "https://fulcio.arkhe.test.invalid", "certChain": {"certificates": [{"rawBytes": b64(ca_cert.public_bytes(serialization.Encoding.DER))}]},
        "validFor": {"start": "2020-01-01T00:00:00Z", "end": "2040-01-01T00:00:00Z"}}]}
(OUT / "trusted_root.json").write_text(json.dumps(trust, indent=2) + "\n")
(OUT / "trust-policy.json").write_text(json.dumps({"domain": "LOCAL TEST ONLY", "identity": IDENTITY,
    "issuer": ISSUER, "captured_at_unix": CAPTURED, "root_sha256": sha(canonical(trust)).hex(),
    "signed_at_unix": TIME}, indent=2) + "\n")
print(f"Generated local cryptographic fixtures in {OUT}; capture={CAPTURED}")
