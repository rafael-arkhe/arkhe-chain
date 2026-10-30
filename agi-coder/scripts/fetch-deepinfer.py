#!/usr/bin/env python3
"""Create a pinned, detached upstream checkout. Never overwrite an existing path.

Build and submodule setup remain explicit upstream steps on the Linux GPU host.
This script does not initialize Git in the parent workspace or download weights.
"""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def main():
    lock = json.loads((ROOT / "third_party/deepinfer.lock.json").read_text())
    destination = ROOT / lock["checkout"]
    if destination.exists():
        raise SystemExit(f"Refusing to overwrite existing checkout: {destination}")
    subprocess.run(["git", "clone", "--filter=blob:none", "--no-checkout", lock["repository"], str(destination)], check=True)
    subprocess.run(["git", "-C", str(destination), "checkout", "--detach", lock["revision"]], check=True)
    actual = subprocess.check_output(["git", "-C", str(destination), "rev-parse", "HEAD"], text=True).strip()
    if actual != lock["revision"]:
        raise SystemExit("Pinned checkout verification failed; preserve the directory for inspection")
    print(f"Pinned DeepInfer checkout ready: {actual}")

if __name__ == "__main__":
    main()
