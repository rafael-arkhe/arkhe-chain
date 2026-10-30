import json
import tempfile
import unittest
from pathlib import Path
from run_p0_greedy import run, verify, RULE_IDS, PERMUTATIONS
from hidden_mechanics_micro import RULES


class P0Tests(unittest.TestCase):
    def test_mapping(self):
        self.assertEqual([RULES[i] for i in RULE_IDS], [(p, 3) for p in PERMUTATIONS])

    def test_short_paired_replay_and_tamper(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'run'
            report = run(out, (1, 1, 1), progress=False)
            self.assertTrue(report['carry_behavior_identical'])
            self.assertEqual(verify(out)['actions'], 600)
            path = out / 'C00.jsonl'
            rows = path.read_text().splitlines()
            row = json.loads(rows[1]); row['payload']['agent_seed'] = 42
            rows[1] = json.dumps(row); path.write_text('\n'.join(rows) + '\n')
            with self.assertRaises(ValueError):
                verify(out)
