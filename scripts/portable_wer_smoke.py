"""Exercise the real Rust seal/verify CLI on an existing unsigned fixture.

Uses throwaway keys, no inference, and no retrospective execution attestation.
Requires cryptography only for this smoke driver, not for the Rust verifier.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
import time
from pathlib import Path


def run(executable, native, output):
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, PrivateFormat, NoEncryption
    output.mkdir(parents=True, exist_ok=False)
    def save(name, value):
        (output/name).write_text(json.dumps(value, indent=2)+"\n", encoding="utf-8")
    worker, log = Ed25519PrivateKey.generate(), Ed25519PrivateKey.generate()
    public = lambda key: list(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw))
    now = int(time.time())
    trust = {"worker_public_key": public(worker), "checkpoint": {
        "log_id": list(hashlib.sha256(b"arkhe-local-smoke-only").digest()), "public_key": public(log),
        "tenant_id": "local-smoke", "stream_id": "pilot-wer", "minimum_leaf_count": 1,
        "maximum_leaf_count": 100, "earliest_issued_at": now-5, "latest_issued_at": now+600}}
    save("trust.json", trust)
    def command(*args):
        return subprocess.run([str(executable.resolve()), *map(str,args)], capture_output=True,
            timeout=30, check=False,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess,"CREATE_NO_WINDOW") else 0)
    with tempfile.TemporaryDirectory(prefix="arkhe-throwaway-signers-") as temporary:
        temporary = Path(temporary)
        for name, key in (("worker", worker), ("log", log)):
            (temporary/name).write_bytes(key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption()))
        sealed = command("seal", "--native", native.resolve(), "--trust", output/"trust.json",
            "--worker-key-file", temporary/"worker", "--log-key-file", temporary/"log",
            "--journal", output/"journal.jsonl", "--output", output/"portable-wer.json")
        if sealed.returncode:
            raise RuntimeError(sealed.stderr.decode(errors="replace"))
        save("receipt.json", json.loads(sealed.stdout))
    verified = command("verify", "--bundle", output/"portable-wer.json", "--trust", output/"trust.json")
    if verified.returncode: raise RuntimeError(verified.stderr.decode(errors="replace"))
    save("verification.json", json.loads(verified.stdout))
    tampered = json.loads((output/"portable-wer.json").read_text())
    tampered["signed_wer"]["worker"]["output_digest"][0] ^= 1
    save("tampered-wer.json", tampered)
    rejected = command("verify", "--bundle", output/"tampered-wer.json", "--trust", output/"trust.json")
    if rejected.returncode == 0: raise AssertionError("tampered WER accepted")
    trust["worker_public_key"] = public(Ed25519PrivateKey.generate())
    save("wrong-trust.json", trust)
    wrong = command("verify", "--bundle", output/"portable-wer.json", "--trust", output/"wrong-trust.json")
    if wrong.returncode == 0: raise AssertionError("wrong signer accepted")
    result = {"scope": "LOCAL_DEVELOPMENT_SMOKE_RETROSPECTIVE_FIXTURE_SEALING",
        "source_sha256": hashlib.sha256(native.read_bytes()).hexdigest(),
        "executable_sha256": hashlib.sha256(executable.read_bytes()).hexdigest(),
        "offline_verification": "PASS", "tampered_wer_rejected": True, "wrong_signer_rejected": True,
        "keys": "THROWAWAY_TEMP_FILES_REMOVED", "model_calls": 0, "original_execution_authenticated": False,
        "organizational_independence_verified": False, "trusted_timestamp_verified": False,
        "capability_demonstrated": False}
    save("result.json", result)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", type=Path, required=True)
    parser.add_argument("--native", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.exe,args.native,args.output_dir.resolve()),indent=2))
