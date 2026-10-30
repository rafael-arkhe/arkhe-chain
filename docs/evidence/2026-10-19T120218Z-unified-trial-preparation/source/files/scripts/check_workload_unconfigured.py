"""Check opt-in harness fails without real configuration; never claims hardware PASS."""
import os, subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[1]
env = dict(os.environ)
env.pop("ARKHE_WORKLOAD_MANIFEST", None)
result = subprocess.run(["cargo", "test", "-p", "arkhe-bugbounty", "--features", "workload-integration", "--test", "workload_live", "--locked", "--", "--nocapture"], cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=120)
if result.returncode == 0 or "real workload manifest required; no mock fallback" not in result.stdout or "1 failed" not in result.stdout:
    raise SystemExit("FAIL: opt-in harness did not reject missing real configuration as expected")
print("PASS missing real workload configuration rejected; HARDWARE_NOT_EXECUTED")
