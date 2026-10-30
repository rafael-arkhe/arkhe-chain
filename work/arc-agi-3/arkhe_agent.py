"""Observation-only frontier explorer. Native development gate is optional/explicit.

No game-specific IDs, hidden engine access, model provider or pre-solved routes.
This is a first experimental policy, not a demonstrated general solver.
"""
from __future__ import annotations
from collections import Counter, deque
import hashlib
import gzip
import json
import os
from pathlib import Path
import random
import subprocess
import time
from arcengine import GameAction, GameState
from agents.agent import Agent


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def snapshot(frame):
    return {"frame":frame.frame,"state":frame.state.name,
            "levels_completed":frame.levels_completed,
            "available_actions":list(frame.available_actions)}


def state_key(frame):
    # guid/action_input are transport history, not perceptual state.
    return hashlib.sha256(canonical(snapshot(frame)).encode()).hexdigest()


def candidates(frame):
    legal = sorted({int(a) for a in frame.available_actions if 1 <= int(a) <= 7})
    result = [(a, None, None) for a in legal if a != 6]
    if 6 in legal:
        # Palette connected components identify click targets from pixels only.
        grid = frame.frame[-1] if frame.frame else []
        height=len(grid); width=len(grid[0]) if height else 0
        seen=set(); regions=[]
        for y in range(height):
            for x in range(width):
                if (x,y) in seen: continue
                color=grid[y][x]; todo=[(x,y)]; seen.add((x,y)); cells=[]
                while todo:
                    cx,cy=todo.pop();cells.append((cx,cy))
                    for nx,ny in ((cx+1,cy),(cx-1,cy),(cx,cy+1),(cx,cy-1)):
                        if 0<=nx<width and 0<=ny<height and (nx,ny) not in seen and grid[ny][nx]==color:
                            seen.add((nx,ny));todo.append((nx,ny))
                if len(cells)<=max(1,width*height//3):
                    # Select an actual component pixel nearest its centroid.
                    mx=sum(c[0] for c in cells)/len(cells);my=sum(c[1] for c in cells)/len(cells)
                    center=min(cells,key=lambda c:((c[0]-mx)**2+(c[1]-my)**2,c))
                    regions.append((len(cells),center))
        points=[c for _,c in sorted(regions)[:48]]
        points += [(x,y) for y in (8,24,40,56) for x in (8,24,40,56)]
        result += [(6,x,y) for x,y in sorted(set(points)) if x<64 and y<64]
    return result


class StateGraph:
    """Predict only observed, non-contradictory exact transitions."""
    def __init__(self):
        self.edges={};self.unstable=set()

    def predict(self,source,action):
        return self.edges.get((source,action))

    def observe(self,source,action,target):
        edge=(source,action)
        if edge in self.edges and self.edges[edge]!=target:
            self.unstable.add(edge);self.edges.pop(edge,None)
        elif edge not in self.unstable:self.edges[edge]=target


class TransitionRecorder:
    """Passive event counters, not policy or authorization authority.

    All dispatches count toward cost; RESET is excluded from exploration ratios.
    Repeated outcomes are not labelled stuck or productive without more evidence.
    """
    def __init__(self):
        self.dispatches=0;self.decisions=0;self.resets=0;self.pairs=Counter();self.triples=Counter()
        self.sources=set();self.repeats=0;self.same_outcome_repeats=0
        self.predictions=0;self.errors=0;self.initial_levels=None;self.final_levels=None
        self.predicted_pairs=set()

    def record(self,source,action,target,prediction,levels_before,levels_after):
        self.dispatches+=1
        if self.initial_levels is None:self.initial_levels=levels_before
        self.final_levels=levels_after
        if action[0]==0:
            self.resets+=1;return
        self.decisions+=1;pair=(source,action);triple=(pair,target)
        self.repeats+=int(self.pairs[pair]>0)
        self.same_outcome_repeats+=int(self.triples[triple]>0)
        self.pairs[pair]+=1;self.triples[triple]+=1;self.sources.add(source)
        if prediction is not None:
            self.predictions+=1;self.errors+=int(prediction!=target);self.predicted_pairs.add(pair)

    def metrics(self):
        n=self.decisions
        return {'dispatches':self.dispatches,'non_reset_actions':n,'reset_actions':self.resets,
                'repeat_ratio':self.repeats/n if n else None,
                'same_outcome_repeat_ratio':self.same_outcome_repeats/n if n else None,
                'stuck_repeat_ratio':None,'stuck_classification':'NOT_IDENTIFIED',
                'state_coverage_source_ratio':len(self.sources)/n if n else None,
                'transition_novelty_pair_ratio':len(self.pairs)/n if n else None,
                'prediction_count':self.predictions,'prediction_error_count':self.errors,
                'prediction_coverage':self.predictions/n if n else None,
                'prediction_coverage_legacy_definition':'event frequency; retained for historical compatibility',
                'prediction_frequency':self.predictions/n if n else None,
                'visited_pair_prediction_coverage':len(self.predicted_pairs)/len(self.pairs) if self.pairs else None,
                'full_state_action_space_coverage':None,
                'model_prediction_error':self.errors/self.predictions if self.predictions else None,
                'levels_per_100_actions':100*(self.final_levels-self.initial_levels)/self.dispatches if self.dispatches else None,
                'generalization':'NOT_ESTABLISHED_EXACT_LOOKUP_MODEL'}


class ExplorationPolicy:
    """Choose actions using the graph; never call the gate or environment."""
    def __init__(self, seed=0, mode="frontier"):
        self.rng=random.Random(seed);self.mode=mode
        self.model=StateGraph()
        self.tried=Counter();self.edges=self.model.edges;self.unstable=self.model.unstable
        self.options={};self.visits=Counter()

    def observe(self, source, action, target):
        edge=(source,action); self.tried[edge]+=1;self.visits[target]+=1
        self.model.observe(source,action,target)

    def choose(self, key, options):
        if not options: raise RuntimeError("No legal actions advertised")
        self.options[key]=tuple(options)
        if self.mode=="random": return self.rng.choice(options)
        untried=[a for a in options if not self.tried[key,a]]
        if untried: return self.rng.choice(untried)
        # Route through observed transitions to a state with untried actions.
        queue=deque([(key,None)]);seen={key}
        while queue and len(seen)<=4096:
            node,first=queue.popleft()
            if node!=key and any(not self.tried[node,a] for a in self.options.get(node,())):
                return first
            for action in self.options.get(node,()):
                target=self.edges.get((node,action))
                if target and target not in seen:
                    seen.add(target);queue.append((target,action if first is None else first))
        ranks={a:(self.tried[key,a],self.visits[self.edges.get((key,a),key)]) for a in options}
        best=min(ranks.values());return self.rng.choice([a for a in options if ranks[a]==best])


# Compatibility for historical local imports/tests; the role is explicitly policy.
Explorer=ExplorationPolicy


class MyAgent(Agent):
    MAX_ACTIONS=160

    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        self.action_counter=0;self.dispatched=0
        self.explorer=Explorer(int(os.getenv("ARKHE_ARC_SEED","0")),os.getenv("ARKHE_ARC_POLICY","frontier"))
        self.transition_recorder=TransitionRecorder()
        self.bridge=os.getenv("ARKHE_ARC_GATE_EXE")
        self.trace_path=os.getenv("ARKHE_ARC_TRACE")
        self.manifest={"profile":"arc-observation-explorer-v2-recorder","metric_schema":"prediction-frequency-and-visited-pair-coverage-v1",
                       "seed":os.getenv("ARKHE_ARC_SEED","0"),
                       "policy":self.explorer.mode,"max_actions":self.MAX_ACTIONS,
                       "agent_sha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                       "bridge_sha256":hashlib.sha256(Path(self.bridge).read_bytes()).hexdigest() if self.bridge else None}
        self.previous_hash="0"*64

    def is_done(self,frames,latest_frame):
        return latest_frame.state is GameState.WIN or self.dispatched>=self.MAX_ACTIONS

    def choose_action(self,frames,latest_frame):
        self.current=latest_frame
        if latest_frame.state in (GameState.NOT_PLAYED,GameState.GAME_OVER):
            self.selected=(0,None,None)
        else:
            self.selected=self.explorer.choose(state_key(latest_frame),candidates(latest_frame))
        a,x,y=self.selected;action=GameAction['RESET' if a==0 else f'ACTION{a}']
        if a==6: action.set_data({"x":x,"y":y})
        action.reasoning={"policy":self.explorer.mode,"native_gate":"ENABLED" if self.bridge else "NOT_INTEGRATED"}
        return action

    def native(self,payload):
        result=subprocess.run([self.bridge],input=canonical(payload),text=True,capture_output=True,timeout=15)
        if result.returncode: raise RuntimeError("Native ARC gate process failed: "+result.stderr[:400])
        value=json.loads(result.stdout)
        if value.get("gate")!="ALLOW": raise RuntimeError("Native ARC gate rejected action")
        return value

    def persist_frame(self,value):
        raw=canonical(value).encode();digest=hashlib.sha256(raw).hexdigest()
        if self.trace_path:
            directory=Path(self.trace_path).parent/'frames';directory.mkdir(parents=True,exist_ok=True)
            path=directory/(digest+'.json.gz')
            if not path.exists():path.write_bytes(gzip.compress(raw,mtime=0))
        return {'sha256':digest,'relative_path':'frames/'+digest+'.json.gz',
                'encoding':'gzip-canonical-json-utf8'}

    def take_action(self,action):
        if self.dispatched>=self.MAX_ACTIONS: raise RuntimeError("Action budget exhausted before dispatch")
        a,x,y=self.selected
        before=snapshot(self.current);source=state_key(self.current)
        prediction=self.explorer.model.predict(source,self.selected) if a else None
        # Persist the proposed experiment before dispatch. Native preflight binds it.
        prediction_event={'predicted_next':prediction,'model':'exact-observed-state-graph',
                          'created_before_dispatch':True,'sequence':self.dispatched+1}
        pre_observation={**before,'prediction':prediction_event}
        before_ref=self.persist_frame(before)
        payload={"run_id":f"{self.game_id}:{self.dispatched}:{hashlib.sha256(canonical(self.manifest).encode()).hexdigest()}",
                 "phase":"preflight","observation":pre_observation,"action":{"id":a},
                 "emergency_stop":os.getenv('ARKHE_ARC_EMERGENCY_STOP','0')=='1'}
        if a==6: payload["action"].update(x=x,y=y)
        try:
            pre=self.native(payload) if self.bridge else None
        except Exception:
            if self.trace_path:
                with open(str(self.trace_path)+'.operational','a',encoding='utf-8') as f:
                    f.write(canonical({'event':'PREFLIGHT_FAILED_NO_DISPATCH',
                                       'step_proposed':self.dispatched+1,'game_id':self.game_id})+'\n')
            raise
        if self.trace_path:
            proposal={'event':'before_dispatch','step':self.dispatched+1,'game_id':self.game_id,
                      'action':payload['action'],'before':source,'before_frame':before_ref,
                      'prediction':prediction_event,'native_preflight':pre,
                      'manifest':self.manifest,'recorded_at_unix_ns':time.time_ns()}
            with open(str(self.trace_path)+'.proposals','a',encoding='utf-8') as f:
                f.write(canonical(proposal)+'\n')
        self.dispatched+=1
        # A transport exception is fatal; its dispatch still consumes the budget.
        outcome=super().take_action(action)
        if outcome is None: raise RuntimeError("Environment returned no outcome")
        after=snapshot(outcome);after_ref=self.persist_frame(after)
        post=self.native({**payload,"phase":"record","outcome":after}) if self.bridge else None
        if pre and pre["intent_digest"]!=post["intent_digest"]:
            raise RuntimeError("Native intent changed between preflight and record")
        target=state_key(outcome)
        self.transition_recorder.record(source,self.selected,target,prediction,
                                        self.current.levels_completed,outcome.levels_completed)
        # Reset/death transitions are not planned as reversible navigation edges.
        if a and outcome.state is not GameState.GAME_OVER:
            self.explorer.observe(source,self.selected,target)
        else:
            self.explorer.tried[source,self.selected]+=1
        record={"game_id":self.game_id,"step":self.dispatched,"before":source,"after":target,
                "action":payload["action"],"state":outcome.state.name,"levels_completed":outcome.levels_completed,
                "native_preflight":pre,"native_record":post,"manifest":self.manifest,
                "before_frame":before_ref,"after_frame":after_ref,"prediction":prediction_event,
                "prediction_correct":prediction==target if prediction is not None else None,
                "previous_hash":self.previous_hash,"trace_trust":"UNSIGNED_HOST_HASH_CHAIN"}
        self.previous_hash=hashlib.sha256(canonical(record).encode()).hexdigest();record["record_hash"]=self.previous_hash
        if self.trace_path:
            with open(self.trace_path,"a",encoding="utf-8") as f:f.write(canonical(record)+"\n")
        return outcome
