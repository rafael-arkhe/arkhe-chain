"""Local C2PA claim hash, and a gated contract submission.

The hash is SHA-256 of the canonical CBOR produced by
``arkhe_verify_core::cbor::canonical::encode_json``. That is the value named
``sha256_of_canonical_claim_bytes`` in the C2PA vector. The verifier field
``claim_canonical_sha256`` is BLAKE3-256 of those same bytes; this script
prints it separately and does not call it SHA-256.

No C2PA contract is deployed in this repository. ``ArkheValidityBridge`` does
not accept a C2PA manifest. A transaction is sent only when ``--send`` is
combined with an RPC URL, a contract address, a private key, and an ABI that
declares the named function. Otherwise the script stops after the local hash.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path


REQUIRED = (
    "instanceID",
    "claim_generator_info",
    "signature",
    "created_assertions",
)
PROFILE = "arkhe-c2pa-claim-signature-v1"
DOMAIN = b"AKG:C2PA-CLAIM-SIG:v1\0"


def head(major: int, n: int, out: bytearray) -> None:
    base = major << 5
    if n <= 23:
        out.append(base | n)
    elif n <= 0xFF:
        out.extend((base | 24, n))
    elif n <= 0xFFFF:
        out.append(base | 25)
        out.extend(n.to_bytes(2, "big"))
    elif n <= 0xFFFFFFFF:
        out.append(base | 26)
        out.extend(n.to_bytes(4, "big"))
    else:
        out.append(base | 27)
        out.extend(n.to_bytes(8, "big"))


def encode_json(value) -> bytes:
    out = bytearray()
    encode_into(value, out)
    return bytes(out)


def encode_into(value, out: bytearray) -> None:
    if value is None:
        out.append(0xF6)
    elif value is False:
        out.append(0xF4)
    elif value is True:
        out.append(0xF5)
    elif isinstance(value, int) and not isinstance(value, bool):
        if value >= 0:
            head(0, value, out)
        else:
            head(1, -1 - value, out)
    elif isinstance(value, str):
        raw = value.encode("utf-8")
        head(3, len(raw), out)
        out.extend(raw)
    elif isinstance(value, list):
        head(4, len(value), out)
        for item in value:
            encode_into(item, out)
    elif isinstance(value, dict):
        pairs = []
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError("C2PA object key must be a string")
            pairs.append((encode_json(key), encode_json(item)))
        pairs.sort(key=lambda pair: pair[0])
        head(5, len(pairs), out)
        for key, item in pairs:
            out.extend(key)
            out.extend(item)
    else:
        raise ValueError("floating point is outside the deterministic C2PA subset")


def load_claim(path: Path, vector: bool) -> tuple[dict, dict | None]:
    document = json.loads(path.read_text(encoding="utf-8"))
    candidate = None
    if vector:
        claim = document["input"]["claim_v2"]
        candidate = document.get("expected_output")
    elif isinstance(document, dict) and "claim_v2" in document.get("input", {}):
        raise ValueError("pass --vector for a C2PA vector file")
    else:
        claim = document
    if not isinstance(claim, dict):
        raise ValueError("C2PA claim must be a map")
    missing = [field for field in REQUIRED if field not in claim]
    if missing:
        raise ValueError("missing C2PA field " + ", ".join(missing))
    if claim.get("alg") == "Ed25519":
        raise ValueError("C2PA claim alg is a hash algorithm, not Ed25519")
    return claim, candidate if isinstance(candidate, dict) else None


def claim_hashes(claim: dict) -> dict[str, str]:
    canonical = encode_json(claim)
    sha256 = hashlib.sha256(canonical).hexdigest()
    result = {
        "canonical_cbor_hex": canonical.hex(),
        "sha256_of_canonical_claim_bytes": sha256,
    }
    try:
        import blake3
    except ImportError:
        return result
    result["claim_canonical_blake3"] = blake3.blake3(canonical).hexdigest()
    return result


def signing_payload(claim: dict, kid: str, issuer: str, alg: str) -> tuple[bytes, str]:
    if (
        kid == ""
        or issuer == ""
        or len(kid.encode("utf-8")) > 256
        or len(issuer.encode("utf-8")) > 256
    ):
        raise ValueError("signer kid/issuer must be non-empty and at most 256 bytes")
    canonical = encode_json(claim)
    try:
        import blake3
    except ImportError as error:
        raise ValueError("blake3 is required for the signing payload") from error
    digest = blake3.blake3(canonical).hexdigest()
    message = {
        "profile": PROFILE,
        "kid": kid,
        "issuer": issuer,
        "alg": alg,
        "claim_sha256": digest,
    }
    return DOMAIN + encode_json(message), digest


def send_manifest(manifest_hash: str, canonical: bytes, args: argparse.Namespace) -> str:
    rpc = os.environ.get("ARKHE_RPC_URL", "")
    address = os.environ.get("ARKHE_C2PA_CONTRACT", "")
    key = os.environ.get("ARKHE_C2PA_PRIVATE_KEY", "")
    abi_path = os.environ.get("ARKHE_C2PA_ABI", "")
    missing = [
        name
        for name, value in (
            ("ARKHE_RPC_URL", rpc),
            ("ARKHE_C2PA_CONTRACT", address),
            ("ARKHE_C2PA_PRIVATE_KEY", key),
            ("ARKHE_C2PA_ABI", abi_path),
        )
        if not value
    ]
    if missing:
        raise SystemExit(
            "envio recusado: "
            + ", ".join(missing)
            + " ausente. Nenhum contrato C2PA está implantado neste repositório."
        )
    try:
        from web3 import Web3
    except ImportError as error:
        raise SystemExit("envio recusado: web3.py não está instalado") from error

    abi = json.loads(Path(abi_path).read_text(encoding="utf-8"))
    names = {
        item.get("name")
        for item in abi
        if isinstance(item, dict) and item.get("type") == "function"
    }
    if args.function not in names:
        raise SystemExit(
            f"envio recusado: a ABI não declara {args.function}"
        )
    web3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 30}))
    if not web3.is_connected():
        raise SystemExit("envio recusado: RPC sem resposta")
    contract_address = web3.to_checksum_address(address)
    code = web3.eth.get_code(contract_address)
    if code in (b"", b"\x00"):
        raise SystemExit("envio recusado: o endereço não tem bytecode")
    account = web3.eth.account.from_key(key)
    contract = web3.eth.contract(address=contract_address, abi=abi)
    function = getattr(contract.functions, args.function)(
        bytes.fromhex(manifest_hash),
        canonical,
    )
    function.call({"from": account.address})
    transaction = function.build_transaction(
        {
            "from": account.address,
            "nonce": web3.eth.get_transaction_count(account.address),
            "chainId": web3.eth.chain_id,
        }
    )
    signed = account.sign_transaction(transaction)
    sent = web3.eth.send_raw_transaction(signed.raw_transaction)
    return web3.to_hex(sent)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("claim", type=Path)
    parser.add_argument(
        "--vector",
        action="store_true",
        help="read input.claim_v2 and compare it with the live encoder",
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="submit after a successful eth_call; omitted runs stay local",
    )
    parser.add_argument("--kid", default="")
    parser.add_argument("--issuer", default="")
    parser.add_argument("--alg", default="Ed25519")
    parser.add_argument(
        "--function",
        default="submitC2paManifest",
        help="ABI function (bytes32 hash, bytes canonical)",
    )
    args = parser.parse_args()
    try:
        claim, candidate = load_claim(args.claim, args.vector)
        hashes = claim_hashes(claim)
    except (OSError, json.JSONDecodeError, KeyError, ValueError) as error:
        print(f"hash recusado: {error}", file=sys.stderr)
        return 2
    report = {
        "broadcast": False,
        "c2pa_standard_validation": "NOT_PERFORMED",
        **hashes,
    }
    if candidate is not None:
        reported = candidate.get("canonical_cbor_hex")
        matches = reported == hashes["canonical_cbor_hex"]
        report["vector_matches_live_encoder"] = matches
        if not matches:
            report["vector_difference"] = (
                "o vetor candidato grava hash como bytes crus; "
                "canonicalize_claim_v2 grava hash_hex como texto"
            )
    if args.kid or args.issuer:
        try:
            payload, profile_digest = signing_payload(
                claim, args.kid, args.issuer, args.alg
            )
            import blake3
        except (ImportError, ValueError) as error:
            print(f"payload recusado: {error}", file=sys.stderr)
            return 2
        report["signing_profile"] = PROFILE
        report["profile_claim_blake3"] = profile_digest
        report["signed_payload_hex"] = payload.hex()
        report["signed_payload_blake3"] = blake3.blake3(payload).hexdigest()
        report["signature_verified"] = False
    print(json.dumps(report, indent=2))
    if not args.send:
        return 0
    try:
        tx_hash = send_manifest(
            hashes["sha256_of_canonical_claim_bytes"],
            bytes.fromhex(hashes["canonical_cbor_hex"]),
            args,
        )
    except SystemExit as error:
        print(str(error), file=sys.stderr)
        return 2
    print(json.dumps({"broadcast": True, "transaction_hash": tx_hash}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
