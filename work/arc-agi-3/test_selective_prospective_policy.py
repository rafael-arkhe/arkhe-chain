import json
import tempfile
import unittest
from pathlib import Path
from hidden_mechanics_micro import ACTIONS, Episode, render
from policy_contract_controls import Policy, FAMILY
from prospective_policy_step import step
from persistent_goal_pilot import public_map
from micro_evaluation_evidence import Writer


class SelectiveProspectiveTests(unittest.TestCase):
    def test_selective_preserves_noncontradicted_goal(self):
        base = [[0] * 8 for _ in range(8)]
        policy = Policy(reset_mode='selective')
        policy.mechanics = {FAMILY[0]}; policy.goals = {4}
        result = policy.observe(base, (3, 3), ACTIONS[0], render(base, (2, 3)))
        self.assertTrue(result['d1'])
        self.assertTrue(policy.mechanics)
        self.assertEqual(policy.goals, {4})

    def test_goal_only_reset_preserves_mechanics(self):
        base = [[0] * 8 for _ in range(8)]
        policy = Policy(reset_mode='selective')
        policy.mechanics = {FAMILY[0]}; policy.goals = {3}
        result = policy.observe(base, (3, 3), ACTIONS[4], render(base, (3, 3)), 3, 0)
        self.assertTrue(result['d2'])
        self.assertEqual(policy.mechanics, {FAMILY[0]})
        self.assertEqual(policy.goals, {4})

    def test_selective_layout_outside_family_and_empty(self):
        from hidden_mechanics_micro import layout, advance
        policy = Policy(reset_mode='selective'); policy.mechanics = {FAMILY[0]}
        for seed in (1000, 1100):
            base, pos = layout(seed)
            result = policy.observe(base, pos, ACTIONS[0], render(base, advance(base, pos, FAMILY[0][0])))
            self.assertFalse(result['d1'])
        base = [[0] * 8 for _ in range(8)]
        result = policy.observe(base, (3, 3), ACTIONS[0], render(base, (5, 3)))
        self.assertTrue(result['d1']); self.assertFalse(policy.mechanics)
        self.assertFalse(policy.observe(base, (3, 3), ACTIONS[0], render(base, (5, 3)))['d1'])

    def test_information_action_and_flag(self):
        base = [[0] * 8 for _ in range(8)]
        old = ((-1, 0), (0, -1), (1, 0), (0, 1), (0, 0))
        new = ((0, -1), (-1, 0), (1, 0), (0, 1), (0, 0))
        policy = Policy(reset_mode='selective'); policy.mechanics = {old, new}
        action = policy.choose_discriminative(base, (1, 0))
        self.assertIn(action, ACTIONS[:2])
        # Before a discriminating observation, the blocked corner preserves both.
        self.assertFalse(policy.observe(base, (0, 0), ACTIONS[0], render(base, (0, 0)))['d1'])
        policy.goals = {3}
        result = policy.observe(base, (0, 0), ACTIONS[0], render(base, (0, 0)), changed=True)
        self.assertTrue(result['d3']); self.assertEqual(policy.goals, {3, 4})

    def test_real_step_committed_before_environment_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'events.jsonl'
            env = Episode(0, 1000, 50); before = env.observe(); base, _ = public_map(before)
            actual_step = env.step
            def guarded_step(action):
                # Reopen the file during the environment call: commitment already exists.
                rows = [json.loads(line) for line in path.read_text().splitlines()]
                self.assertEqual(rows[-1]['payload']['event'], 'prediction_committed')
                self.assertEqual(len(rows), 1)
                return actual_step(action)
            env.step = guarded_step
            writer = Writer(path)
            try:
                after, result = step(writer, Policy(reset_mode='selective'), env, base,
                    before, ACTIONS[0], 'test-source-digest', 'fixture', True)
            finally:
                writer.close()
            rows = [json.loads(line) for line in path.read_text().splitlines()]
            self.assertEqual(after['step'], 1)
            self.assertTrue(result['d3'])
            self.assertEqual(rows[1]['payload']['commitment_hash'], rows[0]['hash'])
            self.assertEqual(rows[2]['payload']['commitment_hash'], rows[0]['hash'])
