"""Evaluate expected-free requests, freeze outputs, then compare selected fields."""
from pathlib import Path
import json
import subprocess
from reader import evaluate, load_registry

ROOT=Path(__file__).resolve().parent
UP=ROOT.parent/'upstream'

def read_json(path): return json.loads(path.read_bytes())
def write_json(path, data): path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def differences(actual,expected,path=''):
    if isinstance(actual,dict) and isinstance(expected,dict):
        out=[]
        for key in sorted(actual.keys()|expected.keys()):
            p=f'{path}/{key}'
            if key not in actual or key not in expected: out.append(dict(path=p,actual=actual.get(key),expected=expected.get(key)))
            else: out.extend(differences(actual[key],expected[key],p))
        return out
    if actual != expected: return [dict(path=path,actual=actual,expected=expected)]
    return []

def run():
    vectors=read_json(UP/'vectors.json')
    requests=[dict(artifact_id=v['name'],claimed_state=v['claimed_state'],context=v['context'],evidence=v['evidence'],use_registry=v['use_registry']) for v in vectors]
    registry=load_registry((UP/'registry.json').read_bytes(),(UP/'registry.json.sig').read_text(),(UP/'trust_root.json').read_bytes())
    bindings=read_json(UP/'bindings.json')
    outputs=[evaluate(r,registry if r['use_registry'] else None,bindings=bindings) for r in requests]
    outputs=json.loads(subprocess.run(['node',str(ROOT/'decision_ids.mjs')],input=json.dumps(outputs),text=True,capture_output=True,check=True).stdout)
    strict=[evaluate(r,registry if r['use_registry'] else None,profile='strict-text') for r in requests]
    # Evaluate all inputs before comparing any expected result. Existing freeze is immutable.
    for name,data in [('requests.json',requests),('decisions.json',outputs),('strict-decisions.json',strict)]:
        target=ROOT/name
        if target.exists():
            if read_json(target)!=data: raise SystemExit(f'Fresh output differs from frozen {name}')
        else: write_json(target,data)
    cases=[]
    for v,actual in zip(vectors,outputs):
        if set(actual)!=set(v['expected']):
            raise SystemExit(f"Output field set differs: {v['name']}")
        expected={key:v['expected'][key] for key in actual}
        diff=differences(actual,expected)
        cases.append(dict(id=v['name'],verdict_match=all(actual[k]==expected[k] for k in ['final_epistemic_state','status']),
            compared_fields=list(actual),differences=diff))
    summary=dict(cases=len(cases),verdict_matches=sum(c['verdict_match'] for c in cases),
        all_compared_fields_match=sum(not c['differences'] for c in cases),
        field_differences=sum(len(c['differences']) for c in cases),
        omitted_upstream_fields=[],
        registry_root_signers=registry['signers'],cases_detail=cases)
    summary['strict_text_differences']=[dict(id=v['name'],differences=differences(a,{k:v['expected'][k] for k in a})) for v,a in zip(vectors,strict) if differences(a,{k:v['expected'][k] for k in a})]
    target=ROOT/'comparison.json'
    if target.exists():
        if read_json(target)!=summary: raise SystemExit('Fresh comparison differs from frozen comparison')
    else: write_json(target,summary)
    print(json.dumps({k:v for k,v in summary.items() if k!='cases_detail'},indent=2))
    for c in cases:
        if c['differences']: print(c['id'],json.dumps(c['differences']))
    if summary['cases']!=54 or summary['all_compared_fields_match']!=54:
        raise SystemExit('Complete decision comparison failed')
    return summary

if __name__=='__main__': run()
