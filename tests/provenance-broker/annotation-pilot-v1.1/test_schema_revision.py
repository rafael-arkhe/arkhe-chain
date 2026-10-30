"""Schema-only versus cross-artifact invariants; no human annotations created."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

import jsonschema

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'scripts'))
from validate_provenance_annotations import validate_annotation


class SchemaRevision(unittest.TestCase):
    def setUp(self):
        self.schema = json.loads((ROOT/'schemas/provenance-broker/annotation-v1.1.schema.json').read_text(encoding='utf-8'))
        self.validator = jsonschema.Draft202012Validator(self.schema)
        self.a = {'protocol_id': 'arkhe-annotation-v1', 'annotation_id': 'synthetic-schema-test',
            'task_id': 'task-test', 'annotator_id': 'test-stub-not-human', 'round_id': 'test',
            'phase': 'Calibration', 'status': 'Draft', 'model_output_exposure': 'Unknown',
            'spans': [], 'events': [], 'relations': [], 'ambiguities': [],
            'support': {'claim_digest': '00'*32, 'outcome': 'NotEvaluated', 'evidence_span_refs': [],
                'event_refs': [], 'relation_refs': [], 'rationale': 'Synthetic test.', 'abstention_reason': 'No human annotation.'}}

    def event(self, labels):
        return {'event_id': 'event-1', 'trigger_span_refs': ['trigger-1'], 'argument_span_refs': [],
            'speaker': {'kind': 'Narrator', 'span_refs': []}, 'polarity': 'Positive',
            'certainty': 'Certain', 'time': 'Past', 'modality_labels': labels}

    def test_schema_itself_requires_evidence_for_three_outcomes(self):
        for outcome in ('Supported', 'Partial', 'Contradicted'):
            with self.subTest(outcome=outcome):
                self.a['support']['outcome'] = outcome
                with self.assertRaises(jsonschema.ValidationError):
                    self.validator.validate(self.a)

    def test_indeterminate_can_have_no_evidence(self):
        self.a['support']['outcome'] = 'Indeterminate'
        self.validator.validate(self.a)

    def test_modality_exclusivity_is_in_schema(self):
        for labels in (['Unmarked', 'Necessity'], ['Underspecified', 'Possibility'], ['Unmarked', 'Underspecified']):
            with self.subTest(labels=labels):
                self.a['events'] = [self.event(labels)]
                with self.assertRaises(jsonschema.ValidationError):
                    self.validator.validate(self.a)

    def test_single_exclusive_and_other_combinations_remain_valid(self):
        for labels in (['Unmarked'], ['Underspecified'], ['Necessity', 'Obligation']):
            self.a['events'] = [self.event(labels)]
            self.validator.validate(self.a)  # References intentionally outside schema-only unit test.

    def test_blank_rationale_rejected(self):
        self.a['support']['rationale'] = ' \t\n'
        with self.assertRaises(jsonschema.ValidationError):
            self.validator.validate(self.a)

    def test_digest_binding_belongs_to_cross_artifact_validator(self):
        self.validator.validate(self.a)
        with self.assertRaisesRegex(ValueError, 'another Claim'):
            validate_annotation(self.a, {'claim_digest': 'ff'*32}, {}, self.validator)


if __name__ == '__main__':
    unittest.main()
