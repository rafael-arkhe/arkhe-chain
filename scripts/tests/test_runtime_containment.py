import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import runtime_containment as runtime


class RuntimePlanTests(unittest.TestCase):
    def setUp(self):
        self.catalog = json.loads(runtime.CATALOG.read_text())

    def test_execution_cannot_be_enabled_by_catalog(self):
        self.catalog['execution_enabled'] = True
        with self.assertRaises(ValueError):
            runtime.validate_catalog(self.catalog)

    def test_unbounded_memory_is_rejected(self):
        vector = next(v for v in self.catalog['vectors'] if v['id'] == 'memory-bounded')
        vector['budget']['memory_attempt_bytes'] = 2 ** 40
        with self.assertRaises(ValueError):
            runtime.validate_catalog(self.catalog)

    def test_duplicate_identity_is_rejected(self):
        self.catalog['vectors'].append(copy.deepcopy(self.catalog['vectors'][0]))
        with self.assertRaises(ValueError):
            runtime.validate_catalog(self.catalog)

    def fixture(self, root):
        (root / 'config').mkdir()
        (root / 'docs/evidence').mkdir(parents=True)
        catalog = root / 'config/vectors.json'
        catalog.write_text(json.dumps(self.catalog))
        source = root / self.catalog['runtime_source']
        source.parent.mkdir(parents=True)
        source.write_text('// fixture only')
        specification = root / 'docs/spec.md'
        specification.write_text('fixture specification')
        return catalog, source, specification

    def test_plan_hashes_and_nonexecution_are_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog, source, spec = self.fixture(root)
            with patch.multiple(runtime, ROOT=root, CATALOG=catalog, SPECIFICATION=spec):
                output = root / 'docs/evidence/plan'
                with contextlib.redirect_stdout(io.StringIO()):
                    plan = runtime.create_plan(output)
                self.assertEqual(plan['status'], 'PLANNED')
                self.assertFalse(plan['runtime_verified'])
                self.assertTrue(all(v['status'] == 'PLANNED' for v in plan['vectors']))
                self.assertIsNone(plan['image_configured_not_inspected'])
                self.assertEqual(plan['runtime_source_sha256'], runtime.digest(source))
                for line in (output / 'SHA256SUMS').read_text().splitlines():
                    expected, name = line.split('  ', 1)
                    self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), expected)

    def test_output_outside_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog, _, spec = self.fixture(root)
            with patch.multiple(runtime, ROOT=root, CATALOG=catalog, SPECIFICATION=spec):
                with self.assertRaises(ValueError):
                    runtime.create_plan(root / 'outside')
                self.assertFalse((root / 'outside').exists())

    def test_mutable_image_tag_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog, _, spec = self.fixture(root)
            config = root / self.catalog['image_configuration']
            config.parent.mkdir(parents=True)
            config.write_text(json.dumps({'image': 'rust:latest'}))
            with patch.multiple(runtime, ROOT=root, CATALOG=catalog, SPECIFICATION=spec):
                with self.assertRaises(ValueError):
                    runtime.create_plan(root / 'docs/evidence/plan')
