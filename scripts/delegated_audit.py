#!/usr/bin/env python3
"""Controlled delegation demo for a real repository audit and portable verification."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import sqlite3
import subprocess
import sys
import time
import uuid

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

ACTION = "run_chain_gate"
GRANT_FIELDS = {
    "version", "task_id", "source_commit", "source_tree", "delegate_public",
    "network_keys_digest", "action", "max_attempts", "max_seconds", "issued_at",
    "expires_at", "output_directory",
}
PLAN_FIELDS = {"task_id", "action", "expected_commit"}
RECEIPT_FIELDS = {
    "version", "task_id", "source_commit", "source_tree", "grant_digest", "plan_digest",
    "manifest_digest", "log_digest", "report_digest", "counts", "status", "started_at",
    "finished_at", "planner",
}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    with Path(path).open("xb") as stream:
        stream.write(canonical(value) + b"\n")


def read_json(path):
    path = Path(path)
    if path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("JSON resource limit")
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result
    return json.loads(path.read_bytes(), object_pairs_hook=unique_object)


def sign(body, key):
    return {"body": body, "signature": key.sign(canonical(body)).hex()}


def verify_signature(envelope, public):
    if set(envelope) != {"body", "signature"}:
        raise ValueError("signed envelope schema")
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(public)).verify(
            bytes.fromhex(envelope["signature"]), canonical(envelope["body"]))
    except Exception as error:
        raise ValueError("invalid signature") from error
    return envelope["body"]


def integer(value, low, high):
    return type(value) is int and low <= value <= high


def validate_grant(envelope, trust, plan, commit, tree, output, now):
    grant = verify_signature(envelope, trust["authority_public"])
    if set(grant) != GRANT_FIELDS or not integer(grant["version"], 1, 1):
        raise ValueError("grant schema")
    if set(plan) != PLAN_FIELDS:
        raise ValueError("plan schema")
    if grant["action"] != ACTION or plan["action"] != ACTION:
        raise ValueError("action not authorized")
    if grant["task_id"] != plan["task_id"] or not re.fullmatch(r"[0-9a-f]{32}", grant["task_id"]):
        raise ValueError("task identity")
    if not re.fullmatch(r"[0-9a-f]{40}", commit) or not re.fullmatch(r"[0-9a-f]{40}", tree):
        raise ValueError("source identity format")
    if grant["source_commit"] != commit or plan["expected_commit"] != commit or grant["source_tree"] != tree:
        raise ValueError("source not authorized")
    if grant["delegate_public"] != bytes(trust["network_keys"]["delegate"]).hex():
        raise ValueError("delegate not authorized")
    if grant["network_keys_digest"] != digest(canonical(trust["network_keys"])):
        raise ValueError("ledger identity not authorized")
    if grant["output_directory"] != str(Path(output).resolve()):
        raise ValueError("output not authorized")
    if not integer(grant["max_attempts"], 1, 3) or not integer(grant["max_seconds"], 1, 1200):
        raise ValueError("invalid budget")
    if not integer(grant["issued_at"], 0, 2**63 - 1) or not integer(grant["expires_at"], 0, 2**63 - 1):
        raise ValueError("invalid time")
    if not grant["issued_at"] <= now < grant["expires_at"]:
        raise ValueError("delegation inactive")
    return grant


class Reservations:
    """Reserve before dispatch. In-doubt/running tasks require operator review."""
    def __init__(self, path):
        self.path = Path(path)
        with sqlite3.connect(self.path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS tasks (task_id TEXT PRIMARY KEY, grant_digest TEXT NOT NULL, attempts INTEGER NOT NULL, status TEXT NOT NULL)")

    def reserve(self, grant, envelope):
        commitment = digest(canonical(envelope))
        with sqlite3.connect(self.path, timeout=10) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT grant_digest, attempts, status FROM tasks WHERE task_id=?", (grant["task_id"],)).fetchone()
            if row is None:
                db.execute("INSERT INTO tasks VALUES (?, ?, 1, 'running')", (grant["task_id"], commitment))
                return
            previous, attempts, status = row
            if previous != commitment or status != "failed" or attempts >= grant["max_attempts"]:
                raise ValueError("replay, concurrent execution or exhausted budget")
            db.execute("UPDATE tasks SET attempts=attempts+1, status='running' WHERE task_id=?", (grant["task_id"],))

    def finish(self, task_id, success):
        with sqlite3.connect(self.path) as db:
            cursor = db.execute("UPDATE tasks SET status=? WHERE task_id=? AND status='running'",
                                ("completed" if success else "failed", task_id))
            if cursor.rowcount != 1:
                raise ValueError("reservation state")


def stop_process(process):
    if process.poll() is not None:
        return
    if os.name == "posix":
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    else:
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        if process.poll() is None:
            process.kill()
    process.wait(timeout=10)


def run_process(command, repo, log_path, seconds, cancelled=lambda: False):
    if cancelled() or seconds <= 0:
        raise ValueError("cancelled or expired before dispatch")
    deadline = time.monotonic() + seconds
    with Path(log_path).open("xb") as log:
        process = subprocess.Popen(command, cwd=repo, shell=False, stdout=log,
                                   stderr=subprocess.STDOUT, start_new_session=(os.name == "posix"))
        try:
            while process.poll() is None:
                if cancelled():
                    raise ValueError("cancelled during execution")
                if time.monotonic() >= deadline:
                    raise ValueError("execution timeout")
                time.sleep(0.05)
            if cancelled() or time.monotonic() >= deadline:
                raise ValueError("cancelled or expired at completion")
            return process.returncode
        finally:
            stop_process(process)


def git(repo, *arguments):
    return subprocess.check_output(["git", "-C", str(repo), *arguments], text=True).strip()


def source_identity(repo):
    if git(repo, "status", "--porcelain", "--untracked-files=normal"):
        raise ValueError("source checkout is dirty")
    return git(repo, "rev-parse", "HEAD"), git(repo, "rev-parse", "HEAD^{tree}")


def verify_gate(directory, commit, tree):
    manifest = read_json(Path(directory) / "manifest.json")
    log = (Path(directory) / "cargo-test.log").read_bytes()
    expected_command = ["cargo", "test", "--locked", "-p", "arkhe-chain", "--no-fail-fast"]
    if manifest.get("commit") != commit or manifest.get("tree") != tree:
        raise ValueError("gate source mismatch")
    if manifest.get("test_exit_code") != 0 or manifest.get("checkout_unchanged") is not True:
        raise ValueError("gate failed or source changed")
    if manifest.get("command") != expected_command or manifest.get("log_sha256") != digest(log):
        raise ValueError("gate command or log mismatch")
    rows = re.findall(rb"test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored", log)
    totals = [sum(int(row[index]) for row in rows) for index in range(3)]
    if not rows or totals[0] == 0 or totals[1:] != [0, 0] or b"FAILED" in log:
        raise ValueError("test result evidence")
    return {"passed": totals[0], "failed": totals[1], "ignored": totals[2]}


def ledger_call(binary, operation, payload, directory=None):
    command = [str(Path(binary).resolve()), operation]
    if directory is not None:
        command.append(str(directory))
    result = subprocess.run(command, input=canonical(payload), stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=45, check=False)
    if result.returncode:
        raise ValueError("ledger rejected evidence: " + result.stderr.decode(errors="replace")[-1000:])
    return json.loads(result.stdout)


def verify_bundle(bundle, trust_path, pinned_trust_digest, binary):
    bundle = Path(bundle).resolve()
    trust_bytes = Path(trust_path).read_bytes()
    if digest(trust_bytes) != pinned_trust_digest:
        raise ValueError("trust root substitution")
    trust = json.loads(trust_bytes)
    envelope = read_json(bundle / "grant.json")
    plan = read_json(bundle / "plan.json")
    signed_receipt = read_json(bundle / "receipt.json")
    receipt = verify_signature(signed_receipt, bytes(trust["network_keys"]["delegate"]).hex())
    if set(receipt) != RECEIPT_FIELDS or receipt["version"] != 1 or receipt["status"] != "success":
        raise ValueError("receipt schema or status")
    if not integer(receipt["started_at"], 0, 2**63 - 1) or not integer(receipt["finished_at"], receipt["started_at"], 2**63 - 1):
        raise ValueError("receipt time")
    grant = validate_grant(envelope, trust, plan, receipt["source_commit"], receipt["source_tree"],
                           envelope["body"]["output_directory"], receipt["started_at"])
    if receipt["finished_at"] >= grant["expires_at"] or receipt["task_id"] != grant["task_id"]:
        raise ValueError("receipt outside delegation")
    counts = verify_gate(bundle / "gate", receipt["source_commit"], receipt["source_tree"])
    expected = {
        "grant_digest": digest(canonical(envelope)), "plan_digest": digest(canonical(plan)),
        "manifest_digest": digest((bundle / "gate/manifest.json").read_bytes()),
        "log_digest": digest((bundle / "gate/cargo-test.log").read_bytes()),
        "report_digest": digest((bundle / "report.md").read_bytes()), "counts": counts,
    }
    if any(receipt[key] != value for key, value in expected.items()):
        raise ValueError("receipt artifact mismatch")
    verified = ledger_call(binary, "verify", {
        "public_keys": trust["network_keys"], "receipt_digest": digest((bundle / "receipt.json").read_bytes()),
        "evidence": read_json(bundle / "ledger/evidence.json"),
    })
    if verified.get("verified") is not True or not receipt["finished_at"] <= verified.get("timestamp", -1) < grant["expires_at"]:
        raise ValueError("ledger verification failed")
    return {"verified": True, "commit": receipt["source_commit"], "counts": counts,
            "trust_sha256": pinned_trust_digest, "ledger": verified}


def run_demo(repo, output, binary, max_seconds):
    repo = Path(repo).resolve()
    output = Path(output).resolve()
    if output.is_relative_to(repo):
        raise ValueError("demo output must be outside the checkout")
    commit, tree = source_identity(repo)
    output.mkdir(parents=True, exist_ok=False)
    bundle = output / "bundle"
    bundle.mkdir()
    runtime = output / "runtime"
    runtime.mkdir(mode=0o700)
    keys = {name: list(secrets.token_bytes(32)) for name in ["delegate", "mldsa", "validator_a", "validator_b"]}
    public = ledger_call(binary, "keys", keys)
    authority = Ed25519PrivateKey.generate()
    delegate = Ed25519PrivateKey.from_private_bytes(bytes(keys["delegate"]))
    if list(delegate.public_key().public_bytes_raw()) != public["delegate"]:
        raise ValueError("delegate key mismatch")
    trust = {"version": 1, "authority_public": authority.public_key().public_bytes_raw().hex(), "network_keys": public}
    write_json(output / "trust.json", trust)
    pinned_trust = digest((output / "trust.json").read_bytes())
    now = int(time.time())
    grant = {
        "version": 1, "task_id": uuid.uuid4().hex, "source_commit": commit, "source_tree": tree,
        "delegate_public": delegate.public_key().public_bytes_raw().hex(),
        "network_keys_digest": digest(canonical(public)), "action": ACTION,
        "max_attempts": 1, "max_seconds": max_seconds, "issued_at": now,
        "expires_at": now + max_seconds + 120, "output_directory": str(bundle),
    }
    envelope = sign(grant, authority)
    plan = {"task_id": grant["task_id"], "action": ACTION, "expected_commit": commit}
    write_json(bundle / "grant.json", envelope)
    write_json(bundle / "plan.json", plan)
    validate_grant(envelope, trust, plan, commit, tree, bundle, int(time.time()))
    reservations = Reservations(runtime / "reservations.sqlite3")
    reservations.reserve(grant, envelope)
    started = int(time.time())
    completed = False
    def cancelled():
        return (runtime / "cancel").exists()
    try:
        # Only this fixed command is constructed; no executable or arguments come from the plan.
        command = [sys.executable, str(repo / "scripts/audit_gate.py"), "--output", str(bundle / "gate")]
        exit_code = run_process(command, repo, bundle / "executor.log", grant["max_seconds"], cancelled)
        if exit_code:
            raise ValueError(f"audit gate exited with {exit_code}")
        counts = verify_gate(bundle / "gate", commit, tree)
        if source_identity(repo) != (commit, tree):
            raise ValueError("source changed during task")
        if cancelled():
            raise ValueError("cancelled before receipt")
        report = (f"# Delegated repository audit\n\nSource commit `{commit}`.\n\n"
                  f"Passed {counts['passed']}, failed {counts['failed']}, ignored {counts['ignored']}.\n\n"
                  "The result covers this repository's chain tests. Cognitive generality, learning, "
                  "BFT convergence and production readiness require separate evidence.\n")
        (bundle / "report.md").write_bytes(report.encode())
        finished = int(time.time())
        if finished >= grant["expires_at"]:
            raise ValueError("delegation expired before receipt")
        receipt = {
            "version": 1, "task_id": grant["task_id"], "source_commit": commit, "source_tree": tree,
            "grant_digest": digest(canonical(envelope)), "plan_digest": digest(canonical(plan)),
            "manifest_digest": digest((bundle / "gate/manifest.json").read_bytes()),
            "log_digest": digest((bundle / "gate/cargo-test.log").read_bytes()),
            "report_digest": digest((bundle / "report.md").read_bytes()), "counts": counts,
            "status": "success", "started_at": started, "finished_at": finished,
            "planner": "external ChatGPT assistant selected this fixed audit workflow; no Arkhe model inference",
        }
        write_json(bundle / "receipt.json", sign(receipt, delegate))
        ledger_directory = bundle / "ledger"
        ledger_directory.mkdir()
        if cancelled():
            raise ValueError("cancelled before ledger dispatch")
        evidence = ledger_call(binary, "seal", {
            "secrets": keys, "receipt_digest": digest((bundle / "receipt.json").read_bytes()),
        }, ledger_directory)
        write_json(ledger_directory / "evidence.json", evidence)
        # A new process receives only public evidence and an externally pinned trust digest.
        verification = subprocess.run([
            sys.executable, str(Path(__file__).resolve()), "verify", "--bundle", str(bundle),
            "--trust", str(output / "trust.json"), "--trust-sha256", pinned_trust,
            "--ledger-binary", str(Path(binary).resolve()),
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60, check=False)
        if verification.returncode:
            raise ValueError("offline process verification failed: " + verification.stderr.decode(errors="replace")[-1000:])
        verified = json.loads(verification.stdout)
        write_json(output / "verification.json", verified)
        completed = True
        return verified
    finally:
        reservations.finish(grant["task_id"], completed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    run.add_argument("--output", type=Path, required=True)
    run.add_argument("--ledger-binary", type=Path, required=True)
    run.add_argument("--max-seconds", type=int, default=900)
    verify = commands.add_parser("verify")
    verify.add_argument("--bundle", type=Path, required=True)
    verify.add_argument("--trust", type=Path, required=True)
    verify.add_argument("--trust-sha256", required=True)
    verify.add_argument("--ledger-binary", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "run":
            result = run_demo(args.repo, args.output, args.ledger_binary, args.max_seconds)
        else:
            result = verify_bundle(args.bundle, args.trust, args.trust_sha256, args.ledger_binary)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as error:
        print(f"FAIL_CLOSED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
