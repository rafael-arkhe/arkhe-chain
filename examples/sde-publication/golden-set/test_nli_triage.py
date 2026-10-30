import json
from pathlib import Path
import unittest
from nli_triage import triage, sentence_claims

POLICY = json.loads((Path(__file__).parent / 'v5-policy.json').read_text())

class SemanticGateTests(unittest.TestCase):
    def test_high_composite_does_not_override_nli_contradiction(self):
        base = {'decision': 'ALLOW', 'reason': 'composite_zone', 'composite': 0.96}
        claims = [{'status': 'MEASURED', 'max_contradiction': 0.99, 'max_entailment': 0.1}]
        self.assertEqual(triage(base, claims, POLICY), ('REQUIRE_APPROVAL', 'nli_contradiction'))

    def test_conflicting_sources_escalate_even_with_entailment(self):
        base = {'decision': 'ALLOW', 'reason': 'composite_zone'}
        claims = [{'status': 'MEASURED', 'max_contradiction': 0.9, 'max_entailment': 0.95}]
        self.assertEqual(triage(base, claims, POLICY)[0], 'REQUIRE_APPROVAL')

    def test_missing_or_truncated_evidence_is_not_an_allow(self):
        base = {'decision': 'ALLOW', 'reason': 'composite_zone'}
        for claims in [[], [{'status': 'UNAVAILABLE'}]]:
            self.assertEqual(triage(base, claims, POLICY)[0], 'REQUIRE_APPROVAL')

    def test_structural_failure_has_precedence_over_unavailable_verifier(self):
        self.assertEqual(triage({'decision': 'DENY', 'reason': 'rule_judge_failed'}, [], POLICY),
            ('DENY', 'structural_rule_failure'))

    def test_no_support_for_an_acceptance_escalates(self):
        self.assertEqual(triage({'decision': 'ALLOW', 'reason': 'composite_zone'},
            [{'status': 'MEASURED', 'max_contradiction': 0.1, 'max_entailment': 0.5}], POLICY)[1],
            'acceptance_without_entailment')

    def test_sentence_units_keep_original_negation(self):
        self.assertEqual(sentence_claims('No, you cannot accept payments. Verification is pending.'),
            ['No, you cannot accept payments.', 'Verification is pending.'])

    def test_abbreviation_does_not_become_spurious_claims(self):
        self.assertEqual(sentence_claims('Pricing depends on the plan (e.g., Light, Core). Check your account.'),
            ['Pricing depends on the plan (e.g., Light, Core).', 'Check your account.'])

if __name__ == '__main__': unittest.main()
