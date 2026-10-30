"""Offline counterfactual branches of a retained active prefix, not new observations."""
import json
from pathlib import Path
from micro_evaluation_evidence import digest
from hidden_mechanics_micro import render, advance, ACTIONS
from persistent_goal_pilot import public_map
from history_family_diagnostic import j2_jump_position
from run_r3_symmetric import SYMMETRIC
from run_d2_active import position


def analyze(source):
    source = Path(source)
    report = json.loads((source/'report.json').read_text())
    expected = next(r['active_report']['final_head'] for r in report['results'] if r['start']==[0,3])
    path = source/'start-0-3.jsonl'; raw = path.read_bytes()
    rows = [json.loads(line) for line in raw.decode().splitlines()]
    previous='0'*64
    for seq,row in enumerate(rows):
        body={k:v for k,v in row.items() if k!='hash'}
        if row['seq']!=seq or row['previous']!=previous or row['hash']!=digest(body):
            raise ValueError('SOURCE_CHAIN_MISMATCH')
        previous=row['hash']
    if previous!=expected: raise ValueError('SOURCE_HEAD_MISMATCH')
    initial=set(SYMMETRIC.values()); current=set(initial); milestones={}; count=0
    for row in rows:
        p=row['payload']
        if p['event']=='prediction_committed':
            pending=p
            if count==0:base,_=public_map(p['before'])
        elif p['event']=='observation_recorded':
            before=pending['before']['grid']; after=p['after']['grid']; action=pending['action']
            pos=position(before)
            current={h for h in current if render(base,advance(base,pos,h[ACTIONS.index(action)]))==after}
            count+=1
            if count in (5,6):
                milestones[count]={'candidates':set(current),'grid':after,'prefix_head':row['hash']}
    branches=[]
    for step in (5,6):
        milestone=milestones[step]; before=milestone['grid']; pos=position(before)
        if pos!=(2,3):raise ValueError('EXPECTED_A_AT_PREFIX')
        alternatives={
            'J2_CONSTRUCTED_STAY':render(base,j2_jump_position(base,pos,(2,0))),
            'J1_CONSTRUCTED_JUMP':render(base,advance(base,pos,(2,0)))}
        predictions={digest(render(base,advance(base,pos,h[1]))) for h in milestone['candidates']}
        results={}
        for label,after in alternatives.items():
            h0={h for h in initial if render(base,advance(base,pos,h[1]))==after}
            accumulated=milestone['candidates'] & h0
            results[label]={'isolated_transition_candidates':len(h0),
                            'prefix_plus_branch_candidates':len(accumulated),
                            'after':after,'remaining_ids':[key for key,h in SYMMETRIC.items() if h in accumulated]}
        branches.append({'prefix_through_action':step,'position':list(pos),
            'source_prefix_observation_hash':milestone['prefix_head'],
            'prefix_candidates':len(milestone['candidates']),
            'prefix_candidate_ids':[key for key,h in SYMMETRIC.items() if h in milestone['candidates']],
            'ACTION2_prediction_count':len(predictions),'ACTION2':'hypothetical, not executed in source',
            'results':results})
    return {'source_log_sha256':__import__('hashlib').sha256(raw).hexdigest(),
            'source_final_head':previous,'source_rows_checked':len(rows),'branches':branches,
            'environment_actions':0,'counterfactual_constraints':4,
            'scope':'Offline known-J2 counterfactual; original continuation excluded; no policy or historical execution claim'}


def run(source,out):
    out=Path(out);out.mkdir(exist_ok=False);(out/'sources').mkdir()
    names=('run_d3_hybrid.py','run_d2_active.py','history_family_diagnostic.py','run_r3_symmetric.py',
           'run_d2_start.py','run_r2_extended.py','run_p0_greedy.py','policy_contract_controls.py',
           'persistent_goal_pilot.py','prospective_policy_step.py','hidden_mechanics_micro.py','micro_evaluation_evidence.py')
    manifest={'format':'D3_OFFLINE_COUNTERFACTUAL_V1','source_directory':str(Path(source).resolve()),
              'prefixes':[5,6],'action':'ACTION2','family_digest':digest(SYMMETRIC),
              'source_digests':{n:digest(Path(__file__).with_name(n).read_text()) for n in names}}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
    for n in names:(out/'sources'/n).write_bytes(Path(__file__).with_name(n).read_bytes())
    (out/'source-trace').mkdir()
    for n in ('start-0-3.jsonl','report.json','manifest.json'):
        (out/'source-trace'/n).write_bytes((Path(source)/n).read_bytes())
    result=analyze(source);(out/'report.json').write_text(json.dumps(result,indent=2));return result


def verify(out):
    out=Path(out);manifest=json.loads((out/'manifest.json').read_text())
    if manifest['family_digest']!=digest(SYMMETRIC):raise ValueError('FAMILY_MISMATCH')
    for n,expected in manifest['source_digests'].items():
        if digest(Path(__file__).with_name(n).read_text())!=expected or digest((out/'sources'/n).read_text())!=expected:
            raise ValueError('SOURCE_MISMATCH')
    result=analyze(out/'source-trace')
    if result!=json.loads((out/'report.json').read_text()):raise ValueError('REPORT_MISMATCH')
    return {'status':'LOCAL_COUNTERFACTUAL_RECOMPUTED','environment_actions':0,
            'counterfactual_constraints':4,'source_log_bound_by_hash':True,'authentication':'NOT_ESTABLISHED'}


if __name__=='__main__':
    import sys
    if sys.argv[1]=='verify':
        result=verify(sys.argv[2]);(Path(sys.argv[2])/'verification.json').write_text(json.dumps(result,indent=2))
    else:result=run(sys.argv[1],sys.argv[2])
    print(json.dumps(result,indent=2))
