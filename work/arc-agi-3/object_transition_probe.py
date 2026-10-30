"""Offline chronological probe of position-independent palette-region translations.

Palette components are candidate objects, not annotated semantic objects. Learns
on a declared prefix only, freezes the model, then predicts future last renders.
No environment calls, game source reads, agent changes or Kaggle operations.
"""
from collections import Counter
import argparse
import hashlib
import json
from pathlib import Path
from analyze_saved_frames import load


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def scene(grid):
    height=len(grid);width=len(grid[0]) if height else 0
    if not width or any(len(row)!=width for row in grid):raise ValueError('nonrectangular empty render')
    palette=Counter(v for row in grid for v in row)
    background=min(palette,key=lambda color:(-palette[color],color))
    visited=set();objects=[]
    for y in range(height):
        for x in range(width):
            if (x,y) in visited or grid[y][x]==background:continue
            color=grid[y][x];cells=[];todo=[(x,y)];visited.add((x,y))
            while todo:
                px,py=todo.pop();cells.append((px,py))
                for nx,ny in ((px+1,py),(px-1,py),(px,py+1),(px,py-1)):
                    if 0<=nx<width and 0<=ny<height and (nx,ny) not in visited and grid[ny][nx]==color:
                        visited.add((nx,ny));todo.append((nx,ny))
            ox=min(p[0] for p in cells);oy=min(p[1] for p in cells)
            shape=sorted((px-ox,py-oy) for px,py in cells)
            objects.append({'color':color,'x':ox,'y':oy,'shape':shape,
                            'signature':digest([color,shape])})
    return {'width':width,'height':height,'background':background,'objects':objects}


def reconstruct(value):
    grid=[[value['background']]*value['width'] for _ in range(value['height'])]
    for obj in value['objects']:
        for dx,dy in obj['shape']:grid[obj['y']+dy][obj['x']+dx]=obj['color']
    return grid


def unique_objects(value):
    counts=Counter(o['signature'] for o in value['objects'])
    return {o['signature']:o for o in value['objects'] if counts[o['signature']]==1}


class TranslationModel:
    def __init__(self,min_support=2):
        self.rules={};self.min_support=min_support

    def observe(self,before,action,after):
        if action['id'] in (0,6):return
        b=scene(before);a=scene(after)
        if (b['width'],b['height'],b['background'])!=(a['width'],a['height'],a['background']):return
        ub=unique_objects(b);ua=unique_objects(a)
        for signature,obj in ub.items():
            if signature not in ua:continue
            other=ua[signature];delta=(other['x']-obj['x'],other['y']-obj['y'])
            self.rules.setdefault((action['id'],signature),Counter())[delta]+=1

    def predict(self,before,action):
        if action['id'] in (0,6):return None,'UNSUPPORTED_ACTION'
        value=scene(before);objects=unique_objects(value);moves=[]
        for signature,obj in objects.items():
            counts=self.rules.get((action['id'],signature))
            if not counts or len(counts)!=1 or sum(counts.values())<self.min_support:continue
            dx,dy=next(iter(counts))
            if dx or dy:moves.append((obj,dx,dy))
        if not moves:return None,'NO_SUPPORTED_NONZERO_TRANSLATION'
        old={(obj['x']+x,obj['y']+y) for obj,_,_ in moves for x,y in obj['shape']}
        destinations=set()
        for obj,dx,dy in moves:
            for x,y in obj['shape']:
                nx=obj['x']+x+dx;ny=obj['y']+y+dy
                if not (0<=nx<value['width'] and 0<=ny<value['height']):return None,'OUT_OF_BOUNDS'
                if (nx,ny) in destinations:return None,'OVERLAPPING_MOVES'
                if before[ny][nx]!=value['background'] and (nx,ny) not in old:return None,'OCCUPIED_DESTINATION'
                destinations.add((nx,ny))
        predicted=[list(row) for row in before]
        for x,y in old:predicted[y][x]=value['background']
        for obj,dx,dy in moves:
            for x,y in obj['shape']:predicted[obj['y']+y+dy][obj['x']+x+dx]=obj['color']
        return predicted,'PREDICTED_TRANSLATION'

    def export(self):
        return [{'action':a,'region_signature':sig,'outcomes':[{'dx':delta[0],'dy':delta[1],'count':count}
                    for delta,count in sorted(counts.items())]} for (a,sig),counts in sorted(self.rules.items())]


def render(value):
    return value['frame'][-1] if value['frame'] else []


def key(record):
    return (record['before'],record['action']['id'],record['action'].get('x'),record['action'].get('y'))


