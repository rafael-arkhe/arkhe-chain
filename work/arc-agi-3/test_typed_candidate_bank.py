import unittest,json
from typed_candidate_bank import bank,CandidateBankProposer
from dsl_proposal_loop import canonical,make_request,training_check,parse_response
from audit_proposal_identity import controls


class BankTests(unittest.TestCase):
    def test_typed_bank_covers_controls_and_retains_scope_limits(self):
        rows=bank();self.assertEqual(len(rows),14)
        self.assertEqual(len({x['candidate_id'] for x in rows}),14)
        for name,episodes in controls().items():
            winners=[x for x in rows if training_check(x['proposal'],episodes)['status']=='REPLAY_PASS']
            self.assertEqual(len(winners),1)
        self.assertIn('ignores action',rows[-1]['description'])

    def test_selection_cannot_inject_new_ast_or_unknown_id(self):
        b=CandidateBankProposer(lambda request:'{"candidate_id":"H00"}')
        p=parse_response(b(make_request(controls()['click'],[])))
        self.assertEqual(p,bank()[0]['proposal'])
        bad=CandidateBankProposer(lambda request:'{"candidate_id":"unknown"}')
        with self.assertRaises(ValueError):parse_response(bad(make_request(controls()['click'],[])))
        self.assertEqual(bad.journal[0]['status'],'SELECTION_REJECTED')
