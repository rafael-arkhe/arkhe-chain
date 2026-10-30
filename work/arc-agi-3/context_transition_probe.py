"""Offline contour-context translation hypothesis. No live environment calls."""
from collections import Counter
import argparse
import hashlib
import json
from pathlib import Path
import object_transition_probe as base


def context(grid,obj,background):
    cells=set(obj['shape']);ring=set()
    for x,y in cells:
        for dx in (-1,0,1):
            for dy in (-1,0,1):
                if (x+dx,y+dy) not in cells:ring.add((x+dx,y+dy))
    result=[]
    for dx,dy in sorted(ring):
        x=obj['x']+dx;y=obj['y']+dy
        value='BOUNDARY' if not (0<=y<len(grid) and 0<=x<len(grid[0])) else grid[y][x]
        result.append((dx,dy,value))
    return base.digest(result)


class ContextModel:
    def __init__(self,min_support=2):self.rules={};self.min_support=min_support
    def observe(self,before,action,after):
        if action['id'] in (0,6):return
        b=base.scene(before);a=base.scene(after)
        if (b['width'],b['height'],b['background'])!=(a['width'],a['height'],a['background']):return
        ub=base.unique_objects(b);ua=base.unique_objects(a)
        for sig,obj in ub.items():
            if sig not in ua:continue
            other=ua[sig];delta=(other['x']-obj['x'],other['y']-obj['y'])
            k=(action['id'],sig,context(before,obj,b['background']))
            self.rules.setdefault(k,Counter())[delta]+=1
    def predict(self,before,action):
        if action['id'] in (0,6):return None,'UNSUPPORTED_ACTION'
        b=base.scene(before);objs=base.unique_objects(b)
        if not objs or len(objs)!=len(b['objects']):return None,'AMBIGUOUS_OR_EMPTY_SCENE'
        moves=[]
        for sig,obj in objs.items():
            counts=self.rules.get((action['id'],sig,context(before,obj,b['background'])))
            if not counts or sum(counts.values())<self.min_support:return None,'INSUFFICIENT_CONTEXT_SUPPORT'
            if len(counts)!=1:return None,'CONFLICTING_CONTEXT'
            dx,dy=next(iter(counts));moves.append((obj,dx,dy))
            dest=set();pred=[[b['background']]*b['width'] for _ in range(b['height'])]
        for o,dx,dy in moves:
            for x,y in o['shape']:
                nx=o['x']+x+dx;ny=o['y']+y+dy
                if not (0<=nx<b['width'] and 0<=ny<b['height']):return None,'OUT_OF_BOUNDS'
                if (nx,ny) in dest:return None,'OVERLAPPING_MOVES'
                dest.add((nx,ny));pred[ny][nx]=o['color']
        return pred,'PREDICTED_CONTEXT_TRANSITION'
    def export(self):
        return [{'key':list(k),'outcomes':[[dx,dy,n] for (dx,dy),n in sorted(c.items())]} for k,c in sorted(self.rules.items())]


def metrics(n,issued,correct):
    return {'queries':n,'issued':issued,'correct':correct,'abstained':n-issued,
            'coverage':issued/n if n else None,'correct_coverage':correct/n if n else None,
            'hit_rate':correct/issued if issued else None,
            'conditional_error':(issued-correct)/issued if issued else None,
            'abstention_rate':(n-issued)/n if n else None}


def evaluate(model,rows):
    n=issued=correct=0;reasons=Counter()
    for b,a,t in rows:
        n+=1;p,r=model.predict(b,a);reasons[r]+=1
        if p is not None:issued+=1;correct+=p==t
    return {**metrics(n,issued,correct),'reasons':dict(reasons)}


def gate(m):
    # Exact whole-render historical consistency; deliberately no arbitrary .5/.9 acceptance.
    return {'status':'PASS' if m['queries']>0 and m['issued']==m['queries'] and m['correct']==m['queries'] else 'FAIL',
            'criterion':'all training queries answered and whole last render exact',
            'scope':'historical consistency only; not future validity','metrics':m}


def board(x,y,wall):
    g=[[0]*10 for _ in range(10)];g[y][x]=5
    if wall:
        g[y][7]=9
    return g


