import tempfile
import unittest
from pathlib import Path
from run_r1_recovery import WaitController, run, verify


class R1RecoveryTests(unittest.TestCase):
    def test_timer_exact_wait_and_new_anomaly(self):
        timer = WaitController(3); timer.after_observation(True)
        for _ in range(2):
            self.assertFalse(timer.before_action()); timer.after_observation(False)
        timer.after_observation(True)  # incompatible observation restarts full wait
        for _ in range(3):
            self.assertFalse(timer.before_action()); timer.after_observation(False)
        self.assertTrue(timer.before_action())
        forever = WaitController(None); forever.after_observation(True)
        for _ in range(20):
            self.assertFalse(forever.before_action()); forever.after_observation(False)

    def test_paired_recovery_and_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'run'; results = run(out)['results']
            self.assertEqual(results[0]['openings_before_steps'], [])
            for result, opening in zip(results[1:], (15, 17, 22)):
                self.assertEqual(result['openings_before_steps'], [opening])
                self.assertTrue(result['singleton_correct_at_end'])
                self.assertIsNotNone(result['arrival_after_reopening'])
                self.assertEqual(result['post_arrival_stay_ratio'], 1)
                self.assertTrue(all(r['mode'] == 'WAIT_FALLBACK' for r in result['rows'][11:opening-1]))
            self.assertEqual(verify(out)['actions'], 200)
