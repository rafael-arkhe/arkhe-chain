"""Post-hoc empirical grid identity on known controls; not equivalence proof."""
import json
from pathlib import Path
from dsl_proposal_loop import parse_response, digest
import finite_grid_dsl_runtime as rt


def measure(proposal, episodes):
    rows=[]
    for ei, episode in enumerate(episodes):
        state={}
        for ti,(before,action,target) in enumerate(episode):
            result=rt.execute(proposal['ast'],before,action,state,proposal['uses_memory'])
            rows.append({'episode':ei,'transition':ti,
                'target_changes_grid':target!=before,
                'predicted_changes_grid':result['grid']!=before,
                'grid_exact':result['grid']==target,
                'state_unchanged':result['state']==state})
            state=result['state']
    changing=[r for r in rows if r['target_changes_grid']]
    stationary=[r for r in rows if not r['target_changes_grid']]
    return {'queries':len(rows),'grid_identity_on_all_examined_inputs':bool(rows) and all(not r['predicted_changes_grid'] for r in rows),
        'required_change_queries':len(changing),'missed_required_changes':sum(not r['predicted_changes_grid'] for r in changing),
        'stationary_target_queries':len(stationary),'stationary_targets_correct':sum(r['grid_exact'] for r in stationary),
        'exact_queries':sum(r['grid_exact'] for r in rows),'rows':rows}


def controls():
    def grid():return [[0]*64 for _ in range(64)]
    click=[]
    for x,y in [(2,3),(9,7)]:
        b=grid();t=grid();t[y][x]=5;click.append((b,{'kind':'CLICK','x':x,'y':y},t))
    click.append((grid(),{'kind':'NOOP'},grid()))
    free=grid();free[3][3]=5;t=grid();t[3][4]=5
    blocked=grid();blocked[3][3]=5;blocked[3][4]=9
    return {'click':[click],'move':[[(free,{'kind':'MOVE','dx':1,'dy':0},t),(blocked,{'kind':'MOVE','dx':1,'dy':0},blocked)]]}


def main():
    source=Path('output/arc3-local-proposer-schema-20261027')
    cases=controls();records=[]
    for path in sorted(source.glob('*/response-*.json')):
        proposal=parse_response(json.loads(path.read_text(encoding='utf-8'))['response'])
        name='click' if path.parent.name.startswith('click') else 'move'
        records.append({'source':str(path),'proposal_sha256':digest(proposal),'training_sha256':digest(cases[name]),'metrics':measure(proposal,cases[name])})
    report={'phase':'POSTHOC_ARCHIVED_RESPONSE_AUDIT','new_model_calls':0,'new_environment_actions':0,
        'responses_examined':len(records),'unique_programs':len({r['proposal_sha256'] for r in records}),
        'empirical_grid_identity_proposals':sum(r['metrics']['grid_identity_on_all_examined_inputs'] for r in records),
        'limitations':['Known training controls only; no universal program equivalence claim.','Repeated proposals are not independent hypotheses.','Grid identity differs from state identity and from valid stationary targets.'],
        'records':records}
    out=Path('output/arc3-proposal-identity-audit-20261027');out.mkdir(exist_ok=False)
    (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='records'},indent=2))


if __name__=='__main__':main()
