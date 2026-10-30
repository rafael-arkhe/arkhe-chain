"""CPU-only bridge contract tests. Fake native modules do not validate GPU inference."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("deepinfer_bridge", HERE / "bridge.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

def envelope():
    request = json.loads((HERE / "request.example.json").read_text())
    return {"protocol": 1, "request_digest": "ab" * 32, "request": request}

def engine_config():
    config = json.loads((HERE / "engine.example.json").read_text())
    config["repository"] = str(HERE)
    config["model_directory"] = str(HERE / "fake-checkpoint")
    return config

class BridgeTests(unittest.TestCase):
    def test_sampling_and_structured_outputs_map_to_native_contract(self):
        value = envelope()
        for kind, schema in [("regex", "[a-z]+"), ("json", '{"type":"object"}'), ("ebnf", 'root ::= "yes"')]:
            value["request"]["sampling"]["structured_output"] = {"schema_type":kind,"schema":schema}
            request = bridge.validate_request(value)
            native = bridge.sampling_kwargs(request["sampling"])
            self.assertEqual(native["so_args"], {"schema_type":kind,"schema":schema})
            self.assertEqual(native["seq_seed"],42)

    def test_invalid_inputs_are_rejected_before_engine_import(self):
        base = envelope()
        for key,value in [("temperature", float("nan")),("top_k",0),("max_tokens",True),("seq_seed",-1),("top_p",0),("deterministic","yes")]:
            invalid = copy.deepcopy(base); invalid["request"]["sampling"][key]=value
            with self.assertRaises(ValueError): bridge.validate_request(invalid)
        invalid=copy.deepcopy(base);invalid["request"]["sampling"]["seq_seed"]=None
        with self.assertRaises(ValueError): bridge.validate_request(invalid)
        invalid=copy.deepcopy(base);invalid["protocol"]=True
        with self.assertRaises(ValueError): bridge.validate_request(invalid)

    def test_native_mapping_and_cleanup_using_fake_engine(self):
        captured={}
        class FakeSampling:
            def __init__(self,**kwargs):captured["sampling"]=kwargs
        class FakeLLM:
            def __init__(self,**kwargs):captured["engine"]=kwargs
            def generate(self,**kwargs):
                captured["generate"]=kwargs
                return [[types.SimpleNamespace(token_id=1,finished=True,finish_reason="stop")]]
            def get_tokenizer(self):return types.SimpleNamespace(decode=lambda *args,**kwargs:'{"proposal":"fix"}')
            def close(self):captured["closed"]=True
        modules={"deepinfer":types.ModuleType("deepinfer"),"deepinfer.entrypoints":types.ModuleType("deepinfer.entrypoints"),"deepinfer.entrypoints.llm":types.SimpleNamespace(LLM=FakeLLM),"deepinfer.sampling_params":types.SimpleNamespace(SamplingParams=FakeSampling)}
        config=engine_config();bridge.validate_config(config)
        request=envelope();request["request"]["model"]=config["model_directory"]
        with patch.dict(sys.modules,modules),patch.dict(os.environ,{"WORLD_SIZE":"1","RANK":"0"}),patch.object(sys,"path",list(sys.path)),patch.object(bridge,"preflight",return_value=(Path("/source"),Path(config["model_directory"]))):
            output=bridge.generate(request,config)
            self.assertEqual(os.environ["DEEPINFER_BATCH_INVARIANT"],"1")
            self.assertEqual(os.environ["DEEPINFER_ENABLE_MTP_VARLEN"],"0")
        self.assertTrue(captured["closed"])
        self.assertEqual(captured["engine"]["context_parallel_size"],8)
        self.assertEqual(captured["engine"]["data_parallel_size"],1)
        self.assertEqual(captured["sampling"]["seq_seed"],42)
        self.assertEqual(output["engine_revision"],bridge.REVISION)
        self.assertEqual(output["request_digest"],envelope()["request_digest"])

    def test_unsupported_platform_and_determinism_fail_explicitly(self):
        config=engine_config()
        with patch.object(sys,"platform","win32"):
            with self.assertRaisesRegex(ValueError,"Linux"):bridge.preflight(config)
        config["accelerator"]="ascend"
        request=envelope();request["request"]["model"]=config["model_directory"]
        with patch.object(bridge,"preflight",return_value=(Path("/source"),Path(config["model_directory"]))),patch.dict(os.environ,{}):
            with self.assertRaisesRegex(ValueError,"NVIDIA-only"):bridge.generate(request,config)

    def test_engine_config_rejects_unknown_and_invalid_settings(self):
        base=engine_config()
        for key,value in [("parallel_size",0),("gpu_memory_utilization",float("nan")),("trust_remote_code","yes"),("repository","relative")]:
            config=copy.deepcopy(base);config[key]=value
            with self.assertRaises(ValueError):bridge.validate_config(config)

if __name__ == "__main__":unittest.main()