def pixels_error(predicted,target):
    if len(predicted)!=len(target) or any(len(a)!=len(b) for a,b in zip(predicted,target)):return 1.0
    total=sum(len(row) for row in target)
    return sum(x!=y for a,b in zip(predicted,target) for x,y in zip(a,b))/total if total else None


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input-dir',required=True,type=Path);p.add_argument('--output-dir',required=True,type=Path)
    p.add_argument('--train-prefix',type=int,default=2500)
    args=p.parse_args()
    if args.train_prefix<=0:p.error('positive training prefix required')
    out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=False)
    traces=[]
    for path in sorted((args.input_dir/'seed-0-budget-5000').glob('*.jsonl')):
        records=[json.loads(l) for l in path.read_text(encoding='utf-8').splitlines()]
        if len(records)<=args.train_prefix:raise ValueError('no test suffix')
        traces.append((path,records))
    if len(traces)!=4:raise ValueError('expected four declared seed-0 5000-action traces')
    source=Path(__file__).read_bytes();source_hash=hashlib.sha256(source).hexdigest()
    plan={'phase':'POSTHOC_CHRONOLOGICAL_OBJECT_TRANSLATION_PROBE','train_prefix':args.train_prefix,
          'trace_sources':[{'path':str(path.resolve()),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path,_ in traces],
          'source_sha256':source_hash,'min_rule_support':2,'test_model_updates':False,
          'prediction_target':'entire last pixel render; not semantic or full latent state',
          'learning_scope':'separate model per trace; no pooling across policies or games',
          'abstention':'unsupported clicks, ambiguous region identities, conflicting motion, collisions or insufficient support',
          'interpretation':'design chosen after aggregate benchmark results; not a blind confirmatory holdout',
          'new_environment_actions':0,'fragmentation_rate':None,'capability_demonstrated':False}
    (out/'plan.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
    summaries=[]
    for path,records in traces:
        model=TranslationModel();lookup={};train_pairs=set();training=0
        for r in records[:args.train_prefix]:
            if not r['action']['id']:continue
            before=load(path.parent,r['before_frame']);after=load(path.parent,r['after_frame'])
            b=render(before);a=render(after)
            if not b or not a:continue
            assert reconstruct(scene(b))==b
            training+=1;train_pairs.add(key(r));lookup.setdefault(key(r),Counter())[digest(a)]+=1
            if before['levels_completed']==after['levels_completed'] and before['state']==after['state']:
                model.observe(b,r['action'],a)
        frozen=digest(model.export());(out/(path.stem+'-model.json')).write_text(json.dumps(model.export(),indent=2))
        counters=Counter();reasons=Counter();sum_pixel_error=0.;sum_persistence_error=0.
        for r in records[args.train_prefix:]:
            if not r['action']['id']:continue
            before=load(path.parent,r['before_frame']);after=load(path.parent,r['after_frame'])
            b=render(before);a=render(after)
            if not b or not a:continue
            counters['test_queries']+=1;unseen=key(r) not in train_pairs
            counters['unseen_raw_pair_queries']+=int(unseen)
            predicted,reason=model.predict(b,r['action']);reasons[reason]+=1
            persistence_correct=b==a;counters['persistence_exact_correct_all_queries']+=int(persistence_correct)
            counts=lookup.get(key(r))
            if counts and len(counts)==1:
                counters['lookup_predictions']+=1
                counters['lookup_exact_correct']+=int(next(iter(counts))==digest(a))
            if predicted is None:continue
            correct=predicted==a;counters['object_predictions']+=1;counters['object_exact_correct']+=int(correct)
            counters['unseen_raw_pair_predictions']+=int(unseen)
            counters['unseen_raw_pair_exact_correct']+=int(unseen and correct)
            counters['persistence_exact_correct_on_object_queries']+=int(persistence_correct)
            sum_pixel_error+=pixels_error(predicted,a);sum_persistence_error+=pixels_error(b,a)
            event={'trace':path.name,'step':r['step'],'before':r['before'],'after':r['after'],
                   'unseen_raw_pair_relative_to_training':unseen,'predicted_last_render_sha256':digest(predicted),
                   'observed_last_render_sha256':digest(a),'exact_correct':correct,
                   'persistence_exact_correct':persistence_correct,'frozen_model_sha256':frozen}
            with (out/'issued-predictions.jsonl').open('a',encoding='utf-8') as stream:stream.write(json.dumps(event)+'\n')
        assert digest(model.export())==frozen
        n=counters['test_queries'];issued=counters['object_predictions'];unseen=counters['unseen_raw_pair_queries']
        summary={'trace':path.name,'training_transitions':training,'frozen_model_sha256':frozen,
                 'learned_region_action_keys':len(model.rules),'counts':dict(counters),'abstentions':dict(reasons),
                 'object_prediction_frequency':issued/n if n else None,
                 'object_exact_accuracy_on_predictions':counters['object_exact_correct']/issued if issued else None,
                 'unseen_raw_pair_prediction_frequency':counters['unseen_raw_pair_predictions']/unseen if unseen else None,
                 'unseen_raw_pair_exact_accuracy':counters['unseen_raw_pair_exact_correct']/counters['unseen_raw_pair_predictions'] if counters['unseen_raw_pair_predictions'] else None,
                 'mean_pixel_error_on_object_predictions':sum_pixel_error/issued if issued else None,
                 'persistence_pixel_error_on_same_queries':sum_persistence_error/issued if issued else None,
                 'fragmentation_rate':None,'logical_state_count':None,'test_model_hash_unchanged':True}
        summaries.append(summary)
        (out/'report.json').write_text(json.dumps({**plan,'runs':summaries,'complete':False},indent=2))
        print(json.dumps(summary),flush=True)
    assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==source_hash
    (out/'report.json').write_text(json.dumps({**plan,'runs':summaries,'complete':True},indent=2))

if __name__=='__main__':main()
