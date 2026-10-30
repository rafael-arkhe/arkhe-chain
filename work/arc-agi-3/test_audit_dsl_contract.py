import unittest
from audit_dsl_contract import audit

class DSLContractTests(unittest.TestCase):
    def test_click_exceeds_stated_ast_budget(self):
        r=audit();self.assertEqual(r['ast_nodes_counting_operators_variables_literals'],16)
        self.assertGreater(r['ast_nodes_counting_operators_variables_literals'],r['declared_max_nodes'])
    def test_counts_exceed_int_domain(self):
        r=audit();self.assertEqual(r['grid_count_all_zero_grid'],4096)
        self.assertEqual(r['list_len_nonbackground_checkerboard_objects'],2048)
