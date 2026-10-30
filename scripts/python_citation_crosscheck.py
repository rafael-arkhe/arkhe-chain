"""Second lexical implementation and unsigned artifact crosscheck, ASCII profile.

Uses regex tokenization, exact rational Jaccard, Python CBOR and Python BLAKE3.
Never calls Rust/FFI to compute lexical outcomes. Not semantic verification.
"""
import argparse
import hashlib
import json
import re
from fractions import Fraction
from pathlib import Path

from blake3_reference import b3

CAPITAL_STOPS=set("The This That These Those However Therefore In On At For But And Or A An It We They He She I You If When While Although Because Since After Before During As By Of To With From Not No Yes".split())
WORD_STOPS=set("the a an is are was were be been being of to in on at for with by from as and or but not no if then than that this it its we they he she i you his her their our your my me us them him".split())
TOKEN=re.compile(r"-?[0-9]+(?:[.,][0-9]+)*|[A-Za-z_][A-Za-z0-9_]*")
ID=re.compile(r"[A-Za-z0-9_.:-]+\Z")


class UnsupportedProfile(ValueError): pass


def ascii_text(text):
    if not isinstance(text,str) or len(text)>32768:
        raise UnsupportedProfile("text must be a bounded string")
    if any(ord(c)>126 or (ord(c)<32 and c not in "\n\r\t") for c in text):
        raise UnsupportedProfile("Unicode/control text is outside the qualified ASCII crosscheck profile")


def lexical(claim, evidence):
    """Evaluate one claim without parsing a Rust verdict or reason."""
    text,ref=claim["text"],claim["evidence_id"]
    ascii_text(text)
    if not text.strip() or not isinstance(ref,str) or not ID.fullmatch(ref):
        raise UnsupportedProfile("nonempty claim and simple ASCII evidence ID required")
    if ref not in evidence:
        return {"status":"FAIL_LEXICAL","error_kind":"UnknownEvidence","evidence_id":ref}
    source=evidence[ref]
    ascii_text(source)
    tokens=TOKEN.findall(text)
    for token in tokens:
        numeral=token[0].isdigit() or token.startswith("-")
        entity=numeral or (token[0].isupper() and token not in CAPITAL_STOPS)
        if entity and token not in source:
            return {"status":"FAIL_LEXICAL","error_kind":"EntityNotInEvidence",
                    "evidence_id":ref,"entity":token}
    def words(value):
        return {t.lower() for t in TOKEN.findall(value) if (t[0].isalpha() or t[0]=="_") and t.lower() not in WORD_STOPS}
    left,right=words(text),words(source)
    denominator=len(left|right)
    numerator=len(left&right)
    score=Fraction(numerator,denominator) if denominator else Fraction(0)
    return {"status":"PASS_LEXICAL" if score>=Fraction(1,2) else "FAIL_LEXICAL",
            "error_kind":None if score>=Fraction(1,2) else "InsufficientSupport",
            "evidence_id":ref,"jaccard_numerator":numerator,"jaccard_denominator":denominator,
            "jaccard_score":float(score)}


def matches_native(expected, observed, claim):
    if observed.get("status")!=expected["status"] or observed.get("evidence_id")!=expected["evidence_id"]:
        return False
    reason=observed.get("reason","")
    kind=expected.get("error_kind")
    if kind is None: return "reason" not in observed
    if kind=="UnknownEvidence":
        return reason=="UnknownEvidence("+json.dumps(expected["evidence_id"])+")"
    if kind=="EntityNotInEvidence":
        return reason==("EntityNotInEvidence { entity: "+json.dumps(expected["entity"])+
                        ", chunk: "+json.dumps(expected["evidence_id"])+" }")
    if kind=="InsufficientSupport":
        match=re.fullmatch(r'InsufficientSupport \{ claim: ("(?:[^"\\]|\\.)*"), score: ([0-9.eE+-]+) \}',reason)
        return bool(match and json.loads(match[1])==claim["text"] and float(match[2])==expected["jaccard_score"])
    return False


def head(major, value):
    for maximum,extra,width in ((24,0,0),(256,24,1),(65536,25,2),(2**32,26,4),(2**64,27,8)):
        if value<maximum:
            return bytes([(major<<5)|(value if not width else extra)])+(value.to_bytes(width,"big") if width else b"")
    raise ValueError("integer outside CBOR range")


def cbor(value):
    if value is None: return b"\xf6"
    if value is False: return b"\xf4"
    if value is True: return b"\xf5"
    if type(value) is int: return head(0,value) if value>=0 else head(1,-1-value)
    if isinstance(value,str):
        raw=value.encode("utf-8"); return head(3,len(raw))+raw
    if isinstance(value,bytes): return head(2,len(value))+value
    if isinstance(value,list): return head(4,len(value))+b"".join(cbor(v) for v in value)
    if isinstance(value,dict) and all(isinstance(k,str) for k in value):
        pairs=sorted((cbor(k),cbor(v)) for k,v in value.items())
        return head(5,len(pairs))+b"".join(k+v for k,v in pairs)
    raise UnsupportedProfile("only integer/string/byte/boolean/null CBOR profile supported")


