"""Capture bounded local validation evidence, never CI or attestation."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCES=["Cargo.lock","scripts/tool_broker.py","scripts/ollama_arm_a.py","scripts/arkhe_b_retrieval.py",
    "orchestration/arkhe-runtime/examples/pilot_evidence.rs",
    "orchestration/arkhe-runtime/examples/pilot_retrieval_citations.rs",
    "orchestration/arkhe-runtime/examples/support/retrieval_citations.rs",
    "scripts/python_citation_crosscheck.py","scripts/blake3_reference.py","scripts/differential_citation_crosscheck.py"]
SOURCES += ["tests/evaluation/python-citation-reference-export-v1/"+name for name in
            ("generation.json","retrieval.json","citation-report.json","native-evidence.json")]
PATTERNS=["test_tool_broker.py","test_ollama_arm_a.py","test_arkhe_b_retrieval.py","test_arkhe_arm_bc.py","test_python_citation_crosscheck.py"]


def hashes():
    paths=SOURCES+["scripts/tests/"+p for p in PATTERNS]
    return {p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir",type=Path,required=True)
    args=parser.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=False)
    before=hashes()
    manifest={"phase":"local_validation","scope":"listed_sources_only_not_full_dependency_closure",
              "source_sha256":before,"remote_ci":False}
    (args.output_dir/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    commands=[(p,[sys.executable,"-m","unittest","discover","-s","scripts/tests","-p",p,"-v"]) for p in PATTERNS]
    commands.append(("native_examples",["cargo","test","--locked","-p","arkhe-runtime",
                     "--example","pilot_evidence","--example","pilot_retrieval_citations"]))
    outcomes=[]
    for name,command in commands:
        with (args.output_dir/(name+".log")).open("x",encoding="utf-8") as stream:
            try:
                process=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=120)
                stream.write(process.stdout+process.stderr)
                outcome={"name":name,"command":command,"exit_code":process.returncode}
            except subprocess.TimeoutExpired as error:
                stream.write("VALIDATION TIMEOUT\n")
                for partial in (error.stdout,error.stderr):
                    if partial: stream.write(partial.decode(errors="replace") if isinstance(partial,bytes) else partial)
                outcome={"name":name,"command":command,"exit_code":None,"reason":"timeout"}
        outcomes.append(outcome)
        print(json.dumps(outcome),flush=True)
    stable=before==hashes()
    report={"phase":"local_validation","outcomes":outcomes,"listed_sources_unchanged":stable,
        "passed":stable and all(o["exit_code"]==0 for o in outcomes),
        "native_shared_tests_run_in_both_examples":True,"remote_ci":False,
        "maturity_if_passed":"LEMMA","capability_demonstrated":False}
    (args.output_dir/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    raise SystemExit(0 if report["passed"] else 2)


if __name__=="__main__": main()
