import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from check_architecture import function_body  # noqa: E402


class ArchitectureBoundariesTests(unittest.TestCase):
    def test_function_body_extracts_balanced_rust_block_and_handles_missing(self):
        sample = """
        pub fn outer(flag: bool) -> u32 {
            if flag {
                let inner = { 1 + 2 };
                return inner;
            }
            0
        }
        """
        body = function_body(sample, "outer")
        self.assertIsNotNone(body)
        self.assertTrue(body.startswith("{"))
        self.assertTrue(body.endswith("}"))
        self.assertIn("let inner = { 1 + 2 };", body)
        self.assertIsNone(function_body(sample, "missing"))
        self.assertIsNone(function_body("fn broken() { if true {", "broken"))

    def test_architecture_registry_invariants_hold(self):
        arch = json.loads((ROOT / "config/architecture.json").read_text(encoding="utf-8"))
        component_ids = {c["id"] for c in arch["components"]}
        self.assertEqual(len(component_ids), len(arch["components"]))

        # Every active node_package and skeleton_member belongs to a registered component path or prefix.
        comp_paths = [c["path"] for c in arch["components"]]
        for member in arch["rust_members"] + arch["node_packages"]:
            self.assertTrue(
                any(member == cp or member.startswith(cp + "/") for cp in comp_paths),
                f"unmapped workspace entry in components: {member}",
            )

        # Only the single unwired barrier -> world edge may carry releases_effect: True.
        releasing = [e for e in arch["edges"] if e.get("releases_effect") is True]
        self.assertEqual(
            releasing,
            [
                {
                    "from": "barrier",
                    "to": "world",
                    "carries": "effect",
                    "releases_effect": True,
                    "status": "unwired",
                }
            ],
        )

    def test_check_architecture_script_passes_on_repository(self):
        proc = subprocess.run(
            [sys.executable, str(ROOT / "scripts/check_architecture.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stdout + proc.stderr)
        self.assertIn("PASS unified architecture", proc.stdout)


if __name__ == "__main__":
    unittest.main()
