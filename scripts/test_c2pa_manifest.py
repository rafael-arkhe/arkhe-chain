"""Lock the local C2PA hash and the refusal to broadcast without a contract."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "c2pa_manifest.py"
VECTOR = ROOT / "verification" / "vectors" / "c2pa" / "valid-minimal.json"
LIVE_SHA256 = "c075840cb06093c6d15142e7c4d8f72c611cf34a580484fc185e77fb90f3c3c5"
LIVE_BLAKE3 = "c123a7d24354619108073f89e154a31fcc87377b90931ce7c0eb8cb867773dd4"
SIGNED_PAYLOAD = "414b473a433250412d434c41494d2d5349473a763100a563616c676745643235353139636b6964687369676e65722d31666973737565726a61726b68652e746573746770726f66696c65781d61726b68652d633270612d636c61696d2d7369676e61747572652d76316c636c61696d5f736861323536784063313233613764323433353436313931303830373366383965313534613331666363383733373762393039333163653763306562386362383637373733646434"


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )


class C2paManifestTests(unittest.TestCase):
    def test_live_encoder_hash_is_not_the_candidate_vector(self) -> None:
        result = run(str(VECTOR), "--vector")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertFalse(report["broadcast"])
        self.assertEqual(report["c2pa_standard_validation"], "NOT_PERFORMED")
        self.assertEqual(report["sha256_of_canonical_claim_bytes"], LIVE_SHA256)
        self.assertEqual(report["claim_canonical_blake3"], LIVE_BLAKE3)
        self.assertFalse(report["vector_matches_live_encoder"])
        self.assertIn("hash_hex", report["vector_difference"])

    def test_signing_payload_matches_the_verifier_domain(self) -> None:
        result = run(
            str(VECTOR),
            "--vector",
            "--kid",
            "signer-1",
            "--issuer",
            "arkhe.test",
            "--alg",
            "Ed25519",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["signing_profile"], "arkhe-c2pa-claim-signature-v1")
        self.assertEqual(report["profile_claim_blake3"], LIVE_BLAKE3)
        self.assertEqual(report["signed_payload_hex"], SIGNED_PAYLOAD)
        self.assertTrue(report["signed_payload_hex"].startswith("414b473a433250412d434c41494d2d5349473a763100"))
        self.assertFalse(report["signature_verified"])
        self.assertFalse(report["broadcast"])

    def test_an_empty_signer_does_not_build_a_payload(self) -> None:
        result = run(str(VECTOR), "--vector", "--kid", "signer-1")
        self.assertEqual(result.returncode, 2)
        self.assertIn("kid/issuer", result.stderr)

    def test_ed25519_is_not_a_claim_hash_algorithm(self) -> None:
        claim = {
            "instanceID": "urn:arkhe:test",
            "claim_generator_info": [],
            "signature": "self#jumbf=c2pa.signature",
            "created_assertions": [],
            "alg": "Ed25519",
        }
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "claim.json"
            path.write_text(json.dumps(claim), encoding="utf-8")
            result = run(str(path))
        self.assertEqual(result.returncode, 2)
        self.assertIn("Ed25519", result.stderr)
        self.assertNotIn("broadcast", result.stdout)

    def test_a_missing_field_does_not_hash(self) -> None:
        claim = {
            "claim_generator_info": [],
            "signature": "self#jumbf=c2pa.signature",
            "created_assertions": [],
        }
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "claim.json"
            path.write_text(json.dumps(claim), encoding="utf-8")
            result = run(str(path))
        self.assertEqual(result.returncode, 2)
        self.assertIn("instanceID", result.stderr)

    def test_send_without_a_contract_does_not_broadcast(self) -> None:
        result = run(str(VECTOR), "--vector", "--send")
        self.assertEqual(result.returncode, 2)
        self.assertIn("envio recusado", result.stderr)
        self.assertIn("ARKHE_C2PA_CONTRACT", result.stderr)
        report = json.loads(result.stdout)
        self.assertFalse(report["broadcast"])
        self.assertEqual(report["sha256_of_canonical_claim_bytes"], LIVE_SHA256)


if __name__ == "__main__":
    unittest.main()
