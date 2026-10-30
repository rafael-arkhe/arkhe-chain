"""Container integration tests: fresh upstream computation, not fixture lookup."""
import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('replay', '/opt/replay/gravit_replay.py')
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)
FIXTURES = Path('/opt/replay/fixtures')


class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def invoke(self, request, decision, name='run'):
        folder = self.root / name
        folder.mkdir()
        (folder / 'request.json').write_bytes(request)
        (folder / 'decision.json').write_bytes(decision)
        proc = subprocess.run([sys.executable, '-I', '/opt/replay/gravit_replay.py',
            '--request', str(folder / 'request.json'), '--decision', str(folder / 'decision.json'),
            '--output', str(folder / 'output')], capture_output=True, timeout=20)
        report = json.loads((folder / 'output/report.json').read_bytes())
        # Preserve reviewable bytes, without copying filesystem metadata to the
        # Windows evidence mount. Oversized negative input is represented by hash.
        saved = OUTPUT / 'samples' / self._testMethodName / name
        saved.mkdir(parents=True, exist_ok=False)
        for label, payload in [('request.json', request), ('provided-decision.json', decision)]:
            if len(payload) <= 100000:
                (saved / label).write_bytes(payload)
            else:
                (saved / (label + '.sha256')).write_text(replay.sha256(payload) + '\n')
        for file in (folder / 'output').iterdir():
            (saved / file.name).write_bytes(file.read_bytes())
        return proc.returncode, report, folder

    def test_signed_reference_pair_is_recomputed(self):
        code, report, folder = self.invoke((FIXTURES / 'signed-request.json').read_bytes(),
                                           (FIXTURES / 'reference-decision.json').read_bytes())
        self.assertEqual(code, 0)
        self.assertEqual(report['status'], 'MATCH')
        self.assertEqual(report['authorization'], 'not_evaluated')
        self.assertEqual((folder / 'output/recomputed-decision.json').read_bytes(),
                         (FIXTURES / 'reference-decision.json').read_bytes())

    def test_forged_decision_with_recalculated_id_is_mismatch(self):
        code, report, _ = self.invoke((FIXTURES / 'signed-request.json').read_bytes(),
                                     (FIXTURES / 'tampered-decision.json').read_bytes())
        self.assertEqual(code, 1)
        self.assertEqual(report['status'], 'MISMATCH')
        self.assertNotEqual(report['provided_decision_sha256'], report['recomputed_decision_sha256'])

    def test_changed_signed_request_cannot_reuse_old_decision(self):
        request = json.loads((FIXTURES / 'signed-request.json').read_bytes())
        request['evidence'][0]['result'] = False  # signature not updated
        code, report, _ = self.invoke(replay.canonical(request), (FIXTURES / 'reference-decision.json').read_bytes())
        self.assertEqual(code, 1)
        self.assertEqual(report['status'], 'MISMATCH')

    def test_new_signed_request_and_separate_process_replays(self):
        # Construct a NEW subject, timestamps and signed hashes. No stored pair
        # can match it; expected is computed via the pinned reference API here.
        replay.reexecute((FIXTURES / 'signed-request.json').read_bytes())
        from gravit_verifier.kernel import VerifierKernel, VerificationRequest, EvidenceRecord, EpistemicState
        from gravit_verifier.registry import TrustRoot, VerifierRegistry, signing_message
        from gravit_verifier.loader import load_bindings_from_dir
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        request = json.loads((FIXTURES / 'signed-request.json').read_bytes())
        request['artifact_id'] = 'new-subject-not-in-golden-fixtures'
        request['context'] = {'high_impact': True, 'evaluation_time': '2026-10-24T12:00:00Z', 'freshness_max_age_seconds': 600}
        for i, record in enumerate(request['evidence']):
            record['timestamp'] = '2026-10-24T11:59:00Z'
            record['integrity_hash'] = hashlib.sha3_256(b'a different replay artifact').hexdigest()
            key = Ed25519PrivateKey.from_private_bytes(hashlib.sha256(f'gravit-test-key:v{i+1}'.encode()).digest())
            record['signature'] = base64.b64encode(key.sign(signing_message(request['artifact_id'], EvidenceRecord(**record)))).decode()
        root = TrustRoot.from_file(replay.VERIFIER / 'tests/golden/trust_root.json')
        kernel = VerifierKernel(VerifierRegistry.from_file(replay.VERIFIER / 'tests/golden/registry.json', root))
        for binding in load_bindings_from_dir(replay.VERIFIER / 'bindings'):
            kernel.load_binding(binding)
        expected = replay.canonical(kernel.verify(VerificationRequest(request['artifact_id'], EpistemicState.VERIFIED_FACT,
            [EvidenceRecord(**e) for e in request['evidence']], request['context'])).to_dict())
        self.assertNotEqual(expected, (FIXTURES / 'reference-decision.json').read_bytes())
        a = self.invoke(replay.canonical(request), expected, 'first')
        b = self.invoke(replay.canonical(request), expected, 'second')
        self.assertEqual((a[0], b[0]), (0, 0))
        self.assertEqual(a[1], b[1])
        self.assertEqual((a[2] / 'output/recomputed-decision.json').read_bytes(),
                         (b[2] / 'output/recomputed-decision.json').read_bytes())

    def test_matching_degraded_decision_is_not_authorization(self):
        case = next(c for c in json.loads((FIXTURES / 'cases.json').read_bytes()) if c['name'] == 'revoked')
        code, report, _ = self.invoke(replay.canonical(case['request']), replay.canonical(case['decision']))
        self.assertEqual(code, 0)
        self.assertNotEqual(report['recomputed_state'], 'Verified Fact')
        self.assertEqual(report['authorization'], 'not_evaluated')

    def test_exact_wire_profile_is_required(self):
        pretty = json.dumps(json.loads((FIXTURES / 'reference-decision.json').read_bytes()), indent=2).encode()
        code, report, _ = self.invoke((FIXTURES / 'signed-request.json').read_bytes(), pretty)
        self.assertEqual((code, report['status']), (1, 'MISMATCH'))

    def test_bad_inputs_fail_without_observation_fallback(self):
        for i, bad in enumerate([b'{"artifact_id":"a","artifact_id":"b"}', b'{"theta":NaN}',
                                 b'[]', b'x' * (replay.LIMIT + 1)]):
            code, report, folder = self.invoke(bad, (FIXTURES / 'reference-decision.json').read_bytes(), f'bad-{i}')
            self.assertEqual((code, report['status']), (2, 'ERROR'))
            self.assertFalse(report['fallback_used'])
            self.assertFalse((folder / 'output/recomputed-decision.json').exists())

    def test_changed_or_missing_context_files_fail_before_execution(self):
        copied = self.root / 'verifier'
        shutil.copytree(replay.VERIFIER, copied, ignore=shutil.ignore_patterns('rust', '__pycache__'))
        manifest = json.loads(replay.TRUSTED_CONTEXT.read_bytes())
        victim = copied / 'gravit_verifier/kernel.py'
        victim.write_bytes(victim.read_bytes() + b'\n# altered\n')
        with self.assertRaisesRegex(ValueError, 'trusted context changed'):
            replay.verify_context(copied, manifest)
        victim.unlink()
        with self.assertRaisesRegex(ValueError, 'trusted context changed'):
            replay.verify_context(copied, manifest)

    def test_registry_profile_replays_all_44_applicable_golden_vectors(self):
        vectors = json.loads((replay.VERIFIER / 'tests/golden/vectors.json').read_bytes())
        rows = []
        for vector in vectors:
            if not vector['use_registry']:
                continue  # Production input cannot disable the pinned registry.
            with self.subTest(vector=vector['name']):
                request = {'artifact_id': vector['name'], 'claimed_state': vector['claimed_state'],
                           'evidence': vector['evidence'], 'context': vector['context']}
                actual, _ = replay.reexecute(replay.canonical(request))
                self.assertEqual(actual, replay.canonical(vector['expected']))
                rows.append({'name': vector['name'], 'sha256': replay.sha256(actual)})
        self.assertEqual(len(rows), 44)
        (OUTPUT / 'golden-vectors.json').write_bytes(replay.canonical({'count': len(rows), 'vectors': rows}) + b'\n')


parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
OUTPUT = args.output
OUTPUT.mkdir(parents=True, exist_ok=True)
result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ReplayTests))
summary = {'status': 'PASS' if result.wasSuccessful() else 'FAIL', 'tests': result.testsRun,
           'failures': len(result.failures), 'errors': len(result.errors),
           'scope': 'Pinned Python replay, public fixture root; no operational attestation or authorization'}
(OUTPUT / 'integration-results.json').write_bytes(replay.canonical(summary) + b'\n')
raise SystemExit(0 if result.wasSuccessful() else 1)
