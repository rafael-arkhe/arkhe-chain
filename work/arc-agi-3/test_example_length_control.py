import json,unittest
from audit_proposal_identity import controls
from dsl_example_length_control import prompt,generic_demos
from dsl_example_contrast import request
from ollama_dsl_proposer import compress_request


class LengthTests(unittest.TestCase):
    def test_bytes_and_count_match_not_token_claim(self):
        for episodes in controls().values():
            text=prompt(episodes);e1=compress_request(request('E1',episodes))
            self.assertEqual(len(text.encode()),len(e1.encode()))
            value=json.loads(text)
            self.assertEqual(len(value['additional_syntax_examples']),3)
            self.assertEqual(value['training_episodes'],json.loads(e1)['training_episodes'])
            self.assertEqual(value['previous_training_feedback'],[])

    def test_generic_outcomes_computed_not_reused(self):
        demos=generic_demos()
        self.assertTrue(all(d['before']==d['target'] for d in demos))
