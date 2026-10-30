"""Inspect archived visible pixels only. Do not change state identity or policy."""
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import argparse

def load(directory,ref):
    digest=ref['sha256']
    if ref['relative_path']!='frames/'+digest+'.json.gz':raise ValueError('invalid snapshot path')
    raw=gzip.decompress((directory/ref['relative_path']).read_bytes())
    if hashlib.sha256(raw).hexdigest()!=digest:raise ValueError('corrupt snapshot')
    return json.loads(raw)

def render_key(value):
    last={**value,'frame':value['frame'][-1:]}
    return hashlib.sha256(json.dumps(last,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def analyze(path):
    rows=Counter();cols=Counter();count=0;same_last=0;layers=Counter();pixel_deltas=[]
    pairs=Counter();repeats=0;distinct_last=set()
    for line in path.read_text(encoding='utf-8').splitlines():
        r=json.loads(line)
        if r['action']['id']==0:continue
        before=load(path.parent,r['before_frame']);after=load(path.parent,r['after_frame']);count+=1
        layers[len(before['frame'])]+=1;lastkey=render_key(before);distinct_last.add(lastkey)
        pair=(lastkey,json.dumps(r['action'],sort_keys=True));repeats+=int(pairs[pair]>0);pairs[pair]+=1
        b=before['frame'][-1] if before['frame'] else [];a=after['frame'][-1] if after['frame'] else []
        if len(b)!=len(a) or any(len(x)!=len(y) for x,y in zip(b,a)):continue
        changed=0
        for y,(br,ar) in enumerate(zip(b,a)):
            for x,(bv,av) in enumerate(zip(br,ar)):
                if bv!=av:changed+=1;rows[y]+=1;cols[x]+=1
        pixel_deltas.append(changed);same_last+=int(changed==0)
    return {'trace':path.name,'non_reset_actions':count,'frame_layer_counts':dict(layers),
            'last_render_source_states':len(distinct_last),
            'last_render_pair_repeat_ratio':repeats/count if count else None,
            'no_last_pixel_change_count':same_last,
            'mean_last_pixel_delta':sum(pixel_deltas)/len(pixel_deltas) if pixel_deltas else None,
            'changed_pixels_by_row':dict(sorted(rows.items())),
            'changed_pixels_by_column':dict(sorted(cols.items())),
            'interpretation':'DESCRIPTIVE_ONLY_NO_HUD_OR_SEMANTIC_LABEL_INFERRED'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',type=Path);args=p.parse_args()
    rows=[analyze(path) for path in sorted(args.directory.glob('*.jsonl'))]
    (args.directory/'frame-diagnostics.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
    print(json.dumps([{k:v for k,v in r.items() if not k.startswith('changed_pixels_by_')} for r in rows],indent=2))
