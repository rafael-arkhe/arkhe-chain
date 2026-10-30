"""Restricted control-profile search with optional exact-size inhabitation.
Changes the grammar profile; does not claim completeness in the original DSL.
"""
from collections import Counter
import hashlib
import json
from finite_grid_dsl_search import allocations,ROOT,replay,GenerationLimit
import finite_grid_dsl_types as d

PROFILE_CONTROLS=('action_kind','eq_kind','grid_set','coord','action_click_x','action_click_y',
                  'is_blocked','translate','grid_objects','state_get','state_set','add')
SPECIAL=('pair','if','list_head','is_some','option_default','match_option')
OPTIONS=(('Option',d.O),('Option',d.D))

class AnalysisLimit(Exception):pass


class ControlGenerator:
    def __init__(self,analysis=True,max_expansions=20000,max_analysis_states=100000,uses_memory=False):
        self.analysis=analysis;self.max_expansions=max_expansions;self.max_analysis_states=max_analysis_states
        self.uses_memory=uses_memory;self.expansions=0;self.cache={};self.analysis_states=0;self.pruned=0;self.cache_hits=0
    def productions(self,target):
        for op in sorted(PROFILE_CONTROLS):
            args,result=d.REGISTRY[op]
            if result==target and (op!='state_set' or self.uses_memory):yield op,args
        if target==ROOT:yield 'pair',(d.G,d.S)
        yield 'if',(d.B,target,target)
        if target==('Option',d.O):yield 'list_head',(('List',d.O,4096),)
        for ot in OPTIONS:
            if target==d.B:yield 'is_some',(ot,)
            if target==ot[1]:yield 'option_default',(ot,target)
    def inhabits(self,target,size,available):
        available=frozenset(available);key=(target,size,available)
        if key in self.cache:self.cache_hits+=1;return self.cache[key]
        if self.analysis_states>=self.max_analysis_states:raise AnalysisLimit()
        self.analysis_states+=1
        answer=False
        if size==1:answer=target in available or target in d.LITERALS
        elif size>1:
            for op,types in self.productions(target):
                for sizes in allocations(size-1,len(types)):
                    if all(self.inhabits(t,n,available) for t,n in zip(types,sizes)):
                        answer=True;break
                if answer:break
            if not answer:
                for ot in OPTIONS:
                    for sizes in allocations(size-2,3):
                        if (self.inhabits(ot,sizes[0],available) and self.inhabits(target,sizes[1],available)
                            and self.inhabits(target,sizes[2],available|{ot[1]})):
                            answer=True;break
                    if answer:break
        self.cache[key]=answer;return answer
    def expressions(self,target,size,env,depth=0):
        if self.expansions>=self.max_expansions:raise GenerationLimit()
        self.expansions+=1
        if size<1:return
        if self.analysis and not self.inhabits(target,size,(t for _,t in env)):
            self.pruned+=1;return
        if size==1:
            for name,t in env:
                if t==target:yield d.var(name)
            if target in d.LITERALS:
                for value in sorted(d.LITERALS[target],key=lambda v:json.dumps(v)):yield d.lit(target,value)
            return
        for op,types in self.productions(target):
            for sizes in allocations(size-1,len(types)):
                # Avoid generating a productive left subtree repeatedly if a
                # later argument is statically impossible at that exact size.
                if self.analysis and not all(self.inhabits(t,n,(t for _,t in env)) for t,n in zip(types,sizes)):
                    self.pruned+=1;continue
                yield from self.combine(op,types,sizes,env,depth)
        bound='b'+str(depth)
        for ot in OPTIONS:
            for sizes in allocations(size-2,3):
                inner=env+((bound,ot[1]),)
                if self.analysis and not (self.inhabits(ot,sizes[0],(t for _,t in env)) and
                    self.inhabits(target,sizes[1],(t for _,t in env)) and self.inhabits(target,sizes[2],(t for _,t in inner))):
                    self.pruned+=1;continue
                for option in self.expressions(ot,sizes[0],env,depth):
                    for fallback in self.expressions(target,sizes[1],env,depth):
                        for body in self.expressions(target,sizes[2],inner,depth+1):
                            yield d.node('match_option',option,fallback,d.node('lambda',body,params=[bound]))
    def combine(self,op,types,sizes,env,depth,args=()):
        if not types:yield d.node(op,*args);return
        for x in self.expressions(types[0],sizes[0],env,depth):
            yield from self.combine(op,types[1:],sizes[1:],env,depth,args+(x,))


def search(episodes,analysis=True,max_nodes=24,max_expansions=20000,max_analysis_states=100000,max_candidates=1000000,uses_memory=False):
    if not 1<=max_nodes<=24 or min(max_expansions,max_analysis_states,max_candidates)<1:raise ValueError('invalid budget')
    g=ControlGenerator(analysis,max_expansions,max_analysis_states,uses_memory);env=(('g',d.G),('a',d.A),('s',d.S))
    n=0;by_size=Counter();passed=[];reasons=Counter();last=None;complete_size=0;started=0;status='COMPLETE'
    try:
        for size in range(1,max_nodes+1):
            started=size
            for ast in g.expressions(ROOT,size,env):
                if n>=max_candidates:status='SEARCH_INCOMPLETE_CANDIDATES';raise StopIteration()
                d.check_program(ast,uses_memory);assert d.count(ast)==size
                n+=1;by_size[size]+=1
                last=hashlib.sha256(json.dumps(ast,sort_keys=True,separators=(',',':')).encode()).hexdigest()
                score=replay(ast,episodes,uses_memory);reasons[score['reason']]+=1
                if score['pass']:passed.append({'ast':ast,'sha256':last,'nodes':size,'replay':score})
            complete_size=size
    except GenerationLimit:status='SEARCH_INCOMPLETE_GENERATION'
    except AnalysisLimit:status='SEARCH_INCOMPLETE_ANALYSIS'
    except StopIteration:pass
    return {'search_status':status,'profile':'PROFILE_CONTROLS','monomorphic_ops':PROFILE_CONTROLS,'special_forms':SPECIAL,
            'inhabitation_enabled':analysis,'generation_calls':g.expansions,'analysis_states':g.analysis_states,'analysis_cache_hits':g.cache_hits,'structurally_pruned':g.pruned,
            'well_typed_candidates':n,'well_typed_by_size':dict(by_size),'max_size_fully_explored':complete_size,'size_started':started,
            'replay_reasons':dict(reasons),'replay_passed':passed,'last_candidate_sha256':last,'holdout_evaluated':False,
            'budget':{'max_nodes':max_nodes,'max_generation_calls':max_expansions,'max_analysis_states':max_analysis_states,'max_candidates':max_candidates,'fuel_per_call':10000},
            'new_environment_actions':0}
