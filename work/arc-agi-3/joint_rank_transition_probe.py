"""Restricted joint rank-translation learner; synthetic development scope.
Ranks are per-frame geometric slots, NOT persistent object identities.
"""
from itertools import permutations,product
from math import factorial,prod
from collections import defaultdict
import json
import object_transition_probe as b
import duplicate_region_enumerator as e

DEFAULT_BUDGET=100000


def ordered(grid):
    s=b.scene(grid)
    s['objects']=sorted(s['objects'],key=lambda o:(o['signature'],o['y'],o['x']))
    return s


def layout(s):
    return (s['width'],s['height'],s['background'],tuple(o['signature'] for o in s['objects']))


def candidates(before,after,budget=DEFAULT_BUDGET):
    if budget<1:raise ValueError('positive budget required')
    x=ordered(before);y=ordered(after)
    if not x['objects']:return {'status':'NO_REGIONS','vectors':set(),'total':0}
    if layout(x)!=layout(y):return {'status':'UNSUPPORTED_REPRESENTATION','vectors':set(),'total':0}
    groups=defaultdict(list)
    for i,o in enumerate(x['objects']):groups[o['signature']].append(i)
    groups=list(groups.values());total=prod(factorial(len(g)) for g in groups)
    if total>budget:return {'status':'SEARCH_INCOMPLETE','vectors':set(),'total':total}
    # Permutations of observed target indices, not arbitrary displacement pools.
    vectors=set()
    for choice in product(*(permutations(g) for g in groups)):
        vector=[None]*len(x['objects'])
        for ids,targets in zip(groups,choice):
            for i,j in zip(ids,targets):
                a=x['objects'][i];z=y['objects'][j]
                vector[i]=(z['x']-a['x'],z['y']-a['y'])
        vectors.add(tuple(vector))
    return {'status':'COMPLETE','vectors':vectors,'total':total}


def predict_vectors(grid,vectors,budget=DEFAULT_BUDGET):
    """Complete vectors are never projected to independent region alternatives."""
    if budget<1:raise ValueError('positive budget required')
    s=ordered(grid);objects=s['objects']
    report={'reason':None,'prediction':None,'explored':0,'total':len(vectors),'admissible':0,'complete':False,'identity_certified':False}
    if not objects:report['reason']='NO_REGIONS';return report
    if not vectors:report['reason']='NO_SUPPORTED_HYPOTHESIS';return report
    consensus=None
    for vector in sorted(vectors):
        if report['explored']>=budget:report['reason']='SEARCH_INCOMPLETE';return report
        report['explored']+=1
        if len(vector)!=len(objects):raise ValueError('complete vector required')
        occupied={};valid=True
        for o,(dx,dy) in zip(objects,vector):
            for sx,sy in o['shape']:
                x=o['x']+sx+dx;y=o['y']+sy+dy
                if not(0<=x<s['width'] and 0<=y<s['height']) or (x,y) in occupied:
                    valid=False;break
                occupied[x,y]=o['color']
            if not valid:break
        if not valid:continue
        g=[[s['background']]*s['width'] for _ in range(s['height'])]
        for (x,y),color in occupied.items():g[y][x]=color
        report['admissible']+=1
        if consensus is None:consensus=g
        elif consensus!=g:report['reason']='AMBIGUOUS_RENDER';return report
    report['complete']=True;report['prediction']=consensus
    report['reason']='CONSENSUS' if consensus is not None else 'NO_ADMISSIBLE_SCENE'
    return report


class JointRankModel:
    def __init__(self,budget=DEFAULT_BUDGET):
        self.budget=budget;self.rules={};self.failures=[];self.training=[]
    def observe(self,before,action,after):
        self.training.append((before,action,after))
        if action['id'] in (0,6):self.failures.append('UNSUPPORTED_ACTION');return
        c=candidates(before,after,self.budget)
        if c['status']!='COMPLETE':self.failures.append(c['status']);return
        k=(e.canonical(action),layout(ordered(before)))
        self.rules[k]=c['vectors'] if k not in self.rules else self.rules[k]&c['vectors']
        if not self.rules[k]:self.failures.append('NO_CONSISTENT_RANK_RULE')
    def predict(self,before,action):
        if action['id'] in (0,6):return {'reason':'UNSUPPORTED_ACTION','prediction':None}
        k=(e.canonical(action),layout(ordered(before)))
        return predict_vectors(before,self.rules.get(k,set()),self.budget)
    def training_gate(self):
        issued=correct=0
        for before,a,after in self.training:
            p=self.predict(before,a)['prediction']
            if p is not None:issued+=1;correct+=p==after
        conflicts=e.training_conflicts(self.training)
        return {'status':e.gate(len(self.training),issued,correct,conflicts),
                'queries':len(self.training),'issued':issued,'correct':correct,'conflicts':conflicts,
                'learning_failures':self.failures,'scope':'full last-render input/target only; not full SDK observation'}
