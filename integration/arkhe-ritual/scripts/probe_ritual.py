"""Read-only Ritual RPC smoke test. No keys, transactions, wallet or deposits."""
import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def abi_bytes3(*values):
    assert len(values) == 3
    offset = 96
    heads, tails = [], []
    for value in values:
        tail = len(value).to_bytes(32, "big") + value + bytes((-len(value)) % 32)
        heads.append(offset.to_bytes(32, "big"))
        tails.append(tail)
        offset += len(tail)
    return "0x" + (b"".join(heads + tails)).hex()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rpc", default="https://rpc.ritualfoundation.org")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    vector = json.loads((root / "vectors/authorization-v1.json").read_text(encoding="utf-8-sig"))

    def rpc(method, params):
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        request = urllib.request.Request(args.rpc, body, {"Content-Type": "application/json", "User-Agent": "arkhe-ritual-readonly-probe/0.1"})
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read(8_000_000))
        if "error" in result:
            raise RuntimeError(f"{method}: {result['error']}")
        return result["result"]

    chain = int(rpc("eth_chainId", []), 16)
    if chain != 784:
        raise RuntimeError(f"Unexpected chain {chain}; refusing Ritual-specific precompile")
    genesis = rpc("eth_getBlockByNumber", ["0x0", False])["hash"]
    registry = "0xf4495DC72143D44A93AB0ecE4d6D63a216b27839"
    code = rpc("eth_getCode", [registry, "latest"])
    if code in ("0x", "0x0"):
        raise RuntimeError("Documented TEEServiceRegistry has no code")
    pub = bytes.fromhex(vector["public_key_hex"])
    message = bytes.fromhex(vector["digest_hex"])
    signature = bytes.fromhex(vector["signature_hex"])

    def verify(msg):
        value = rpc("eth_call", [{"to": "0x0000000000000000000000000000000000000009", "data": abi_bytes3(pub, msg, signature)}, "latest"])
        raw = bytes.fromhex(value.removeprefix("0x"))
        if len(raw) != 32 or int.from_bytes(raw, "big") not in (0, 1):
            raise RuntimeError(f"Unexpected Ed25519 response: {value}")
        return int.from_bytes(raw, "big") == 1

    valid = verify(message)
    altered = bytes([message[0] ^ 1]) + message[1:]
    invalid_accepted = verify(altered)
    report = {
        "observed_at_utc": datetime.now(timezone.utc).isoformat(),
        "rpc": args.rpc, "chain_id": chain, "genesis_hash": genesis,
        "registry_address": registry, "registry_code_bytes": (len(code) - 2) // 2,
        "precompile": "0x0009", "valid_signature_accepted": valid,
        "altered_message_rejected": not invalid_accepted,
        "transactions_sent": 0,
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not valid or invalid_accepted:
        raise RuntimeError("Precompile behavior failed positive/negative vector checks")


if __name__ == "__main__":
    main()
