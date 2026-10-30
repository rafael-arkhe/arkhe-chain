"""Seeded ASCII lexical comparison across Python and native Rust, no model calls."""
import argparse
import hashlib
import json
import random
import subprocess
import sys
from pathlib import Path

from blake3_reference import b3
from python_citation_crosscheck import lexical, matches_native


def cases():
    rows=[("Sydney has 5 offices.","Sydney has 5 offices.","source"),
        ("Sydney has 5 offices.","Melbourne has 5 offices.","source"),
        ("Sydney has 5 offices.","Sydney has not 5 offices.","source"),
        ("The treaty was signed in 1957.","The treaty was signed in 1956.","source"),
        ("alpha beta","alpha gamma","source"),("the and a","the a an","source"),
        ("x costs -1.25 and 1,234 units","x costs -1.25 units","source"),
        ("Sydney has offices.","Sydney has offices.","missing"),
        ("15 offices","5 offices","source"),
        ("Reply with the single word OK.","Frozen prior experience is OK.","source")]
    rng=random.Random(20261026)
    vocabulary=["alpha","beta","gamma","delta","model","provider","local","supports","uses","tools"]
    for _ in range(64):
        rows.append((" ".join(rng.sample(vocabulary,rng.randrange(1,9))),
                     " ".join(rng.sample(vocabulary,rng.randrange(1,9))),"source"))
    return rows


def run(executable,output):
    output.mkdir(parents=True,exist_ok=False)
    manifest={"phase":"citation_implementation_differential","seed":20261026,"profile":"ASCII",
        "rust_binary_sha256":hashlib.sha256(executable.read_bytes()).hexdigest(),
        "python_source_sha256":hashlib.sha256((Path(__file__).parent/"python_citation_crosscheck.py").read_bytes()).hexdigest()}
    (output/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    rows=[]
    with (output/"cases.jsonl").open("x",encoding="utf-8") as ledger:
        for index,(source,text,ref) in enumerate(cases()):
            claim={"text":text,"evidence_id":ref}
            payload={"tenant":"test","subject":"reader","chunks":[{"id":"source","tenant":"test",
                "readers":["reader"],"text":source,"source_ref_hex":"ab"*32,
                "expected_digest_hex":b3(b"AKG:RAG:CHUNK:v1\0"+source.encode()).hex()}],
                "response_json":json.dumps({"claims":[claim]})}
            native=subprocess.run([str(executable.resolve())],input=json.dumps(payload).encode(),
                capture_output=True,check=True,timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
            observed=json.loads(native.stdout)["claims"][0]
            expected=lexical(claim,{"source":source})
            row={"index":index,"claim":claim,"source_text":source,"python":expected,"rust":observed,
                 "matched":matches_native(expected,observed,claim)}
            rows.append(row)
            ledger.write(json.dumps(row,allow_nan=False)+"\n"); ledger.flush()
    report={"phase":"citation_implementation_differential","cases":len(rows),
        "matched":sum(r["matched"] for r in rows),"mismatches":[r["index"] for r in rows if not r["matched"]],
        "model_calls":0,"profile":"ASCII_ONLY","organizational_independence":False,
        "semantic_entailment":"NOT_MEASURED","capability_demonstrated":False,
        "known_shared_limitations":["negation can pass","numerals use substring presence","capitalization is heuristic"]}
    (output/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    return report


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-exe",type=Path,required=True)
    parser.add_argument("--output-dir",type=Path,required=True)
    args=parser.parse_args()
    result=run(args.native_exe,args.output_dir)
    raise SystemExit(0 if not result["mismatches"] else 2)
