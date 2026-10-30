import tempfile
import unittest
from pathlib import Path
from persistent_goal_pilot import GoalLearner, run


class GoalPilotTests(unittest.TestCase):
    def test_feedback_and_ambiguity(self):
        learner = GoalLearner()
        self.assertEqual(learner.predict_reward(3), .5)
        learner.update(0, 0)
        self.assertEqual(learner.possible, {3, 4})
        learner.update(3, 0)
        self.assertEqual(learner.possible, {4})
        self.assertEqual(learner.choose(), 4)
        self.assertEqual(learner.predict_reward(4), 1)

    def test_paired_goal_tasks(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = run(Path(tmp) / 'run', rule_ids=(0, 1), episodes=10)
            self.assertEqual(report['adaptive']['successes'], 19)
            self.assertEqual(report['adaptive']['singleton_episodes'], [1, 1])
            self.assertEqual(report['adaptive']['final_five_all_success_tasks'], 2)
            self.assertEqual(report['frozen']['successes'], 10)
            self.assertEqual(report['oracle']['successes'], 20)
            from verify_persistent_goal import verify
            self.assertEqual(verify(Path(tmp) / 'run')['episodes'], 60)
