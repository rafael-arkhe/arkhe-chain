import unittest
from audit_scene_context_redundancy import audit,descriptors,board

class ContextRedundancyTests(unittest.TestCase):
    def test_partitions_identical(self):self.assertEqual(audit()['status'],'EXACT_SCENE_PARTITIONS_IDENTICAL')
    def test_absolute_position_prevents_new_position_key_reuse(self):
        for a,b in zip(descriptors(board(),{'id':4}),descriptors(board(1),{'id':4})):
            self.assertNotEqual(a,b)
