"""Positive controls, frozen train/test fit and visible-frame correspondence audit."""
from collections import Counter
import argparse
import hashlib
import json
from pathlib import Path
from analyze_saved_frames import load
from object_transition_probe import TranslationModel,scene,unique_objects,render,digest


class SpriteWorld:
    """Synthetic 10x10 control only; no ARC game semantics are assumed."""
    DELTA={1:(0,-1),2:(0,1),3:(-1,0),4:(1,0)}
    def __init__(self,x,y):self.x=x;self.y=y
    def frame(self):
        grid=[[0]*10 for _ in range(10)]
        for dx,dy in ((0,0),(1,0),(0,1),(1,1)):grid[self.y+dy][self.x+dx]=3
        return grid
    def step(self,action):
        dx,dy=self.DELTA[action]
        self.x=max(0,min(8,self.x+dx));self.y=max(0,min(8,self.y+dy))
        return self.frame()


def frozen_fit(model,transitions):
    frozen=digest(model.export());counts=Counter();reasons=Counter()
    for before,action,after in transitions:
        counts['queries']+=1;prediction,reason=model.predict(before,action);reasons[reason]+=1
        if prediction is None:counts['abstentions']+=1;continue
        counts['predictions']+=1;counts['correct_entire_last_render']+=int(prediction==after)
    assert frozen==digest(model.export())
    n=counts['queries'];issued=counts['predictions'];correct=counts['correct_entire_last_render']
    return {'counts':dict(counts),'abstention_reasons':dict(reasons),
            'prediction_frequency':issued/n if n else None,
            'conditional_exact_accuracy':correct/issued if issued else None,
            'exact_reproduction_rate_all_queries':correct/n if n else None,
            'model_unchanged':True}


def controls():
    training=[];test=[]
    for x,y in ((2,2),(4,4)):
        for action in (1,2,3,4):
            env=SpriteWorld(x,y);before=env.frame();after=env.step(action)
            training.append((before,{'id':action},after))
    for x,y in ((1,1),(6,6),(2,6),(6,2)):
        for action in (1,2,3,4):
            env=SpriteWorld(x,y);before=env.frame();after=env.step(action)
            test.append((before,{'id':action},after))
    model=TranslationModel()
    for b,a,t in training:model.observe(b,a,t)
    train_pairs={(digest(b),digest(a)) for b,a,_ in training}
    assert all((digest(b),digest(a)) not in train_pairs for b,a,_ in test)
    positive={'train_fit':frozen_fit(model,training),'unseen_position_test_fit':frozen_fit(model,test),
              'new_raw_pairs':len(test),'ground_truth_objects':1,
              'known_signature_stability':len({next(iter(unique_objects(scene(b)))) for b,_,_ in training+test})==1}
    assert positive['train_fit']['conditional_exact_accuracy']==1
    assert positive['unseen_position_test_fit']['conditional_exact_accuracy']==1
    # A perfectly stable sprite can have conditional (move/blocked) dynamics.
    blocked=SpriteWorld(8,2);before=blocked.frame();after=blocked.step(4)
    conditional=TranslationModel()
    for b,a,t in training+[(before,{'id':4},after)]:conditional.observe(b,a,t)
    counterexample={'train_fit':frozen_fit(conditional,training+[(before,{'id':4},after)]),
                    'test_fit':frozen_fit(conditional,test),
                    'same_signature_on_blocked_step':set(unique_objects(scene(before)))==set(unique_objects(scene(after))),
                    'interpretation':'stable extraction does not imply a context-independent displacement'}
    assert conditional.predict(SpriteWorld(6,2).frame(),{'id':4})[0] is None
    return {'synthetic_10x10_positive_control':positive,'synthetic_blocking_counterexample':counterexample,
            'scope':'validates this implementation on known synthetic dynamics, not all bugs or ARC generalization'}


def restore(path):
    model=TranslationModel()
    for row in json.loads(path.read_text()):
        model.rules[(row['action'],row['region_signature'])]=Counter({(v['dx'],v['dy']):v['count'] for v in row['outcomes']})
    return model


def transitions(path,records):
    for r in records:
        if r['action']['id']==0:continue
        before=load(path.parent,r['before_frame']);after=load(path.parent,r['after_frame'])
        yield render(before),r['action'],render(after)


