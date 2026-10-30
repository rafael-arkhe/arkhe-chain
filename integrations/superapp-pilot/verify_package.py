"""Independent wire/MMR verifier. No imports from the Rust client.

Requires an explicit external trust file. Demo trust is public fixture material,
not a demonstration of an organizational trust provisioning ceremony.
"""
import argparse
import hashlib
import json
import struct
import time
from pathlib import Path
import blake3
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def exact(obj, fields):
    require(isinstance(obj, dict) and set(obj) == set(fields.split()), "unexpected fields")


def number(n, bits=64):
    require(type(n) is int and 0 <= n < 2**bits, "invalid unsigned integer")
    return n.to_bytes(bits // 8, "big")


def raw(v, size=None):
    require(type(v) is list and all(type(x) is int and 0 <= x <= 255 for x in v), "invalid byte array")
    b = bytes(v)
    require(len(b) <= 1024 * 1024 and (size is None or len(b) == size), "invalid byte length")
    return b


def field(b):
    require(len(b) <= 1024 * 1024, "field too long")
    return number(len(b), 32) + b


def text(s):
    require(type(s) is str, "invalid text")
    return field(s.encode("utf-8"))


def texts(values):
    require(type(values) is list and len(values) <= 64, "invalid list")
    return number(len(values), 32) + b"".join(text(s) for s in values)


def sha(b):
    return hashlib.sha256(b).digest()


def manifest_bytes(m):
    exact(m, "publisher bundle_digest imports permissions signature")
    return b"ARKHE:PILOT:MANIFEST:1\0" + field(raw(m["publisher"], 32)) + field(raw(m["bundle_digest"], 32)) + texts(m["imports"]) + texts(m["permissions"])


def checkpoint_bytes(c):
    exact(c, "root count epoch signature")
    return b"ARKHE:PILOT:CHECKPOINT:1\0" + raw(c["root"], 32) + number(c["count"]) + number(c["epoch"])


def policy_digest(p):
    exact(p, "max_age_seconds fuel memory_bytes allowed_apis")
    return sha(b"ARKHE:PILOT:POLICY:1\0" + number(p["max_age_seconds"]) + number(p["fuel"]) + number(p["memory_bytes"]) + texts(p["allowed_apis"]))


def package_bytes(p):
    exact(p, "version artifact policy policy_digest evaluated_at decision consent events gate_pubkey gate_signature")
    a = p["artifact"]
    exact(a, "manifest bundle checkpoint leaf_index proof")
    out = b"ARKHE:PILOT:PACKAGE:1\0" + number(p["version"], 32)
    out += field(manifest_bytes(a["manifest"])) + field(raw(a["manifest"]["signature"], 64)) + field(raw(a["bundle"]))
    out += field(checkpoint_bytes(a["checkpoint"])) + field(raw(a["checkpoint"]["signature"], 64)) + number(a["leaf_index"])
    require(len(a["proof"]) <= 64, "proof too long")
    out += number(len(a["proof"]), 32)
    for step in a["proof"]:
        exact(step, "kind direction hash")
        out += text(step["kind"]) + text(step["direction"]) + field(raw(step["hash"], 32))
    out += field(policy_digest(p["policy"])) + field(raw(p["policy_digest"], 32))
    out += number(p["evaluated_at"]) + text(p["decision"]) + texts(p["consent"])
    require(len(p["events"]) <= 1024, "too many events")
    out += number(len(p["events"]), 32)
    for e in p["events"]:
        exact(e, "epoch api allowed reason")
        require(type(e["allowed"]) is bool, "invalid event flag")
        out += number(e["epoch"]) + text(e["api"]) + bytes([e["allowed"]]) + text(e["reason"])
    return out + field(raw(p["gate_pubkey"], 32))


def signature(key, message, sig):
    Ed25519PublicKey.from_public_bytes(raw(key, 32)).verify(raw(sig, 64), message)


def inclusion(a):
    """Independent implementation of frozen arkhe-mmr v1, including position/shape."""
    n, index = a["checkpoint"]["count"], a["leaf_index"]
    number(n); number(index)
    require(0 < n <= 1_000_000 and index < n, "invalid MMR position/count")
    widths = [1 << bit for bit in range(n.bit_length() - 1, -1, -1) if n & (1 << bit)]
    start = 0
    for peak, width in enumerate(widths):
        if index < start + width:
            break
        start += width
    local = index - start
    shape = [("node", "left" if (local >> bit) & 1 else "right") for bit in range(width.bit_length() - 1)]
    if peak < len(widths) - 1:
        shape.append(("bag", "right"))
    shape.extend([("bag", "left")] * peak)
    require([(s["kind"], s["direction"]) for s in a["proof"]] == shape, "invalid MMR proof shape")
    current = blake3.blake3(b"\x00" + manifest_bytes(a["manifest"])).digest()
    for step in a["proof"]:
        sibling = raw(step["hash"], 32)
        left, right = (sibling, current) if step["direction"] == "left" else (current, sibling)
        prefix = b"\x01" if step["kind"] == "node" else b"\x02" + number(2 * n - n.bit_count())
        current = blake3.blake3(prefix + left + right).digest()
    require(current == raw(a["checkpoint"]["root"], 32), "MMR root mismatch")


def verify_package(p, trust, now):
    exact(trust, "publisher_keys checkpoint_keys gate_keys policy")
    encoded = package_bytes(p)
    require(p["version"] == 1, "unsupported version")
    a, m, cp = p["artifact"], p["artifact"]["manifest"], p["artifact"]["checkpoint"]
    require(m["publisher"] in trust["publisher_keys"], "publisher not pinned")
    signature(m["publisher"], manifest_bytes(m), m["signature"])
    require(sha(raw(a["bundle"])) == raw(m["bundle_digest"], 32), "bundle digest mismatch")
    cp_valid = False
    for key in trust["checkpoint_keys"]:
        try:
            signature(key, checkpoint_bytes(cp), cp["signature"])
            cp_valid = True
        except Exception:
            pass
    require(cp_valid, "checkpoint signer not pinned")
    inclusion(a)
    expected_policy = policy_digest(trust["policy"])
    require(expected_policy == raw(p["policy_digest"], 32) == policy_digest(p["policy"]), "policy mismatch")
    require(cp["epoch"] <= p["evaluated_at"] <= now, "future evaluation/checkpoint")
    expiry = cp["epoch"] + trust["policy"]["max_age_seconds"]
    require(now <= expiry, "EVIDENCE_DEGRADED: expired checkpoint")
    require(p["decision"] == "Allow", "package does not claim admission")
    require(p["gate_pubkey"] in trust["gate_keys"], "gate not pinned")
    signature(p["gate_pubkey"], encoded, p["gate_signature"])
    for event in p["events"]:
        require(p["evaluated_at"] <= event["epoch"] <= expiry, "event outside admission window")
        if event["allowed"]:
            require(event["api"] in m["permissions"] and event["api"] in p["consent"] and event["api"] in trust["policy"]["allowed_apis"], "allowed API violates policy/consent")
    return "PACKAGE_VERIFIED: signatures, MMR inclusion, policy and freshness; execution claims remain declarations"


def load(path):
    def unique(pairs):
        result = {}
        for k, v in pairs:
            require(k not in result, "duplicate JSON key")
            result[k] = v
        return result
    data = Path(path).read_bytes()
    require(len(data) <= 8 * 1024 * 1024, "input too large")
    return json.loads(data, object_pairs_hook=unique)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("package")
    parser.add_argument("--trust", required=True, help="pinned trust supplied by trusted operator, never from package")
    parser.add_argument("--historical-at", type=int, help="explicit historical verification time; does not establish current validity")
    args = parser.parse_args()
    try:
        result = verify_package(load(args.package), load(args.trust), args.historical_at if args.historical_at is not None else int(time.time()))
        print(result)
    except Exception as error:
        raise SystemExit(f"PACKAGE_REJECTED: {type(error).__name__}: {error}")
