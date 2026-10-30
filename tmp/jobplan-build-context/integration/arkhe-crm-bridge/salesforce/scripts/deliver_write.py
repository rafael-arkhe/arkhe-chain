"""Verify Rust intent, issue once, PATCH and reconcile. Sandbox only; tokens stay in CLI memory."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess
from sandbox_tools import Sandbox

FIELDS = ("Event_Id__c", "Org_Id__c", "Target_Lead__c", "Field_API_Name__c", "New_Value__c",
          "Is_Null__c", "Expected_Version__c", "Expires_At__c", "Checkpoint_Hash__c", "Request_Hash__c", "Producer_Id__c")


def stamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def literal(value):
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def rust(binary, intent, policy, org, historical=False):
    command = [str(binary), "prepare-write", "--input", str(intent), "--policy", str(policy), "--org-id", org]
    if historical:
        command.append("--historical")
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        # Do not forward arbitrary subprocess output or paths into shared CI logs.
        raise RuntimeError("Rust rejected write intent/policy, scope or freshness")
    return None if historical else json.loads(result.stdout)


def same_approval(saved, payload):
    for field in FIELDS:
        left, right = saved.get(field), payload.get(field)
        if field in {"Expected_Version__c", "Expires_At__c"}:
            if stamp(left) != stamp(right):
                return False
        elif left != right:
            return False
    return True


def deliver(sandbox, payload, reconcile_only=False):
    """A consumed approval never authorizes a second write, even if the Lead later changes."""
    lead_id = payload["Target_Lead__c"]
    field = payload["Field_API_Name__c"]
    if not re.fullmatch(r"00Q[A-Za-z0-9]{15}", lead_id) or field not in {
        "LeadSource", "Arkhe_Test_1__c", "Arkhe_Test_2__c", "Arkhe_Test_3__c", "Arkhe_Test_4__c"
    }:
        raise RuntimeError("Unsupported target")
    approvals = sandbox.query("SELECT Id,Consumed_At__c," + ",".join(FIELDS) +
        " FROM Arkhe_Write_Approval__c WHERE Event_Id__c=" + literal(payload["Event_Id__c"]))
    if len(approvals) > 1 or (approvals and not same_approval(approvals[0], payload)):
        raise RuntimeError("Event ID conflict: immutable approval differs")
    leads = sandbox.query(f"SELECT Id,SystemModstamp,{field} FROM Lead WHERE Id='{lead_id}'")
    if len(leads) != 1:
        raise RuntimeError("Target Lead inaccessible")
    lead = leads[0]
    if approvals and approvals[0]["Consumed_At__c"] is not None:
        return "consumed_value_observed" if lead.get(field) == payload["New_Value__c"] else "consumed_value_changed"
    if reconcile_only:
        return "pending_approval" if approvals else "not_issued"
    if lead.get(field) == payload["New_Value__c"]:
        return "noop_unconsumed"
    if stamp(lead["SystemModstamp"]) != stamp(payload["Expected_Version__c"]):
        return "stale_requires_new_signed_intent"
    if stamp(payload["Expires_At__c"]) <= datetime.now(timezone.utc):
        return "expired_requires_new_signed_intent"
    if not approvals:
        status, _ = sandbox.request("POST", "sobjects/Arkhe_Write_Approval__c", payload)
        # A timeout raises and leaves the journal pending; a retry queries before POST.
        if status != 201:
            # Includes racing duplicate insertion. Never assume an HTTP error means no commit.
            return deliver(sandbox, payload, reconcile_only=True)
    status, _ = sandbox.request("PATCH", f"sobjects/Lead/{lead_id}", {field: payload["New_Value__c"]})
    # Persisted state, rather than 204 alone, decides the result.
    result = deliver(sandbox, payload, reconcile_only=True)
    if result == "pending_approval" and status != 204:
        return "write_rejected_pending_approval"
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", required=True)
    parser.add_argument("--intent", required=True, type=Path)
    parser.add_argument("--policy", required=True, type=Path)
    parser.add_argument("--bridge-bin", required=True, type=Path)
    parser.add_argument("--journal", required=True, type=Path, help="Private persistent SQLite journal; never commit")
    parser.add_argument("--reconcile-only", action="store_true")
    args = parser.parse_args()
    sandbox = Sandbox(args.org)
    binary, intent, policy = (p.resolve(strict=True) for p in (args.bridge_bin, args.intent, args.policy))
    rust(binary, intent, policy, sandbox.org_id, historical=True)
    fingerprint = hashlib.sha256(json.dumps(json.loads(intent.read_text(encoding="utf-8")),
        sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    args.journal.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(args.journal, timeout=60) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        db.execute("CREATE TABLE IF NOT EXISTS deliveries (fingerprint TEXT PRIMARY KEY, org TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL)")
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute("SELECT org,payload FROM deliveries WHERE fingerprint=?", (fingerprint,)).fetchone()
        if existing:
            if existing[0] != sandbox.org_id:
                raise RuntimeError("Journal org mismatch")
            payload = json.loads(existing[1])
        else:
            if args.reconcile_only:
                raise RuntimeError("Reconciliation requires the original persistent journal")
            payload = rust(binary, intent, policy, sandbox.org_id)
            db.execute("INSERT INTO deliveries VALUES (?,?,?,?)", (fingerprint, sandbox.org_id, json.dumps(payload), "pending"))
        db.commit()  # Durable intent before the first remote mutation.
        db.execute("BEGIN IMMEDIATE")
        try:
            result = deliver(sandbox, payload, reconcile_only=True)
            if not args.reconcile_only and result in {"pending_approval", "not_issued"}:
                fresh = rust(binary, intent, policy, sandbox.org_id)
                if not same_approval(payload, fresh):
                    raise RuntimeError("Journal payload does not match verified signed intent")
                result = deliver(sandbox, fresh)
            db.execute("UPDATE deliveries SET state=? WHERE fingerprint=?", (result, fingerprint))
            db.commit()
        except Exception:
            db.rollback()  # Committed pending record survives ambiguous transport failures.
            raise
    print(json.dumps({"fingerprint": fingerprint, "state": result, "sandbox_org_id": sandbox.org_id}))
    return 0 if result in {"consumed_value_observed", "noop_unconsumed"} else 2


if __name__ == "__main__":
    raise SystemExit(main())
