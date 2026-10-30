"""Bounded deterministic typed synthesis in a declared finite type profile.
No observational pruning; not the full polymorphic DSL type universe.
"""
from itertools import product
from collections import Counter
import hashlib
import json
import finite_grid_dsl_types as d
import finite_grid_dsl_runtime as runtime

ROOT=('Pair',d.G,d.S)
TYPES=(d.G,d.S,d.O,d.A,d.C,d.D,d.K,d.B,d.N,d.P,d.AK,
       ('List',d.O,4096),('List',d.C,8),('Option',d.O),('Option',d.C),('Option',d.D),ROOT)

class GenerationLimit(Exception):pass


def allocations(total,n):
    if n==0:
        if total==0:yield ()
    elif n==1:
        if total>=1:yield (total,)
    else:
        for first in range(1,total-n+2):
            for tail in allocations(total-first,n-1):yield (first,)+tail


class Generator:
    def __init__(self,max_expansions,uses_memory=False):self.expansions=0;self.max_expansions=max_expansions;self.uses_memory=uses_memory
    def expand(self):
        if self.expansions>=self.max_expansions:raise GenerationLimit()
        self.expansions+=1
    def expressions(self,target,size,env,depth=0):
        self.expand()
        if size<1:return
        if size==1:
            for name,t in env:
                if t==target:yield d.var(name)
            if target in d.LITERALS:
                for value in sorted(d.LITERALS[target],key=lambda v:json.dumps(v)):
                    yield d.lit(target,value)
            return
        # Fixed production order, structural equality only; no semantic merging.
        productions=[]
        for op,(args,result) in sorted(d.REGISTRY.items()):
            if result==target and (op!='state_set' or self.uses_memory):productions.append((op,args))
        if target==ROOT:productions.append(('pair',(d.G,d.S)))
        productions.append(('if',(d.B,target,target)))
        if target==d.N:
            for t in (('List',d.O,4096),('List',d.C,8)):productions.append(('list_len',(t,)))
        for element,lst in [(d.O,('List',d.O,4096)),(d.C,('List',d.C,8))]:
            if target==('Option',element):productions.append(('list_head',(lst,)))
        for option in [('Option',d.O),('Option',d.C),('Option',d.D)]:
            if target==d.B:productions.append(('is_some',(option,)))
            if target==option[1]:productions.append(('option_default',(option,target)))
        for op,types in productions:
            for sizes in allocations(size-1,len(types)):
                yield from self.combine(op,types,sizes,env,depth)
        # Canonical finite names are alpha-normalized by lexical binder depth.
        # All binders are represented by this fixed naming discipline, not
        # arbitrary strings; evaluator/typechecker retain their existing format.
        bound='b'+str(depth)
        for bt in TYPES:
            for sizes in allocations(size-1,2):
                for value in self.expressions(bt,sizes[0],env,depth):
                    for body in self.expressions(target,sizes[1],env+((bound,bt),),depth+1):
                        yield d.node('let',value,body,name=bound)
        for ot in [('Option',d.O),('Option',d.C),('Option',d.D)]:
            for sizes in allocations(size-2,3): # lambda costs one node
                for option in self.expressions(ot,sizes[0],env,depth):
                    for fallback in self.expressions(target,sizes[1],env,depth):
                        for body in self.expressions(target,sizes[2],env+((bound,ot[1]),),depth+1):
                            yield d.node('match_option',option,fallback,d.node('lambda',body,params=[bound]))
        for elem,lst in [(d.O,('List',d.O,4096)),(d.C,('List',d.C,8))]:
            for sizes in allocations(size-2,3):
                for seq in self.expressions(lst,sizes[0],env,depth):
                    for initial in self.expressions(target,sizes[1],env,depth):
                        inner=env+((bound,target),('b'+str(depth+1),elem))
                        for body in self.expressions(target,sizes[2],inner,depth+2):
                            yield d.node('fold',seq,initial,d.node('lambda',body,params=[bound,'b'+str(depth+1)]))
    def combine(self,op,types,sizes,env,depth,args=()):
        if not types:
            yield d.node(op,*args);return
        for expr in self.expressions(types[0],sizes[0],env,depth):
            yield from self.combine(op,types[1:],sizes[1:],env,depth,args+(expr,))


def replay(ast,episodes,uses_memory=False):
    queries=issued=correct=0;fuel=0;reason=None
    for episode in episodes:
        state={}
        for before,action,target in episode:
            queries+=1
            try:
                result=runtime.execute(ast,before,action,state,uses_memory)
            except runtime.StepLimitExceeded:
                return {'pass':False,'queries_examined':queries,'reason':'STEP_LIMIT_EXCEEDED','issued':issued,'correct':correct,'fuel_used':fuel}
            fuel+=result['steps'];issued+=1
            if result['grid']!=target:reason='REPLAY_MISMATCH';break
            correct+=1;state=result['state']
        if reason:break
    return {'pass':bool(queries) and reason is None,'queries_examined':queries,'reason':reason or ('REPLAY_PASS' if queries else 'NO_QUERIES'),'issued':issued,'correct':correct,'fuel_used':fuel}


def search(episodes,max_nodes=24,max_candidates=1000000,max_expansions=20000,max_passed=10000,uses_memory=False):
    if not 1<=max_nodes<=d.MAX_NODES or min(max_candidates,max_expansions,max_passed)<1:raise ValueError('invalid budget')
    gen=Generator(max_expansions,uses_memory);env=(('g',d.G),('a',d.A),('s',d.S));hist=Counter();passed=[];reasons=Counter();candidate_count=0;full_size=0;last_hash=None
    status='COMPLETE';started=0
    try:
        for size in range(1,max_nodes+1):
            started=size
            for ast in gen.expressions(ROOT,size,env):
                if candidate_count>=max_candidates:status='SEARCH_INCOMPLETE_CANDIDATES';raise StopIteration()
                d.check_program(ast,uses_memory)
                assert d.count(ast)==size
                candidate_count+=1;hist[size]+=1
                encoded=json.dumps(ast,sort_keys=True,separators=(',',':'));last_hash=hashlib.sha256(encoded.encode()).hexdigest()
                score=replay(ast,episodes,uses_memory);reasons[score['reason']]+=1
                if score['pass']:
                    passed.append({'ast':ast,'sha256':last_hash,'nodes':size,'replay':score})
                    if len(passed)>=max_passed:status='SEARCH_INCOMPLETE_REPLAY_LIMIT';raise StopIteration()
            full_size=size
    except GenerationLimit:status='SEARCH_INCOMPLETE_GENERATION'
    except StopIteration:pass
    return {'search_status':status,'profile':'finite TYPES listed in source; Pair only Grid/State; lambda only fold/match; canonical binder names',
            'budget':{'max_nodes':max_nodes,'max_candidates':max_candidates,'max_generator_calls':max_expansions,'max_replay_passed':max_passed,'fuel_per_step':10000},
            'generation_calls':gen.expansions,'well_typed_candidates':candidate_count,'well_typed_by_size':dict(hist),
            'max_size_fully_explored':full_size,'size_started':started,'last_candidate_sha256':last_hash,
            'replay_reasons':dict(reasons),'replay_passed':passed,'holdout_evaluated':False,
            'ratification':'NOT_EVALUATED','new_environment_actions':0}
