"""Sampled unpaired component statistics. No semantic tracking inference."""
import argparse
from collections import Counter
import hashlib
import json
from math import factorial,prod
from pathlib import Path
import object_transition_probe as b


def describe(before,after):
    x=b.scene(before);y=b.scene(after);xo=x['objects'];yo=y['objects']
    colors=lambda objects:Counter(o['color'] for o in objects)
    shapes=lambda objects:Counter(b.digest(o['shape']) for o in objects)
    sigs=lambda objects:Counter(o['signature'] for o in objects)
    sx=sigs(xo);sy=sigs(yo)
    repeated=lambda c:sum(n for n in c.values() if n>1)
    equal=sx==sy
    return {'before_regions':len(xo),'after_regions':len(yo),'cardinality_changed':len(xo)!=len(yo),
            'color_shape_multiset_changed':not equal,
            'shape_only_multiset_changed':shapes(xo)!=shapes(yo),
            'color_only_region_multiset_changed':colors(xo)!=colors(yo),
            'before_repeated_signature_regions':repeated(sx),'after_repeated_signature_regions':repeated(sy),
            'either_frame_has_repeated_signature':any(n>1 for c in (sx,sy) for n in c.values()),
            'complete_same_signature_bijections':prod(factorial(n) for n in sx.values()) if equal and sx else 0,
            'correspondence_domain':'exact color/shape bijections only; 0 does not diagnose semantic disappearance',
            'changed_pixels':sum(a!=z for r,s in zip(before,after) for a,z in zip(r,s)),
            'semantic_shape_change_rate':None,'identity_pairing_ambiguity':None}


def run(root,out):
    report={'scope':'sampled paired renders, unpaired component multiset statistics; not global rates or object tracking',
            'sampling':'10 equally spaced non-reset transitions per train/test partition per trace; dispatch prefix2500',
            'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'new_environment_actions':0,'runs':[]}
    for path in sorted(root.glob('*.jsonl')):
        records=[json.loads(s) for s in path.read_text().splitlines()];samples=[]
        for label,part in [('train',records[:2500]),('test',records[2500:])]:
            eligible=[r for r in part if r['action']['id']!=0]
            if len(eligible)<10:raise ValueError('insufficient sample domain')
            for i in range(10):
                r=eligible[i*(len(eligible)-1)//9]
                before=b.render(b.load(path.parent,r['before_frame']));after=b.render(b.load(path.parent,r['after_frame']))
                samples.append({'partition':label,'step':r['step'],'before_frame':r['before_frame'],'after_frame':r['after_frame'],'statistics':describe(before,after)})
        counts=Counter()
        for s in samples:
            for k,v in s['statistics'].items():
                if isinstance(v,bool):counts[k]+=v
        report['runs'].append({'trace':path.name,'trace_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sample_count':len(samples),'boolean_counts':dict(counts),'samples':samples})
    if len(report['runs'])!=4:raise ValueError('four traces required')
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x',encoding='utf-8') as stream:json.dump(report,stream,indent=2)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input-dir',required=True,type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args();r=run(a.input_dir,a.out)
    for x in r['runs']:print(x['trace'],x['sample_count'],x['boolean_counts'])
