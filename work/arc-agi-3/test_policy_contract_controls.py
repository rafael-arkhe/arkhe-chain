import unittest
from hidden_mechanics_micro import ACTIONS, layout, render, advance
from policy_contract_controls import Policy, FAMILY, associate


class PolicyContractTests(unittest.TestCase):
    def test_t1_new_layout_same_mechanics(self):
        learner = Policy(); learner.mechanics = {FAMILY[0]}
        for seed in (1000, 1100):
            base, pos = layout(seed)
            learner.start_episode()
            after = render(base, advance(base, pos, FAMILY[0][0]))
            result = learner.observe(base, pos, ACTIONS[0], after)
            self.assertFalse(result['d1'])
            self.assertEqual(learner.mechanics, {FAMILY[0]})

    def test_t2_nondiscriminating_then_discriminating(self):
        # At the top-left corner, left and up are indistinguishable blocked moves.
        base = [[0] * 8 for _ in range(8)]
        old = ((-1, 0), (0, -1), (1, 0), (0, 1), (0, 0))
        new = ((0, -1), (-1, 0), (1, 0), (0, 1), (0, 0))
        learner = Policy(); learner.mechanics = {old}
        result = learner.observe(base, (0, 0), ACTIONS[0], render(base, (0, 0)))
        self.assertFalse(result['d1'])
        after = render(base, advance(base, (1, 0), new[0]))
        result = learner.observe(base, (1, 0), ACTIONS[0], after)
        self.assertTrue(result['d1'])
        self.assertIn(new, learner.mechanics)

    def test_t3_reset_carry_and_outside_family(self):
        base = [[0] * 8 for _ in range(8)]; pos = (3, 3)
        old = FAMILY[0]; after = render(base, (2, 3))
        for reset in (False, True):
            learner = Policy(reset=reset); learner.mechanics = {old}
            result = learner.observe(base, pos, ACTIONS[0], after)
            self.assertTrue(result['d1'])
            self.assertEqual(bool(learner.mechanics), reset)
            if not reset:
                self.assertIsNone(learner.predict(base, pos, ACTIONS[0]))
                actions = [learner.fallback() for _ in range(5)]
                self.assertEqual(set(actions), set(ACTIONS))
                self.assertFalse(learner.observe(base, pos, ACTIONS[0], after)['d1'])
            learner.mechanics = {old}
            result = learner.observe(base, pos, ACTIONS[0], render(base, (5, 3)))
            self.assertTrue(result['d1'])
            self.assertFalse(learner.mechanics)

    def test_goal_contradiction_and_absent_reward(self):
        base = [[0] * 8 for _ in range(8)]; pos = (3, 3)
        learner = Policy(); learner.goals = {3}
        after = render(base, pos)
        self.assertFalse(learner.observe(base, pos, ACTIONS[4], after, reward=None)['d2'])
        self.assertFalse(learner.observe(base, pos, ACTIONS[4], after, marker=0, reward=0)['d2'])
        result = learner.observe(base, pos, ACTIONS[4], after, marker=3, reward=0)
        self.assertTrue(result['d2'])
        self.assertEqual(learner.goals, {4})

    def test_carry_signal_invariance(self):
        base = [[0] * 8 for _ in range(8)]; pos = (3, 3)
        learners = [Policy(reset=False, seed=42), Policy(reset=False, seed=42)]
        records = []
        for learner, signal in zip(learners, (False, True)):
            learner.mechanics = set()
            rows = []
            for _ in range(20):
                action = learner.fallback()
                rows.append((action, learner.observe(base, pos, action, render(base, pos), changed=signal)))
            records.append(rows)
        self.assertEqual(records[0], records[1])

    def test_alarm_matching_is_causal(self):
        result = associate([10, 30], [9, 12, 13, 40], 5)
        self.assertEqual(result, {'delays': {10: 2}, 'duplicates': [13],
                                 'false_alarms': [9, 40], 'missed_changes': [30]})
