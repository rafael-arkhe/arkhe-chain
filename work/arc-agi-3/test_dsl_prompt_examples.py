import unittest,json
from dsl_prompt_examples import examples,augment
from dsl_proposal_loop import parse_response

class PromptExampleTests(unittest.TestCase):
    def test_examples_pass_strict_parser(self):
        for e in examples():parse_response(json.dumps({'uses_memory':e['uses_memory'],'ast':e['ast']}))
    def test_augmentation_preserves_evidence(self):
        evidence={'training_episodes':[[['before',{'kind':'NOOP'},'after']]],'previous_training_feedback':[]}
        result=json.loads(augment(json.dumps(evidence)))
        self.assertEqual(result['training_episodes'],evidence['training_episodes'])
        self.assertEqual(result['previous_training_feedback'],[])
        self.assertEqual(len(result['additional_syntax_examples']),3)
