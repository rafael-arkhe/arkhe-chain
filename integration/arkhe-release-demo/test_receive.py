"""Offline regression tests against the frozen public Radicle fixture."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

import receive

EVIDENCE = Path(__file__).resolve().parents[2] / 'docs/evidence/2026-10-28-verifiable-release'


class ConsumerRegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)

    def test_frozen_signed_review_and_source_archive(self):
        receive.unpack(EVIDENCE / 'package-v2.zip', self.work)
        trust = json.loads((EVIDENCE / 'trust.json').read_text())
        result = receive.verify_source(self.work, trust)
        self.assertTrue(result['archive_matches_commit'])

    def test_changed_artifact_is_rejected_even_in_a_valid_package(self):
        receive.unpack(EVIDENCE / 'package-v2.zip', self.work)
        trust = json.loads((EVIDENCE / 'trust.json').read_text())
        (self.work / 'artifact.tar').write_bytes(b'altered release')
        with self.assertRaisesRegex(ValueError, 'exact git archive'):
            receive.verify_source(self.work, trust)

    def test_wrong_expected_review_key_is_rejected(self):
        receive.unpack(EVIDENCE / 'package-v2.zip', self.work)
        trust = json.loads((EVIDENCE / 'trust.json').read_text())
        state = json.loads((self.work / 'radicle-review.json').read_text())
        revision = trust['source']['revision']
        review_id = next(iter(state['revisions'][revision]['reviews'].values()))['id']
        repo = self.work / 'source.git'
        receive.checked(['git', '-c', 'core.hooksPath=/dev/null', 'clone', '--bare', self.work / 'source.bundle', repo])
        author = state['revisions'][revision]['author']['id']
        with self.assertRaisesRegex(ValueError, 'signer differs'):
            receive.signed_commit(repo, review_id, author, self.work)

    def test_modified_review_snapshot_is_rejected(self):
        receive.unpack(EVIDENCE / 'package-v2.zip', self.work)
        trust = json.loads((EVIDENCE / 'trust.json').read_text())
        with (self.work / 'radicle-review.json').open('ab') as f:
            f.write(b' ')
        with self.assertRaisesRegex(ValueError, 'evidence digest'):
            receive.verify_source(self.work, trust)

    def test_archive_path_traversal_is_rejected(self):
        package = self.work / 'bad.zip'
        with zipfile.ZipFile(package, 'w') as z:
            for name in receive.NAMES:
                z.writestr('../outside' if name == 'README.txt' else name, b'x')
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            receive.unpack(package, self.work)
        self.assertFalse((self.work.parent / 'outside').exists())

    def test_duplicate_archive_member_is_rejected(self):
        package = self.work / 'duplicate.zip'
        with zipfile.ZipFile(package, 'w') as z:
            for name in receive.NAMES:
                z.writestr(name, b'x')
            z.writestr('artifact.tar', b'x')
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            receive.unpack(package, self.work)


if __name__ == '__main__':
    unittest.main()
