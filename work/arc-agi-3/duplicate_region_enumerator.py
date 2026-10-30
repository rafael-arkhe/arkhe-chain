"""One-step exhaustive rendered consensus over explicitly supplied hypotheses.
No learner, environment access, rollout or semantic identity guarantee.
"""
from itertools import product
from math import prod
import hashlib
import json
import object_transition_probe as base

DEFAULT_BUDGET=100000


def canonical(value):
    # JSON structure, not source-file whitespace, defines equality.
    return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')


def training_conflicts(transitions):
    outcomes={}
    for before,action,after in transitions:
        key=canonical([before,action]);outcomes.setdefault(key,set()).add(canonical(after))
    return sum(len(v)>1 for v in outcomes.values())


def predict(grid,options,action_id=4,budget=DEFAULT_BUDGET):
    """options maps scene-order region indices to explicit finite displacement sets.

    Caller must derive options solely from frozen training hypotheses; this pure
    enumerator does not validate their provenance or completeness.
    """
    if isinstance(budget,bool) or not isinstance(budget,int) or budget<1:raise ValueError('positive integer budget required')
    result={'target':'whole last render','horizon':1,'budget':budget,'explored':0,
            'raw_cartesian_total':0,'admissible_examined':0,'complete':False,'prediction':None}
    def finish(reason):result['reason']=reason;return result
    if action_id in (0,6):return finish('UNSUPPORTED_ACTION')
    if not grid or not grid[0] or any(len(row)!=len(grid[0]) for row in grid):raise ValueError('nonempty rectangular grid required')
    if any(isinstance(v,bool) or not isinstance(v,int) or not 0<=v<=255 for row in grid for v in row):raise ValueError('integer pixels 0..255 required')
    scene=base.scene(grid);regions=scene['objects'];result['region_count']=len(regions)
    if not regions:return finish('NO_REGIONS')
    if set(options)!=set(range(len(regions))):return finish('NO_SUPPORTED_DISPLACEMENT')
    alternatives=[]
    for index in range(len(regions)):
        values=options[index]
        if any(len(d)!=2 or any(isinstance(v,bool) or not isinstance(v,int) for v in d) for d in values):raise ValueError('integer displacement pairs required')
        choices=sorted(set(tuple(d) for d in values))
        if not choices:return finish('NO_SUPPORTED_DISPLACEMENT')
        alternatives.append(choices)
    result['raw_cartesian_total']=prod(map(len,alternatives))
    consensus=None;first_assignment=None
    for assignment in product(*alternatives):
        if result['explored']>=budget:return finish('SEARCH_INCOMPLETE')
        result['explored']+=1
        occupied={};valid=True
        for obj,(dx,dy) in zip(regions,assignment):
            for sx,sy in obj['shape']:
                x=obj['x']+sx+dx;y=obj['y']+sy+dy
                if not(0<=x<scene['width'] and 0<=y<scene['height']) or (x,y) in occupied:
                    valid=False;break
                occupied[x,y]=obj['color']
            if not valid:break
        if not valid:continue
        rendered=[[scene['background']]*scene['width'] for _ in range(scene['height'])]
        for (x,y),color in occupied.items():rendered[y][x]=color
        result['admissible_examined']+=1
        encoded=canonical(rendered)
        if consensus is None:consensus=encoded;first_assignment=assignment
        elif consensus!=encoded:
            result['counterexample_disagreement']=True
            return finish('AMBIGUOUS_RENDER')
    result['complete']=True
    if consensus is None:return finish('NO_ADMISSIBLE_SCENE')
    result['prediction']=json.loads(consensus)
    result['prediction_sha256']=hashlib.sha256(consensus).hexdigest()
    result['hypothesis_retention']='all admissible assignments remain represented by frozen options + constraints; no selected latent identity'
    return finish('CONSENSUS')


def gate(queries,issued,correct,conflicts):
    return 'PASS' if queries>0 and issued==queries and correct==queries and conflicts==0 else 'FAIL'
