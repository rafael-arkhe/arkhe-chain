from pathlib import Path
import subprocess, shutil, sys
root=Path(__file__).resolve().parents[1]

subprocess.check_call([sys.executable, str(root/"scripts/check_boundaries.py")])

cargo=shutil.which("cargo")
if not cargo:
    raise SystemExit("FAIL cargo unavailable: conformance cannot be validated")

subprocess.check_call([cargo,"test","-p","arkhe-cognition-sdk","--locked"], cwd=root)

subprocess.check_call([cargo,"test","-p","arkhe-runtime","--test","cognition_conformance","--locked"], cwd=root)
print("PASS real cognition modules and ContainmentGate rejection tests")
