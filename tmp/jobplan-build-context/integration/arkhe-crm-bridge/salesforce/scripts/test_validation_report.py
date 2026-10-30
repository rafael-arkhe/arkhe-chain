import unittest
from pathlib import Path
from validation_report import assess


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.project=Path(__file__).resolve().parents[1]
        self.result={"status":0,"result":{"done":True,"success":True,"checkOnly":True,"status":"Succeeded",
            "details":{"runTestResult":{"numTestsRun":12,"numFailures":0,"codeCoverage":[
                {"name":name,"numLocations":100,"numLocationsNotCovered":10} for name in
                ["ArkheWriteGate","ArkheDeliveryQueue","ArkheDeliveryBatch","ArkheDeliverySchedule","ArkheLeadGate","ArkheApprovalGuard"]]}}}}
    def test_complete_report_passes(self):
        self.assertTrue(assess(self.result,self.project)["passed"])
    def test_pending_is_not_success(self):
        self.result["result"]["done"]=False
        self.assertFalse(assess(self.result,self.project)["passed"])
    def test_missing_coverage_fails(self):
        self.result["result"]["details"]["runTestResult"]["codeCoverage"].pop()
        self.assertFalse(assess(self.result,self.project)["passed"])
    def test_low_coverage_fails(self):
        self.result["result"]["details"]["runTestResult"]["codeCoverage"][0]["numLocationsNotCovered"]=26
        self.assertFalse(assess(self.result,self.project)["passed"])
    def test_zero_executed_tests_fails(self):
        self.result["result"]["details"]["runTestResult"]["numTestsRun"]=0
        self.assertFalse(assess(self.result,self.project)["passed"])


if __name__ == "__main__": unittest.main()
