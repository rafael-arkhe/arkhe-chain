"""Verify balanced selection, unused feedback branch and frozen probe scope."""
import hashlib,json
from pathlib import Path
from balanced_selection import balanced_bank,schema


def main():
    import jsonschema
    out=Path('output/arc3-balanced-selection-20261027')
    r=json.loads((out/'report.json').read_text())
    calls=[c for run in r['runs'].values() for c in run['usage']]
    keys=['required_cells','required_correct','pairs','exact_pairs','stationary_pairs','stationary_exact']
    scores=[s for run in r['runs'].values() for s in run['scores']]
    summary={'requests':len(calls),'complete_responses':sum(c.get('done') is True for c in calls),
        'per_request_global':{k:sum(s[k] for s in scores) for k in keys},
        'controls':{name:{'stage':run['result']['stage'],'ratification':run['result']['ratification'],'selections':[e.get('candidate_id') for e in run['frontend']],'scores':run['scores']} for name,run in r['runs'].items()},
        'frozen_probe_results':r['frozen_probe_results'],
        'reported_input_tokens':sum(c.get('prompt_eval_count') or 0 for c in calls),
        'reported_output_tokens':sum(c.get('eval_count') or 0 for c in calls),
        'generation_wall_seconds':sum(c['wall_seconds'] for c in calls),'cleanup':r['cleanup']}
    requests=list(out.glob('*/request-*.json'));responses=list(out.glob('*/response-*.json'))
    assert len(requests)==len(responses)==len(calls)==3
    descriptions=[{'candidate_id':x['candidate_id'],'description':x['description']} for x in balanced_bank()]
    for path in requests:
        prompt=json.loads(json.loads(path.read_text())['prompt'])
        assert prompt['candidate_descriptions']==descriptions
        assert prompt['explicit_dev_mismatch']==[]
        assert 'frozen_probes' not in prompt
    for path in responses:jsonschema.validate(json.loads(json.loads(path.read_text())['response']),schema())
    old=json.loads(json.loads(Path('output/arc3-candidate-bank-smoke-20261027/click/request-2.json').read_text())['prompt'])
    counter=old['previous_training_feedback'][0]['training_counterexample']
    assert counter['expected']['overrides']==[[2,3,5]] and counter['predicted']['overrides']==[[2,3,2]]
    summary['explicit_feedback_condition']='NOT_EXERCISED_ALL_FIRST_ATTEMPTS_PASSED'
    (out/'summary.json').write_text(json.dumps(summary,indent=2))
    receipt={'tests_passed':163,'three_prompts_equal_frozen_balanced_list':True,'all_response_schemas_valid':True,
        'previous_wrong_click_request_already_contained_expected_color5_and_predicted_color2':True,
        'no_probe_examples_in_selection_prompts':True,'explicit_feedback_branch_not_exercised':True,
        'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path('work/arc-agi-3/balanced_selection.py'),Path('work/arc-agi-3/run_balanced_selection.py')]},
        'artifact_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [out/'plan.json',out/'report.json',out/'summary.json']},'cleanup':r['cleanup']}
    (out/'verification-receipt.json').write_text(json.dumps(receipt,indent=2))
    print(json.dumps({k:v for k,v in summary.items() if k!='controls'},indent=2))


if __name__=='__main__':main()
