"""Frozen-prefix diagnostic of border masking, aliasing and future prediction.

No logical-state labels are inferred; no mask is promoted to the agent.
"""
from collections import Counter
import argparse
import hashlib
import json
from pathlib import Path
from analyze_saved_frames import load

CONFIGS=[('all-frame-identity',None),('last-frame-only',0),('border-1',1),
         ('border-2',2),('border-4',4),('border-8',8)]

def sha(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def project(value,border):
    grid=value['frame'][-1] if value['frame'] else []
    if border and len(grid)<=2*border:raise ValueError('mask removes entire board')
    masked=[([0]*len(row) if border and (y<border or y>=len(grid)-border) else row)
            for y,row in enumerate(grid)]
    return {'frame':masked,'state':value['state'],'levels_completed':value['levels_completed'],
            'available_actions':value['available_actions']}

def single_prediction(counts):
    return next(iter(counts)) if counts and len(counts)==1 else None

class FrozenLookup:
    def __init__(self):self.retained={};self.full={}
    def observe(self,key,retained,full):
        self.retained.setdefault(key,Counter())[retained]+=1
        self.full.setdefault(key,Counter())[full]+=1
    def predict(self,key):
        return single_prediction(self.retained.get(key)),single_prediction(self.full.get(key))
    def conflicts(self):
        return {'retained_target_conflicting_train_pairs':sum(len(v)>1 for v in self.retained.values()),
                'full_target_conflicting_train_pairs':sum(len(v)>1 for v in self.full.values())}
    def digest(self):
        export=lambda mapping:[(key,sorted(counts.items())) for key,counts in sorted(mapping.items())]
        return sha({'retained':export(self.retained),'full':export(self.full)})

def evaluate(path,records,prefix):
    models={name:FrozenLookup() for name,_ in CONFIGS}
    aliases={name:{} for name,_ in CONFIGS};train_raw_pairs=set();train_raw_states=set();train_actions=set()
    totals={name:Counter() for name,_ in CONFIGS};source_hashes=set();source=path.parent
    for r in records[:prefix]:
        if r['action']['id']==0:continue
        before=load(source,r['before_frame']);after=load(source,r['after_frame'])
        action=sha(r['action']);raw=r['before'];train_raw_pairs.add((raw,action));train_raw_states.add(raw);train_actions.add(action)
        full=sha(project(after,0));source_hashes.add(raw)
        for name,border in CONFIGS:
            abstract=raw if border is None else sha(project(before,border))
            retained=full if border is None else sha(project(after,border))
            aliases[name].setdefault(abstract,set()).add(raw)
            models[name].observe((abstract,action),retained,full)
    frozen={name:model.digest() for name,model in models.items()}
    for r in records[prefix:]:
        if r['action']['id']==0:continue
        before=load(source,r['before_frame']);after=load(source,r['after_frame'])
        action=sha(r['action']);raw=r['before'];full=sha(project(after,0))
        unseen=(raw,action) not in train_raw_pairs
        compositional=unseen and raw in train_raw_states and action in train_actions
        for name,border in CONFIGS:
            abstract=raw if border is None else sha(project(before,border))
            retained=full if border is None else sha(project(after,border))
            predicted,pred_full=models[name].predict((abstract,action));stats=totals[name]
            stats['queries']+=1;stats['unseen_raw_pair_queries']+=int(unseen)
            stats['compositional_raw_pair_queries']+=int(compositional)
            stats['predictions_retained']+=int(predicted is not None)
            stats['correct_retained']+=int(predicted is not None and predicted==retained)
            stats['predictions_full']+=int(pred_full is not None)
            stats['correct_full']+=int(pred_full is not None and pred_full==full)
            if unseen:
                stats['unseen_predictions_retained']+=int(predicted is not None)
                stats['unseen_correct_retained']+=int(predicted is not None and predicted==retained)
                stats['unseen_predictions_full']+=int(pred_full is not None)
                stats['unseen_correct_full']+=int(pred_full is not None and pred_full==full)
            if compositional:
                stats['compositional_predictions_retained']+=int(predicted is not None)
                stats['compositional_correct_retained']+=int(predicted is not None and predicted==retained)
    rows=[]
    for name,border in CONFIGS:
        assert frozen[name]==models[name].digest()
        s=totals[name];n=s['queries'];unseen=s['unseen_raw_pair_queries']
        ratio=lambda a,b:s[a]/s[b] if s[b] else None
        groups=aliases[name]
        rows.append({'configuration':name,'border_rows_each_end':border,
                     'train_raw_source_hashes':len(source_hashes),'train_abstract_source_hashes':len(groups),
                     'raw_hashes_per_abstract_training_group':len(source_hashes)/len(groups) if groups else None,
                     'training_alias_groups_with_multiple_raw_hashes':sum(len(v)>1 for v in groups.values()),
                     **models[name].conflicts(),'counts':dict(s),
                     'prediction_frequency_retained':s['predictions_retained']/n if n else None,
                     'accuracy_on_retained_predictions':ratio('correct_retained','predictions_retained'),
                     'prediction_frequency_full':s['predictions_full']/n if n else None,
                     'accuracy_on_full_predictions':ratio('correct_full','predictions_full'),
                     'unseen_raw_pair_prediction_frequency_retained':s['unseen_predictions_retained']/unseen if unseen else None,
                     'unseen_raw_pair_correct_coverage_retained':s['unseen_correct_retained']/unseen if unseen else None,
                     'unseen_raw_pair_accuracy_retained':ratio('unseen_correct_retained','unseen_predictions_retained'),
                     'unseen_raw_pair_correct_coverage_full':s['unseen_correct_full']/unseen if unseen else None,
                     'compositional_raw_pair_accuracy_retained':ratio('compositional_correct_retained','compositional_predictions_retained'),
                     'model_frozen_sha256':frozen[name],'logical_state_count':None,'fragmentation_rate':None,
                     'logical_equivalence_validated':False})
    return rows

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input-dir',required=True,type=Path)
    p.add_argument('--output-dir',required=True,type=Path);p.add_argument('--train-prefix',type=int,default=2500)
    p.add_argument('--source-glob',default='seed-0-budget-5000/*.jsonl');args=p.parse_args()
    if args.train_prefix<=0:p.error('positive prefix required')
    out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=False)
    paths=sorted(args.input_dir.glob(args.source_glob))
    if not paths:raise ValueError('no traces')
    source_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    plan={'phase':'OFFLINE_BORDER_ABLATION_CHRONOLOGICAL','prefix_dispatches':args.train_prefix,
          'configurations':CONFIGS,'source_sha256':source_hash,
          'traces':[{'path':str(path.resolve()),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths],
          'state_metadata_preserved':['state','levels_completed','available_actions'],
          'action_identity':'id plus absolute click coordinates','training_updates_on_test':False,
          'interpretation':'post-hoc public development diagnostic, not semantic HUD validation or private evaluation',
          'logical_fragmentation_rate':None,'new_environment_actions':0,'live_policy_changed':False,
          'mask_promotion':'NONE','capability_demonstrated':False}
    (out/'plan.json').write_text(json.dumps(plan,indent=2))
    runs=[]
    for path in paths:
        records=[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()]
        if len(records)<=args.train_prefix:raise ValueError('no suffix')
        rows=evaluate(path,records,args.train_prefix)
        result={'trace':str(path.relative_to(args.input_dir)),'configurations':rows};runs.append(result)
        (out/'report.json').write_text(json.dumps({**plan,'runs':runs,'complete':False},indent=2))
        print(json.dumps({'trace':result['trace'],'configurations_completed':len(rows)}),flush=True)
    assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==source_hash
    (out/'report.json').write_text(json.dumps({**plan,'runs':runs,'complete':True},indent=2))

if __name__=='__main__':main()
