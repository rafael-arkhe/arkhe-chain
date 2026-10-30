"""Paired public-game evaluation with equal exact budgets; no upload."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

ROOT=Path(__file__).resolve().parent
FRAMEWORK=ROOT/'reference/starter/vendor/ARC-AGI-3-Agents'
sys.path.insert(0,str(FRAMEWORK))
from arc_agi import Arcade, OperationMode
from arkhe_agent import MyAgent


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output-dir',type=Path,required=True)
    p.add_argument('--games',default='ls20,vc33')
    p.add_argument('--steps',type=int,default=80)
    p.add_argument('--seed',type=int,default=0)
    p.add_argument('--bridge-exe',type=Path,required=True)
    p.add_argument('--profiles',default='random,frontier,frontier-native')
    args=p.parse_args()
    if args.steps<=0:p.error('steps must be positive')
    profiles=args.profiles.split(',')
    if len(set(profiles))!=len(profiles) or any(v not in ('random','frontier','frontier-native') for v in profiles):
        p.error('profiles must be distinct random/frontier/frontier-native')
    bridge=args.bridge_exe.resolve(strict=True)
    out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=False)
    report={'phase':'public_development_paired_smoke','seed':args.seed,'max_actions':args.steps,
            'agent_sha256':hashlib.sha256((ROOT/'arkhe_agent.py').read_bytes()).hexdigest(),
            'bridge_sha256':hashlib.sha256(bridge.read_bytes()).hexdigest(),
            'native_policy':'DEV_UNPROTECTED','native_wer':'UNSIGNED',
            'wormgraph':'IN_MEMORY_READBACK_ONLY','capability_demonstrated':False,'runs':[]}
    for profile in profiles:
        # Separate SDK instance and new agent per game/profile: no shared learned state.
        arc=Arcade(operation_mode=OperationMode.NORMAL)
        for game in args.games.split(','):
            row={'profile':profile,'game_id':game,'status':'FAILED'};started=time.monotonic()
            trace=out/f'{profile}-{game}.jsonl'
            os.environ['ARKHE_ARC_POLICY']='random' if profile=='random' else 'frontier'
            os.environ['ARKHE_ARC_SEED']=str(args.seed)
            os.environ['ARKHE_ARC_TRACE']=str(trace)
            os.environ.pop('ARKHE_ARC_GATE_EXE',None)
            if profile.endswith('-native'):os.environ['ARKHE_ARC_GATE_EXE']=str(bridge)
            try:
                env=arc.make(game)
                if env is None:raise RuntimeError('environment unavailable')
                MyAgent.MAX_ACTIONS=args.steps
                agent=MyAgent(card_id='local-dev',game_id=game,agent_name='arkhe-eval',
                              ROOT_URL='http://localhost',record=False,arc_env=env)
                agent.main()
                final=agent.frames[-1]
                row.update(status='COMPLETED',actions=agent.dispatched,levels_completed=final.levels_completed,
                           state=final.state.name,observed_states=len(agent.explorer.options),
                           observed_edges=len(agent.explorer.edges),trace=trace.name,
                           transition_metrics=agent.transition_recorder.metrics())
                if agent.dispatched>args.steps:raise AssertionError('budget overshoot')
            except Exception as e:row.update(error=type(e).__name__+': '+str(e))
            row['elapsed_seconds']=time.monotonic()-started;report['runs'].append(row)
            (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print(json.dumps(row),flush=True)
    matches=[]
    for game in args.games.split(',') if all(v in profiles for v in ('frontier','frontier-native')) else []:
        paths=[out/f'{profile}-{game}.jsonl' for profile in ('frontier','frontier-native')]
        trajectories=[]
        for path in paths:
            trajectories.append([(r['before'],r['action'],r['after']) for r in
                                 (json.loads(l) for l in path.read_text().splitlines())] if path.exists() else [])
        matches.append({'game_id':game,'native_observer_same_trajectory':bool(trajectories[0]) and trajectories[0]==trajectories[1]})
    report['paired_observer_check']=matches
    report['all_runs_completed']=all(r['status']=='COMPLETED' for r in report['runs'])
    (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return 0 if report['all_runs_completed'] and all(m['native_observer_same_trajectory'] for m in matches) else 2

if __name__=='__main__':raise SystemExit(main())
