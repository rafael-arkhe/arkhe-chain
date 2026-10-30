import json,tempfile,unittest
from pathlib import Path
from micro_evaluation_evidence import produce,verify,digest


class EvidenceTests(unittest.TestCase):
    def test_prospective_trace_replays_and_commits_before_outcome(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'run';produce(root);r=verify(root)
            self.assertEqual(r['events'],206)
            self.assertEqual(r['metrics_frozen_suffix']['queries'],80)
            self.assertEqual(r['authentication'],'NOT_ESTABLISHED')

    def test_mutation_and_truncation_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'run';produce(root)
            original=(root/'events.jsonl').read_bytes()
            (root/'events.jsonl').write_bytes(original[:-100])
            with self.assertRaisesRegex(ValueError,'LOG_DIGEST'):verify(root)
            (root/'events.jsonl').write_bytes(original)
            rows=[json.loads(x) for x in original.decode().splitlines()]
            rows[2]['payload']['action']='UNAVAILABLE'
            modified='\n'.join(json.dumps(x) for x in rows)+'\n';(root/'events.jsonl').write_text(modified,encoding='utf-8')
            import hashlib
            checkpoint=json.loads((root/'checkpoint.json').read_text());checkpoint['log_sha256']=hashlib.sha256((root/'events.jsonl').read_bytes()).hexdigest()
            (root/'checkpoint.json').write_text(json.dumps(checkpoint))
            with self.assertRaisesRegex(ValueError,'EVENT_CHAIN'):verify(root)

    def test_fake_signed_label_not_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'run';produce(root)
            checkpoint=json.loads((root/'checkpoint.json').read_text());checkpoint['signed']=True
            (root/'checkpoint.json').write_text(json.dumps(checkpoint))
            with self.assertRaisesRegex(ValueError,'UNSUPPORTED_TRUST_CLAIM'):verify(root)
