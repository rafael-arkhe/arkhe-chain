"""Offline structural diagnosis; no background correctness or semantic labels inferred."""
from collections import Counter
import argparse
import hashlib
import json
from pathlib import Path
import object_transition_probe as b


def describe(grid):
    s=b.scene(grid);counts=Counter(o['signature'] for o in s['objects'])
    unique=b.unique_objects(s);h=len(grid);w=len(grid[0])
    border=[grid[y][x] for y in range(h) for x in range(w) if y in (0,h-1) or x in (0,w-1)]
    corners=[grid[0][0],grid[0][-1],grid[-1][0],grid[-1][-1]]
    mode=lambda values:min(Counter(values),key=lambda c:(-Counter(values)[c],c))
    duplicates=[]
    for sig,n in counts.items():
        if n>1:
            objs=[o for o in s['objects'] if o['signature']==sig]
            duplicates.append({'signature':sig,'count':n,'color':objs[0]['color'],'area':len(objs[0]['shape']),
                               'positions':[[o['x'],o['y']] for o in objs]})
    return {'height':h,'width':w,'background_global_mode':s['background'],
            'border_mode':mode(border),'corner_mode':mode(corners),'corners':corners,
            'region_count':len(s['objects']),'unique_region_count':len(unique),
            'duplicated_region_count':sum(n for n in counts.values() if n>1),
            'duplicate_signature_count':len(duplicates),'duplicate_signatures':duplicates,
            'structural_rejection':'EMPTY_SCENE' if not s['objects'] else 'REPEATED_SIGNATURES' if len(unique)!=len(s['objects']) else None,
            'exact_reconstruction':b.reconstruct(s)==grid,
            'background_correctness':None,'semantic_sprite_identity':None,'animation_label':None}


def run(root,out):
    report={'sampling':'five evenly spaced non-reset training before-frames and five suffix before-frames per ls20 trace; prefix2500',
            'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'new_arc_actions':0,'policy_changed':False,'runs':[]}
    for p in sorted(root.glob('*-ls20.jsonl')):
        rows=[json.loads(line) for line in p.read_text().splitlines()];selected=[]
        for label,part in [('train',rows[:2500]),('test',rows[2500:])]:
            eligible=[r for r in part if r['action']['id']!=0]
            if len(eligible)<5:raise ValueError('insufficient frames')
            for i in range(5):
                r=eligible[i*(len(eligible)-1)//4];g=b.render(b.load(p.parent,r['before_frame']))
                selected.append({'partition':label,'step':r['step'],'frame_reference':r['before_frame'],'description':describe(g)})
        report['runs'].append({'trace':str(p.resolve()),'trace_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'samples':selected})
    if len(report['runs'])!=2:raise ValueError('expected two ls20 traces')
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x',encoding='utf-8') as stream:json.dump(report,stream,indent=2)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input-dir',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();r=run(a.input_dir,a.out)
    for x in r['runs']:
        print(Path(x['trace']).name,[(s['step'],s['description']['region_count'],s['description']['unique_region_count'],s['description']['structural_rejection']) for s in x['samples']])
