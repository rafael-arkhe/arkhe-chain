import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).parents[1]))
import python_citation_crosscheck as checker

FIXTURE=Path(__file__).resolve().parents[2]/"tests/evaluation/python-citation-reference-export-v1"


class CrosscheckTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/"export"
        shutil.copytree(FIXTURE,self.root)

    def edit(self,name,change):
        path=self.root/name
        value=json.loads(path.read_text(encoding="utf-8"))
        change(value)
        path.write_text(json.dumps(value),encoding="utf-8")

    def test_actual_native_export_matches_score_report_digest_and_wer(self):
        result=checker.check_export(self.root)
        self.assertEqual(result["agreement"],"MATCHED")
        self.assertEqual(result["claims"][0]["jaccard_numerator"],9)
        self.assertEqual(result["claims"][0]["jaccard_denominator"],23)
        self.assertTrue(result["unsigned_wer_encoding_and_digest_matched"])
        self.assertFalse(result["production_trust_field_modified"])

    def test_altered_native_verdict_is_rejected(self):
        self.edit("citation-report.json",lambda r:r.update(status="PASS_LEXICAL"))
        with self.assertRaises(ValueError): checker.check_export(self.root)

    def test_altered_worker_is_rejected_even_if_lexical_report_matches(self):
        self.edit("native-evidence.json",lambda r:r["worker_record"].update(module_version="altered"))
        with self.assertRaises(ValueError): checker.check_export(self.root)

    def test_report_digest_tampering_is_rejected(self):
        self.edit("native-evidence.json",lambda r:r.update(citation_report_digest="0"*64))
        with self.assertRaises(ValueError): checker.check_export(self.root)

    def test_unicode_is_unsupported_not_silently_compared(self):
        self.edit("retrieval.json",lambda r:r["chunks"][0].update(text="São Paulo"))
        with self.assertRaises(checker.UnsupportedProfile): checker.check_export(self.root)

    def test_duplicate_keys_and_extra_claim_metadata_are_rejected(self):
        with self.assertRaises(ValueError): checker.strict_json('{"x":1,"x":2}')
        def change(r):
            answer=json.loads(r["answer"])
            answer["claims"][0]["hidden"]="metadata"
            r["answer"]=json.dumps(answer)
        self.edit("generation.json",change)
        with self.assertRaises(ValueError): checker.check_export(self.root)

    def test_boolean_cbor_is_not_integer_encoding(self):
        self.assertEqual(checker.cbor(False),bytes.fromhex("f4"))
        self.assertEqual(checker.cbor(True),bytes.fromhex("f5"))
        self.assertNotEqual(checker.cbor(True),checker.cbor(1))

    def test_agreement_does_not_imply_entailment(self):
        result=checker.lexical({"text":"Sydney has not 5 offices.","evidence_id":"s"},{"s":"Sydney has 5 offices."})
        self.assertEqual(result["status"],"PASS_LEXICAL")


if __name__=="__main__": unittest.main()
