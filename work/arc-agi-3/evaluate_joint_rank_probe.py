"""Posthoc archived chronological evaluation of restricted joint-rank model."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import joint_rank_transition_probe as j
import object_transition_probe as b
import context_transition_probe as c


def export(m):
    return [{'action':key[0].decode(),'layout':key[1],'vectors':sorted(value)} for key,value in sorted(m.rules.items(),key=lambda x:repr(x[0]))]


def structural(before,after):
    x=j.ordered(before);y=j.ordered(after)
    return {'cardinality_changed':len(x['objects'])!=len(y['objects']),
            'layout_changed':j.layout(x)!=j.layout(y),
            'background_changed':x['background']!=y['background'],
            'signature_multiset_changed':Counter(o['signature'] for o in x['objects'])!=Counter(o['signature'] for o in y['objects'])}


def run(root,out):
    paths=sorted(root.glob('*.jsonl'))
    if len(paths)!=4:raise ValueError('four traces required')
    out.mkdir(parents=True,exist_ok=False)
    files=[Path(__file__),Path(j.__file__),Path(b.__file__)]
    report={'phase':'POSTHOC_JOINT_RANK_ARCHIVE_PROBE','train_dispatch_prefix':2500,
            'budget':j.DEFAULT_BUDGET,'source_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
            'trace_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
            'identity_order_stability_rate':None,'identity_order_stability_reason':'no independent identities for duplicated regions; rank matching alone cannot identify physical persistence',
            'new_environment_actions':0,'policy_changed':False,'test_updates':False,'runs':[]}
    (out/'plan.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    for path in paths:
        records=[json.loads(s) for s in path.read_text().splitlines()];train=[];test=[];seen=set();lookup={};m=j.JointRankModel();stats=Counter()
        for i,r in enumerate(records):
            if r['action']['id']==0:continue
            before=b.load(path.parent,r['before_frame']);after=b.load(path.parent,r['after_frame'])
            x=b.render(before);y=b.render(after)
            if not x or not y:raise ValueError('empty last render')
            flags=structural(x,y);part='train' if i<2500 else 'test'
            stats[part+'_queries']+=1
            for name,value in flags.items():stats[part+'_'+name]+=value
            item=(x,r['action'],y,flags,b.key(r))
            if i<2500:
                train.append(item);m.observe(x,r['action'],y);seen.add(b.key(r));lookup.setdefault(b.key(r),Counter())[b.digest(y)]+=1
            else:test.append(item)
        model=export(m);frozen=b.digest(model)
        (out/(path.stem+'-model.json')).write_text(json.dumps(model,indent=2),encoding='utf-8')
        # m.training_gate replays all training queries; no exclusions for failed learns.
        gate=m.training_gate();buckets={};reasons=Counter()
        for x,a,y,flags,key in test:
            p=m.predict(x,a);prediction=p['prediction'];reason=p['reason'];reasons[reason]+=1
            labels=['all','unseen' if key not in seen else 'seen',
                    'cardinality_changed' if flags['cardinality_changed'] else 'cardinality_unchanged',
                    'layout_changed' if flags['layout_changed'] else 'layout_unchanged']
            for label in labels:
                k=buckets.setdefault(label,Counter());k['queries']+=1
                if prediction is not None:k['issued']+=1;k['correct']+=prediction==y
                lc=lookup.get(key)
                if lc and len(lc)==1:k['lookup_issued']+=1;k['lookup_correct']+=next(iter(lc))==b.digest(y)
        result={'trace':path.name,'model_sha256':frozen,'training_gate':gate,'training_failure_counts':dict(Counter(m.failures)),
                'learned_layout_action_keys':len(m.rules),'retained_joint_vectors':sum(len(v) for v in m.rules.values()),
                'structural_counts':dict(stats),'test_reasons':dict(reasons),'test':{},
                'test_scope':'diagnostic only when training gate FAIL; not admitted model capability'}
        for label,k in buckets.items():result['test'][label]={'joint_rank':c.metrics(k['queries'],k['issued'],k['correct']),
                                                            'lookup':c.metrics(k['queries'],k['lookup_issued'],k['lookup_correct'])}
        assert b.digest(export(m))==frozen;result['frozen_hash_unchanged']=True
        report['runs'].append(result)
        (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps({'trace':path.name,'gate':gate,'structural':dict(stats),'test':result['test'].get('unseen')}),flush=True)
    report['complete']=True
    assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in report['source_sha256'].items())
    (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input-dir',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();run(a.input_dir,a.out)
