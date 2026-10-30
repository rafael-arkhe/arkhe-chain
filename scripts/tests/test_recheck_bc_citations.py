import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).parents[1]))
import recheck_bc_citations as recheck
from generality_pilot import digest


class RecheckTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.source=self.root/"source"
        self.source.mkdir()
        self.exe=self.root/"bridge"
        self.exe.write_bytes(b"fixture")
        self.snapshot={"model_prompt":"prompt","memory":"memory"}
        self.manifest={"prompt_sha256":digest("prompt"),"memory_sha256":digest("memory"),
                       "config":{"model_digest":"a"*64}}
        self.record={"execution_status":"COMPLETED_UNGRADED","arm":"B","answer":"answer",
                     "prompt_sha256":digest("prompt"),"model_digest":"a"*64}
        self.save()

    def save(self):
        for name,value in (("manifest.json",self.manifest),("input-snapshot.json",self.snapshot),("record.json",self.record)):
            (self.source/name).write_text(json.dumps(value),encoding="utf-8")

    def test_reanalysis_is_distinct_and_preserves_source(self):
        original=(self.source/"record.json").read_bytes()
        response=subprocess.CompletedProcess([],0,json.dumps({"gate":"ALLOW","citation_report":{"status":"FAIL_LEXICAL"}}).encode(),b"")
        with patch.object(recheck.subprocess,"run",return_value=response) as run:
            report=recheck.recheck(self.source,self.exe,self.root/"out")
        self.assertEqual(run.call_count,1)
        self.assertEqual(report["new_model_calls"],0)
        self.assertEqual(report["phase"],"artifact_reanalysis")
        self.assertEqual((self.source/"record.json").read_bytes(),original)

    def test_failed_generation_cannot_be_relabelled(self):
        self.record["execution_status"]="FAILED"
        self.save()
        with patch.object(recheck.subprocess,"run") as run:
            with self.assertRaises(ValueError): recheck.recheck(self.source,self.exe,self.root/"out")
            run.assert_not_called()

    def test_snapshot_mismatch_is_rejected(self):
        self.snapshot["memory"]="different"
        self.save()
        with self.assertRaises(ValueError): recheck.recheck(self.source,self.exe,self.root/"out")


if __name__ == "__main__": unittest.main()
