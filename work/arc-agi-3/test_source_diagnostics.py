import unittest
from source_diagnostics import diagnose


class DiagnosticTests(unittest.TestCase):
    def test_collects_later_blockers_without_executing(self):
        source='def step(g,a,s):\n x=g[0]\n while True:\n  pass\n return g.__class__,s'
        r=diagnose(source)
        self.assertTrue(r['syntax_parseable'])
        self.assertGreaterEqual(len(r['known_blockers']),3)
        self.assertEqual({x['line'] for x in r['known_blockers']},{2,3,4,5})

    def test_candidate_sugar_not_certified_by_inventory(self):
        source='def step(g,a,s):\n return g[1][2],s'
        self.assertEqual(len(diagnose(source)['observed_sugar']),1)
        self.assertEqual(len(diagnose(source,sugar=False)['known_blockers']),1)

    def test_syntax_error_has_location_without_invented_inventory(self):
        r=diagnose('def step(:')
        self.assertFalse(r['syntax_parseable'])
        self.assertEqual(r['parse_error_location']['line'],1)
        self.assertEqual(r['known_blockers'],[])
