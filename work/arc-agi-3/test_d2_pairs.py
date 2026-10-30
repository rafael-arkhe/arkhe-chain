import tempfile
import unittest
from pathlib import Path
from policy_contract_controls import Policy
from micro_evaluation_evidence import digest
from run_d2_pairs import pair_action,run,verify


class D2PairsTests(unittest.TestCase):
    def test_pair_novelty_prefers_unseen_action(self):
        policy=Policy(seed=0);grid=[[0]*8 for _ in range(8)]
        seen={digest([grid,a]) for a in ('ACTION1','ACTION2','ACTION3','ACTION4')}
        self.assertEqual(pair_action(policy,grid,seen),'ACTION5')

    def test_paired_trace_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'run';report=run(out)
            self.assertEqual(report['actions'],300)
            for i in range(0,6,2):
                target,pairs=report['results'][i:i+2]
                self.assertEqual(target['first_singleton_step'],pairs['first_singleton_step'])
                self.assertEqual(target['extra_pair_test_actions'],0)
                self.assertTrue(pairs['same_online_passive_all_steps'])
            self.assertEqual(verify(out)['actions'],300)
