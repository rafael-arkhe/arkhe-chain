import copy,unittest
from hidden_mechanics_micro import Episode,ACTIONS,RULES,FiniteEffectLearner,oracle_plan


class HiddenMicroTests(unittest.TestCase):
    def test_goal_unidentifiable_before_terminal(self):
        one=Episode(0,17,horizon=4);two=Episode(1,17,horizon=4)
        self.assertEqual(RULES[0][0],RULES[1][0]);self.assertNotEqual(RULES[0][1],RULES[1][1])
        self.assertEqual(one.observe(),two.observe())
        for action in ACTIONS[:3]:self.assertEqual(one.step(action),two.step(action))
        self.assertIsNone(one.observe()['reward'])

    def test_oracle_certifies_path_and_reward_only_at_horizon(self):
        for rule in (0,1,137):
            env=Episode(rule,21,horizon=50);plan=oracle_plan(env)
            self.assertEqual(plan['status'],'FOUND')
            for action in plan['actions']:env.step(action)
            self.assertIsNone(env.observe()['reward'])
            stop=ACTIONS[env._deltas.index((0,0))]
            while not env.observe()['done']:env.step(stop)
            self.assertEqual(env.observe()['reward'],1)
            with self.assertRaises(ValueError):env.step(stop)

    def test_action_model_and_freeze(self):
        env=Episode(137,21);learner=FiniteEffectLearner(env.observe())
        for action in ACTIONS*3:
            before=env.observe()['grid'];after=env.step(action)['grid'];learner.update(before,action,after)
        frozen=copy.deepcopy(learner);old=copy.deepcopy(frozen.possible)
        for action in ACTIONS:
            before=env.observe()['grid'];pred=frozen.predict(before,action);after=env.step(action)['grid']
            if pred is not None:self.assertEqual(pred,after)
        self.assertEqual(frozen.possible,old)

    def test_public_interface_has_no_rule_or_goal(self):
        obs=Episode(137,12).observe()
        self.assertEqual(set(obs),{'grid','available_actions','step','done','reward'})
        self.assertEqual((len(obs['grid']),len(obs['grid'][0])),(8,8))
        with self.assertRaises(ValueError):Episode(0,12).step('UNKNOWN')
