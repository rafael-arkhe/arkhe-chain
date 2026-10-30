"""Failure-oriented delivery/reconciliation tests, using an in-memory REST double."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest
from deliver_write import deliver


class Org:
    def __init__(self):
        self.approvals = []
        self.lead = {"Id":"00Q000000000001AAA","SystemModstamp":"2026-10-25T12:00:00.123Z","LeadSource":None}
        self.posts = self.patches = 0
        self.reject = False
        self.lose_post = self.lose_patch = False
    def query(self, query):
        return deepcopy(self.approvals if "FROM Arkhe_Write_Approval__c" in query else [self.lead])
    def request(self, method, resource, payload):
        if method == "POST":
            self.posts += 1
            self.approvals = [dict(payload,Id="a00000000000001AAA",Consumed_At__c=None)]
            if self.lose_post:
                self.lose_post = False
                raise TimeoutError("response lost after insert")
            return 201, {"id":"a00000000000001AAA"}
        self.patches += 1
        if self.reject:
            return 400, [{"errorCode":"FIELD_CUSTOM_VALIDATION_EXCEPTION"}]
        self.lead.update(payload)
        self.approvals[0]["Consumed_At__c"]="2026-10-25T12:01:00.000Z"
        if self.lose_patch:
            self.lose_patch = False
            raise TimeoutError("response lost after commit")
        return 204,None


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.org = Org()
        self.payload={"Event_Id__c":"evt-1","Org_Id__c":"00D000000000001AAA",
            "Target_Lead__c":self.org.lead["Id"],"Field_API_Name__c":"LeadSource","New_Value__c":"Web",
            "Is_Null__c":False,"Expected_Version__c":self.org.lead["SystemModstamp"],
            "Expires_At__c":(datetime.now(timezone.utc)+timedelta(minutes=3)).isoformat(),
            "Checkpoint_Hash__c":"a"*64,"Request_Hash__c":"b"*64,"Producer_Id__c":"producer"}
    def test_commit_then_retry_never_writes_again(self):
        self.assertEqual(deliver(self.org,self.payload),"consumed_value_observed")
        self.assertEqual(deliver(self.org,self.payload),"consumed_value_observed")
        self.assertEqual((self.org.posts,self.org.patches),(1,1))
    def test_lost_issuance_response_recovers_without_duplicate(self):
        self.org.lose_post=True
        with self.assertRaises(TimeoutError): deliver(self.org,self.payload)
        self.assertEqual(deliver(self.org,self.payload),"consumed_value_observed")
        self.assertEqual(self.org.posts,1)
    def test_lost_commit_response_reconciles_without_second_patch(self):
        self.org.lose_patch=True
        with self.assertRaises(TimeoutError): deliver(self.org,self.payload)
        self.assertEqual(deliver(self.org,self.payload),"consumed_value_observed")
        self.assertEqual(self.org.patches,1)
    def test_consumed_then_changed_value_is_never_reapplied(self):
        deliver(self.org,self.payload)
        self.org.lead["LeadSource"]="Other"
        self.assertEqual(deliver(self.org,self.payload),"consumed_value_changed")
        self.assertEqual(self.org.patches,1)
    def test_event_conflict_fails_without_writing(self):
        self.org.approvals=[dict(self.payload,Id="fixture",Consumed_At__c=None,Producer_Id__c="other")]
        with self.assertRaises(RuntimeError): deliver(self.org,self.payload)
        self.assertEqual((self.org.posts,self.org.patches),(0,0))
    def test_stale_version_is_not_rebound(self):
        self.org.lead["SystemModstamp"]="2026-10-25T12:00:01.123Z"
        self.assertEqual(deliver(self.org,self.payload),"stale_requires_new_signed_intent")
        self.assertEqual(self.org.posts,0)
    def test_expired_does_not_issue(self):
        self.payload["Expires_At__c"]="2000-01-01T00:00:00.000Z"
        self.assertEqual(deliver(self.org,self.payload),"expired_requires_new_signed_intent")
        self.assertEqual(self.org.posts,0)
    def test_noop_does_not_claim_consumption(self):
        self.org.lead["LeadSource"]="Web"
        self.assertEqual(deliver(self.org,self.payload),"noop_unconsumed")
        self.assertEqual(self.org.posts,0)
    def test_rejected_write_keeps_approval_for_reconciliation(self):
        self.org.reject=True
        self.assertEqual(deliver(self.org,self.payload),"write_rejected_pending_approval")
        self.assertIsNone(self.org.approvals[0]["Consumed_At__c"])
    def test_reconciliation_is_read_only(self):
        self.assertEqual(deliver(self.org,self.payload,True),"not_issued")
        self.assertEqual((self.org.posts,self.org.patches),(0,0))


if __name__ == "__main__": unittest.main()
