"""Probe actual API CRUD/FLS and the guard using separate sandbox sessions."""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import uuid
from sandbox_tools import Sandbox

parser = argparse.ArgumentParser()
parser.add_argument("--issuer-org", required=True, help="Sandbox alias for the trusted issuer")
parser.add_argument("--unprivileged-org", required=True, help="Different user, same sandbox, no issuer permission")
parser.add_argument("--lead-id", required=True, help="Existing sandbox fixture visible to the test user")
parser.add_argument("--approval-id", required=True, help="Existing synthetic approval from race probe")
parser.add_argument("--evidence", type=Path, default=Path("evidence/security.json"))
args = parser.parse_args()
issuer = Sandbox(args.issuer_org)
user = Sandbox(args.unprivileged_org)
if issuer.org_id != user.org_id:
    raise SystemExit("Both sessions must refer to the same sandbox")
# Distinct session identity is checked through UserInfo REST, without persisting tokens.
_, issuer_identity = issuer.request("GET", "chatter/users/me")
_, user_identity = user.request("GET", "chatter/users/me")
if not isinstance(issuer_identity, dict) or not isinstance(user_identity, dict) or not issuer_identity.get("id") or issuer_identity.get("id") == user_identity.get("id"):
    raise SystemExit("Cannot establish distinct test-user identities")
results = {}
lead = issuer.query(f"SELECT SystemModstamp FROM Lead WHERE Id='{args.lead_id}'")[0]
issuer.query(f"SELECT Id FROM Arkhe_Write_Approval__c WHERE Id='{args.approval_id}'")[0]
results["create"] = user.request("POST", "sobjects/Arkhe_Write_Approval__c", {
    "Event_Id__c": "forged-"+uuid.uuid4().hex, "Org_Id__c": user.org_id,
    "Target_Lead__c": args.lead_id, "Field_API_Name__c": "LeadSource", "New_Value__c": "Web",
    "Is_Null__c": False, "Expected_Version__c": lead["SystemModstamp"],
    "Expires_At__c": (datetime.now(timezone.utc)+timedelta(minutes=4)).isoformat(timespec="seconds"),
    "Checkpoint_Hash__c": "a"*64, "Request_Hash__c": "b"*64, "Producer_Id__c": "synthetic-forgery"})
results["edit"] = user.request("PATCH", f"sobjects/Arkhe_Write_Approval__c/{args.approval_id}", {"Producer_Id__c": "forged"})
results["delete"] = user.request("DELETE", f"sobjects/Arkhe_Write_Approval__c/{args.approval_id}")
# A permission-denied error must be observed, not just any failing validation.
access_codes = {"INSUFFICIENT_ACCESS_OR_READONLY", "INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY", "INVALID_TYPE", "INVALID_TYPE_FOR_OPERATION", "INVALID_FIELD_FOR_INSERT_UPDATE"}
passed = all(status >= 400 and isinstance(body, list) and any(e.get("errorCode") in access_codes for e in body)
             for status, body in results.values())
args.evidence.parent.mkdir(parents=True, exist_ok=True)
args.evidence.write_text(json.dumps({"sandbox_org_id": user.org_id, "results": results,
    "access_denied_observed": passed, "warning": "A failure with validation or missing-field errors is inconclusive, not a security pass."}, indent=2), encoding="utf-8")
print(f"API access probe {'passed' if passed else 'inconclusive/failed'}; evidence: {args.evidence}")
raise SystemExit(0 if passed else 1)
