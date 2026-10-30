import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
import mask_diagnostic_v5 as m

class V5Tests(unittest.TestCase):
    def units(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'s.jsonl'
            p.write_text('\n'.join(json.dumps(r) for r in m.synth_rows('hud','hud_episode')),encoding='utf-8')
            return m.load(p)['hud']
    def test_selftest(self):
        with contextlib.redirect_stdout(io.StringIO()):m.selftest()
    def test_fold_counts_reconcile(self):
        units=self.units(); report=m.run_kfold(units,'episode',2,20)
        for mask in report['masks'].values():
            for v in m.VARIANTS:
                for target in m.TARGETS:
                    folds=mask['test_per_fold']
                    for key in m.CNT:
                        self.assertEqual(sum(f[v][target]['counts'][key] for f in folds),mask['test'][v][target]['counts'][key])
                    self.assertTrue(all(f[v][target]['n_groups']==2 for f in folds))
    def test_single_degenerate_display(self):
        rep=m.run_single(self.units(),'episode',.5,5)
        rep['masks']['none']['degenerate']=True
        s=io.StringIO()
        with contextlib.redirect_stdout(s):m.show('hud',rep)
        self.assertIn('none*',s.getvalue())
