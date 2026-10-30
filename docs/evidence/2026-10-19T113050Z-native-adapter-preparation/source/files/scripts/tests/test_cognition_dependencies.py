import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cognition_dependencies import audit_cognition_graph

class CognitionDependenciesTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2]
        self.metadata = {
            "packages": [
                {"id": "worker", "name": "worker", "version": "1", "source": None,
                 "manifest_path": str(self.root / "cognition/worker/Cargo.toml")},
                {"id": "helper", "name": "helper", "version": "1", "source": "registry+approved",
                 "manifest_path": "/cache/helper/Cargo.toml"}],
            "resolve": {"nodes": [{"id": "worker", "dependencies": ["helper"]},
                                   {"id": "helper", "dependencies": []}]}}
        self.approved = {
            "worker": {"version": "1", "source": None, "manifest": "cognition/worker/Cargo.toml"},
            "helper": {"version": "1", "source": "registry+approved"}}
    def audit(self):
        return audit_cognition_graph(self.metadata, self.approved, self.root)
    def test_approved_closure(self):
        self.assertEqual(self.audit(), [])
    def test_hidden_transitive_signer(self):
        self.metadata["packages"].append({"id": "renamed-id", "name": "signer", "version": "1",
            "source": "registry+approved", "manifest_path": "/cache/signer/Cargo.toml"})
        self.metadata["resolve"]["nodes"][1]["dependencies"] = ["renamed-id"]
        self.metadata["resolve"]["nodes"].append({"id": "renamed-id", "dependencies": []})
        self.assertIn("unapproved cognition dependency: signer", self.audit())
    def test_version_or_source_change(self):
        for field, value in [("version", "2"), ("source", "git+other")]:
            original = copy.deepcopy(self.metadata)
            self.metadata["packages"][1][field] = value
            self.assertTrue(self.audit())
            self.metadata = original
    def test_local_path_substitution(self):
        self.metadata["packages"][0]["manifest_path"] = str(self.root / "cognition/impostor/Cargo.toml")
        self.assertTrue(self.audit())
