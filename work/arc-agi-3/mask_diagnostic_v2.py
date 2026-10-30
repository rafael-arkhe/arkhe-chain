"""Grouped OOF mask diagnostic with fixed targets and paired conditional bootstrap.

The learned intersection is auxiliary and never pooled as a fixed task. Reuses
the validated v1 action/frame/archive contracts. No environment or Kaggle calls.
"""
import argparse
from collections import Counter,defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import random
import numpy as np
import mask_diagnostic as base
from paired_seed_analysis import quantile

MASKS=('none','border2','border4','variance')
FULL=np.ones((64,64),bool)
FIXED_CORE=FULL.copy();FIXED_CORE[:4]=False;FIXED_CORE[-4:]=False

def read_jsonl(path,merge_file_episodes=False):
    files=[path] if path.is_file() else sorted(list(path.glob('*.jsonl'))+list(path.glob('*.jsonl.gz')))
    if not files:raise ValueError('no JSONL inputs')
    grouped=defaultdict(list);seen=set();stats=Counter()
    for fp in files:
        opener=gzip.open if fp.suffix=='.gz' else open
        with opener(fp,'rt',encoding='utf-8') as stream:
            for line in stream:
                if not line.strip():continue
                r=json.loads(line)
                for name in ('game','episode','level','t','action','frame'):
                    if r.get(name) is None:raise ValueError('missing field: '+name)
                if not isinstance(r['t'],int) or isinstance(r['t'],bool):raise ValueError('integer step required')
                r['frame']=base.frame(r['frame'])
                if r.get('next_frame') is not None:r['next_frame']=base.frame(r['next_frame'])
                if not merge_file_episodes:r['episode']=base.canonical([fp.name,r['episode']])
                key=(r['game'],r.get('policy','unspecified'),r['episode'],r['level'])
                if (*key,r['t']) in seen:raise ValueError('duplicate step in same namespaced unit')
                seen.add((*key,r['t']));grouped[key].append(r);stats['input_rows']+=1
    normalized=[]
    for rows in grouped.values():
        rows.sort(key=lambda r:r['t'])
        for i,r in enumerate(rows):
            if r.get('next_frame') is not None:stats['explicit_outcomes']+=1
            elif i+1<len(rows) and rows[i+1]['t']==r['t']+1:
                following=rows[i+1];r={**r,'next_frame':following['frame'],
                    'next_context':following.get('context',{'level':following['level']})};stats['inferred_consecutive_outcomes']+=1
            else:stats['omitted_no_consecutive_successor']+=1;continue
            normalized.append(r)
    groups,inner=base.load_rows(normalized)
    stats.update({k:v for k,v in inner.items() if k!='input_rows'})
    return groups,dict(stats),files

def group_key(unit,by):return base.canonical(unit['episode'] if by=='episode' else unit['level'])

def grouped_folds(units,by,k,frac,seed):
    omitted_boundaries=0
    if by=='level':
        a,b,info=base.split_units(units,by,.5);units=a+b
        omitted_boundaries=info['omitted_cross_level_boundary_transitions']
    ids=sorted({group_key(u,by) for u in units})
    if k==0:
        a,b,info=base.split_units(units,by,frac)
        return [(a,b,{'fold':0,'train_groups':sorted({group_key(u,by) for u in a}),
                       'test_groups':sorted({group_key(u,by) for u in b}),
                       'omitted_cross_level_boundary_transitions':omitted_boundaries})]
    if k<2 or k>len(ids):raise ValueError('folds require 2 <= k <= distinct group count')
    random.Random(seed).shuffle(ids);assignment={v:i%k for i,v in enumerate(ids)};out=[]
    for i in range(k):
        train=[u for u in units if assignment[group_key(u,by)]!=i]
        test=[u for u in units if assignment[group_key(u,by)]==i]
        if not train or not test:raise ValueError('empty fold is not silently discarded')
        out.append((train,test,{'fold':i,'train_groups':sorted({group_key(u,by) for u in train}),
                                'test_groups':sorted({group_key(u,by) for u in test}),
                                'omitted_cross_level_boundary_transitions':omitted_boundaries}))
    return out