def controls():
    a={'id':4};m=ContextModel();train=[]
    for y in (3,4):
        for x in (3,4,5,6):train.append((board(x,y,True),a,board(min(x+1,6),y,True)))
    train=train*2  # repeat each context to satisfy declared min_support=2
    for row in train:m.observe(*row)
    test=[(board(x,6,True),a,board(min(x+1,6),6,True)) for x in (3,4,5,6)]
    assert gate(evaluate(m,train))['status']=='PASS'
    assert evaluate(m,test)['correct']==4
    baseline=base.TranslationModel()
    for row in train:baseline.observe(*row)
    assert evaluate(baseline,test)['issued']==0
    # Same visible state/context, different hidden-mode outcomes: must abstain.
    neg=ContextModel();b=board(4,4,False)
    for _ in range(2):
        neg.observe(b,a,board(5,4,False));neg.observe(b,a,b)
    negative=evaluate(neg,[(b,a,b)])
    assert negative['issued']==0 and gate(negative)['status']=='FAIL'
    empty=ContextModel();assert gate(evaluate(empty,test))['status']=='FAIL'
    return {'status':'PASS','positive_train':gate(evaluate(m,train)),
            'positive_unseen_positions':evaluate(m,test),'context_free_same_queries':evaluate(baseline,test),
            'hidden_mode_negative':negative,'empty_model_gate':'FAIL'}


def run(input_dir,out,prefix):
    out.mkdir(parents=True,exist_ok=False)
    source=Path(__file__);paths=sorted((input_dir/'seed-0-budget-5000').glob('*.jsonl'))
    if len(paths)!=4:raise ValueError('expected four historical traces')
    plan={'phase':'POSTHOC_CONTOUR_CONTEXT_PROBE','train_prefix':prefix,'new_arc_actions':0,
          'model':'action + color/shape + eight-neighbor contour palette/boundary; all regions require support',
          'min_support':2,'target':'entire last render','test_updates':False,'policy_changed':False,
          'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
          'inputs':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
          'controls':controls(),'fragmentation_rate':None,'runs':[]}
    (out/'plan.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
    for path in paths:
        records=[json.loads(s) for s in path.read_text().splitlines()]
        if not 0<prefix<len(records):raise ValueError('invalid prefix')
        train=[];test=[];seen=set();lookup={};m=ContextModel()
        for i,r in enumerate(records):
            if r['action']['id']==0:continue
            before=base.load(path.parent,r['before_frame']);after=base.load(path.parent,r['after_frame'])
            b=base.render(before);t=base.render(after)
            if not b or not t:continue
            row=(b,r['action'],t)
            if i<prefix:
                train.append(row);seen.add(base.key(r));lookup.setdefault(base.key(r),Counter())[base.digest(t)]+=1
                if before['levels_completed']==after['levels_completed'] and before['state']==after['state']:m.observe(*row)
            else:test.append((row,base.key(r)))
        frozen=base.digest(m.export());train_eval=evaluate(m,train)
        (out/(path.stem+'-model.json')).write_text(json.dumps(m.export(),indent=2),encoding='utf-8')
        result={'trace':path.name,'model_sha256':frozen,'training_gate':gate(train_eval),'test':{}}
        for label,is_unseen in [('seen',False),('unseen',True)]:
            subset=[(row,k) for row,k in test if (k not in seen)==is_unseen]
            result['test'][label]={'context_model':evaluate(m,[row for row,k in subset])}
            issued=correct=0
            for row,k in subset:
                c=lookup.get(k)
                if c and len(c)==1:issued+=1;correct+=next(iter(c))==base.digest(row[2])
            result['test'][label]['lookup']=metrics(len(subset),issued,correct)
        assert base.digest(m.export())==frozen
        result['frozen_hash_unchanged']=True;result['admitted_model']=result['training_gate']['status']=='PASS'
        result['test_scope']='diagnostic even if training gate fails; no admitted capability claim'
        plan['runs'].append(result)
        (out/'report.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
        print(json.dumps({'trace':path.name,'gate':result['training_gate']['status'],'unseen':result['test']['unseen']}),flush=True)
    plan['complete']=True
    (out/'report.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input-dir',type=Path);p.add_argument('--out',type=Path);p.add_argument('--train-prefix',type=int,default=2500);p.add_argument('--selftest',action='store_true');a=p.parse_args()
    if a.selftest:print(json.dumps(controls(),indent=2))
    else:
        if a.input_dir is None or a.out is None:p.error('input-dir and out required')
        run(a.input_dir,a.out,a.train_prefix)
