"""Compare returned JSONL with a private key. Never execute reviewer code."""
import argparse
import hashlib
import json
from pathlib import Path


def sha_file(path):
    hashed=hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda:stream.read(1024*1024),b""): hashed.update(block)
    return hashed.hexdigest()


def parse(text):
    def unique(pairs):
        result={}
        for key,value in pairs:
            if key in result: raise ValueError("duplicate JSON key")
            result[key]=value
        return result
    def nonfinite(_): raise ValueError("nonfinite JSON")
    return json.loads(text,object_pairs_hook=unique,parse_constant=nonfinite)


def read(path):
    raw=path.read_bytes()
    if len(raw)>8_000_000: raise ValueError("review JSON artifact too large")
    return raw.decode("utf-8")


def result_rows(path):
    rows={}
    required={"status","error_kind","evidence_id","entity","jaccard_numerator","jaccard_denominator"}
    for line in read(path).splitlines():
        if not line.strip(): raise ValueError("blank result row")
        row=parse(line)
        if not isinstance(row,dict) or set(row)!={"case_id","verdict"} or not isinstance(row["case_id"],str):
            raise ValueError("invalid response row")
        verdict=row["verdict"]
        if not isinstance(verdict,dict) or set(verdict)!=required: raise ValueError("invalid verdict schema")
        if verdict["status"] not in ("PASS_LEXICAL","FAIL_LEXICAL","UNSUPPORTED"): raise ValueError("invalid status")
        if verdict["error_kind"] not in (None,"UnknownEvidence","EntityNotInEvidence","InsufficientSupport","UnsupportedProfile"):
            raise ValueError("invalid error kind")
        if not isinstance(verdict["evidence_id"],str) or (verdict["entity"] is not None and not isinstance(verdict["entity"],str)):
            raise ValueError("invalid entity/ID")
        for key in ("jaccard_numerator","jaccard_denominator"):
            value=verdict[key]
            if value is not None and (type(value) is not int or value<0): raise ValueError("cardinalities must be nonnegative integers or null")
        if row["case_id"] in rows: raise ValueError("duplicate case ID")
        rows[row["case_id"]]=verdict
    return rows


def grade(package,returned,submission,implementation):
    public=package/"public"; private=package/"private"
    reference=parse(read(private/"provenance.json"))
    if sha_file(public/"manifest.json")!=reference["public_manifest_sha256"]:
        raise ValueError("public package manifest differs from private commitment")
    manifest=parse(read(public/"manifest.json"))
    allowed={"PROFILE.md","cases.jsonl","response.schema.json","submission.json","REVIEW.md"}
    if set(manifest["files_sha256"])!=allowed: raise ValueError("unexpected package file list")
    for name,expected in manifest["files_sha256"].items():
        if sha_file(public/name)!=expected: raise ValueError("public package file changed")
    claimed=parse(read(submission))
    if claimed.get("submission_kind") not in ("EXTERNAL_REVIEW","ORGANIZER_SELF_TEST"):
        raise ValueError("submission kind required")
    for key in ("no_prior_implementation_access","organization_independent_of_original_authors"):
        if type(claimed.get(key)) is not bool: raise ValueError("explicit source-access/independence declarations required")
    if not claimed.get("reviewer_id") or not claimed.get("organization"): raise ValueError("reviewer identity and organization declaration required")
    source_hash=sha_file(implementation)
    if claimed.get("implementation_sha256")!=source_hash: raise ValueError("submitted source hash mismatch")
    if claimed.get("spec_sha256")!=sha_file(public/"PROFILE.md") or claimed.get("cases_sha256")!=sha_file(public/"cases.jsonl"):
        raise ValueError("reviewer used a different spec or case set")
    expected=result_rows(private/"answers.jsonl")
    actual=result_rows(returned)
    missing=sorted(set(expected)-set(actual)); unknown=sorted(set(actual)-set(expected))
    different=sorted(k for k in set(actual)&set(expected) if actual[k]!=expected[k])
    matched=sum(actual.get(k)==value for k,value in expected.items())
    return {"phase":"external_conformance_grading","conformance":"MATCHED" if not (missing or unknown or different) else "MISMATCH",
        "expected_cases":len(expected),"matched_cases":matched,"missing_case_ids":missing,"unknown_case_ids":unknown,
        "different_case_ids":different,"submission_kind":claimed["submission_kind"],
        "reviewer_id_declared":claimed["reviewer_id"],"organization_declared":claimed["organization"],
        "reviewer_claims_no_prior_source_access":claimed["no_prior_implementation_access"],
        "reviewer_claims_organization_independence":claimed["organization_independent_of_original_authors"],
        "organizational_independence_verified":False,"identity_verified":False,"reviewer_code_executed":False,
        "submitted_source_sha256":source_hash,"conceptual_review":"REQUIRES_HUMAN_ASSESSMENT",
        "production_trust_field_modified":False,"semantic_entailment":"NOT_MEASURED","capability_demonstrated":False}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-dir",type=Path,required=True)
    parser.add_argument("--responses",type=Path,required=True)
    parser.add_argument("--submission",type=Path,required=True)
    parser.add_argument("--implementation-file",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    try: report=grade(args.package_dir,args.responses,args.submission,args.implementation_file)
    except (ValueError,KeyError,TypeError,OSError) as error:
        report={"phase":"external_conformance_grading","conformance":"INVALID_SUBMISSION","error":str(error),
            "organizational_independence_verified":False,"reviewer_code_executed":False,"capability_demonstrated":False}
    with args.output.open("x",encoding="utf-8") as stream: json.dump(report,stream,indent=2); stream.write("\n")
    raise SystemExit(0 if report["conformance"]=="MATCHED" else 2)