def inspect_pairs(path,records,model,out):
    selected=[];chosen_key=None;stationary=None;extra_moving=None
    for r in records[:2500]:
        action=r['action']['id']
        if action in (0,6):continue
        before=load(path.parent,r['before_frame']);after=load(path.parent,r['after_frame'])
        bs=scene(render(before));ats=scene(render(after));b=unique_objects(bs);a=unique_objects(ats)
        for signature,obj in sorted(b.items()):
            key=(action,signature)
            if signature not in a or len(model.rules.get(key,{}))<2:continue
            other=a[signature];delta=(other['x']-obj['x'],other['y']-obj['y'])
            item={'step':r['step'],'action':r['action'],'signature':signature,'color':obj['color'],
                  'shape_area':len(obj['shape']),'before_position':[obj['x'],obj['y']],
                  'after_position':[other['x'],other['y']],'delta':delta,
                  'before_frame':r['before_frame'],'after_frame':r['after_frame'],
                  'before_frame_layers':len(before['frame']),'after_frame_layers':len(after['frame']),
                  'before_region_count':len(bs['objects']),'after_region_count':len(ats['objects']),
                  'before_unique_signatures':len(b),'after_unique_signatures':len(a),
                  'identity_basis':'unique color/normalized-shape signature, not independently labelled object identity'}
            if chosen_key is None and delta!=(0,0):
                chosen_key=key;selected.append(item)
            elif key==chosen_key:
                if delta==(0,0) and stationary is None:stationary=item
                elif delta!=(0,0) and extra_moving is None and r['step']!=selected[0]['step']:extra_moving=item
        if selected and stationary and extra_moving:break
    if stationary:selected.append(stationary)
    if extra_moving:selected.append(extra_moving)
    # Render observed pixels only; rectangles identify the selected candidate region.
    if selected:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        from matplotlib.patches import Rectangle
        fig,axes=plt.subplots(len(selected),2,figsize=(10,4.6*len(selected)),squeeze=False)
        for i,item in enumerate(selected):
            for j,(field,pos_field) in enumerate((('before_frame','before_position'),('after_frame','after_position'))):
                pos=item[pos_field]
                value=load(path.parent,item[field]);grid=render(value);ax=axes[i,j]
                ax.imshow(grid,cmap='tab20',vmin=0,vmax=19,interpolation='nearest')
                found=unique_objects(scene(grid))[item['signature']]
                width=max(dx for dx,_ in found['shape'])+1;height=max(dy for _,dy in found['shape'])+1
                ax.add_patch(Rectangle((pos[0]-.5,pos[1]-.5),width,height,fill=False,edgecolor='red',linewidth=2))
                ax.set_title(f"step {item['step']} action {item['action']['id']} | {'before' if j==0 else 'after'}\nposition={pos}, delta={list(item['delta'])}")
                ax.set_xticks([]);ax.set_yticks([])
        fig.suptitle('Observed ls20 regions: red box = candidate match; colors shown by palette index')
        fig.tight_layout();fig.savefig(out/'ls20-pair-inspection.png',dpi=130);plt.close(fig)
    return {'trace':str(path),'selection':'earliest unique moving region with a conflicting fitted key, then stationary and further moving examples of that same key',
            'pairs':selected,'semantic_ground_truth_available':False,
            'population_tracking_accuracy':None,'h2_status':'NOT_IDENTIFIED_FROM_THREE_SELECTED_PAIRS'}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input-dir',required=True,type=Path)
    p.add_argument('--model-dir',required=True,type=Path);p.add_argument('--output-dir',required=True,type=Path);args=p.parse_args()
    out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=False)
    plan={'phase':'POSTHOC_TRANSLATION_CONTROL_AND_FIT_DIAGNOSTIC','source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'train_prefix_dispatches':2500,'model_scope':'original frozen models restored, not retrained or tuned',
          'new_arc_environment_actions':0,'live_policy_modified':False,'hypotheses_not_mutually_exclusive':True}
    (out/'plan.json').write_text(json.dumps(plan,indent=2))
    control=controls();(out/'synthetic-controls.json').write_text(json.dumps(control,indent=2));print(json.dumps(control),flush=True)
    rows=[];inspection=None
    original=json.loads((args.model_dir/'report.json').read_text())
    expected={r['trace']:r['frozen_model_sha256'] for r in original['runs']}
    for path in sorted((args.input_dir/'seed-0-budget-5000').glob('*.jsonl')):
        records=[json.loads(l) for l in path.read_text(encoding='utf-8').splitlines()]
        model_path=args.model_dir/(path.stem+'-model.json');model=restore(model_path)
        assert digest(model.export())==expected[path.name]
        row={'trace':path.name,'trace_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
             'model_file_sha256':hashlib.sha256(model_path.read_bytes()).hexdigest(),
             'model_export_digest':digest(model.export()),
             'train_fit':frozen_fit(model,transitions(path,records[:2500])),
             'test_fit':frozen_fit(model,transitions(path,records[2500:]))}
        rows.append(row);print(json.dumps(row),flush=True)
        (out/'report.json').write_text(json.dumps({**plan,'controls':control,'runs':rows,'complete':False},indent=2))
        if path.name=='frontier-ls20.jsonl':
            inspection=inspect_pairs(path,records,model,out)
            (out/'ls20-pair-inspection.json').write_text(json.dumps(inspection,indent=2))
        (out/'report.json').write_text(json.dumps({**plan,'controls':control,'runs':rows,'complete':False},indent=2))
    assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==plan['source_sha256']
    (out/'report.json').write_text(json.dumps({**plan,'controls':control,'runs':rows,'complete':True},indent=2))

if __name__=='__main__':main()