def fit_and_score(train_units,test_units,by,var_thr):
    train=[t for u in train_units for t in u['transitions']]
    learned=base.make_masks(train,[var_thr]);keeps={name:learned[name] for name in MASKS[:3]}
    keeps['variance']=learned[f'variance-{var_thr:g}'];intersection=np.logical_and.reduce(list(keeps.values()))
    targets={'full':FULL,'fixed_core':FIXED_CORE,'train_intersection_aux':intersection}
    common=[(t,{name:base.projected(t['after'],keep,t['next_context']) for name,keep in targets.items()}) for t in train]
    reports={};tallies={}
    for name,keep in keeps.items():
        fitted={}
        for t,values in common:
            key=(base.projected(t['before'],keep,t['context']),t['action'])
            entry=fitted.setdefault(key,{target:Counter() for target in targets})
            for target,value in values.items():entry[target][value]+=1
        model_digest=lambda:hashlib.sha256(base.canonical([(key,{target:sorted(c.items()) for target,c in entry.items()})
                                                           for key,entry in sorted(fitted.items())]).encode()).hexdigest()
        frozen_model_hash=model_digest()
        # Source/action-aware descriptive conflict classes, never physical causes.
        original=base.table(train,keep);classes=Counter();ge2=0;obs_ge2=0
        for entry in original.values():
            n=sum(entry['next'].values())
            if n>=2:ge2+=1;obs_ge2+=n
            if len(entry['next'])<2:continue
            within=any(len(c)>1 for c in entry['per_raw'].values())
            deterministic_outcomes={next(iter(c)) for c in entry['per_raw'].values() if len(c)==1}
            between=len(deterministic_outcomes)>1
            classes['both_observed' if within and between else 'within_raw_present' if within else 'between_raw_only']+=1
        score={target:{method:defaultdict(lambda:[0,0,0]) for method in ('unique','mode')} for target in targets}
        for unit in test_units:
            gid=group_key(unit,by)
            for t in unit['transitions']:
                entry=fitted.get((base.projected(t['before'],keep,t['context']),t['action']))
                for target,target_keep in targets.items():
                    observed=base.projected(t['after'],target_keep,t['next_context'])
                    for method in ('unique','mode'):
                        pred=base.predict(entry[target],method) if entry else None
                        s=score[target][method][gid];s[0]+=1;s[1]+=int(pred is not None);s[2]+=int(pred is not None and pred==observed)
        reports[name]={'masked_cells':int((~keep).sum()),'distinct_pre_states_train':len({k[0] for k in fitted}),
                       'pairs_train':len(fitted),'pairs_ge2_obs':ge2,'obs_in_ge2_pairs':obs_ge2,
                       'obs_ge2_fraction':obs_ge2/len(train) if train else None,
                       'observed_conflict_classes':dict(classes),'conflict_semantics':'observed support patterns, not causal attribution',
                       'frozen_model_sha256':frozen_model_hash,'model_unchanged_on_test':model_digest()==frozen_model_hash,
                       'test_by_target_and_predictor':{target:{method:dict(groups) for method,groups in methods.items()}
                                                       for target,methods in score.items()}}
        tallies[name]=score
        assert model_digest()==frozen_model_hash
    return reports,tallies,{'kept_cells':int(intersection.sum()),'mask_sha256':hashlib.sha256(intersection.tobytes()).hexdigest(),
                            'meaning':'training-derived target; auxiliary per-fold only, not pooled'}

def stat(groups,draw):
    n=sum(groups[g][0] for g in draw);issued=sum(groups[g][1] for g in draw);correct=sum(groups[g][2] for g in draw)
    return {'queries':n,'issued':issued,'correct':correct,'prediction_frequency':issued/n if n else None,
            'correct_coverage':correct/n if n else None,'error_on_issued':(issued-correct)/issued if issued else None}

