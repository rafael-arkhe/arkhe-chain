import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0,str(Path(__file__).parents[1]))
from prepare_external_citation_review import prepare, PUBLIC_FILES
from grade_external_citation_review import grade


class ExternalReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.package=self.root/"package"
        prepare(self.package)
        self.implementation=self.root/"submitted.py"
        self.implementation.write_text('raise RuntimeError("must not execute reviewer code")\n',encoding="utf-8")
        self.responses=self.root/"responses.jsonl"
        self.responses.write_bytes((self.package/"private/answers.jsonl").read_bytes())
        self.submission=self.root/"submission.json"
        manifest=json.loads((self.package/"public/submission.json").read_text())
        manifest.update(submission_kind="ORGANIZER_SELF_TEST",reviewer_id="fixture",organization="organizer",
            implementation_sha256=hashlib.sha256(self.implementation.read_bytes()).hexdigest(),
            no_prior_implementation_access=False,organization_independent_of_original_authors=False)
        self.submission.write_text(json.dumps(manifest),encoding="utf-8")

    def grade(self): return grade(self.package,self.responses,self.submission,self.implementation)

    def test_public_archive_has_no_answers_or_implementation(self):
        with zipfile.ZipFile(self.package/"external-review.zip") as archive:
            self.assertEqual(set(archive.namelist()),PUBLIC_FILES)
            rows=[json.loads(line) for line in archive.read("cases.jsonl").splitlines()]
            self.assertEqual(len(rows),75)
            self.assertTrue(all(set(r)=={"case_id","claim","evidence"} for r in rows))
            self.assertFalse(any("private" in n or n.endswith((".py",".rs")) for n in archive.namelist()))

    def test_matching_selftest_is_not_external_independence_or_code_execution(self):
        result=self.grade()
        self.assertEqual(result["conformance"],"MATCHED")
        self.assertEqual(result["matched_cases"],75)
        self.assertFalse(result["organizational_independence_verified"])
        self.assertFalse(result["reviewer_code_executed"])
        self.assertEqual(result["submission_kind"],"ORGANIZER_SELF_TEST")

    def test_declared_independence_does_not_verify_it(self):
        value=json.loads(self.submission.read_text())
        value.update(submission_kind="EXTERNAL_REVIEW",no_prior_implementation_access=True,
            organization_independent_of_original_authors=True)
        self.submission.write_text(json.dumps(value))
        result=self.grade()
        self.assertTrue(result["reviewer_claims_organization_independence"])
        self.assertFalse(result["organizational_independence_verified"])
        self.assertFalse(result["production_trust_field_modified"])

    def test_changed_answer_and_missing_answer_do_not_reduce_denominator(self):
        rows=[json.loads(line) for line in self.responses.read_text().splitlines()]
        rows[0]["verdict"]["status"]="FAIL_LEXICAL" if rows[0]["verdict"]["status"]=="PASS_LEXICAL" else "PASS_LEXICAL"
        rows.pop()
        self.responses.write_text("".join(json.dumps(r)+"\n" for r in rows))
        result=self.grade()
        self.assertEqual(result["conformance"],"MISMATCH")
        self.assertEqual(result["expected_cases"],75)
        self.assertEqual(result["matched_cases"],73)
        self.assertEqual(len(result["missing_case_ids"]),1)

    def test_duplicate_and_boolean_cardinality_are_invalid(self):
        rows=self.responses.read_text().splitlines()
        self.responses.write_text("\n".join(rows+[rows[0]])+"\n")
        with self.assertRaises(ValueError): self.grade()
        value=json.loads(rows[0]); value["verdict"]["jaccard_numerator"]=True
        self.responses.write_text(json.dumps(value)+"\n"+"\n".join(rows[1:])+"\n")
        with self.assertRaises(ValueError): self.grade()

    def test_public_package_and_source_tampering_are_rejected(self):
        self.implementation.write_text("changed")
        with self.assertRaises(ValueError): self.grade()
        with (self.package/"public/PROFILE.md").open("a") as stream: stream.write("changed")
        with self.assertRaises(ValueError): self.grade()


if __name__=="__main__": unittest.main()
