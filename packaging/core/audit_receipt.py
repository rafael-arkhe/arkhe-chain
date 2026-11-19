#!/usr/bin/env python3
"""Recompute the public hashes inside a Gate 0 fixture.

This script does not verify signatures. The signature check is
`arkhe-provenance-mcp verify`. Matching hashes with a bad signature are not a pass.

What it does do, independently of the Rust binary: recompute every receipt id
from its canonical body, fold the Merkle proof in the artifact receipt, and
confront the three digest bindings that tie an agent action to the artifact
storage committed and to the invariant verdict that checked it. If this file
and the Rust verifier disagree, one of them is wrong, and that is the point of
writing it twice.
"""

import hashlib
import json
import sys
from pathlib import Path

DOMAIN = b"ARKHE-RECEIPT-V1\n"
LEAF_PROFILE = "arkhe-storage-leaf/v1"
AXIOM = "llm_output_unverified"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value) -> str:
    """The encoding arkhe-flow signs over: sorted keys, no space, JSON strings."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def receipt_id(body) -> str:
    return sha256(DOMAIN + canonical(body).encode("utf-8"))


def commit_root(previous_root: str, admission_id: str) -> str:
    return sha256(f"{previous_root}\n{admission_id}".encode())


def leaf(statement: str) -> str:
    return sha256(f"leaf\n{statement}".encode())


def node(left: str, right: str) -> str:
    return sha256(f"node\n{left}\n{right}".encode())


def artifact_statement(artifact: str, model: str, data: str, pipeline: str) -> str:
    return sha256(f"{LEAF_PROFILE}\n{artifact}\n{model}\n{data}\n{pipeline}".encode())


def fold(statement: str, index: int, proof) -> str:
    """Walk the proof from the leaf to the root, checking each side against the
    index parity. A step on the wrong side is a malformed proof, not a mismatch."""
    acc = leaf(statement)
    cursor = index
    for step in proof:
        side, _, sibling = step.partition(":")
        if side not in ("L", "R") or len(sibling) != 64:
            raise ValueError(f"malformed proof step: {step}")
        if (side == "L") != (cursor % 2 == 1):
            raise ValueError(f"proof side {side} does not match index {cursor}")
        acc = node(sibling, acc) if side == "L" else node(acc, sibling)
        cursor //= 2
    return acc


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "fixtures/gate0")

    def receipt(name):
        return json.loads((root / f"{name}.json").read_text(encoding="utf-8"))

    def digest_of(name):
        return sha256((root / name).read_bytes())

    admission = receipt("admission")
    commit = receipt("commit")
    anchor = receipt("anchor")
    checks = {
        "subject": digest_of("subject.bin") == admission["body"]["subject_sha256"],
        "policy": digest_of("policy.json") == admission["body"]["policy_sha256"],
        "root": commit_root(commit["body"]["previous_root"], commit["body"]["admission_id"])
        == commit["body"]["root"],
        "commit_names_admission": commit["body"]["admission_id"] == admission["id"],
        "anchor_names_commit": anchor["body"]["commit_id"] == commit["id"],
        "anchor_pending": anchor["body"]["transport"] == "none" and anchor["body"]["observed"] == "pending",
    }

    names = ["admission", "commit", "anchor"]
    agent = (root / "action.json").exists()
    if agent:
        names += ["artifact", "action", "verdict"]
        artifact = receipt("artifact")
        action = receipt("action")
        verdict = receipt("verdict")
        trust = json.loads((root / "trust.json").read_text(encoding="utf-8"))
        bytes_sha = digest_of("artifact.bin")
        body = artifact["body"]

        statement = artifact_statement(
            body["artifact_sha256"], body["model_sha256"], body["data_sha256"], body["pipeline_sha256"]
        )
        try:
            folded = fold(statement, body["leaf_index"], body["merkle_proof"])
        except ValueError as error:
            print(f"merkle: {error}", file=sys.stderr)
            folded = None

        checks.update({
            # the artifact receipt against the files in hand, and against itself
            "artifact_bytes": body["artifact_sha256"] == bytes_sha,
            "artifact_model": body["model_sha256"] == digest_of("model.json"),
            "artifact_data": body["data_sha256"] == digest_of("data.json"),
            "artifact_pipeline": body["pipeline_sha256"] == digest_of("pipeline.json"),
            "artifact_profile": body["merkle_profile"] == "arkhe-storage-merkle/v1",
            "merkle_folds_to_root": folded == body["merkle_root"],
            # the agent action: what it claims, and that it never clears itself
            "action_plan": action["body"]["plan_sha256"] == digest_of("plan.json"),
            "action_output_is_the_artifact": action["body"]["output_sha256"] == bytes_sha,
            "action_carries_the_axiom": action["body"]["axiom"] == AXIOM,
            "action_issuer_is_the_agent": action["body"]["issuer"] == "flow",
            # the verdict: about this action, on these bytes, by another role
            "verdict_names_the_action": verdict["body"]["action_id"] == action["id"],
            "verdict_checked_the_artifact": verdict["body"]["output_sha256"] == bytes_sha,
            "verdict_held": verdict["body"]["held"] is True,
            "verdict_issuer_is_not_the_agent": verdict["body"]["issuer"] == "invariant"
            != action["body"]["issuer"],
            # a key identity check, not a signature check: which key the
            # receipt names, and that it is not the key the agent signs with
            "verdict_names_the_roster_invariant_key": verdict["signer"] == trust["keys"].get("invariant"),
            "verdict_key_is_not_the_agent_key": verdict["signer"] != trust["keys"].get("flow"),
        })

    # every receipt id is the hash of its own canonical body
    for name in names:
        value = receipt(name)
        checks[f"{name}_id_recomputes"] = receipt_id(value["body"]) == value["id"]

    print(json.dumps({
        "schema": "arkhe-hash-recompute/v2",
        "agent_receipts": agent,
        "signatures_verified": False,
        "checks": checks,
    }, indent=2))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
