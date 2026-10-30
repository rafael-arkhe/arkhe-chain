import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from triage_statistics import binary_agreement, flip_rate, wilson, repetition_summary


class StatisticsTests(unittest.TestCase):
    def test_zero_denominator_and_boundary_intervals(self):
        self.assertIsNone(wilson(0, 0))
        low, high = wilson(0, 10)
        self.assertAlmostEqual(low, 0)
        self.assertAlmostEqual(high, 0.2775328, places=6)
        other = wilson(10, 10)
        self.assertAlmostEqual(other[0], 1-high)
        self.assertAlmostEqual(other[1], 1)

    def test_small_negative_sample_is_uncertain(self):
        low, high = wilson(1, 8)
        self.assertAlmostEqual(low, 0.02241749145)
        self.assertAlmostEqual(high, 0.47088818221)

    def test_agreement_adjusted_for_chance(self):
        truth = [True, True, False, False]
        self.assertEqual(binary_agreement(truth, truth)['cohens_kappa'], 1)
        self.assertEqual(binary_agreement(truth, [True, False, True, False])['cohens_kappa'], 0)
        self.assertIsNone(binary_agreement([True], [True])['cohens_kappa'])

    def test_flip_rate_is_per_case_not_per_transition(self):
        self.assertEqual(flip_rate([[True, False], [False, False], [True, False]]), 0.5)
        self.assertEqual(flip_rate([[True], [True], [True]]), 0)

    def test_invalid_repetitions_are_not_negative_predictions(self):
        for data in ([[True]], [[True], [None]], [[True], [True, False]]):
            with self.assertRaises(ValueError):
                flip_rate(data)

    def test_five_repetitions_with_missing_and_changing_cases(self):
        rows = [[True, False, None], [False, False, True], [True, False, True],
                [True, False, True], [True, False, True]]
        summary = repetition_summary([True, False, True], rows)
        self.assertEqual(summary['complete_cases'], 2)
        self.assertEqual(summary['incomplete_cases'], 1)
        self.assertEqual(summary['flip_rate_complete'], 0.5)
        self.assertEqual(summary['missing_case_sensitivity_bounds_not_ci'], [1/3, 2/3])
        self.assertEqual(summary['per_repetition'][0]['ERROR'], 1)
        self.assertEqual(summary['per_repetition'][0]['FN'], 0)
        self.assertGreater(summary['descriptive_dispersion']['recall']['sample_variance'], 0)

    def test_no_complete_cases_is_undefined_not_zero_flip(self):
        summary = repetition_summary([True], [[None]]*5)
        self.assertIsNone(summary['flip_rate_complete'])
        self.assertIsNone(summary['flip_rate_wilson_95_descriptive'])
        self.assertIsNone(summary['descriptive_dispersion']['precision']['mean'])
        self.assertEqual(summary['missing_case_sensitivity_bounds_not_ci'], [0,1])

    def test_wilson_rejects_invalid_counts(self):
        for counts in [(-1,5), (6,5), (1,-1), (True,5)]:
            with self.assertRaises(ValueError):
                wilson(*counts)


if __name__ == '__main__':
    unittest.main()
