"""Live two-client probe; requires deployed candidate and a sandbox issuer session."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from threading import Barrier
import uuid
from sandbox_tools import Sandbox

parser = argparse.ArgumentParser()
parser.add_argument("--org", required=True)
parser.add_argument("--evidence", type=Path, default=Path("evidence/race.json"))
args = parser.parse_args()
sandbox = Sandbox(args.org)
event_id = "arkhe-race-" + uuid.uuid4().hex
status, body = sandbox.request("POST", "sobjects/Lead", {"LastName": event_id, "Company": "Arkhe sandbox probe"})
if status != 201:
    raise SystemExit("Cannot create sandbox probe Lead; verify CRUD/FLS and validation rules")
lead_id = body["id"]
lead = sandbox.query(f"SELECT Id, SystemModstamp FROM Lead WHERE Id='{lead_id}'")[0]
status, body = sandbox.request("POST", "sobjects/Arkhe_Write_Approval__c", {
    "Event_Id__c": event_id, "Org_Id__c": sandbox.org_id, "Target_Lead__c": lead_id,
    "Field_API_Name__c": "LeadSource", "New_Value__c": "Web", "Is_Null__c": False,
    "Expected_Version__c": lead["SystemModstamp"],
    "Expires_At__c": (datetime.now(timezone.utc)+timedelta(minutes=4)).isoformat(timespec="seconds"),
    "Checkpoint_Hash__c": "a"*64, "Request_Hash__c": "b"*64, "Producer_Id__c": "sandbox-synthetic-producer"})
if status != 201:
    raise SystemExit(f"Approval issuance failed; retained probe Lead {lead_id} for inspection")
approval_id = body["id"]
barrier = Barrier(2)


def update(_):
    barrier.wait(timeout=10)
    evidence = {"client_attempt_id": uuid.uuid4().hex}
    status, body = sandbox.request("PATCH", f"sobjects/Lead/{lead_id}", {"LeadSource": "Web"}, evidence=evidence)
    return {"status": status, "body": body, "transport": evidence}


with ThreadPoolExecutor(max_workers=2) as pool:
    responses = list(pool.map(update, range(2)))
saved = sandbox.query(f"SELECT Id, Consumed_At__c FROM Arkhe_Write_Approval__c WHERE Id='{approval_id}'")[0]
final = sandbox.query(f"SELECT LeadSource FROM Lead WHERE Id='{lead_id}'")[0]
passed = any(response["status"] == 204 for response in responses) and saved["Consumed_At__c"] is not None and final["LeadSource"] == "Web"
args.evidence.parent.mkdir(parents=True, exist_ok=True)
args.evidence.write_text(json.dumps({"sandbox_org_id": sandbox.org_id, "lead_id": lead_id,
    "approval_id": approval_id, "responses": responses, "approval": saved, "lead": final,
    "probe_passed": passed,
    "server_overlap_proven": False,
    "response_to_apex_log_correlation_verified": False,
    "limitations": "A barrier starts clients together, but does not prove overlapping server transactions. Two 204 responses can mean a successful write followed by a no-op. This probe alone does not prove single consumption or locking correctness. Retain server logs and run the adversarial matrix."}, indent=2), encoding="utf-8")
print(f"Probe {'passed' if passed else 'failed'}; evidence: {args.evidence}; fixtures retained: {lead_id}, {approval_id}")
raise SystemExit(0 if passed else 1)
