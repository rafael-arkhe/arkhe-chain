import unittest
from replay_evidence_audit import ModelEvidence

class Tests(unittest.TestCase):
    def test_perfect_training_replay_does_not_confirm_future(self):
        m=ModelEvidence();m.model_replay('old','old');m.future_prediction('old','new',True,True)
        r=m.report();self.assertTrue(r['full_training_model_replay_pass'])
        self.assertEqual(r['future_prediction_error'],1)
        self.assertEqual(r['controlled_environment_replay_count'],0)
        self.assertEqual(r['confirmation_status'],'NO_CAUSAL_CONFIRMATION_FROM_MODEL_REPLAY')

    def test_abstention_does_not_pass_full_replay_or_create_zero_error(self):
        m=ModelEvidence();m.model_replay(None,'state');m.future_prediction(None,'state',True,True)
        r=m.report();self.assertFalse(r['full_training_model_replay_pass'])
        self.assertIsNone(r['future_prediction_error'])

    def test_future_counters_count_events_not_unique_pairs(self):
        m=ModelEvidence()
        m.future_prediction('a','a',True,False);m.future_prediction('a','b',True,False)
        r=m.report();self.assertEqual(r['frozen_future']['issued'],2)
        self.assertEqual(r['future_prediction_error'],0.5)
        self.assertEqual(r['frozen_future']['unseen_abstract_issued'],0)

if __name__=='__main__':unittest.main()
