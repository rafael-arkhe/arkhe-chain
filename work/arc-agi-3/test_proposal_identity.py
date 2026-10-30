import unittest
import finite_grid_dsl_types as d
from audit_proposal_identity import measure, controls


class IdentityAuditTests(unittest.TestCase):
    def test_identity_separates_required_change_and_blocked(self):
        p={'uses_memory':False,'ast':d.node('pair',d.var('g'),d.var('s'))}
        m=measure(p,controls()['move'])
        self.assertTrue(m['grid_identity_on_all_examined_inputs'])
        self.assertEqual(m['missed_required_changes'],1)
        self.assertEqual(m['stationary_targets_correct'],1)

    def test_empty_is_not_identity_evidence(self):
        self.assertFalse(measure({},[])['grid_identity_on_all_examined_inputs'])
