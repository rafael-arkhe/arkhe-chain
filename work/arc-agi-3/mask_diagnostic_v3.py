"""Fixed-target trade-off summary and four synthetic mask controls.

Consumes validated v2 OOF reports; does not refit the archived ARC models.
Selective loss is wrong/n + declared_abstention_cost * abstained/n.
All classifications are conditional descriptive screens, never mask adoption.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import random
import numpy as np
import mask_diagnostic as base
import mask_diagnostic_v2 as v2
from paired_seed_analysis import quantile

MODES=('moving_hud','flag_row0','blink_hud','marker_displaced')

def validate_pairs(mask_groups):
    if 'none' not in mask_groups:raise ValueError('baseline none is required')
    ids=sorted(mask_groups['none'])
    if not ids:raise ValueError('no test groups')
    for name,groups in mask_groups.items():
        if sorted(groups)!=ids:raise ValueError('unpaired groups cannot be silently intersected')
        for gid,(n,issued,correct) in groups.items():
            if any(not isinstance(x,int) or isinstance(x,bool) for x in (n,issued,correct)) or not 0<=correct<=issued<=n or n<=0:
                raise ValueError('invalid absolute tallies')
            if n!=mask_groups['none'][gid][0]:raise ValueError('different query counts in paired group')
    return ids

def metrics(groups,draw,abstention_cost):
    n=sum(groups[g][0] for g in draw);issued=sum(groups[g][1] for g in draw);correct=sum(groups[g][2] for g in draw)
    wrong=issued-correct;abstained=n-issued
    return {'queries':n,'issued':issued,'correct':correct,'wrong':wrong,'abstained':abstained,
            'coverage':issued/n,'correct_coverage':correct/n,'wrong_coverage':wrong/n,
            'conditional_error':wrong/issued if issued else None,
            'selective_loss':(wrong+abstention_cost*abstained)/n}

def compare(mask_groups,B=1000,seed=0,margin=.02,abstention_cost=.5):
    if B<1 or not np.isfinite(margin) or margin<0 or not 0<=abstention_cost<=1:raise ValueError('invalid screening parameter')
    ids=validate_pairs(mask_groups);rng=random.Random(seed)
    draws=[[rng.choice(ids) for _ in ids] for _ in range(B)]
    point={name:metrics(groups,ids,abstention_cost) for name,groups in mask_groups.items()}
    samples={name:[metrics(groups,draw,abstention_cost) for draw in draws] for name,groups in mask_groups.items()}
    results={}
    for name,groups in mask_groups.items():
        differences={}
        for metric in ('coverage','correct_coverage','conditional_error','selective_loss'):
            a=point[name][metric];b=point['none'][metric]
            values=[m[metric]-r[metric] for m,r in zip(samples[name],samples['none'])
                    if m[metric] is not None and r[metric] is not None]
            differences[metric]={'point':a-b if a is not None and b is not None else None,
                                 'lo':quantile(values,.025) if len(ids)>=2 and values else None,
                                 'hi':quantile(values,.975) if len(ids)>=2 and values else None,
                                 'defined_draws':len(values)}
        loss=differences['selective_loss']
        equal=groups==mask_groups['none']
        if equal:screen='NO_AGGREGATE_DIFFERENCE_IN_RECORDED_TALLIES'
        elif loss['lo'] is None:screen='INSUFFICIENT_GROUPS_FOR_INTERVAL_SCREEN'
        elif loss['lo']>margin:screen='EXCEEDS_MARGIN_IN_CONDITIONAL_BOOTSTRAP'
        elif loss['hi']<=margin:screen='MEETS_DESCRIPTIVE_MARGIN_FOR_THIS_TARGET_AND_COST'
        else:screen='INCONCLUSIVE'
        results[name]={'counts_and_points':point[name],'paired_differences_mask_minus_none':differences,
                       'descriptive_screen':screen,'promotion_allowed':False,
                       'conditional_error_comparison_scope':'different issued subsets; not a common-query accuracy comparison'}
    return {'n_groups':len(ids),'bootstrap_draws':B,'seed':seed,'margin':margin,'abstention_cost':abstention_cost,
            'loss_definition':'(wrong + abstention_cost * abstained) / all_queries',
            'parameter_status':'declared exploratory policy choices, not derived constants or retrospective preregistration',
            'uncertainty':'conditional on fitted OOF models; no bootstrap refitting or across-game population claim',
            'results':results}

def collect(result,target,method):
    if target not in ('full','fixed_core'):raise ValueError('learned target is not eligible for pooling')
    pooled={name:{} for name in v2.MASKS}
    for fold in result['folds']:
        if set(fold['train_groups'])&set(fold['test_groups']):raise ValueError('fold leakage')
        for name in v2.MASKS:
            groups=fold['masks'][name]['test_by_target_and_predictor'][target][method]
            if set(groups)&set(pooled[name]):raise ValueError('test group counted more than once')
            pooled[name].update(groups)
    validate_pairs(pooled);return pooled

def training_summary(result):
    summary={}
    for name in v2.MASKS:
        values=[]
        for fold in result['folds']:
            baseline=fold['masks']['none']['distinct_pre_states_train'];value=fold['masks'][name]['distinct_pre_states_train']
            values.append({'fold':fold['fold'],'distinct_pre_states':value,
                           'relative_difference_from_none':(value-baseline)/baseline if baseline else None,
                           'observed_conflict_classes':fold['masks'][name]['observed_conflict_classes']})
        summary[name]=values
    return {'per_fold':summary,'interpretation':'descriptive; neither state-count equality nor projected conflicts determine utility'}

def summarize_group(group,B,seed,margin,cost,method):
    result=group['result']
    return {'game':group['game'],'policy':group['policy'],'training':training_summary(result),
            'fixed_targets':{target:compare(collect(result,target,method),B,seed,margin,cost) for target in ('full','fixed_core')}}

def synth_rows(mode):
    for episode in range(6):
        rng=random.Random(episode)
        for level in (0,1):
            pos=32;flag=(episode+level)%2
            for t in range(80):
                grid=np.zeros((64,64),np.uint8);grid[30,pos]=5
                if mode=='flag_row0':grid[0,0]=1+flag
                elif mode=='blink_hud':grid[1,10]=(8+episode) if t%2==0 else 0
                elif mode=='moving_hud':grid[1,t%64]=8+episode
                else:grid[1,(pos*7+t*13)%64]=8+episode
                action=rng.randrange(2)
                yield {'game':mode,'episode':episode,'level':level,'t':t,'action':action,'frame':grid.tolist()}
                delta=1 if action else -1;pos=min(44,max(20,pos+(-delta if mode=='flag_row0' and flag else delta)))

def controls(B):
    report={}
    for mode in MODES:
        groups,_=base.load_rows(synth_rows(mode));units=groups[mode,'unspecified']
        result=v2.run(units,'episode',0,.5,.5,B,0)
        group={'game':mode,'policy':'synthetic','result':result}
        summary=summarize_group(group,B,0,.02,.5,'mode')
        fold=result['folds'][0];variance_cells=fold['masks']['variance']['masked_cells']
        summary['variance_masked_cells']=variance_cells;summary['raw_v2_result']=result
        report[mode]=summary
    core=lambda mode,mask:report[mode]['fixed_targets']['fixed_core']['results'][mask]['counts_and_points']
    assert core('moving_hud','border2')['correct_coverage']>core('moving_hud','none')['correct_coverage']
    assert core('flag_row0','none')['conditional_error']==0
    assert core('flag_row0','border2')['conditional_error']>0
    assert report['blink_hud']['variance_masked_cells']==1
    assert core('blink_hud','variance')['correct_coverage']>core('blink_hud','none')['correct_coverage']
    assert report['marker_displaced']['variance_masked_cells']==0
    assert collect(report['marker_displaced']['raw_v2_result'],'fixed_core','mode')['variance']==collect(report['marker_displaced']['raw_v2_result'],'fixed_core','mode')['none']
    return {'status':'PASS','modes':report,'scope':'known synthetic mechanisms; no ARC policy or causal certification'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--report',type=Path)
    p.add_argument('--out',type=Path,required=True);p.add_argument('--selftest',action='store_true')
    p.add_argument('--boot',type=int,default=1000);p.add_argument('--seed',type=int,default=0)
    p.add_argument('--margin',type=float,default=.02);p.add_argument('--abstention-cost',type=float,default=.5)
    p.add_argument('--predictor',choices=('mode','unique'),default='mode');args=p.parse_args()
    if (args.report is None)==(not args.selftest):p.error('select --report or --selftest')
    if args.out.exists():p.error('output already exists')
    if args.boot<1 or not np.isfinite(args.margin) or args.margin<0 or not 0<=args.abstention_cost<=1:p.error('invalid parameter')
    report={'phase':'FIXED_TARGET_EXPLORATORY_TRADEOFF','source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'margin':args.margin,'abstention_cost':args.abstention_cost,'predictor':args.predictor,
            'new_arc_actions':0,'live_policy_changed':False,'mask_promoted':False,'groups':[]}
    if args.selftest:report['selftest']=controls(args.boot)
    else:
        original=json.loads(args.report.read_text());report['input_report_sha256']=hashlib.sha256(args.report.read_bytes()).hexdigest()
        if original.get('phase')!='GROUPED_OOF_FIXED_TARGET_MASK_DIAGNOSTIC' or not original.get('all_groups_complete'):
            raise ValueError('complete validated v2 fixed-target report required')
        for group in original['groups']:
            report['groups'].append(summarize_group(group,args.boot,args.seed,args.margin,args.abstention_cost,args.predictor))
    args.out.parent.mkdir(parents=True,exist_ok=True)
    with args.out.open('x',encoding='utf-8') as stream:json.dump(report,stream,indent=2)

if __name__=='__main__':main()
