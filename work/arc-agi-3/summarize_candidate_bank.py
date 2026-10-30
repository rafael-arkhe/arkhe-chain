"""Score actual selection requests separately from final DEV incumbents."""
import hashlib,json
from pathlib import Path
from audit_proposal_identity import controls
from run_example_packages import score
from typed_candidate_bank import bank,response_schema


def main():
    import jsonschema
    out=Path('output/arc3-candidate-bank-smoke-20261027')
    report=json.loads((out/'report.json').read_text());candidates=bank()
    lookup={x['candidate_id']:x for x in candidates};rows=[];final={}
    for control,run in report['runs'].items():
        for i,usage in enumerate(run['usage']):
            entry=run['frontend'][i] if i<len(run['frontend']) else None
            row={'control':control,'request':i+1,'usage':usage,'score':score(controls()[control])}
            if entry and entry['status']=='SELECTED_TYPED_CANDIDATE':
                chosen=lookup[entry['candidate_id']]
                row.update(candidate_id=chosen['candidate_id'],description=chosen['description'],score=score(controls()[control],chosen['proposal']))
            rows.append(row)
        result=run['result']
        final[control]={'stage':result['stage'],'ratification':result['ratification'],
            'candidate_id':next((x['candidate_id'] for x in candidates if x['proposal_sha256']==result.get('incumbent_sha256')),None),
            'score':score(controls()[control],result['incumbent']) if 'incumbent' in result else score(controls()[control])}
    keys=['required_cells','required_correct','pairs','exact_pairs','stationary_pairs','stationary_exact']
    summary={'requests':len(rows),'complete_responses':sum(x['usage'].get('done') is True for x in rows),
        'selected_typed':sum('candidate_id' in x for x in rows),'per_request_global':{k:sum(x['score'][k] for x in rows) for k in keys},
        'rows':rows,'final_incumbents':final,'reported_input_tokens':sum(x['usage'].get('prompt_eval_count') or 0 for x in rows),
        'reported_output_tokens':sum(x['usage'].get('eval_count') or 0 for x in rows),
        'generation_wall_seconds':sum(x['usage']['wall_seconds'] for x in rows),'cleanup':report['cleanup'],
        'warning':'All algorithms supplied manually; selected fit on known DEV controls is not free synthesis, holdout admission or ARC capability.'}
    (out/'summary.json').write_text(json.dumps(summary,indent=2))
    requests=list(out.glob('*/request-*.json'));responses=list(out.glob('*/response-*.json'))
    assert len(requests)==len(responses)==len(rows)==3
    for path in responses:jsonschema.validate(json.loads(json.loads(path.read_text())['response']),response_schema())
    for path in requests:
        prompt=json.loads(json.loads(path.read_text())['prompt'])
        assert prompt['candidate_descriptions']==[{'candidate_id':x['candidate_id'],'description':x['description']} for x in candidates]
        assert 'candidate_bank' not in prompt
    receipt={'tests_passed':161,'three_candidate_lists_equal_frozen_bank':True,'three_response_envelopes_schema_valid':True,
        'candidate_bank_sha256':hashlib.sha256(json.dumps(candidates,sort_keys=True).encode()).hexdigest(),
        'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path('work/arc-agi-3/typed_candidate_bank.py'),Path('work/arc-agi-3/run_candidate_bank_smoke.py')]},
        'report_sha256':hashlib.sha256((out/'report.json').read_bytes()).hexdigest(),'cleanup':report['cleanup']}
    (out/'verification-receipt.json').write_text(json.dumps(receipt,indent=2))
    print(json.dumps({k:v for k,v in summary.items() if k!='rows'},indent=2))


if __name__=='__main__':main()
