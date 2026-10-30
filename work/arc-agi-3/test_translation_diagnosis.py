import unittest
from diagnose_translation_probe import controls,frozen_fit,SpriteWorld,inspect_pairs
from object_transition_probe import TranslationModel

class Tests(unittest.TestCase):
    def test_exact_10x10_positive_control_generalizes_to_unseen_positions(self):
        r=controls()['synthetic_10x10_positive_control']
        self.assertEqual(r['new_raw_pairs'],16)
        self.assertEqual(r['train_fit']['exact_reproduction_rate_all_queries'],1)
        self.assertEqual(r['unseen_position_test_fit']['prediction_frequency'],1)
        self.assertEqual(r['unseen_position_test_fit']['conditional_exact_accuracy'],1)

    def test_stable_extraction_can_still_have_conditional_motion(self):
        r=controls()['synthetic_blocking_counterexample']
        self.assertTrue(r['same_signature_on_blocked_step'])
        self.assertEqual(r['train_fit']['counts']['queries'],9)
        self.assertEqual(r['train_fit']['counts']['abstentions'],3)
        self.assertEqual(r['test_fit']['counts']['abstentions'],4)

    def test_no_predictions_means_zero_reproduction_not_zero_error(self):
        world=SpriteWorld(2,2);before=world.frame();after=world.step(4)
        r=frozen_fit(TranslationModel(),[(before,{'id':4},after)])
        self.assertEqual(r['prediction_frequency'],0)
        self.assertEqual(r['exact_reproduction_rate_all_queries'],0)
        self.assertIsNone(r['conditional_exact_accuracy'])

    def test_selected_pair_plot_uses_numeric_positions(self):
        import tempfile,json,gzip,hashlib
        from pathlib import Path
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'frames').mkdir();model=TranslationModel();records=[]
            def persist(grid):
                value={'frame':[grid],'state':'NOT_FINISHED','levels_completed':0,'available_actions':[4]}
                raw=json.dumps(value,sort_keys=True,separators=(',',':')).encode();h=hashlib.sha256(raw).hexdigest()
                rel='frames/'+h+'.json.gz';(root/rel).write_bytes(gzip.compress(raw))
                return {'sha256':h,'relative_path':rel}
            for step,(x,target) in enumerate(((1,2),(2,2),(3,4)),1):
                before=SpriteWorld(x,2).frame();after=SpriteWorld(target,2).frame()
                model.observe(before,{'id':4},after)
                records.append({'step':step,'action':{'id':4},'before_frame':persist(before),'after_frame':persist(after)})
            r=inspect_pairs(root/'synthetic.jsonl',records,model,root)
            self.assertEqual(len(r['pairs']),3)
            self.assertTrue((root/'ls20-pair-inspection.png').exists())

if __name__=='__main__':unittest.main()
