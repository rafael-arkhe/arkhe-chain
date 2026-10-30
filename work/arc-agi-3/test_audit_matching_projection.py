import unittest
from audit_matching_projection import counterexample

class MatchingProjectionAuditTests(unittest.TestCase):
    def test_projection_creates_spurious_assignments(self):
        r=counterexample()
        self.assertTrue(any(x['deltas']==(6,6) and x['target']==[11,16] for x in r['spurious_joint_assignments']))
    def test_swap_identity_is_not_render_ambiguity(self):
        r=counterexample()['identity_swap']
        self.assertEqual(len(r['matching_vectors']),2)
        self.assertEqual(len(r['rendered_position_sets']),1)
