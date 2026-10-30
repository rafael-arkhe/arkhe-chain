import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]))
from citation_semantic_diagnostic import cases, LABELS, score_predictions, score_files, run


class SemanticDiagnosticTests(unittest.TestCase):
    def test_balanced_cases_and_no_labels_in_inputs(self):
        data = cases()
        self.assertEqual(len(data),36)
        self.assertEqual(len({r['id'] for r in data}),36)
        for label in LABELS:self.assertEqual(sum(r['label']==label for r in data),12)
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'run'; report=run(out)
            self.assertTrue(all(set(r)=={'id','evidence','claim'} for r in json.loads((out/'inputs.json').read_text())))
            self.assertFalse(report['semantic_model_evaluated'])
            self.assertGreater(report['contradiction_acceptance_rate'],0)

    def test_itt_missing_abstain_and_confusion(self):
        gold=[{'id':'a','label':'SUPPORTED'},{'id':'b','label':'CONTRADICTED'},
              {'id':'c','label':'INSUFFICIENT'}]
        result=score_predictions(gold,[{'id':'a','label':'SUPPORTED'},{'id':'b','label':'ABSTAIN'}])
        self.assertEqual(result['accuracy_itt'],1/3)
        self.assertEqual(result['coverage'],1/3)
        self.assertEqual(result['missing'],1)
        self.assertEqual(result['confusion']['CONTRADICTED']['ABSTAIN'],1)
        self.assertEqual(result['confusion']['INSUFFICIENT']['MISSING'],1)

    def test_reject_duplicate_unknown_and_nonsemantic_labels(self):
        gold=[{'id':'a','label':'SUPPORTED'}]
        for predictions in ([{'id':'a','label':'SUPPORTED'}]*2,
                            [{'id':'z','label':'SUPPORTED'}],
                            [{'id':'a','label':'PASS_LEXICAL'}]):
            with self.assertRaises(ValueError):score_predictions(gold,predictions)

    def test_dataset_tampering_rejected_before_scoring(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'run';run(out)
            predictions=Path(tmp)/'predictions.json';predictions.write_text('[]')
            (out/'gold.json').write_text('[]')
            with self.assertRaisesRegex(ValueError,'DATASET_DIGEST_MISMATCH'):
                score_files(out,predictions,Path(tmp)/'score.json')
