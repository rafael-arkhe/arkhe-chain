"""Check explicit claims against a pinned excerpt from local provider documentation."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from blake3_reference import b3


def run(source, executable, output):
    raw=source.read_bytes()
    text=raw.decode("utf-8").replace("\r\n","\n")
    start=text.index("The local provider uses")
    end=text.index("\n\n",start)
    chunk_text=" ".join(text[start:end].split())
    # Keep the actual source paragraph, including its limits; never use the ID as text.
    chunk={"id":"ollama-readme-local-provider", "tenant":"pilot", "readers":["diagnostic-reader"],
        "text":chunk_text,"expected_digest_hex":b3(b"AKG:RAG:CHUNK:v1\0"+chunk_text.encode()).hex(),
        "source_ref_hex":b3(b"AKG:PILOT:LOCAL-SOURCE:v1\0"+raw).hex()}
    cases={"literal_source_claim":chunk_text,"changed_entity_claim":chunk_text.replace("Ollama","UnlistedVendor")}
    output.mkdir(parents=True,exist_ok=False)
    manifest={"phase":"retrieval_citation_smoke","source_path":str(source.resolve()),
        "source_raw_sha256":hashlib.sha256(raw).hexdigest(),"excerpt_transform":"join_whitespace",
        "source_excerpt":chunk_text,"bridge_sha256":hashlib.sha256(executable.read_bytes()).hexdigest(),
        "new_model_calls":0,"external_factual_validation":False}
    (output/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    reports={}
    for name,claim in cases.items():
        payload={"tenant":"pilot","subject":"diagnostic-reader","chunks":[chunk],
            "response_json":json.dumps({"claims":[{"text":claim,"evidence_id":chunk["id"]}]})}
        (output/(name+"-input.json")).write_text(json.dumps(payload,indent=2)+"\n",encoding="utf-8")
        process=subprocess.run([str(executable.resolve())],input=json.dumps(payload).encode(),
            capture_output=True,check=True,timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
        reports[name]=json.loads(process.stdout)
    report={"phase":"retrieval_citation_smoke","new_model_calls":0,"cases":reports,
            "claims_origin":"HOST_AUTHORED_DIAGNOSTIC","capability_demonstrated":False,
            "B_live_retrieval_adapter":"NOT_INTEGRATED"}
    (output/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    return report


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",type=Path,default=Path(__file__).resolve().parents[1]/"integration/arkhe-ollama/README.md")
    parser.add_argument("--bridge-exe",type=Path,required=True)
    parser.add_argument("--output-dir",type=Path,required=True)
    args=parser.parse_args()
    run(args.source,args.bridge_exe,args.output_dir)
