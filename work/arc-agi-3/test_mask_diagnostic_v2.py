import json
from pathlib import Path
import tempfile
import unittest
import mask_diagnostic as base
from mask_diagnostic_v2 import read_jsonl,grouped_folds,paired_bootstrap,selftest

class Tests(unittest.TestCase):
    def test_fixed_target_catches_error_hidden_by_learned_intersection(self):
        r=selftest(20)
        self.assertEqual(r['status'],'PASS')
        full=r['positive_control']['pooled_fixed_target_results']['full']['mode']['masks']['border2']
        self.assertEqual(full['counts_and_points']['correct'],0)
        bad=r['negative_control']['pooled_fixed_target_results']['fixed_core']['mode']['masks']['border2']
        self.assertGreater(bad['counts_and_points']['error_on_issued'],0)
        self.assertFalse(r['negative_control']['learned_intersection_pooled'])

    def test_oof_groups_appear_once_and_never_in_their_training_fold(self):
        units=[{'episode':e,'level':0,'transitions':[]} for e in range(5)]
        folds=grouped_folds(units,'episode',5,.5,0);all_test=[]
        for _,_,info in folds:
            self.assertFalse(set(info['train_groups'])&set(info['test_groups']))
            all_test+=info['test_groups']
        self.assertEqual(len(set(all_test)),5);self.assertEqual(len(all_test),5)

    def test_files_namespace_episode_ids_and_validate_missing_outcome_shape(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);frame=[[0]*64 for _ in range(64)]
            row={'game':'g','episode':'named','level':0,'t':0,'action':{'id':6,'x':1,'y':2},'frame':frame,'next_frame':frame}
            for name in ('a.jsonl','b.jsonl'):(root/name).write_text(json.dumps(row)+'\n')
            groups,_,_=read_jsonl(root);self.assertEqual(len(groups['g','unspecified']),2)
            with self.assertRaises(ValueError):read_jsonl(root,True)
            (root/'b.jsonl').write_text(json.dumps({**row,'next_frame':[[0]]})+'\n')
            with self.assertRaises(ValueError):read_jsonl(root)

    def test_mixed_explicit_and_inferred_outcomes_do_not_bridge_gaps(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'data.jsonl';frame=[[0]*64 for _ in range(64)]
            template={'game':'g','episode':0,'level':0,'action':1,'frame':frame}
            rows=[{**template,'t':0},{**template,'t':1,'next_frame':frame},{**template,'t':3}]
            p.write_text('\n'.join(json.dumps(r) for r in rows))
            groups,stats,_=read_jsonl(p)
            self.assertEqual(stats['transitions'],2)
            self.assertEqual(stats['omitted_no_consecutive_successor'],1)

    def test_bootstrap_is_paired_and_reports_undefined_errors(self):
        tallies={'none':{'a':[10,0,0],'b':[10,0,0]},'border2':{'a':[10,10,10],'b':[10,10,10]}}
        r=paired_bootstrap(tallies,30,0)
        self.assertEqual(r['paired_contrasts']['border2']['delta_correct_coverage'],1)
        self.assertEqual(r['masks']['none']['descriptive_intervals']['error_on_issued']['defined_bootstrap_draws'],0)
        with self.assertRaises(ValueError):paired_bootstrap({'none':{'a':[1,1,1]},'border2':{'b':[1,1,1]}},10,0)

if __name__=='__main__':unittest.main()
