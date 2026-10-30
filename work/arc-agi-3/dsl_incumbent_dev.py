"""DEV-only bounded repair with frozen best AST. No holdout or PROD API."""
import copy,json
from dsl_proposal_loop import canonical,digest,make_request,parse_response,training_check,MAX_REQUEST_BYTES
import finite_grid_dsl_types as d
import finite_grid_dsl_runtime as rt


def evaluate(proposal,episodes):
    exact=0;queries=0
    for episode in episodes:
        state={}
        for before,action,target in episode:
            result=rt.execute(proposal['ast'],before,action,state,proposal['uses_memory'])
            exact+=result['grid']==target;queries+=1;state=result['state']
    return {'exact':exact,'queries':queries,'first_counterexample':training_check(proposal,episodes)}


def run_dev(proposer,dev_episodes,max_attempts=5):
    if type(max_attempts) is not int or not 1<=max_attempts<=5:raise ValueError('budget1..5')
    dev=copy.deepcopy(dev_episodes)
    best=None;best_score=None;best_rank=None;feedback=[];journal=[]
    result={'lane':'DEV','max_attempts':max_attempts,'training_sha256':digest(dev),
            'attempts':journal,'production_effects':0,'ratification':'NOT_EVALUATED',
            'holdout_evaluated':False,'stage':'NONE'}
    for attempt in range(max_attempts):
        payload=json.loads(make_request(dev,feedback))
        payload['current_best']=None if best is None else {'proposal':best,'dev_score':best_score,
            'stage':'CANDIDATE','proposal_sha256':digest(best)}
        payload['repair_task']='Revise the current_best using DEV counterexamples. Return one full AST, not a patch. No production admission or holdout access is provided.'
        request=canonical(payload)
        if len(request.encode())>MAX_REQUEST_BYTES:
            result['status']='REQUEST_LIMIT';break
        row={'attempt':attempt+1,'parent_sha256':None if best is None else digest(best),'request_sha256':digest(request)}
        journal.append(row)
        try:
            raw=proposer(request)
        except Exception as exc:
            row.update(status='PROVIDER_ERROR',error_type=type(exc).__name__);result['status']='PROVIDER_ERROR';break
        try:proposal=parse_response(raw)
        except ValueError as exc:
            row.update(status='PARSE_TYPE_REJECTED',reason=str(exc));feedback.append({'attempt':attempt+1,'reason':str(exc)})
            continue
        try:score=evaluate(proposal,dev)
        except Exception as exc:
            row.update(status='EXECUTION_ERROR',error_type=type(exc).__name__)
            feedback.append({'attempt':attempt+1,'reason':'EXECUTION_ERROR','error_type':type(exc).__name__});continue
        row.update(status='DEV_EVALUATED',proposal_sha256=digest(proposal),dev_score=score)
        # Total panel is fixed; rank exact whole grids, then smaller AST, then hash.
        rank=(-score['exact'],d.count(proposal['ast']),digest(proposal))
        selected=score['queries']>0 and (best_rank is None or rank<best_rank)
        row['selected_as_incumbent']=selected
        if selected:best=copy.deepcopy(proposal);best_score=copy.deepcopy(score);best_rank=rank
        feedback.append({'attempt':attempt+1,'proposal_sha256':digest(proposal),'training_counterexample':score['first_counterexample']})
        if best_score and best_score['queries']>0 and best_score['exact']==best_score['queries']:
            result.update(status='DEV_EXACT_CANDIDATE_FOUND',stage='PROVISIONAL');break
    else:result['status']='BUDGET_EXHAUSTED'
    result.setdefault('status','BUDGET_EXHAUSTED')
    if best is not None:
        result['incumbent']=best;result['incumbent_sha256']=digest(best);result['dev_score']=best_score
        if result['stage']!='PROVISIONAL':result['stage']='CANDIDATE'
    return result


if __name__=='__main__':
    from pathlib import Path
    from audit_proposal_identity import controls
    out=Path('output/arc3-incumbent-dev-fixture-20261027');out.mkdir(exist_ok=False)
    identity={'uses_memory':False,'ast':d.node('pair',d.var('g'),d.var('s'))}
    correct={'uses_memory':False,'ast':d.controls()['click']}
    answers=iter([canonical(identity),canonical(correct)])
    requests=[]
    def fixture(request):requests.append(json.loads(request));return next(answers)
    result=run_dev(fixture,controls()['click'],2)
    report={'source':'MANUAL_FIXTURE_NOT_MODEL_SYNTHESIS','model_calls':0,'result':result,'requests':requests}
    (out/'report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'stage':result['stage'],'ratification':result['ratification'],'dev_exact':result['dev_score']['exact']}))
