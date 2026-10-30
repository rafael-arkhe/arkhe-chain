"""Offline mask diagnostic adapted from user-supplied code; no policy changes.

Accepts pre-action frame JSONL or the existing snapshot-backed ARC archive.
All split identities, omitted transitions and predictor definitions are reported.
"""
import argparse
from collections import Counter,defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import numpy as np
from analyze_saved_frames import load as load_snapshot


def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)

def frame(value):
    a=np.asarray(value)
    if a.shape!=(64,64) or not np.issubdtype(a.dtype,np.integer) or np.any(a<0) or np.any(a>255):
        raise ValueError('frame must be a 64x64 integer grid in [0,255]')
    return a.astype(np.uint8,copy=False)

def hkey(a,context):
    h=hashlib.blake2b(digest_size=32)
    h.update(b'ARKHE:MASK-DIAGNOSTIC:v1\0');h.update(canonical(context).encode());h.update(a.tobytes(order='C'))
    return h.hexdigest()

def projected(a,keep,context):return hkey(np.where(keep,a,0).astype(np.uint8),context)

def load_rows(rows):
    grouped=defaultdict(list);seen=set();schemas=set();stats=Counter()
    for r in rows:
        policy=r.get('policy','unspecified');key=(r['game'],policy,r['episode'],r['level'])
        if not isinstance(r['t'],int) or isinstance(r['t'],bool):raise ValueError('t must be integer')
        step=(*key,r['t'])
        if step in seen:raise ValueError('duplicate step')
        seen.add(step);schemas.add('explicit' if 'next_frame' in r else 'pre_action')
        context=r.get('context',{'level':r['level']})
        item={**r,'frame':frame(r['frame']),'context':context,'action_key':canonical(r['action'])}
        if 'next_frame' in r:
            item['next_frame']=frame(r['next_frame']);item['next_context']=r.get('next_context',context)
        grouped[key].append(item);stats['input_rows']+=1
    if len(schemas)>1:raise ValueError('mixed explicit and pre-action schemas')
    result=defaultdict(list)
    for (game,policy,episode,level),items in grouped.items():
        items.sort(key=lambda r:r['t']);trans=[]
        for i,r in enumerate(items):
            if r.get('is_reset',False):stats['omitted_reset_actions']+=1;continue
            if 'next_frame' in r:
                after=r['next_frame'];context=r['next_context']
            elif i+1==len(items):stats['omitted_no_within_unit_successor']+=1;continue
            elif items[i+1]['t']!=r['t']+1:stats['omitted_gap_predecessors']+=1;continue
            else:after=items[i+1]['frame'];context=items[i+1]['context']
            trans.append({'before':r['frame'],'after':after,'action':r['action_key'],
                          'context':r['context'],'next_context':context,
                          'logical':r.get('logical_state_id')})
        if trans:result[game,policy].append({'episode':episode,'level':level,'transitions':trans})
    stats['transitions']=sum(len(u['transitions']) for units in result.values() for u in units)
    return result,dict(stats)

def archive_rows(directory):
    for path in sorted(directory.glob('seed-*/*.jsonl')):
        for line in path.read_text(encoding='utf-8').splitlines():
            r=json.loads(line);b=load_snapshot(path.parent,r['before_frame']);a=load_snapshot(path.parent,r['after_frame'])
            metadata=lambda v:{k:v[k] for k in ('state','levels_completed','available_actions')}
            yield {'game':r['game_id'],'policy':r['manifest']['policy'],
                   'episode':path.parent.name+':'+path.stem,'level':b['levels_completed'],'t':r['step'],
                   'action':r['action'],'frame':b['frame'][-1],'next_frame':a['frame'][-1],
                   'context':metadata(b),'next_context':metadata(a),'is_reset':r['action']['id']==0}

def split_units(units,by,frac):
    if not 0<frac<1:raise ValueError('train fraction must be strictly between 0 and 1')
    omitted_boundaries=0
    if by=='level':
        cleaned=[]
        for u in units:
            same_level=[]
            for t in u['transitions']:
                level=lambda c:c.get('levels_completed',c.get('level',u['level']))
                if level(t['context'])!=level(t['next_context']):omitted_boundaries+=1
                else:same_level.append(t)
            if same_level:cleaned.append({**u,'transitions':same_level})
        units=cleaned
    key=lambda u:u['episode'] if by=='episode' else u['level']
    ids=sorted({key(u) for u in units},key=canonical)
    if len(ids)<2:raise ValueError('at least two distinct split units required')
    n=max(1,min(len(ids)-1,int(len(ids)*frac)));train=set(ids[:n])
    return ([u for u in units if key(u) in train],[u for u in units if key(u) not in train],
            {'by':by,'train_ids':ids[:n],'test_ids':ids[n:],
             'omitted_cross_level_boundary_transitions':omitted_boundaries,
             'level_definition':'level ordinal across episodes, not episode/level instances' if by=='level' else None})