def strict_json(text):
    def unique(pairs):
        result={}
        for key,value in pairs:
            if key in result: raise ValueError("duplicate JSON key")
            result[key]=value
        return result
    return json.loads(text,object_pairs_hook=unique,parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite JSON")))


def load(path):
    raw=path.read_bytes()
    if len(raw)>2_000_000: raise UnsupportedProfile("artifact too large")
    return strict_json(raw)


def check_export(directory):
    generation=load(directory/"generation.json")
    retrieval=load(directory/"retrieval.json")
    report=load(directory/"citation-report.json")
    native=load(directory/"native-evidence.json")
    answer=strict_json(generation["answer"])
    if not isinstance(answer,dict) or set(answer)!={"claims"} or not isinstance(answer["claims"],list) or not 1<=len(answer["claims"])<=64:
        raise ValueError("unsupported claim envelope")
    if any(not isinstance(c,dict) or set(c)!={"text","evidence_id"} for c in answer["claims"]):
        raise ValueError("claim schema differs from native contract")
    chunks=retrieval["chunks"]
    if len(chunks)>32 or len({c["id"] for c in chunks})!=len(chunks):
        raise ValueError("invalid selected evidence identities")
    evidence={c["id"]:c["text"] for c in chunks}
    for ref,text in evidence.items():
        if not ID.fullmatch(ref): raise UnsupportedProfile("unsupported evidence ID")
        ascii_text(text)
    predictions=[lexical(claim,evidence) for claim in answer["claims"]]
    observed=report["claims"]
    agree=len(predictions)==len(observed) and all(matches_native(p,o,c) for p,o,c in zip(predictions,observed,answer["claims"]))
    expected_status="PASS_LEXICAL" if all(p["status"]=="PASS_LEXICAL" for p in predictions) else "FAIL_LEXICAL"
    agree=agree and report["status"]==expected_status
    if not agree: raise ValueError("Python lexical result disagrees with native report")
    if native["citation_report"]!=report: raise ValueError("saved report differs from native evidence")
    report_digest=b3(b"AKG:PILOT:CITATION-REPORT:v1\0"+cbor(report)).hex()
    if report_digest!=native["citation_report_digest"]: raise ValueError("citation report digest mismatch")
    worker=native["worker_record"]
    if worker.get("classification") is not None:
        raise UnsupportedProfile("typed classification WERs are outside this export profile")
    def bytes32(value):
        if not isinstance(value,list) or len(value)!=32 or any(type(v) is not int or not 0<=v<=255 for v in value):
            raise ValueError("invalid digest bytes")
        return bytes(value)
    projection={k:worker[k] for k in ("module_id","module_version","input_digest","output_digest",
                "evidence_refs","confidence_bps","uncertainty_note","execution_id")}
    projection["input_digest"]=bytes32(worker["input_digest"])
    projection["output_digest"]=bytes32(worker["output_digest"])
    projection["evidence_refs"]=[bytes32(v) for v in worker["evidence_refs"]]
    if worker.get("operation") is not None: projection["operation"]=worker["operation"]
    encoded=cbor(projection)
    if encoded.hex()!=native["worker_cbor_hex"] or b3(b"AKG:WER:v1\0"+encoded).hex()!=native["worker_digest"]:
        raise ValueError("unsigned WER encoding/digest mismatch")
    if "lexical_citation_report="+report_digest not in (worker.get("uncertainty_note") or ""):
        raise ValueError("WER does not bind report digest")
    answer_digest=b3(b"AKG:PILOT:ANSWER:v1\0"+generation["answer"].encode()).hex()
    if answer_digest!=bytes32(worker["output_digest"]).hex(): raise ValueError("WER answer binding mismatch")
    return {"phase":"python_lexical_crosscheck","profile":"ASCII_LEXICAL_AND_UNSIGNED_EXPORT_V1",
        "agreement":"MATCHED","claims":predictions,"citation_report_digest":report_digest,
        "report_digest_matched":True,"unsigned_wer_encoding_and_digest_matched":True,
        "model_calls":0,"rust_invoked_for_lexical_computation":False,
        "production_trust_field_modified":False,"organizational_independence":False,
        "semantic_entailment":"NOT_MEASURED","artifact_authenticity":"NOT_VERIFIED_UNSIGNED",
        "scope_exclusions":["BM25 ranking","ACL decisions","source truth","model identity","signatures"],
        "capability_demonstrated":False,
        "python_source_sha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-dir",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    code=0
    try: result=check_export(args.export_dir)
    except (ValueError,KeyError,TypeError,OSError) as error:
        code=3 if isinstance(error,UnsupportedProfile) else 2
        result={"phase":"python_lexical_crosscheck","agreement":"UNSUPPORTED" if code==3 else "MISMATCH",
                "error":str(error),"capability_demonstrated":False}
    with args.output.open("x",encoding="utf-8") as stream:
        json.dump(result,stream,indent=2,allow_nan=False); stream.write("\n")
    raise SystemExit(code)
