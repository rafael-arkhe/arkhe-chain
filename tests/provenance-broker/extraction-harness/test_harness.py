"""Stage-boundary checks with stubs; actual model execution is a separate artifact."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'scripts'))
from provenance_extraction_harness import check_spans, support_stage, integration_stage, extraction_stage


class StageBoundaries(unittest.TestCase):
    def fixture(self, name):
        path = ROOT/'tests/provenance-broker/v3.1/extensions-v2/fixtures'/(name+'.json')
        return json.loads(path.read_text(encoding='utf-8'))

    def support(self, name, artifacts=None):
        f = self.fixture(name)
        evaluator = {'id': 'arkhe-support-rule-pt', 'version': '1', 'method': 'Rule'}
        artifacts = artifacts if artifacts is not None else [{'span_checks': [], 'raw': {}}]
        return support_stage(f['candidate']['claim'], f['chunks'], artifacts, evaluator)

    def test_utf8_offsets_are_not_character_offsets(self):
        text = 'é Atlas'
        checks = check_spans({'entities': [{'text': 'Atlas', 'start': 2, 'end': 7}]}, text)
        self.assertEqual(checks[0]['byte_start'], 3)
        self.assertEqual(checks[0]['byte_end'], 8)
        self.assertTrue(checks[0]['valid'])

    def test_token_limit_abstains_before_model_can_truncate(self):
        from types import SimpleNamespace
        model = SimpleNamespace(processor=SimpleNamespace(word_splitter=lambda text, lower: iter(range(513))))
        with self.assertRaisesRegex(ValueError, 'truncate'):
            extraction_stage(model, None, 'texto curto', {'max_text_bytes': 4096, 'max_len': 512}, {})

    def test_invalid_span_is_explicit_and_evaluator_abstains(self):
        artifacts = [{'span_checks': check_spans({'text': 'wrong', 'start': 0, 'end': 2}, 'é Atlas'), 'raw': {}}]
        result = self.support('V2-NEGATION-POSITIVE-CLAIM', artifacts)
        self.assertEqual(result['semantic_outcome'], 'NotEvaluated')
        self.assertEqual(result['reason'], 'INVALID_EXTRACTED_SPAN')

    def test_extractor_score_never_defines_support_outcome(self):
        artifacts = [{'span_checks': [], 'raw': {'semantic_outcome': 'Supported', 'confidence': 1.0}}]
        self.assertEqual(self.support('V2-NEGATION-POSITIVE-CLAIM', artifacts)['semantic_outcome'], 'Contradicted')

    def test_negation_and_modality_are_relative_to_claim(self):
        expected = {'V2-NEGATION-POSITIVE-CLAIM': 'Contradicted',
            'V2-NEGATION-NEGATIVE-CLAIM': 'Supported',
            'V2-HYPOTHESIS-ASSERTED': 'Indeterminate', 'V2-HYPOTHESIS-POSSIBLE': 'Supported'}
        for name, outcome in expected.items():
            with self.subTest(name=name):
                self.assertEqual(self.support(name)['semantic_outcome'], outcome)

    def test_correction_requires_explicit_reference(self):
        f = self.fixture('V2-CORRECTION-OLD-CLAIM')
        result = self.support('V2-CORRECTION-OLD-CLAIM')
        self.assertEqual(result['semantic_outcome'], 'Contradicted')
        f['chunks'][1]['bytes_hex'] = bytes.fromhex(f['chunks'][1]['bytes_hex']).decode().replace(
            'Correção de 21/10: o relato de 20/10 estava errado;', 'Outra fonte:').encode().hex()
        result = support_stage(f['candidate']['claim'], f['chunks'], [{'span_checks': []}], {'id': 'test'})
        self.assertEqual(result['semantic_outcome'], 'Indeterminate')

    def test_unsupported_predicate_abstains(self):
        self.assertEqual(self.support('V2-ENDPOINTS-NO-RELATION')['semantic_outcome'], 'NotEvaluated')

    def test_stage_does_not_read_frozen_labels(self):
        f = self.fixture('V2-NEGATION-POSITIVE-CLAIM')
        f['observations']['semantic']['body']['outcome'] = 'Supported'
        result = support_stage(f['candidate']['claim'], f['chunks'], [{'span_checks': []}], {'id': 'test'})
        self.assertEqual(result['semantic_outcome'], 'Contradicted')

    def test_experimental_rule_is_not_promoted_to_fixture_human(self):
        f = self.fixture('V2-NEGATION-NEGATIVE-CLAIM')
        profile = json.loads((ROOT/'schemas/provenance-broker/profile-v2.json').read_text(encoding='utf-8'))
        before = deepcopy(f)
        result = integration_stage(f, self.support('V2-NEGATION-NEGATIVE-CLAIM'), [], profile)
        self.assertEqual(result['experimental_ingestion']['status'], 'Blocked')
        self.assertEqual(result['simulation']['applied_rule'], 'ASSERTION_UNSUPPORTED')
        self.assertEqual(result['simulation']['released_payload']['chunks'], [])
        self.assertEqual(before, f)


if __name__ == '__main__':
    unittest.main()
