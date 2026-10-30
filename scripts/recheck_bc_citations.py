"""Reanalyze a completed B export with native lexical checks, without inference."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from generality_pilot import digest


def recheck(source, executable, output):
    manifest, snapshot, record = (json.loads((source/name).read_text(encoding="utf-8"))
        for name in ("manifest.json","input-snapshot.json","record.json"))
    if record.get("execution_status") != "COMPLETED_UNGRADED" or record.get("arm") != "B":
        raise ValueError("source must be a completed, ungraded B export")
    if digest(snapshot["model_prompt"]) != manifest["prompt_sha256"] or digest(snapshot["memory"]) != manifest["memory_sha256"]:
        raise ValueError("snapshot differs from source manifest")
    if record.get("prompt_sha256") != manifest["prompt_sha256"] or record.get("model_digest") != manifest["config"]["model_digest"]:
        raise ValueError("source record differs from source manifest")
    output.mkdir(parents=True,exist_ok=False)
    frozen = {"phase":"artifact_reanalysis","source_directory":str(source.resolve()),
        "source_manifest_sha256":digest(manifest),"source_record_sha256":digest(record),
        "input_snapshot_sha256":digest(snapshot),"verify_citations":True,
        "bridge_binary_sha256":hashlib.sha256(executable.read_bytes()).hexdigest()}
    with (output/"manifest.json").open("x",encoding="utf-8") as stream:
        json.dump(frozen,stream,indent=2)
    payload = {"run_id":output.name,"arm":"B","prompt":snapshot["model_prompt"],
        "memory":snapshot["memory"],"model_digest":manifest["config"]["model_digest"],
        "manifest_sha256":digest(frozen),"answer":record["answer"],"phase":"record",
        "intent_type":"Simulate","emergency_stop":False,"verify_citations":True}
    process = subprocess.run([str(executable.resolve())],input=json.dumps(payload).encode(),
        capture_output=True,check=True,timeout=10,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    native = json.loads(process.stdout)
    if native.get("citation_report") is None or native.get("gate") != "ALLOW":
        raise ValueError("native report missing or gate rejected reanalysis")
    report = {"phase":"artifact_reanalysis","new_model_calls":0,
        "source_execution_rewritten":False,"independent_evaluator":False,
        "capability_demonstrated":False,"grading":"NOT_PERFORMED", "native_evidence":native}
    with (output/"report.json").open("x",encoding="utf-8") as stream:
        json.dump(report,stream,indent=2)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir",type=Path,required=True)
    parser.add_argument("--bridge-exe",type=Path,required=True)
    parser.add_argument("--output-dir",type=Path,required=True)
    args = parser.parse_args()
    recheck(args.source_dir,args.bridge_exe,args.output_dir)
