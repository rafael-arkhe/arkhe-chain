"""In-memory validation stubs only; no reviewer annotation is materialized."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

import jsonschema

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'scripts'))
from validate_provenance_annotations import validate_annotation


class MechanicalAnnotationValidation(unittest.TestCase):
    def setUp(self):
        packet_root = Path(__file__).parent
        packet = json.loads((packet_root/'tasks.json').read_text(encoding='utf-8'))
        self.task = next(t for t in packet['tasks'] if any('serviço' in (packet_root/('sources/'+s+'.txt')).read_text(encoding='utf-8') for s in t['source_ids']))
        self.sources = {s: (packet_root/('sources/'+s+'.txt')).read_bytes() for s in self.task['source_ids']}
        schema = json.loads((ROOT/'schemas/provenance-broker/annotation-v1.schema.json').read_text(encoding='utf-8'))
        self.validator = jsonschema.Draft202012Validator(schema)
        self.a = {'protocol_id': 'arkhe-annotation-v1', 'annotation_id': 'synthetic-test-only',
            'task_id': self.task['task_id'], 'annotator_id': 'test-stub-not-human', 'round_id': 'test',
            'phase': 'Calibration', 'status': 'Draft', 'model_output_exposure': 'Unknown',
            'spans': [], 'events': [], 'relations': [], 'ambiguities': [],
            'support': {'claim_digest': self.task['claim_digest'], 'outcome': 'NotEvaluated',
                'evidence_span_refs': [], 'event_refs': [], 'relation_refs': [],
                'rationale': 'Synthetic validation stub.', 'abstention_reason': 'Not a human annotation.'}}

    def check(self):
        validate_annotation(self.a, self.task, self.sources, self.validator)

    def test_empty_draft_is_not_evaluation_or_review(self):
        self.check()

    def test_other_claim_digest_rejected(self):
        self.a['support']['claim_digest'] = '00'*32
        with self.assertRaisesRegex(ValueError, 'another Claim'):
            self.check()

    def test_unresolved_reference_rejected(self):
        self.a['support']['evidence_span_refs'] = ['missing']
        with self.assertRaisesRegex(ValueError, 'unresolved'):
            self.check()

    def test_mid_utf8_character_offset_rejected(self):
        sid = next(s for s, raw in self.sources.items() if b'\xc3' in raw)
        start = self.sources[sid].index(b'\xc3')+1
        self.a['spans'] = [{'span_id': 's1', 'source_id': sid, 'byte_offset': start, 'byte_length': 1,
            'text': 'x', 'kind': 'Entity', 'label': 'other', 'scope_event_refs': []}]
        with self.assertRaises(UnicodeError):
            self.check()

    def test_judgment_requires_evidence(self):
        self.a['support']['outcome'] = 'Supported'
        with self.assertRaisesRegex(ValueError, 'evidence spans'):
            self.check()

    def test_unknown_review_flag_not_accepted(self):
        self.a['independent_review'] = 'reviewed'
        with self.assertRaises(jsonschema.ValidationError):
            self.check()

    def test_adjudication_requires_parents(self):
        self.a['phase'] = 'Adjudication'
        with self.assertRaises(jsonschema.ValidationError):
            self.check()


if __name__ == '__main__':
    unittest.main()
