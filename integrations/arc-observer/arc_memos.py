"""Bounded, read-only Memo observation. No invoice/reference inference by amount."""
import argparse
import json
from pathlib import Path
import time

from arc_capture import CHAIN_ID, ERC20, Rpc, SYSTEM, TOPIC, hex_value, qualify, select_movements

MEMO = "0x5294e9927c3306dcbadb03fe70b92e01ccede505"
MEMO_TOPIC = "0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4"
BEFORE_TOPIC = "0xb252e055da754c72fbf7542cf424b190808a9b541e912894c5e15b4238c41501"


def address_topic(value):
    value = hex_value(value, 64)
    if value[2:26] != "0" * 24:
        raise ValueError("invalid memo address padding")
    return "0x" + value[-40:]


def decode_memo(log):
    if log.get("removed") is not False or hex_value(log["address"], 40) != MEMO:
        raise ValueError("unqualified memo emitter/log")
    topics = log["topics"]
    if len(topics) != 4 or hex_value(topics[0], 64) != MEMO_TOPIC:
        raise ValueError("unsupported memo signature")
    data_hex = hex_value(log["data"])
    if len(data_hex) > 2 + 2 * (128 + 4096) or (len(data_hex) - 2) % 64:
        raise ValueError("invalid memo ABI size")
    data = bytes.fromhex(data_hex[2:])
    if len(data) < 128 or int.from_bytes(data[32:64]) != 96:
        raise ValueError("invalid memo ABI offset")
    size = int.from_bytes(data[96:128])
    padded = ((size + 31) // 32) * 32
    if size > 4096 or len(data) != 128 + padded or any(data[128 + size:]):
        raise ValueError("invalid memo length or padding")
    return {
        "sender": address_topic(topics[1]), "target": address_topic(topics[2]),
        "memo_id": hex_value(topics[3], 64), "call_data_hash": "0x" + data[:32].hex(),
        "memo_hex": "0x" + data[128:128 + size].hex(),
        "memo_index": str(int.from_bytes(data[64:96])),
        "log_index": int(hex_value(log["logIndex"]), 16),
        "transaction_hash": hex_value(log["transactionHash"], 64),
        "block_hash": hex_value(log["blockHash"], 64),
    }


def inspect_receipt(receipt):
    from Crypto.Hash import keccak  # Optional pycryptodome; never substitute SHA3-256.
    if not receipt or int(hex_value(receipt["status"]), 16) != 1:
        raise ValueError("memo receipt missing or unsuccessful")
    tx_hash = hex_value(receipt["transactionHash"], 64)
    block_hash = hex_value(receipt["blockHash"], 64)
    memo_logs = [log for log in receipt["logs"] if log["address"].lower() == MEMO]
    before = {}
    memos = []
    for log in memo_logs:
        if log.get("removed") is not False or hex_value(log["transactionHash"], 64) != tx_hash or hex_value(log["blockHash"], 64) != block_hash:
            raise ValueError("memo receipt/event provenance mismatch")
        topics = log["topics"]
        if topics and topics[0].lower() == BEFORE_TOPIC:
            if len(topics) != 2 or log["data"] != "0x":
                raise ValueError("invalid BeforeMemo ABI")
            index = str(int(hex_value(topics[1], 64), 16))
            if index in before:
                raise ValueError("duplicate memo frame index")
            before[index] = int(hex_value(log["logIndex"]), 16)
        elif topics and topics[0].lower() == MEMO_TOPIC:
            memos.append(decode_memo(log))
    native = [log for log in receipt["logs"] if log["address"].lower() == SYSTEM
              and log["topics"] and log["topics"][0].lower() == TOPIC]
    movements, excluded, _ = select_movements(native)
    used = set()
    associations = []
    for memo in memos:
        if memo["memo_index"] in used:
            raise ValueError("duplicate completed memo frame")
        used.add(memo["memo_index"])
        start = before.get(memo["memo_index"])
        if start is None or start >= memo["log_index"]:
            raise ValueError("missing or unordered BeforeMemo frame")
        candidates = []
        # Only direct EOA wrapper -> USDC transfer() is supported for association.
        # Nested or multi-movement calls remain retained but not auto-associated.
        frame_logs = [log for log in native if start < int(log["logIndex"], 16) < memo["log_index"]]
        if (len(frame_logs) == 1 and (receipt.get("to") or "").lower() == MEMO
                and receipt["from"].lower() == memo["sender"] and memo["target"] == ERC20):
            for item in movements:
                if (item["transaction_hash"] != tx_hash or item["block_hash"] != block_hash
                        or not start < item["event_index"] < memo["log_index"]
                        or item["from"] != memo["sender"]):
                    continue
                calldata = bytes.fromhex("a9059cbb" + "0" * 24 + item["to"][2:] + f"{item['amount_microusd']:064x}")
                call_hash = "0x" + keccak.new(digest_bits=256, data=calldata).hexdigest()
                if call_hash == memo["call_data_hash"]:
                    candidates.append(item["event_index"])
        associations.append({
            "memo_index": memo["memo_index"], "memo_log_index": memo["log_index"],
            "candidate_movement_log_indices": candidates,
            "status": "bound-direct-transfer" if len(candidates) == 1 else "unassociated-unsupported-or-ambiguous",
            "invoice_authenticity": "not-established", "confidence_score": None,
        })
    return {"memos": memos, "associations": associations, "excluded_movements": excluded,
            "scope": "RPC event/frame/calldata consistency only; no invoice authenticity or consensus proof",
            "reference_assignment": "none; application-specific memoId/invoice mapping required"}


def scan(output, lookback):
    output.mkdir(exist_ok=False)
    rpc = Rpc(output)
    chain = int(hex_value(rpc.call("eth_chainId", [])), 16)
    if chain != CHAIN_ID:
        raise ValueError("wrong network")
    head = rpc.call("eth_getBlockByNumber", ["finalized", False])
    if not head:
        raise ValueError("finalized head unavailable")
    end = int(hex_value(head["number"]), 16)
    start = max(0, end - lookback + 1)
    logs = []
    scanned = []
    # Search newest chunks first. Stop on observed events; do not claim total history.
    for chunk_end in range(end, start - 1, -256):
        time.sleep(1)  # Avoid bursting against the public RPC during backfill.
        chunk_start = max(start, chunk_end - 255)
        found = rpc.call("eth_getLogs", [{"fromBlock": hex(chunk_start), "toBlock": hex(chunk_end),
                                         "address": MEMO, "topics": [MEMO_TOPIC]}])
        scanned.append({"from": chunk_start, "to": chunk_end, "memo_log_count": len(found)})
        if found:
            logs = found
            break
    observation = None
    if logs:
        selected = decode_memo(logs[0])
        receipt = rpc.call("eth_getTransactionReceipt", [selected["transaction_hash"]])
        observation = inspect_receipt(receipt)
        if selected not in observation["memos"]:
            raise ValueError("queried memo not reproduced in receipt")
        block = rpc.call("eth_getBlockByNumber", [receipt["blockNumber"], False])
        if (block["hash"].lower() != selected["block_hash"]
                or int(block["number"], 16) > end
                or block["number"] != receipt["blockNumber"]):
            raise ValueError("memo block/finality inconsistency")
        # Qualify every eligible canonical movement before reporting associations.
        native = [log for log in receipt["logs"] if log["address"].lower() == SYSTEM
                  and log["topics"] and log["topics"][0].lower() == TOPIC]
        for item in select_movements(native)[0]:
            qualify(item, receipt, block, head)
    report = {"profile": "arkhe/arc-memo-observation/v1", "chain_id": chain,
              "status": "memo-observed" if observation else "no-memo-observed-in-scanned-range",
              "finality": "rpc-reported-finalized", "scanned_ranges": scanned,
              "observation": observation, "requests": rpc.calls,
              "synthetic": False, "reference_assignment": "none"}
    (output / "memos.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "status": report["status"],
                      "scanned_ranges": scanned, "observation": observation}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--lookback", type=int, default=256)
    args = parser.parse_args()
    if not 1 <= args.lookback <= 4096:
        parser.error("lookback must be between 1 and 4096")
    scan(args.output, args.lookback)
