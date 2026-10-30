import unittest
from contrastive_triage import evidence_state

class ContrastiveTests(unittest.TestCase):
    def test_equal_differences_do_not_erase_conflict_and_absence(self):
        conflict = evidence_state(0.9, 0.9)
        absent = evidence_state(0.1, 0.1)
        self.assertEqual(conflict[1], absent[1])
        self.assertEqual(conflict[0], 'CONFLICTING_EVIDENCE')
        self.assertEqual(absent[0], 'INSUFFICIENT_EVIDENCE')

    def test_negative_difference_is_distinct_from_support(self):
        self.assertEqual(evidence_state(0.05, 0.95)[0], 'CONTRADICTION_SIGNAL')
        self.assertEqual(evidence_state(0.95, 0.05)[0], 'SUPPORT_SIGNAL')

if __name__ == '__main__': unittest.main()
