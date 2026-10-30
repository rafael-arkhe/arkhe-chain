"""Prepare a code-free external review ZIP and separate private reference key."""
import argparse
import hashlib
import json
import random
import zipfile
from pathlib import Path

from differential_citation_crosscheck import cases
from python_citation_crosscheck import lexical, load

ROOT=Path(__file__).resolve().parents[1]
PUBLIC_FILES={"PROFILE.md","cases.jsonl","response.schema.json","submission.json","REVIEW.md","manifest.json"}


def sha(raw): return hashlib.sha256(raw).hexdigest()


def normalized(prediction):
    return {key:prediction.get(key) for key in ("status","error_kind","evidence_id","entity",
                                               "jaccard_numerator","jaccard_denominator")}


def prepare(output):
    output.mkdir(parents=True,exist_ok=False)
    public=output/"public"; private=output/"private"
    public.mkdir(); private.mkdir()
    rows=[{"claim":{"text":text,"evidence_id":ref},"evidence":[{"id":"source","text":source}]}
          for source,text,ref in cases()]
    fixture=ROOT/"tests/evaluation/python-citation-reference-export-v1"
    answer=json.loads(load(fixture/"generation.json")["answer"])
    rows.append({"claim":answer["claims"][0],"evidence":load(fixture/"retrieval.json")["chunks"]})
    rng=random.Random(20261026)
    rng.shuffle(rows)
    answers=[]
    for row in rows:
        row["case_id"]="case-"+format(rng.getrandbits(64),"016x")
        verdict=lexical(row["claim"],{e["id"]:e["text"] for e in row["evidence"]})
        answers.append({"case_id":row["case_id"],"verdict":normalized(verdict)})
    if len({r["case_id"] for r in rows})!=len(rows): raise ValueError("duplicate generated IDs")
    (public/"PROFILE.md").write_bytes((ROOT/"specs/evaluation/ASCII-LEXICAL-EXTERNAL-REVIEW-v1.md").read_bytes())
    (public/"cases.jsonl").write_text("".join(json.dumps(r,ensure_ascii=False)+"\n" for r in rows),encoding="utf-8")
    schema={"type":"object","required":["case_id","verdict"],"additionalProperties":False,
        "properties":{"case_id":{"type":"string"},"verdict":{"type":"object",
        "additionalProperties":False,"required":["status","error_kind","evidence_id","entity","jaccard_numerator","jaccard_denominator"],
        "properties":{"status":{"enum":["PASS_LEXICAL","FAIL_LEXICAL","UNSUPPORTED"]},
        "error_kind":{"enum":[None,"UnknownEvidence","EntityNotInEvidence","InsufficientSupport","UnsupportedProfile"]},
        "evidence_id":{"type":"string"},"entity":{"type":["string","null"]},
        "jaccard_numerator":{"type":["integer","null"],"minimum":0},
        "jaccard_denominator":{"type":["integer","null"],"minimum":0}}}}}
    (public/"response.schema.json").write_text(json.dumps(schema,indent=2)+"\n",encoding="utf-8")
    submission={"submission_kind":"EXTERNAL_REVIEW","reviewer_id":"","organization":"",
        "implementation_sha256":"","no_prior_implementation_access":None,
        "organization_independent_of_original_authors":None,"source_access_disclosure":"",
        "conceptual_review_file":"","spec_sha256":sha((public/"PROFILE.md").read_bytes()),
        "cases_sha256":sha((public/"cases.jsonl").read_bytes())}
    (public/"submission.json").write_text(json.dumps(submission,indent=2)+"\n",encoding="utf-8")
    (public/"REVIEW.md").write_text("Send only this public package to an external reviewer who has not seen the prior source or conversation. Return output JSONL, completed submission manifest, implementation source/archive and a conceptual review. Do not send the organizer's private answer directory or repository. No source will be executed automatically by the grader. No reviewer has been contacted by this preparation step.\n",encoding="utf-8")
    manifest={"profile":"LEX-ASCII-1","cases":len(rows),"contains_prior_implementation_source":False,
        "contains_expected_outputs":False,"files_sha256":{p.name:sha(p.read_bytes()) for p in sorted(public.iterdir())}}
    (public/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    (private/"answers.jsonl").write_text("".join(json.dumps(r)+"\n" for r in answers),encoding="utf-8")
    provenance={"public_manifest_sha256":sha((public/"manifest.json").read_bytes()),
        "reference_source_sha256":sha((ROOT/"scripts/python_citation_crosscheck.py").read_bytes()),
        "reference_cases_are_organizer_generated":True,"external_review_performed":False,
        "organizational_independence_verified":False,"capability_demonstrated":False}
    (private/"provenance.json").write_text(json.dumps(provenance,indent=2)+"\n",encoding="utf-8")
    if {p.name for p in public.iterdir()}!=PUBLIC_FILES: raise ValueError("unexpected public package files")
    with zipfile.ZipFile(output/"external-review.zip","x",compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(PUBLIC_FILES): archive.write(public/name,name)
    return manifest


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir",type=Path,required=True)
    args=parser.parse_args()
    prepare(args.output_dir)
