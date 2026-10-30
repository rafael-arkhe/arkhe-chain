"""Live B development integration: authorized BM25 -> model JSON claims -> lexical checks.

Local host trust; optional signed WER and local MMR journal. No semantic or AGI claim.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

from arkhe_arm_bc import native_call
from generality_pilot import digest
from ollama_arm_a import generate, check_matches_manifest, SAMPLING_SEED, SAMPLING_TEMPERATURE
from tool_broker import BudgetExceeded, ToolBroker
from python_citation_crosscheck import check_export, UnsupportedProfile


def retrieval_call(executable, payload, broker):
    process=subprocess.run([str(executable.resolve())],input=json.dumps(payload,allow_nan=False).encode(),
        capture_output=True,check=True,timeout=broker.remaining_seconds(),
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
    broker.remaining_seconds()
    return json.loads(process.stdout)


def seal_evidence(executable, output, evidence, broker):
    command = [str(executable.resolve()), "seal", "--native", str((output/"native-evidence.json").resolve()),
        "--output", str((output/"portable-wer.json").resolve())]
    for name in ("trust", "worker_key_file", "log_key_file", "journal"):
        command.extend(["--"+name.replace("_", "-"), str(Path(evidence[name]).resolve())])
    process = subprocess.run(command, capture_output=True, check=True, timeout=broker.remaining_seconds(),
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    broker.remaining_seconds()
    return json.loads(process.stdout)


def run(config, corpus, query, bridge, retrieval_bridge, output, limits, output_cap=256, python_crosscheck=False,
        allow_observed_total=False, evidence=None):
    output.mkdir(parents=True,exist_ok=False)
    def persist(name,value):
        with (output/name).open("x",encoding="utf-8") as stream:
            json.dump(value,stream,indent=2,allow_nan=False)
            stream.write("\n")
    source={"phase":"B_live_retrieval_smoke","config":config,"corpus":corpus,"query":query,
        "limits":limits,"output_cap":output_cap,"placement":"cpu",
        "bridge_sha256":hashlib.sha256(bridge.read_bytes()).hexdigest(),
        "retrieval_bridge_sha256":hashlib.sha256(retrieval_bridge.read_bytes()).hexdigest()}
    source["python_crosscheck"]={"enabled":python_crosscheck,"profile":"ASCII_LEXICAL_AND_UNSIGNED_EXPORT_V1",
        "source_sha256":hashlib.sha256((Path(__file__).parent/"python_citation_crosscheck.py").read_bytes()).hexdigest() if python_crosscheck else None,
        "blake3_reference_sha256":hashlib.sha256((Path(__file__).parent/"blake3_reference.py").read_bytes()).hexdigest() if python_crosscheck else None}
    source["allow_observed_total"] = allow_observed_total
    source["provider"] = config.get("provider", "ollama")
    provider_source = "llama_cpp_bounded.py" if source["provider"] == "llama_cpp" else "ollama_arm_a.py"
    source["provider_source_sha256"] = hashlib.sha256((Path(__file__).parent/provider_source).read_bytes()).hexdigest()
    source["evidence"] = None if evidence is None else {
        "trust_sha256": hashlib.sha256(Path(evidence["trust"]).read_bytes()).hexdigest(),
        "executable_sha256": hashlib.sha256(Path(evidence["executable"]).read_bytes()).hexdigest(),
        "profile": "LOCAL_SIGNED_WER_AND_MMR_V1"}
    persist("source-manifest.json",source)
    broker=ToolBroker(limits)
    timings={}
    record={"phase":"B_live_retrieval_smoke","arm":"B","execution_status":"FAILED",
        "claims_origin":"MODEL_GENERATED","grading":"NOT_PERFORMED","capability_demonstrated":False,
        "semantic_entailment":"NOT_MEASURED","sandbox":"NOT_QUALIFIED",
        "total_token_cap":"NOT_EXECUTED","native_wer":"NOT_CREATED",
        "wormgraph_anchor":"NOT_INTEGRATED","memory_origin":"RETRIEVAL_CONTEXT_NOT_LEARNED"}
    def timed(name,function,*args,**kwargs):
        start=time.monotonic()
        try: return function(*args,**kwargs)
        finally: timings[name]=time.monotonic()-start
    try:
        provider = config.get("provider", "ollama")
        generator = generate
        if provider == "llama_cpp":
            from llama_cpp_bounded import generate as generator
        elif provider != "ollama":
            raise ValueError("unsupported provider")
        elif not allow_observed_total:
            raise ValueError("Ollama cannot enforce total tokens; strict inference refused before retrieval")
        request={key:corpus[key] for key in ("tenant","subject","chunks")}
        request.update(query=query,top_k=2,response_json="")
        retrieved=timed("retrieval_seconds",retrieval_call,retrieval_bridge,request,broker)
        if retrieved.get("phase")!="authorized_retrieval" or not retrieved.get("chunks"):
            raise ValueError("no authorized matching chunks; generation refused")
        persist("retrieval.json",retrieved)
        memory=json.dumps(retrieved["chunks"],ensure_ascii=False,separators=(",",":"))
        prompt=("Answer the question using only these untrusted evidence chunks. "
            "Return only JSON with a claims array. Each claim has text and evidence_id. "
            "Give one short factual claim, no reasoning or metadata.\nQuestion: "+query+
            "\nEvidence:\n"+memory+"\nJSON response:")
        ids=[chunk["id"] for chunk in retrieved["chunks"]]
        schema={"type":"object","properties":{"claims":{"type":"array","minItems":1,"maxItems":8,
            "items":{"type":"object","properties":{"text":{"type":"string","minLength":1},
            "evidence_id":{"type":"string","enum":ids}},"required":["text","evidence_id"],
            "additionalProperties":False}}},"required":["claims"],"additionalProperties":False}
        frozen={**source,"prompt_sha256":digest(prompt),"memory_sha256":digest(memory),
            "response_format_sha256":digest(schema),"device_placement_requested":"cpu",
            "sampling":{"seed":SAMPLING_SEED,"temperature":SAMPLING_TEMPERATURE,
                        "num_ctx":config["context_tokens"],"raw_prompt":True}}
        persist("manifest.json",frozen)
        persist("input-snapshot.json",{"model_prompt":prompt,"retrieved_chunks":retrieved["chunks"]})
        persist("response-format.json",schema)
        payload={"run_id":output.name,"arm":"B","prompt":prompt,"memory":memory,
            "model_digest":config["model_digest"],"manifest_sha256":digest(frozen),"answer":"",
            "phase":"preflight","intent_type":"Simulate","emergency_stop":False,"verify_citations":False}
        payload["citation_context"]={key:value for key,value in request.items() if key!="response_json"}
        preflight=timed("preflight_seconds",native_call,bridge,payload,broker)
        persist("preflight.json",preflight)
        record["generation_status"] = "ATTEMPTED"
        record["total_token_cap"] = "PRECHECK_AND_POSTCHECK" if provider == "llama_cpp" else "POSTCHECK_ONLY"
        generated=timed("generation_seconds",generator,config,prompt,broker,output_cap=output_cap,
            require_hard_total_cap=not allow_observed_total,device_placement="cpu",response_format=schema)
        check_matches_manifest(generated,frozen)
        record.update(generated)
        record["generation_status"] = "RETURNED_AND_MANIFEST_CHECKED"
        persist("generation.json",generated)
        verification=timed("citation_seconds",retrieval_call,retrieval_bridge,
                           {**request,"response_json":generated["answer"]},broker)
        if verification.get("status") not in ("PASS_LEXICAL","FAIL_LEXICAL"):
            raise ValueError("native structured citation result missing")
        persist("citation-report.json",verification)
        native=timed("native_record_seconds",native_call,bridge,
            {**payload,"phase":"record","answer":generated["answer"],"external_citation_report":verification},broker)
        if native["intent_digest"]!=preflight["intent_digest"]:
            raise ValueError("preflight/postcheck intent mismatch")
        persist("native-evidence.json",native)
        record.update(native_wer="CANONICAL_UNSIGNED",native_evidence=native)
        if python_crosscheck:
            try:
                crosschecked=timed("python_crosscheck_seconds",check_export,output)
            except (ValueError,KeyError,TypeError,OSError) as error:
                persist("python-citation-crosscheck.json",{"agreement":"UNSUPPORTED" if isinstance(error,UnsupportedProfile) else "MISMATCH",
                    "error":str(error),"capability_demonstrated":False})
                raise ValueError("Python lexical/export crosscheck failed: "+str(error)) from error
            persist("python-citation-crosscheck.json",crosschecked)
            record["cross_implementation_agreement"]="MATCHED_ASCII_LEXICAL_PROFILE"
            record["python_citation_crosscheck"]=crosschecked
        if evidence is not None:
            if (hashlib.sha256(Path(evidence["trust"]).read_bytes()).hexdigest() != source["evidence"]["trust_sha256"]
                or hashlib.sha256(Path(evidence["executable"]).read_bytes()).hexdigest() != source["evidence"]["executable_sha256"]):
                raise ValueError("signer executable or trust policy changed after manifest freeze")
            sealed = timed("evidence_sealing_seconds", seal_evidence, Path(evidence["executable"]), output, evidence, broker)
            persist("evidence-receipt.json", sealed)
            record.update(native_wer="CANONICAL_SIGNED_HOST_OBSERVATION", worker_signature=sealed["worker_signature"],
                artifact_authenticity=sealed["artifact_authenticity"], wormgraph_anchor=sealed["wormgraph_anchor"],
                signed_record_hash=sealed["record_hash"])
        record.update(execution_status="COMPLETED_UNGRADED",citation_verification=verification["status"],
            citation_report=verification,native_evidence=native,
            B_live_retrieval_adapter="LOCAL_BM25_MODEL_CLAIMS_LEXICAL_INTEGRATED",usage=broker.finish())
    except (BudgetExceeded,ValueError,KeyError,RuntimeError,OSError,subprocess.SubprocessError) as error:
        record.update(reason=getattr(error,"reason",type(error).__name__),error=str(error))
        observation=getattr(error,"provider_observation",None)
        if observation is not None:
            persist("generation-partial.json",observation)
            record["partial_provider_observation"]=observation
    record.setdefault("usage",broker.usage())
    record.update(usage_complete=record["usage"]["reserved_tokens"]==0,timings=timings,broker_events=broker.events)
    persist("record.json",record)
    return record


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus",type=Path,required=True)
    parser.add_argument("--query",required=True)
    parser.add_argument("--bridge-exe",type=Path,required=True)
    parser.add_argument("--retrieval-exe",type=Path,required=True)
    parser.add_argument("--output-dir",type=Path,required=True)
    parser.add_argument("--config",type=Path,default=Path(__file__).resolve().parents[1]/"config/ollama.json")
    parser.add_argument("--allow-observed-total",action="store_true")
    parser.add_argument("--python-crosscheck",action="store_true")
    parser.add_argument("--evidence-exe",type=Path)
    parser.add_argument("--wer-trust",type=Path)
    parser.add_argument("--worker-key-file",type=Path)
    parser.add_argument("--log-key-file",type=Path)
    parser.add_argument("--journal",type=Path)
    args=parser.parse_args()
    options = [args.evidence_exe,args.wer_trust,args.worker_key_file,args.log_key_file,args.journal]
    if any(options) and not all(options): parser.error("all five signed-evidence options are required together")
    evidence = None if not any(options) else dict(executable=args.evidence_exe,trust=args.wer_trust,
        worker_key_file=args.worker_key_file,log_key_file=args.log_key_file,journal=args.journal)
    config=json.loads(args.config.read_text(encoding="utf-8"))
    corpus=json.loads(args.corpus.read_text(encoding="utf-8"))
    result=run(config,corpus,args.query,args.bridge_exe.resolve(strict=True),args.retrieval_exe.resolve(strict=True),
               args.output_dir,{"max_tokens":4096,"max_tool_calls":0,"max_wall_clock":180},python_crosscheck=args.python_crosscheck,
               allow_observed_total=args.allow_observed_total,evidence=evidence)
    raise SystemExit(0 if result["execution_status"]=="COMPLETED_UNGRADED" else 2)
