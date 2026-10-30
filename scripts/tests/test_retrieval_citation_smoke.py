import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).parents[1]))
import run_retrieval_citation_smoke as smoke


class RetrievalSmokeTests(unittest.TestCase):
    def test_crlf_source_text_is_preserved_as_evidence_not_id(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            source=root/"source.md"
            source.write_bytes(b"# Source\r\n\r\nThe local provider uses Ollama.\r\nIt runs locally.\r\n\r\nOther paragraph.\r\n")
            executable=root/"bridge"
            executable.write_bytes(b"fixture")
            response=subprocess.CompletedProcess([],0,b'{"claims":[]}',b'')
            with patch.object(smoke.subprocess,"run",return_value=response) as run:
                report=smoke.run(source,executable,root/"out")
            payload=json.loads(run.call_args_list[0].kwargs["input"])
            self.assertEqual(payload["chunks"][0]["text"],"The local provider uses Ollama. It runs locally.")
            self.assertNotEqual(payload["chunks"][0]["id"],payload["chunks"][0]["text"])
            self.assertEqual(report["new_model_calls"],0)
            self.assertEqual(report["B_live_retrieval_adapter"],"NOT_INTEGRATED")
            self.assertEqual(run.call_count,2)


if __name__=="__main__": unittest.main()
