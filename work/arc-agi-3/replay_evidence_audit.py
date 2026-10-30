"""Keep fitted model replay, future prediction and controlled environment replay separate."""
from collections import Counter
import argparse
import json
from pathlib import Path
from analyze_saved_frames import load
from border_mask_probe import FrozenLookup,project,sha


class ModelEvidence:
    def __init__(self):
        self.replay=Counter();self.future=Counter()

    def model_replay(self,predicted,observed):
        self.replay['queries']+=1
        self.replay['abstentions']+=int(predicted is None)
        if predicted is not None:
            self.replay['issued']+=1;self.replay['correct']+=int(predicted==observed)

    def future_prediction(self,predicted,observed,unseen_raw,unseen_abstract):
        self.future['queries']+=1
        self.future['unseen_raw_queries']+=int(unseen_raw)
        self.future['unseen_abstract_queries']+=int(unseen_abstract)
        if predicted is None:return
        self.future['issued']+=1;self.future['correct']+=int(predicted==observed)
        self.future['unseen_raw_issued']+=int(unseen_raw)
        self.future['unseen_raw_correct']+=int(unseen_raw and predicted==observed)
        self.future['unseen_abstract_issued']+=int(unseen_abstract)
        self.future['unseen_abstract_correct']+=int(unseen_abstract and predicted==observed)

    def report(self):
        return {'model_replay':dict(self.replay),'frozen_future':dict(self.future),
                'full_training_model_replay_pass':bool(self.replay['queries']) and self.replay['queries']==self.replay['correct'],
                'future_prediction_error':1-self.future['correct']/self.future['issued'] if self.future['issued'] else None,
                'controlled_environment_replay_count':0,
                'controlled_environment_replay_status':'NOT_PERFORMED',
                'confirmation_status':'NO_CAUSAL_CONFIRMATION_FROM_MODEL_REPLAY',
                'promotion_decision':'NOT_MADE_BY_DIAGNOSTIC'}


def audit(path,prefix,border):
    records=[json.loads(l) for l in path.read_text(encoding='utf-8').splitlines()]
    model=FrozenLookup();training=[];rawpairs=set()
    for r in records[:prefix]:
        if r['action']['id']==0:continue
        before=load(path.parent,r['before_frame']);after=load(path.parent,r['after_frame'])
        action=sha(r['action']);abstract=r['before'] if border is None else sha(project(before,border))
        full=sha(project(after,0));retained=full if border is None else sha(project(after,border))
        key=(abstract,action);model.observe(key,retained,full);training.append((key,retained,full))
        rawpairs.add((r['before'],action))
    evidence={scope:ModelEvidence() for scope in ('retained','full')}
    frozen=model.digest()
    for key,retained,full in training:
        pr,pf=model.predict(key);evidence['retained'].model_replay(pr,retained);evidence['full'].model_replay(pf,full)
    for r in records[prefix:]:
        if r['action']['id']==0:continue
        before=load(path.parent,r['before_frame']);after=load(path.parent,r['after_frame'])
        action=sha(r['action']);abstract=r['before'] if border is None else sha(project(before,border))
        full=sha(project(after,0));retained=full if border is None else sha(project(after,border))
        key=(abstract,action);pr,pf=model.predict(key)
        unseen_raw=(r['before'],action) not in rawpairs;unseen_abstract=key not in model.retained
        evidence['retained'].future_prediction(pr,retained,unseen_raw,unseen_abstract)
        evidence['full'].future_prediction(pf,full,unseen_raw,unseen_abstract)
    assert frozen==model.digest()
    return {'trace':path.name,'border_rows_each_end':border,'frozen_model_sha256':frozen,
            'retained_target':evidence['retained'].report(),'full_target':evidence['full'].report()}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input-dir',required=True,type=Path)
    p.add_argument('--output-dir',required=True,type=Path);args=p.parse_args()
    out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=False)
    import hashlib
    paths=sorted((args.input_dir/'seed-0-budget-5000').glob('*.jsonl'))
    plan={'phase':'POSTHOC_MODEL_REPLAY_EVIDENCE_AUDIT','source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'train_prefix_dispatches':2500,'border_configurations':[None,2],
          'new_environment_actions':0,'environment_replays_performed':0,'live_agent_modified':False,
          'trace_sources':[{'path':str(path.resolve()),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths]}
    (out/'plan.json').write_text(json.dumps(plan,indent=2));rows=[]
    for path in paths:
        for border in (None,2):
            row=audit(path,2500,border);rows.append(row)
            (out/'report.json').write_text(json.dumps({**plan,'rows':rows,'complete':False},indent=2))
            print(json.dumps({'trace':path.name,'border':border,'replay_pass_retained':row['retained_target']['full_training_model_replay_pass'],
                              'replay_pass_full':row['full_target']['full_training_model_replay_pass']}),flush=True)
    (out/'report.json').write_text(json.dumps({**plan,'rows':rows,'complete':True},indent=2))
