import unittest
from invariant_evidence_checker import check

class InvariantEvidenceTests(unittest.TestCase):
    def row(self):
        return {'trace':'synthetic','training_gate':{'status':'FAIL','queries':10,'issued':0,'correct':0,'conflicts':0},'test':{'all':{'joint_rank':{'queries':10,'issued':0}}}}
    def test_missing_oracle_is_not_pass(self):
        r=check(self.row())
        self.assertEqual(r['checks']['I1']['status'],'NOT_IDENTIFIABLE')
        self.assertEqual(r['checks']['I4']['status'],'FAIL')
        self.assertEqual(r['ratification'],'NOT_ADMITTED')
    def test_training_pass_not_automatic_ratification(self):
        x=self.row();x['training_gate'].update(status='PASS',issued=10,correct=10)
        r=check(x);self.assertEqual(r['ratification'],'NOT_ADMITTED')
        self.assertFalse(r['runtime_authorization_performed'])
        self.assertEqual(r['checks']['I10']['status'],'RATIFICATION_POLICY_NOT_INTEGRATED')
