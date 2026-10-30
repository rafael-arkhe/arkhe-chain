"""Frozen local-feature selector for retrospective footprint-change labels.
Does not predict transformations, background changes or whole renders.
"""
from collections import Counter
import argparse
import hashlib
import json
from pathlib import Path
import object_transition_probe as b
from context_transition_probe import context


def examples(before,action):
    scene=b.scene(before);rows=[]
    for o in scene['objects']:
        cells=[(o['x']+x,o['y']+y) for x,y in o['shape']]
        edge=min(min(x,scene['width']-1-x,y,scene['height']-1-y) for x,y in cells)
        features=[action,o['color'],o['shape'],o['x'],o['y'],len(cells),edge,context(before,o,scene['background'])]
        rows.append((b.digest(features),cells))
    return rows


class Selector:
    def __init__(self):self.counts={}
    def observe(self,rows,after,before):
        for key,cells in rows:
            label=any(before[y][x]!=after[y][x] for x,y in cells)
            self.counts.setdefault(key,Counter())[int(label)]+=1
    def predict(self,key):
        c=self.counts.get(key)
        if not c:return None,'UNSEEN_FEATURE_KEY'
        if sum(c.values())<2:return None,'INSUFFICIENT_SUPPORT'
        if len(c)!=1:return None,'CONFLICTING_LABELS'
        return next(iter(c)),'ISSUED'
    def export(self):return [[key,sorted(c.items())] for key,c in sorted(self.counts.items())]


def tally(selector,rows,before,after):
    c=Counter()
    for key,cells in rows:
        label=int(any(before[y][x]!=after[y][x] for x,y in cells));p,reason=selector.predict(key)
        c['region_queries']+=1;c['actual_touched']+=label;c['actual_untouched']+=1-label;c[reason]+=1
        if p is not None:
            c['issued']+=1;c['correct']+=p==label
            c['TP' if p and label else 'FP' if p else 'FN' if label else 'TN']+=1
    return c


def summarize(c):
    n=c['region_queries'];issued=c['issued']
    return {'counts':dict(c),'coverage':issued/n if n else None,'correct_coverage':c['correct']/n if n else None,
            'conditional_error':(issued-c['correct'])/issued if issued else None,
            'always_untouched_accuracy_on_all':c['actual_untouched']/n if n else None,
            'touched_recall_including_abstentions':c['TP']/c['actual_touched'] if c['actual_touched'] else None}


def run(root,out):
    out.mkdir(parents=True,exist_ok=False)
    paths=sorted(root.glob('*.jsonl'))
    if len(paths)!=4:raise ValueError('expected four traces')
    r={'phase':'POSTHOC_FROZEN_REGION_FOOTPRINT_SELECTOR','prefix':2500,'min_support':2,
       'features':'canonical action incl coordinates; color; normalized shape; x/y; area; edge distance; palette contour8 context',
       'label':'any pixel in before region footprint changes; not object motion, growth or whole-render prediction',
       'inference_inputs':'before render and action only','new_environment_actions':0,'hybrid_gate':'NOT_EVALUATED_NO_TRANSFORMATION_MODEL',
       'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
       'trace_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'runs':[]}
    (out/'plan.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
    for path in paths:
        records=[json.loads(s) for s in path.read_text().splitlines()];m=Selector();train=[];test=[]
        for i,v in enumerate(records):
            if v['action']['id']==0:continue
            before=b.render(b.load(path.parent,v['before_frame']));after=b.render(b.load(path.parent,v['after_frame']))
            rows=examples(before,v['action'])
            if i<2500:m.observe(rows,after,before);train.append((rows,before,after))
            else:test.append((rows,before,after))
        frozen=b.digest(m.export());(out/(path.stem+'-model.json')).write_text(json.dumps(m.export()),encoding='utf-8')
        totals={}
        for name,data in [('train',train),('test',test)]:
            counts=Counter()
            for rows,before,after in data:counts.update(tally(m,rows,before,after))
            totals[name]=summarize(counts)
        assert b.digest(m.export())==frozen
        item={'trace':path.name,'model_sha256':frozen,'feature_keys':len(m.counts),'frozen_unchanged':True,**totals}
        r['runs'].append(item);(out/'report.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
        print(json.dumps(item),flush=True)
    r['complete']=True;(out/'report.json').write_text(json.dumps(r,indent=2),encoding='utf-8')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input-dir',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();run(a.input_dir,a.out)