def make_masks(trans,thresholds):
    masks={'none':np.ones((64,64),bool),'border2':np.ones((64,64),bool),'border4':np.ones((64,64),bool)}
    for n in (2,4):masks[f'border{n}'][:n,:]=False;masks[f'border{n}'][-n:,:]=False
    changes=np.zeros((64,64),np.uint64)
    for t in trans:changes+=(t['before']!=t['after'])
    for threshold in thresholds:
        if not 0<threshold<=1:raise ValueError('variance threshold must be in (0,1]')
        masks[f'variance-{threshold:g}']=changes/len(trans)<threshold if trans else np.ones((64,64),bool)
    return masks

def table(trans,keep):
    result={};all_keep=np.ones((64,64),bool)
    for t in trans:
        raw=projected(t['before'],all_keep,t['context']);key=(projected(t['before'],keep,t['context']),t['action'])
        entry=result.setdefault(key,{'next':Counter(),'full':Counter(),'per_raw':defaultdict(Counter)})
        nxt=projected(t['after'],keep,t['next_context'])
        entry['next'][nxt]+=1;entry['full'][projected(t['after'],all_keep,t['next_context'])]+=1
        entry['per_raw'][raw][nxt]+=1
    return result

def predict(counts,method):
    if not counts:return None
    if method=='unique':return next(iter(counts)) if len(counts)==1 else None
    return min(counts,key=lambda target:(-counts[target],target))

def diagnose(train_units,test_units,thresholds):
    train=[t for u in train_units for t in u['transitions']];test=[t for u in test_units for t in u['transitions']]
    masks=make_masks(train,thresholds);all_keep=masks['none'];raw_pairs=set(table(train,all_keep));result={}
    for name,keep in masks.items():
        fitted=table(train,keep);ge2=[v for v in fitted.values() if sum(v['next'].values())>=2]
        conflicts=[v for v in ge2 if len(v['next'])>1]
        within=sum(any(len(c)>1 for c in v['per_raw'].values()) for v in conflicts)
        scores={method:Counter() for method in ('unique','mode')}
        for t in test:
            rawkey=(projected(t['before'],all_keep,t['context']),t['action']);unseen=rawkey not in raw_pairs
            entry=fitted.get((projected(t['before'],keep,t['context']),t['action']))
            target=projected(t['after'],keep,t['next_context']);full=projected(t['after'],all_keep,t['next_context'])
            for method,s in scores.items():
                s['queries']+=1;s['unseen_raw_queries']+=int(unseen)
                pr=predict(entry['next'],method) if entry else None;pf=predict(entry['full'],method) if entry else None
                s['issued_retained']+=int(pr is not None);s['correct_retained']+=int(pr is not None and pr==target)
                s['issued_full']+=int(pf is not None);s['correct_full']+=int(pf is not None and pf==full)
                if unseen:
                    s['unseen_issued_retained']+=int(pr is not None);s['unseen_correct_retained']+=int(pr is not None and pr==target)
                    s['unseen_correct_full']+=int(pf is not None and pf==full)
        reports={}
        for method,s in scores.items():
            ratio=lambda a,b:s[a]/s[b] if s[b] else None
            reports[method]={'counts':dict(s),'prediction_frequency_retained':ratio('issued_retained','queries'),
                'error_on_issued_retained':1-ratio('correct_retained','issued_retained') if s['issued_retained'] else None,
                'correct_coverage_unseen_retained':ratio('unseen_correct_retained','unseen_raw_queries'),
                'correct_coverage_unseen_full':ratio('unseen_correct_full','unseen_raw_queries')}
        result[name]={'masked_cells':int((~keep).sum()),'kept_cells':int(keep.sum()),'degenerate_mask':not bool(keep.any()),
            'distinct_train_source_states':len({k[0] for k in fitted}),'train_state_action_pairs':len(fitted),
            'pairs_with_at_least_two_observations':len(ge2),'observations_in_ge2_pairs':sum(sum(v['next'].values()) for v in ge2),
            'observed_projected_conflict_pairs':len(conflicts),'projected_conflict_rate':len(conflicts)/len(ge2) if ge2 else None,
            'conflicts_within_same_raw_state_and_action':within,'conflicts_only_between_distinct_raw_sources':len(conflicts)-within,
            'causal_attribution':'not inferred; raw conflicts can reflect unobserved context, not stochasticity',
            'full_target_conflicting_pairs':sum(len(v['full'])>1 for v in fitted.values()),
            'predictors':reports,'fragmentation_rate':None,'mask_promotion':'NONE'}
    return result

