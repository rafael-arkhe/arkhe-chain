"""Read-only Arc Testnet capture. RPC observations are not consensus proofs."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

RPC = "https://rpc.testnet.arc.io"
CHAIN_ID = 5042002
SYSTEM = "0xfffffffffffffffffffffffffffffffffffffffe"
ERC20 = "0x3600000000000000000000000000000000000000"
TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
SCALE = 10**12
ZERO = "0x" + "0" * 40


def hex_value(value, width=None):
    if not isinstance(value, str) or not re.fullmatch(r"0x[0-9a-fA-F]+", value):
        raise ValueError("invalid RPC hex value")
    if width is not None and len(value) != width + 2:
        raise ValueError("invalid RPC hex width")
    return value.lower()


def decode(log):
    if log.get("removed") is not False:
        raise ValueError("removed or unqualified log")
    if hex_value(log["address"], 40) != SYSTEM:
        raise ValueError("not the canonical native emitter")
    topics = log["topics"]
    if len(topics) != 3 or hex_value(topics[0], 64) != TOPIC:
        raise ValueError("unsupported event signature")
    parties = []
    for topic in topics[1:]:
        topic = hex_value(topic, 64)
        if topic[2:26] != "0" * 24:
            raise ValueError("noncanonical address topic padding")
        parties.append("0x" + topic[-40:])
    return {
        "block_hash": hex_value(log["blockHash"], 64),
        "block_number": int(hex_value(log["blockNumber"]), 16),
        "transaction_hash": hex_value(log["transactionHash"], 64),
        "event_index": int(hex_value(log["logIndex"]), 16),
        "from": parties[0], "to": parties[1],
        "amount_native": int(hex_value(log["data"], 64), 16),
    }


def select_movements(logs):
    """Emitter selection avoids mirror double-counting; identity dedup is exact.

    Different log indices remain different even with equal payer/payee/amount.
    Sub-micro precision is reported and never silently rounded into the profile.
    """
    identities = {}
    ignored_mirrors = 0
    for log in logs:
        emitter = hex_value(log["address"], 40)
        if emitter == ERC20:
            ignored_mirrors += 1
            continue
        item = decode(log)
        key = (item["block_hash"], item["transaction_hash"], item["event_index"])
        if key in identities and identities[key] != item:
            raise ValueError("conflicting duplicate event identity")
        identities[key] = item
    eligible, excluded = [], []
    for item in sorted(identities.values(), key=lambda x: (x["block_number"], x["transaction_hash"], x["event_index"])):
        amount, remainder = divmod(item["amount_native"], SCALE)
        reason = None
        if ZERO in (item["from"], item["to"]):
            reason = "mint-or-burn-not-a-customer-receipt"
        elif remainder:
            reason = "sub-micro-precision-not-supported-by-reconciliation-v1"
        elif not 0 < amount <= 2**64 - 1:
            reason = "amount-outside-reconciliation-v1-range"
        elif item["event_index"] > 2**32 - 1:
            reason = "event-index-outside-reconciliation-v1-range"
        if reason:
            excluded.append({**item, "amount_native": str(item["amount_native"]), "reason": reason})
        else:
            eligible.append({**item, "amount_microusd": amount})
    return eligible, excluded, ignored_mirrors


class Rpc:
    def __init__(self, output):
        self.output = output
        self.calls = []

    def call(self, method, params):
        request = {"jsonrpc": "2.0", "id": len(self.calls) + 1, "method": method, "params": params}
        body = json.dumps(request, separators=(",", ":")).encode()
        req = urllib.request.Request(RPC, data=body, headers={
            "Content-Type": "application/json", "User-Agent": "ArkheArcObserver/0.1", "Accept": "application/json"})
        # Bound retries on the public endpoint and respect numeric Retry-After.
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    raw = response.read(8_000_001)
                    if len(raw) > 8_000_000:
                        raise ValueError("RPC response exceeds capture limit")
                break
            except urllib.error.HTTPError as error:
                if error.code != 429 or attempt == 2:
                    raise
                delay = error.headers.get("Retry-After", "2")
                delay = int(delay) if delay.isdigit() else 2
                if delay > 10:
                    raise
                time.sleep(max(1, delay))
        name = f"rpc-{request['id']:03d}.json"
        (self.output / name).write_bytes(raw)
        self.calls.append({"request": request, "response_file": name,
                           "response_sha256": hashlib.sha256(raw).hexdigest()})
        envelope = json.loads(raw)
        if envelope.get("jsonrpc") != "2.0" or envelope.get("id") != request["id"] or "error" in envelope:
            raise ValueError("invalid or failed JSON-RPC response")
        return envelope["result"]


def qualify(item, receipt, block, final_head):
    if not receipt or int(hex_value(receipt["status"]), 16) != 1:
        raise ValueError("receipt missing or transaction unsuccessful")
    if (hex_value(receipt["transactionHash"], 64) != item["transaction_hash"]
            or hex_value(receipt["blockHash"], 64) != item["block_hash"]
            or int(hex_value(receipt["blockNumber"]), 16) != item["block_number"]
            or hex_value(block["hash"], 64) != item["block_hash"]
            or int(hex_value(block["number"]), 16) != item["block_number"]
            or item["block_number"] > int(hex_value(final_head["number"]), 16)):
        raise ValueError("inconsistent block/receipt/finalized observation")
    matches = [decode(log) for log in receipt["logs"]
               if log["address"].lower() == SYSTEM and log["topics"] and log["topics"][0].lower() == TOPIC]
    comparable = {key: value for key, value in item.items() if key != "amount_microusd"}
    if matches.count(comparable) != 1:
        raise ValueError("selected event absent or duplicated in receipt")


def capture(output, lookback):
    output.mkdir(parents=False, exist_ok=False)
    rpc = Rpc(output)
    try:
        chain_id = int(hex_value(rpc.call("eth_chainId", [])), 16)
        if chain_id != CHAIN_ID:
            raise ValueError("wrong network: only Arc Testnet is supported")
        head = rpc.call("eth_getBlockByNumber", ["finalized", False])
        if not head:
            raise ValueError("RPC did not supply a finalized head; no fallback to latest")
        end = int(hex_value(head["number"]), 16)
        start = max(0, end - lookback + 1)
        logs = rpc.call("eth_getLogs", [{"fromBlock": hex(start), "toBlock": hex(end),
                                        "address": SYSTEM, "topics": [TOPIC]}])
        eligible, excluded, ignored = select_movements(logs)
        (output / "excluded.json").write_text(json.dumps(excluded, indent=2), encoding="utf-8")
        if not eligible:
            raise ValueError("no exactly representable non-mint/burn movement found in bounded scan")
        item = eligible[0]
        receipt = rpc.call("eth_getTransactionReceipt", [item["transaction_hash"]])
        block = rpc.call("eth_getBlockByNumber", [hex(item["block_number"]), False])
        qualify(item, receipt, block, head)
        gas_native = int(hex_value(receipt["gasUsed"]), 16) * int(hex_value(receipt["effectiveGasPrice"]), 16)
        manifest = {
            "profile": "arkhe/arc-rpc-observation/v1", "rpc": RPC, "chain_id": chain_id,
            "captured_at_utc": datetime.now(timezone.utc).isoformat(),
            "scope": "One observed movement; no completeness claim or consensus proof",
            "finality": {"status": "rpc-reported-finalized", "head_number": end,
                         "head_hash": hex_value(head["hash"], 64),
                         "receipt_success": True, "independent_consensus_verification": False},
            "range": {"from": start, "to": end}, "raw_log_count": len(logs),
            "eligible_count": len(eligible), "excluded_count": len(excluded),
            "ignored_erc20_mirrors": ignored,
            "selected": {**item, "amount_native": str(item["amount_native"])},
            "fee": {"scope": "whole transaction, not per movement", "payer": receipt["from"].lower(),
                    "native_units": str(gas_native), "decimals": 18,
                    "microusd_floor": gas_native // SCALE, "sub_micro_remainder": gas_native % SCALE},
            "reference": {"value": "", "status": "absent-no-offchain-association-provided"},
            "requests": rpc.calls,
        }
        raw_manifest = json.dumps(manifest, indent=2).encode()
        (output / "capture.json").write_bytes(raw_manifest)
        transfer = {key: item[key] for key in ["block_number", "block_hash", "transaction_hash", "event_index", "from", "to", "amount_microusd"]}
        transfer.update({"chain_id": chain_id, "observed_at": int(hex_value(block["timestamp"]), 16),
                         "reference": "", "source": "arc-rpc-capture:sha256:" + hashlib.sha256(raw_manifest).hexdigest(),
                         "synthetic": False})
        (output / "transfer.json").write_text(json.dumps(transfer, indent=2), encoding="utf-8")
        print(json.dumps({"capture": str(output), "transaction_hash": item["transaction_hash"],
                          "event_index": item["event_index"], "amount_microusd": item["amount_microusd"],
                          "finality": manifest["finality"]["status"], "reference": "absent"}, indent=2))
    except Exception:
        (output / "failed-requests.json").write_text(json.dumps(rpc.calls, indent=2), encoding="utf-8")
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="new directory under an existing parent")
    parser.add_argument("--lookback", type=int, default=32)
    args = parser.parse_args()
    if not 1 <= args.lookback <= 256:
        parser.error("lookback must be between 1 and 256 blocks")
    capture(args.output, args.lookback)
