import unittest
from run_r3_symmetric import SYMMETRIC, filter_transition, fixed_replay
from run_r2_extended import HYPOTHESES, VARIANTS
from hidden_mechanics_micro import render, advance


class R3SymmetricTests(unittest.TestCase):
    def test_cardinality_and_fixed_jump(self):
        family = tuple(SYMMETRIC.values())
        self.assertEqual(len(family), 600)
        self.assertEqual(len(set(family)), 600)
        self.assertTrue(set(HYPOTHESES.values()).issubset(family))
        base = [[0]*8 for _ in range(8)]
        before = render(base, (3,3)); after = render(base, (1,3))
        self.assertEqual(len(filter_transition(family, base, before, 'ACTION1', after)), 24)
        self.assertEqual(len(filter_transition(HYPOTHESES.values(), base, before, 'ACTION1', after)), 1)

    def test_fixed_replay_does_not_select_actions(self):
        base = [[0]*8 for _ in range(8)]
        pos = (3,3); truth = VARIANTS[0]; transitions=[]
        for action in ('ACTION1','ACTION2','ACTION3','ACTION4','ACTION5'):
            before=render(base,pos); pos=advance(base,pos,truth[int(action[-1])-1])
            transitions.append({'before':before,'action':action,'after':render(base,pos)})
        small=fixed_replay({'fixture':transitions},HYPOTHESES)[0]
        large=fixed_replay({'fixture':transitions},SYMMETRIC)[0]
        self.assertEqual(small['first_jump']['h0_compatible'],1)
        self.assertEqual(large['first_jump']['h0_compatible'],24)
        self.assertEqual(small['remaining'],1); self.assertEqual(large['remaining'],1)
