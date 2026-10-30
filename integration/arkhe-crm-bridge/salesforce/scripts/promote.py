"""Manual protected-environment deployment, preserving a metadata backup and exact source hash."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from sandbox_tools import Sandbox
from validation_report import assess


def digest(root):
    checksum=hashlib.sha256()
    for path in sorted((root/"force-app").rglob("*")):
        if path.is_file():
            checksum.update(path.relative_to(root).as_posix().encode()+b"\0"+path.read_bytes())
    return checksum.hexdigest()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--org",required=True)
    parser.add_argument("--environment",required=True,choices=["integration-qa","production"])
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    if args.environment=="production" and (not os.environ.get("GITHUB_SHA") or
        os.environ.get("SF_PRODUCTION_ACCEPTED_COMMIT")!=os.environ["GITHUB_SHA"]):
        raise SystemExit("Production requires SF_PRODUCTION_ACCEPTED_COMMIT equal to the reviewed commit after operational acceptance")
    target=Sandbox(args.org,expected_sandbox=args.environment!="production")
    evidence=root/"evidence"
    evidence.mkdir(exist_ok=True)
    before=digest(root)

    def run(name, arguments):
        result=subprocess.run([target.sf,*arguments,"--target-org",args.org,"--wait","30","--json"],
            cwd=root,capture_output=True,text=True)
        try:
            body=json.loads(result.stdout)
        except json.JSONDecodeError:
            raise SystemExit(f"No JSON for {name}; operation unconfirmed")
        (evidence/(name+".json")).write_text(json.dumps(body,indent=2),encoding="utf-8")
        if result.returncode!=0:
            raise SystemExit(f"{name} did not complete successfully; inspect restricted evidence")
        return body

    # Back up existing Arkhe components. First installations may return missing-component warnings.
    backup=["project","retrieve","start","--output-dir",str(evidence/"predeploy")]
    for component in ["ApexClass:Arkhe*","ApexTrigger:Arkhe*","Flow:Arkhe*","CustomObject:Arkhe*",
        "PermissionSet:Arkhe*","CustomPermission:Arkhe*",*[f"CustomField:Lead.Arkhe_Test_{i}__c" for i in range(1,5)]]:
        backup += ["--metadata",component]
    run("backup",backup)
    validation=["project","deploy","validate"] if args.environment=="production" else ["project","deploy","start","--dry-run"]
    report=run("validation",[*validation,"--source-dir","force-app","--test-level","RunLocalTests"])
    decision=assess(report,root)
    (evidence/"coverage-assessment.json").write_text(json.dumps(decision,indent=2),encoding="utf-8")
    if not decision["passed"] or before!=digest(root):
        raise SystemExit("Validation/coverage incomplete or source changed; no promotion")
    if args.environment=="production":
        deployment=run("deployment",["project","deploy","quick","--job-id",report["result"]["id"]])
    else:
        deployment=run("deployment",["project","deploy","start","--source-dir","force-app","--test-level","RunLocalTests"])
    deployed=deployment.get("result",{})
    if deployed.get("done") is not True or deployed.get("success") is not True or deployed.get("status")!="Succeeded":
        raise SystemExit("Deployment not confirmed; use sf project deploy report, do not assume failure or retry blindly")
    (evidence/"release.json").write_text(json.dumps({"commit":os.environ.get("GITHUB_SHA"),
        "source_sha256":before,"org_id":target.org_id,"environment":args.environment,
        "deployment_id":deployed.get("id")},indent=2),encoding="utf-8")
    print("Deployment completed; receipt saved to evidence/release.json")


if __name__=="__main__": main()