def paired_bootstrap(mask_groups,B,seed):
    if B<1:raise ValueError('positive bootstrap count required')
    ids=sorted(next(iter(mask_groups.values())))
    if any(sorted(groups)!=ids for groups in mask_groups.values()):raise ValueError('bootstrap groups are not paired')
    rng=random.Random(seed);draws=[[rng.choice(ids) for _ in ids] for _ in range(B)] if ids else []
    samples={name:[stat(groups,draw) for draw in draws] for name,groups in mask_groups.items()}
    intervals={};contrasts={}
    def interval(values):
        defined=[v for v in values if v is not None]
        return {'lo':quantile(defined,.025) if len(ids)>=2 and defined else None,
                'hi':quantile(defined,.975) if len(ids)>=2 and defined else None,
                'defined_bootstrap_draws':len(defined)}
    for name,groups in mask_groups.items():
        intervals[name]={'counts_and_points':stat(groups,ids),'n_groups':len(ids),
                         'descriptive_intervals':{metric:interval([s[metric] for s in samples[name]])
                                                  for metric in ('prediction_frequency','correct_coverage','error_on_issued')}}
        contrasts[name]={'baseline':'none','delta_correct_coverage':stat(groups,ids)['correct_coverage']-stat(mask_groups['none'],ids)['correct_coverage'] if ids else None,
                         'interval':interval([a['correct_coverage']-b['correct_coverage'] for a,b in zip(samples[name],samples['none'])])}
    return {'masks':intervals,'paired_contrasts':contrasts,'bootstrap_draws':B,'seed':seed,
            'scope':'conditional descriptive grouped bootstrap; fold models are not refitted in bootstrap',
            'training_variability_included':False,'few_groups_warning':len(ids)<20}

def run(units,by,folds,frac,var_thr,boot,seed):
    splits=grouped_folds(units,by,folds,frac,seed);per_fold=[]
    pooled={target:{method:{name:{} for name in MASKS} for method in ('unique','mode')} for target in ('full','fixed_core')}
    for train,test,split in splits:
        if set(split['train_groups'])&set(split['test_groups']):raise AssertionError('split leak')
        reports,tallies,intersection=fit_and_score(train,test,by,var_thr)
        per_fold.append({**split,'train_transitions':sum(len(u['transitions']) for u in train),
                         'test_transitions':sum(len(u['transitions']) for u in test),
                         'training_intersection':intersection,'masks':reports})
        for target in pooled:
            for method in pooled[target]:
                for name in MASKS:
                    groups=tallies[name][target][method]
                    if set(pooled[target][method][name])&set(groups):raise AssertionError('OOF test group evaluated twice')
                    pooled[target][method][name].update(groups)
    return {'folds':per_fold,'pooled_fixed_target_results':{
        target:{method:paired_bootstrap(groups,boot,seed) for method,groups in methods.items()} for target,methods in pooled.items()},
        'learned_intersection_pooled':False,'training_metrics':'per-fold descriptive values, not standard errors',
        'fixed_core_kept_cells':int(FIXED_CORE.sum()),'fragmentation_rate':None}

def synth_rows(flag_game):
    for episode in range(6):
        for level in (0,1):
            x=32+4*level;flag=episode%2
            for t in range(60):
                f=np.zeros((64,64),np.uint8);f[30,x]=5
                if flag_game:f[0,0]=1+flag
                else:f[1,t%64]=8+episode
                action=1 if t%2==0 else 0
                yield {'game':'flag_row0' if flag_game else 'hud_indep','episode':episode,'level':level,'t':t,
                       'action':action,'frame':f.tolist()}
                delta=1 if action else -1;x+=-delta if flag_game and flag else delta

