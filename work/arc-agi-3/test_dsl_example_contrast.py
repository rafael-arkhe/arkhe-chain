import json, unittest
from dsl_example_contrast import demonstrations, request
from audit_proposal_identity import controls
from dsl_prompt_examples import augment
from dsl_proposal_loop import make_request, training_check, digest


class ExampleTests(unittest.TestCase):
    def test_demo_rules_do_not_solve_target_controls(self):
        demos=demonstrations()
        self.assertEqual([d['identity_correct'] for d in demos],[False,True,False])
        for demo in demos:
            name='click' if demo['name'].startswith('click') else 'move'
            self.assertEqual(training_check(demo['proposal'],controls()[name])['status'],'REPLAY_FAIL')
        target_pairs={digest((b,a)) for eps in controls().values() for ep in eps for b,a,_ in ep}
        self.assertTrue(all(digest((d['before'],d['action'])) not in target_pairs for d in demos))

    def test_baseline_exact_and_contrast_preserves_evidence(self):
        episodes=controls()['move']
        self.assertEqual(request('E0',episodes),augment(make_request(episodes,[])))
        one=json.loads(request('E1',episodes));two=json.loads(request('E2',episodes))
        self.assertEqual(one['training_episodes'],two['training_episodes'])
        self.assertEqual(one['previous_training_feedback'],[])
        for a,b in zip(one['additional_syntax_examples'],two['additional_syntax_examples']):
            extra=b.pop('contrast');self.assertEqual(a,b)
            self.assertEqual(extra['provided_program_exact'],True)
