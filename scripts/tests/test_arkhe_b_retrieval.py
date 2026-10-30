import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).parents[1]))
import arkhe_b_retrieval as adapter
from generality_pilot import digest


class LiveRetrievalTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.exe=self.root/"bridge"
        self.exe.write_bytes(b"fixture")
        self.config={"model":"test","model_digest":"a"*64,"context_tokens":4096}
        self.corpus={"tenant":"one","subject":"reader","chunks":[{"id":"private","text":"PRIVATE_SENTINEL"}]}
        self.limits={"max_tokens":100,"max_tool_calls":0,"max_wall_clock":10}
        self.retrieved={"phase":"authorized_retrieval","chunks":[{"id":"public","text":"Sydney has offices."}]}
        self.verification={"phase":"structured_citation_diagnostic","status":"FAIL_LEXICAL",
                           "semantic_entailment":"NOT_MEASURED","claims":[{"status":"FAIL_LEXICAL"}]}

    def generated(self,config,prompt,broker,**kwargs):
        return {"answer":json.dumps({"claims":[{"text":"claim","evidence_id":"public"}]}),
            "prompt_sha256":digest(prompt),"response_format_sha256":digest(kwargs["response_format"]),
            "model":"test","model_digest":"a"*64,"output_token_cap":20,
            "device_placement_requested":"cpu","sampling":{"num_predict":20,"seed":adapter.SAMPLING_SEED,
            "temperature":0,"num_ctx":4096,"num_gpu":0}}

    def call(self,**kwargs):
        kwargs.setdefault("allow_observed_total",True)
        return adapter.run(self.config,self.corpus,"Sydney offices",self.exe,self.exe,
                           self.root/"out",self.limits,output_cap=20,**kwargs)

    def test_empty_authorized_retrieval_refuses_generation(self):
        with patch.object(adapter,"retrieval_call",return_value={"phase":"authorized_retrieval","chunks":[]}):
            with patch.object(adapter,"generate") as generate:
                record=self.call()
                generate.assert_not_called()
        self.assertEqual(record["execution_status"],"FAILED")

    def test_strict_ollama_refused_before_retrieval_or_generation(self):
        with patch.object(adapter,"retrieval_call") as retrieval, patch.object(adapter,"generate") as generate:
            record=self.call(allow_observed_total=False)
            retrieval.assert_not_called()
            generate.assert_not_called()
        self.assertEqual(record["execution_status"],"FAILED")
        self.assertEqual(record["total_token_cap"],"NOT_EXECUTED")

    def test_signing_failure_blocks_completion_preserves_unsigned_evidence(self):
        evidence=dict(executable=self.exe,trust=self.exe,worker_key_file=self.exe,log_key_file=self.exe,journal=self.root/"journal")
        with patch.object(adapter,"retrieval_call",side_effect=[self.retrieved,self.verification]), \
             patch.object(adapter,"generate",side_effect=self.generated), \
             patch.object(adapter,"native_call",side_effect=[{"intent_digest":"same"},{"intent_digest":"same"}]), \
             patch.object(adapter,"seal_evidence",side_effect=ValueError("untrusted signer")):
            record=self.call(evidence=evidence)
        self.assertEqual(record["execution_status"],"FAILED")
        self.assertEqual(record["native_wer"],"CANONICAL_UNSIGNED")
        self.assertTrue((self.root/"out"/"native-evidence.json").exists())

    def test_failed_provider_is_attempted_not_marked_unexecuted(self):
        with patch.object(adapter,"retrieval_call",return_value=self.retrieved), \
             patch.object(adapter,"native_call",return_value={"intent_digest":"same"}), \
             patch.object(adapter,"generate",side_effect=RuntimeError("provider failed")):
            record=self.call()
        self.assertEqual(record["generation_status"],"ATTEMPTED")
        self.assertEqual(record["total_token_cap"],"POSTCHECK_ONLY")
        self.assertEqual(record["execution_status"],"FAILED")

    def test_strict_profile_routes_to_bounded_backend(self):
        import llama_cpp_bounded
        self.config["provider"]="llama_cpp"
        with patch.object(adapter,"retrieval_call",side_effect=[self.retrieved,self.verification]), \
             patch.object(adapter,"native_call",side_effect=[{"intent_digest":"same"},{"intent_digest":"same"}]), \
             patch.object(llama_cpp_bounded,"generate",side_effect=self.generated) as bounded, \
             patch.object(adapter,"generate") as ollama:
            record=self.call(allow_observed_total=False)
        ollama.assert_not_called()
        self.assertTrue(bounded.call_args.kwargs["require_hard_total_cap"])
        self.assertEqual(record["total_token_cap"],"PRECHECK_AND_POSTCHECK")
        self.assertEqual(record["generation_status"],"RETURNED_AND_MANIFEST_CHECKED")
        self.assertEqual(record["execution_status"],"COMPLETED_UNGRADED")

    def test_only_selected_chunks_reach_model_and_model_claims_reach_verifier(self):
        with patch.object(adapter,"retrieval_call",side_effect=[self.retrieved,self.verification]) as retrieval:
            with patch.object(adapter,"generate",side_effect=self.generated) as model:
                with patch.object(adapter,"native_call",side_effect=[{"intent_digest":"same"},{"intent_digest":"same"}]) as native:
                    record=self.call()
        prompt=model.call_args.args[1]
        self.assertNotIn("PRIVATE_SENTINEL",prompt)
        self.assertIn("Sydney has offices.",prompt)
        self.assertEqual(retrieval.call_args_list[1].args[1]["response_json"],record["answer"])
        self.assertEqual(native.call_args_list[1].args[1]["external_citation_report"],self.verification)
        context=native.call_args_list[0].args[1]["citation_context"]
        self.assertEqual(context["query"],"Sydney offices")
        self.assertEqual(context["chunks"],self.corpus["chunks"])
        self.assertNotIn("response_json",context)
        self.assertEqual(context,native.call_args_list[1].args[1]["citation_context"])
        self.assertEqual(record["citation_verification"],"FAIL_LEXICAL")
        self.assertEqual(record["execution_status"],"COMPLETED_UNGRADED")
        self.assertFalse(record["capability_demonstrated"])

    def test_postcheck_failure_preserves_generation_and_usage(self):
        with patch.object(adapter,"retrieval_call",side_effect=[self.retrieved,ValueError("invalid structured claims")]):
            with patch.object(adapter,"generate",side_effect=self.generated):
                with patch.object(adapter,"native_call",return_value={"intent_digest":"same"}):
                    record=self.call()
        self.assertEqual(record["execution_status"],"FAILED")
        self.assertTrue((self.root/"out"/"generation.json").is_file())
        self.assertEqual(record["native_wer"],"NOT_CREATED")

    def test_optional_python_disagreement_blocks_completion_but_keeps_created_wer(self):
        with patch.object(adapter,"retrieval_call",side_effect=[self.retrieved,self.verification]):
            with patch.object(adapter,"generate",side_effect=self.generated):
                with patch.object(adapter,"native_call",side_effect=[{"intent_digest":"same"},{"intent_digest":"same"}]):
                    with patch.object(adapter,"check_export",side_effect=ValueError("divergent verdict")):
                        record=self.call(python_crosscheck=True)
        self.assertEqual(record["execution_status"],"FAILED")
        self.assertEqual(record["native_wer"],"CANONICAL_UNSIGNED")
        self.assertNotIn("cross_implementation_agreement",record)
        diagnostic=json.loads((self.root/"out"/"python-citation-crosscheck.json").read_text())
        self.assertEqual(diagnostic["agreement"],"MISMATCH")

    def test_optional_python_match_records_scope_without_promoting_native_trust(self):
        with patch.object(adapter,"retrieval_call",side_effect=[self.retrieved,self.verification]):
            with patch.object(adapter,"generate",side_effect=self.generated):
                with patch.object(adapter,"native_call",side_effect=[{"intent_digest":"same"},{"intent_digest":"same","citation_report_trust":"RECOMPUTED_IN_BRIDGE_SAME_IMPLEMENTATION"}]):
                    with patch.object(adapter,"check_export",return_value={"agreement":"MATCHED","organizational_independence":False}):
                        record=self.call(python_crosscheck=True)
        self.assertEqual(record["execution_status"],"COMPLETED_UNGRADED")
        self.assertEqual(record["cross_implementation_agreement"],"MATCHED_ASCII_LEXICAL_PROFILE")
        self.assertEqual(record["native_evidence"]["citation_report_trust"],"RECOMPUTED_IN_BRIDGE_SAME_IMPLEMENTATION")


if __name__=="__main__": unittest.main()