def selftest(boot):
    groups,_=base.load_rows(list(synth_rows(False))+list(synth_rows(True)))
    positive=run(groups['hud_indep','unspecified'],'episode',3,.5,.1,boot,0)
    negative=run(groups['flag_row0','unspecified'],'episode',0,.5,.1,boot,0)
    pos=positive['pooled_fixed_target_results']['fixed_core']['mode']['masks']
    neg=negative['pooled_fixed_target_results']['fixed_core']['mode']['masks']
    assert pos['border2']['counts_and_points']['correct_coverage']==1
    assert pos['none']['counts_and_points']['issued']==0
    assert neg['none']['counts_and_points']['error_on_issued']==0
    assert neg['border2']['counts_and_points']['error_on_issued']>0
    aux=negative['folds'][0]['masks']['border2']['test_by_target_and_predictor']['train_intersection_aux']['mode']
    assert stat(aux,sorted(aux))['error_on_issued']==0
    return {'status':'PASS','positive_control':positive,'negative_control':negative,
            'finding':'training-intersection target can hide the negative-control error that fixed_core detects'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('traces',nargs='?',type=Path)
    p.add_argument('--archive-dir',type=Path);p.add_argument('--out',type=Path,default=Path('mask_report_v2.json'))
    p.add_argument('--split',choices=('episode','level'),default='episode');p.add_argument('--folds',type=int,default=0)
    p.add_argument('--train-frac',type=float,default=.5);p.add_argument('--var-thr',type=float,default=.5)
    p.add_argument('--boot',type=int,default=1000);p.add_argument('--seed',type=int,default=0)
    p.add_argument('--merge-file-episodes',action='store_true');p.add_argument('--selftest',action='store_true');args=p.parse_args()
    if sum((args.traces is not None,args.archive_dir is not None,args.selftest))!=1:p.error('select one input mode')
    if not 0<args.train_frac<1 or not 0<args.var_thr<=1 or args.boot<1 or args.folds<0 or args.folds==1:p.error('invalid numeric option')
    if args.out.exists():p.error('output already exists')
    report={'phase':'GROUPED_OOF_FIXED_TARGET_MASK_DIAGNOSTIC','source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'dependencies_sha256':{name:hashlib.sha256((Path(__file__).parent/name).read_bytes()).hexdigest()
                                   for name in ('mask_diagnostic.py','paired_seed_analysis.py','analyze_saved_frames.py')},
            'fixed_targets':['full last render plus context','middle 56 rows plus context'],
            'var_thr':args.var_thr,'folds_requested':args.folds,'grouping':args.split,'seed':args.seed,
            'learned_target_pooled':False,'new_arc_actions':0,'live_policy_changed':False,'groups':[]}
    report['posthoc_fixed_game_development']=True
    if args.selftest:report['selftest']=selftest(args.boot)
    else:
        if args.archive_dir:
            groups,stats=base.load_rows(base.archive_rows(args.archive_dir));files=sorted(args.archive_dir.glob('seed-*/*.jsonl'))
        else:groups,stats,files=read_jsonl(args.traces,args.merge_file_episodes)
        report['input_counts']=stats
        report['input_sources']=[{'path':str(f.resolve()),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in files]
        for (game,policy),units in sorted(groups.items()):
            row={'game':game,'policy':policy}
            try:row.update(status='COMPLETE',result=run(units,args.split,args.folds,args.train_frac,args.var_thr,args.boot,args.seed))
            except ValueError as error:row.update(status='INSUFFICIENT_OR_INVALID_SPLIT',reason=str(error))
            report['groups'].append(row);print(base.canonical({'game':game,'policy':policy,'status':row['status']}),flush=True)
    report['all_groups_complete']=bool(args.selftest) or bool(report['groups']) and all(g['status']=='COMPLETE' for g in report['groups'])
    args.out.parent.mkdir(parents=True,exist_ok=True)
    with args.out.open('x',encoding='utf-8') as f:json.dump(report,f,indent=2)
    return 0 if report['all_groups_complete'] else 2

if __name__=='__main__':raise SystemExit(main())
