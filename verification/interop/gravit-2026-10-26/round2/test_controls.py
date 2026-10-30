"""Security controls beyond the golden decisions; no upstream runtime."""
import copy
import json
import unittest
from pathlib import Path
from reader import load_registry, evaluate, representatives, freshness, convergence
from compare import differences

UP=Path(__file__).resolve().parent.parent/'upstream'

class Controls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw=(UP/'registry.json').read_bytes()
        cls.sigs=(UP/'registry.json.sig').read_text()
        cls.trust=(UP/'trust_root.json').read_bytes()
        cls.registry=load_registry(cls.raw,cls.sigs,cls.trust)
        cls.request=json.loads((Path(__file__).resolve().parent/'requests.json').read_bytes())[0]

    def test_registry_threshold_is_actually_enforced(self):
        lines=[s for s in self.sigs.splitlines() if s and not s.startswith('#')]
        with self.assertRaises(ValueError): load_registry(self.raw,'\n'.join(lines[:2]),self.trust)

    def test_duplicate_signer_cannot_form_quorum(self):
        line=next(s for s in self.sigs.splitlines() if s and not s.startswith('#'))
        with self.assertRaises(ValueError): load_registry(self.raw,'\n'.join([line]*3),self.trust)

    def test_registry_whitespace_tamper_invalidates_signatures(self):
        with self.assertRaises(ValueError): load_registry(self.raw+b' ',self.sigs,self.trust)

    def test_unknown_signer_cannot_complete_quorum(self):
        lines=[s for s in self.sigs.splitlines() if s and not s.startswith('#')]
        lines[0]='0000000000000000 '+lines[0].split()[1]
        with self.assertRaises(ValueError): load_registry(self.raw,'\n'.join(lines),self.trust)

    def test_strict_majority_required(self):
        doc=json.loads(self.trust); doc['threshold']=2
        with self.assertRaises(ValueError): load_registry(self.raw,self.sigs,json.dumps(doc).encode())

    def test_boolean_threshold_rejected(self):
        doc=json.loads(self.trust); doc['threshold']=True
        with self.assertRaises(ValueError): load_registry(self.raw,self.sigs,json.dumps(doc).encode())

    def test_duplicate_root_keys_rejected(self):
        doc=json.loads(self.trust); doc['root_keys'].append(doc['root_keys'][0])
        with self.assertRaises(ValueError): load_registry(self.raw,self.sigs,json.dumps(doc).encode())

    def test_key_id_must_bind_public_key(self):
        doc=json.loads(self.trust); doc['root_keys'][0]['key_id']='0000000000000000'
        with self.assertRaises(ValueError): load_registry(self.raw,self.sigs,json.dumps(doc).encode())

    def test_replay_into_another_artifact_excludes_every_signature(self):
        r=copy.deepcopy(self.request); r['artifact_id']='different-artifact'
        out=evaluate(r,self.registry)
        self.assertEqual(out['status'],'REJECTED')
        self.assertEqual([e['reason'] for e in out['excluded_evidence']],['bad_signature']*2)

    def test_tampered_result_excluded_before_contradiction_rule(self):
        r=copy.deepcopy(self.request); r['evidence'][0]['result']=False
        out=evaluate(r,self.registry)
        self.assertEqual(out['final_epistemic_state'],'Probabilistic Assessment')
        self.assertEqual(out['excluded_evidence'],[dict(record_id='r1',reason='bad_signature')])

    def test_expected_output_injection_has_no_effect(self):
        r=copy.deepcopy(self.request); r['expected']={'status':'REJECTED'}
        self.assertEqual(evaluate(r,self.registry),evaluate(self.request,self.registry))

    def test_transitive_sharing_is_one_source_in_any_order(self):
        rows=[dict(theta=.9,verifier_id='a',provenance='x'),dict(theta=.4,verifier_id='a',provenance='y'),dict(theta=.8,verifier_id='b',provenance='y')]
        for data in [rows,list(reversed(rows))]:
            reps=representatives(data,lambda e:e['verifier_id'])
            self.assertEqual(len(reps),1); self.assertEqual(reps[0]['theta'],.4)

    def test_convergence_boundaries(self):
        for theta,h,f in [(.7,1.,0.),(.5,0.,0.),(.499999,0.,1.)]:
            _,metrics=convergence([dict(theta=theta),dict(theta=theta)])
            self.assertEqual(metrics,dict(h=h,f=f))
        rows=[dict(theta=.9)]*7+[dict(theta=.4)]*3
        self.assertFalse(convergence(rows)[0])

    def test_freshness_inclusive_and_future_excluded(self):
        policy=dict(evaluation_time='2026-09-06T13:00:00Z',freshness_max_age_seconds=3600)
        self.assertTrue(freshness([dict(timestamp='2026-09-06T12:00:00Z')],policy))
        self.assertFalse(freshness([dict(timestamp='2026-09-06T11:59:59Z')],policy))
        self.assertFalse(freshness([dict(timestamp='2026-09-06T13:00:01Z')],policy))

    def test_empty_evidence_cannot_grant_state(self):
        r=copy.deepcopy(self.request); r['evidence']=[]
        self.assertEqual(evaluate(r,self.registry)['status'],'REJECTED')

    def test_comparison_detects_wrong_verdict(self):
        self.assertTrue(differences({'status':'SUCCESS'},{'status':'REJECTED'}))

    def test_text_difference_remains_visible(self):
        requests=json.loads((Path(__file__).resolve().parent/'requests.json').read_bytes())
        r=next(x for x in requests if x['artifact_id']=='two_keys_one_operator')
        strict=evaluate(r,self.registry,profile='strict-text')
        compat=evaluate(r,self.registry)
        self.assertFalse(strict['convergence_metrics']['CANON-RES-012']['constraint_ok'])
        self.assertTrue(compat['convergence_metrics']['CANON-RES-012']['constraint_ok'])
        self.assertEqual(strict['final_epistemic_state'],compat['final_epistemic_state'])

if __name__=='__main__': unittest.main()
