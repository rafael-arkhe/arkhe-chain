"""Compile/test via check-only deployment after verifying Organization.IsSandbox."""
import argparse
import json
from pathlib import Path
import subprocess
from sandbox_tools import Sandbox
from validation_report import assess

parser = argparse.ArgumentParser()
parser.add_argument("--org", required=True, help="Explicit authenticated sandbox alias")
parser.add_argument("--test-level", choices=["RunLocalTests", "RunSpecifiedTests"], default="RunLocalTests")
parser.add_argument("--evidence", type=Path, default=Path("evidence/validation.json"))
args = parser.parse_args()
sandbox = Sandbox(args.org)
project = Path(__file__).resolve().parents[1]
command = [sandbox.sf, "project", "deploy", "start", "--dry-run",
    "--target-org", args.org, "--source-dir", "force-app", "--test-level", args.test_level,
    "--wait", "30", "--json", "--junit", "--coverage-formatters", "json",
    "--results-dir", str(args.evidence.resolve().parent / "test-results")]
if args.test_level == "RunSpecifiedTests":
    command += ["--tests", "ArkheWriteGateTest", "ArkheDeliveryTest"]
process = subprocess.run(command,cwd=project,capture_output=True,text=True)
try:
    result = json.loads(process.stdout)
except json.JSONDecodeError:
    raise SystemExit("CLI did not return deployment JSON; validation is unconfirmed")
job = result.get("result", {})
if job.get("id") and job.get("done") is not True:
    process = subprocess.run([sandbox.sf,"project","deploy","report","--job-id",job["id"],
        "--target-org",args.org,"--wait","30","--json"],cwd=project,capture_output=True,text=True)
    try:
        result = json.loads(process.stdout)
    except json.JSONDecodeError:
        raise SystemExit("Deployment report unavailable; validation is unconfirmed")
decision = assess(result, project)
args.evidence.parent.mkdir(parents=True, exist_ok=True)
args.evidence.write_text(json.dumps({"sandbox_org_id": sandbox.org_id,
    "check_only": True, "deployment": result, "assessment": decision}, indent=2), encoding="utf-8")
print(json.dumps(decision))
raise SystemExit(0 if process.returncode == 0 and decision["passed"] else 1)