def synthetic_rows():
    for episode in (0,1):
        for level in range(3):
            x=10+level*10
            for t in range(60):
                fr=np.zeros((64,64),np.uint8);fr[30,x]=5;fr[0,t%64]=9 if episode==0 else 8
                action=1 if t%2==0 else 0
                yield {'game':'synth','episode':episode,'level':level,'t':t,'action':action,'frame':fr.tolist()}
                x+=1 if action else -1

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('traces',nargs='?',type=Path)
    p.add_argument('--archive-dir',type=Path);p.add_argument('--out',type=Path,default=Path('mask_report.json'))
    p.add_argument('--split',choices=('episode','level'),default='episode');p.add_argument('--train-frac',type=float,default=.5)
    p.add_argument('--var-thresholds',default='.01,.05,.1,.5');p.add_argument('--selftest',action='store_true');args=p.parse_args()
    if sum((args.traces is not None,args.archive_dir is not None,args.selftest))!=1:p.error('select exactly one input mode')
    thresholds=[float(v) for v in args.var_thresholds.split(',')]
    if not 0<args.train_frac<1 or any(not 0<t<=1 for t in thresholds):p.error('invalid split or variance threshold')
    if args.selftest:groups,stats=load_rows(synthetic_rows());mode='SYNTHETIC_CONTROL'
    elif args.archive_dir:groups,stats=load_rows(archive_rows(args.archive_dir));mode='ARCHIVED_EXPLICIT_TRANSITIONS'
    else:
        opener=gzip.open if args.traces.suffix=='.gz' else open
        with opener(args.traces,'rt',encoding='utf-8') as f:groups,stats=load_rows(json.loads(l) for l in f if l.strip())
        mode='USER_JSONL'
    report={'phase':'OFFLINE_GROUPED_MASK_DIAGNOSTIC','input_mode':mode,'input_counts':stats,
            'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'variance_thresholds_declared':thresholds,'variance_masks_fit_on_train_only':True,
            'mode_tie_break':'lexicographically smallest target hash among tied empirical modes',
            'frame_scope':'last render and supplied visible context; all ARC animation layers retained in original archives',
            'new_arc_actions':0,'live_policy_changed':False,'posthoc_development_only':True,'groups':[]}
    if args.traces:report['input_sha256']=hashlib.sha256(args.traces.read_bytes()).hexdigest()
    if args.archive_dir:
        report['archive_sources']=[{'path':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
                                   for p in sorted(args.archive_dir.glob('seed-*/*.jsonl'))]
    for (game,policy),units in sorted(groups.items()):
        row={'game':game,'policy':policy}
        try:
            train,test,split=split_units(units,args.split,args.train_frac)
            row.update(status='COMPLETE',split=split,train_units=len(train),test_units=len(test),
                       shared_episode_ids=sorted({u['episode'] for u in train}&{u['episode'] for u in test},key=canonical),
                       masks=diagnose(train,test,thresholds))
        except ValueError as e:row.update(status='INSUFFICIENT_OR_INVALID_SPLIT',reason=str(e))
        report['groups'].append(row)
        print(canonical({'game':game,'policy':policy,'status':row['status']}),flush=True)
    if args.selftest:
        checks=report['groups'][0]['masks']
        assert checks['none']['predictors']['unique']['prediction_frequency_retained']==0
        assert checks['border2']['predictors']['unique']['prediction_frequency_retained']==1
        assert checks['border2']['predictors']['unique']['error_on_issued_retained']==0
        assert checks['border2']['predictors']['unique']['correct_coverage_unseen_full']==0
        report['synthetic_assertions']='PASS_KNOWN_HUD_INVARIANCE_NOT_FULL_FRAME_PREDICTION'
    report['all_groups_complete']=bool(report['groups']) and all(g['status']=='COMPLETE' for g in report['groups'])
    args.out.parent.mkdir(parents=True,exist_ok=True)
    with args.out.open('x',encoding='utf-8') as f:json.dump(report,f,indent=2)
    return 0 if report['all_groups_complete'] else 2

if __name__=='__main__':raise SystemExit(main())
