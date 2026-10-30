import unittest
from temperature_scale import fit_temperature, probabilities, nll

class TemperatureTests(unittest.TestCase):
    def test_scaling_preserves_class_order_and_normalization(self):
        for t in [0.2, 1, 5]:
            p = probabilities([2, -1, 0], t)
            self.assertAlmostEqual(sum(p), 1)
            self.assertGreater(p[0], p[2]); self.assertGreater(p[2], p[1])

    def test_overconfident_errors_can_be_softened_without_holdout(self):
        rows = [{'logits': [8, 0, 0], 'gold_label': label} for label in ['contradiction', 'neutral', 'entailment']]
        t = fit_temperature(rows)
        self.assertGreater(t, 1)
        self.assertLess(nll(rows, t), nll(rows, 1))

    def test_invalid_temperature_is_rejected(self):
        for t in [0, -1, float('inf'), float('nan')]:
            with self.assertRaises(ValueError): probabilities([1, 0, 0], t)

if __name__ == '__main__': unittest.main()
