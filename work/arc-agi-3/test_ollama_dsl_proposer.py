import unittest,json
from ollama_dsl_proposer import pack_grid,unpack_grid,compress_request
from dsl_proposal_loop import make_request

class OllamaAdapterTests(unittest.TestCase):
    def test_lossless_sparse(self):
        g=[[0]*64 for _ in range(64)];g[9][12]=5;g[0][0]=15
        self.assertEqual(unpack_grid(pack_grid(g)),g)
    def test_request_no_solution_or_holdout(self):
        g=[[0]*64 for _ in range(64)];a=[r[:] for r in g];a[3][2]=5
        data=json.loads(compress_request(make_request([[(g,{'kind':'CLICK','x':2,'y':3},a)]],[])))
        self.assertEqual(data['syntax_only_example']['ast']['op'],'pair')
        self.assertNotIn('holdout',data)
        self.assertEqual(unpack_grid(data['training_episodes'][0][0][2]),a)
