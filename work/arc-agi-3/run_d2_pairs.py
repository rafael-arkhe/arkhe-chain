"""Post-singleton pair coverage versus immediate target pursuit, local paired pilot."""
import json
from pathlib import Path
from run_d2_active import J2Episode, position
from run_d2_start import STARTS
from run_r3_symmetric import SYMMETRIC
from run_p0_greedy import CheckingWriter
from policy_contract_controls import Policy
from persistent_goal_pilot import public_map, plan
from prospective_policy_step import step
from hidden_mechanics_micro import ACTIONS, advance, render
from micro_evaluation_evidence import Writer, digest


def pair_action(policy, before, seen):
    """Used only at singleton: expected survivors=1; lambda=1 novelty bonus."""
    scores = {a: 1 - int(digest([before, a]) not in seen) for a in ACTIONS}
    minimum = min(scores.values()); choices = [a for a in ACTIONS if scores[a] == minimum]
    count = min(policy.counts[a] for a in choices)
    action = policy.rng.choice([a for a in choices if policy.counts[a] == count])
    policy.counts[action] += 1
    return action


def core(writer, spec):
    writer.append({'event': 'manifest', 'digest': digest(spec)})
    results = []
    for start in spec['starts']:
        for variant in ('P-target', 'P-pairs'):
            env = J2Episode(); env.pos = tuple(start)
            policy = Policy(reset=False, seed=0); policy.mechanics = set(SYMMETRIC.values())
            before = env.observe(); base, _ = public_map(before)
            seen = set(); constraints = []; trace = []; counts = []; first_empty = singleton = arrival = None
            a_visits = []; b_visits = []; a_actions = []; b_actions = []
            emitted = exact = pair_steps = 0; subsequent = stayed = 0
            exploration = 0; disabled = False; failure = None
            episode = f'{variant}-{start[0]}-{start[1]}'
            for i in range(1,51):
                pos = position(before['grid']); route = None; mode = 'A1'
                if pos == (2,3): a_visits.append(i-1)
                if pos == (2,5): b_visits.append(i-1)
                coverage_phase = variant == 'P-pairs' and len(policy.mechanics) == 1 and i <= spec['pair_budget_total_steps']
                if coverage_phase:
                    action = pair_action(policy, before['grid'], seen); mode = 'PAIR_TEST'; pair_steps += 1
                elif len(policy.mechanics) == 1 and not disabled:
                    try:
                        route = plan(base,pos,spec['target'],next(iter(policy.mechanics)))
                    except ValueError:
                        disabled = True; failure = 'UNREACHABLE'
                    if route is not None and len(route) > 51-i:
                        disabled = True; failure = 'PLAN_TOO_LONG'
                    if not disabled:
                        h=next(iter(policy.mechanics)); action=route[0] if route else ACTIONS[h.index((0,0))]
                        policy.counts[action]+=1; mode='PLAN' if route else 'HOLD'
                if not coverage_phase and (len(policy.mechanics)!=1 or disabled):
                    if not disabled and exploration>=spec['exploration_budget']:
                        disabled=True; failure='IDENTIFICATION_BUDGET_EXHAUSTED'
                    action=policy.choose_discriminative(base,pos)
                    mode='EMPTY_FALLBACK' if not policy.mechanics else 'A1'
                    if not disabled: exploration+=1
                key=digest([before['grid'],action]); fresh=key not in seen; seen.add(key)
                if pos==(2,3) and action=='ACTION2': a_actions.append(i)
                if pos==(2,5) and action=='ACTION2': b_actions.append(i)
                prediction=policy.predict(base,pos,action)
                writer.append({'event':'control_decision','episode':episode,'step':i,'mode':mode,
                               'pair_new':fresh,'route':route})
                after,_=step(writer,policy,env,base,before,action,digest(spec['source_digests']),episode)
                compatible={h for h in SYMMETRIC.values()
                            if render(base,advance(base,pos,h[ACTIONS.index(action)]))==after['grid']}
                constraints.append(compatible)
                passive=set.intersection(set(SYMMETRIC.values()),*constraints)
                if passive!=policy.mechanics: raise ValueError('ONLINE_PASSIVE_MISMATCH')
                writer.append({'event':'history_diagnostic','episode':episode,'step':i,
                               'local_candidates':len(compatible),'history_candidates':len(passive),
                               'history_digest':digest(sorted(passive))})
                counts.append(len(passive))
                if first_empty is None and not passive:first_empty=i
                if singleton is None and len(passive)==1:singleton=i
                emitted+=prediction is not None;exact+=prediction is not None and prediction==after['grid']
                trace.append(digest([before['grid'],action,after['grid']]))
                end=position(after['grid']);on_target=base[end[1]][end[0]]==spec['target']
                if arrival is not None:subsequent+=1;stayed+=on_target
                if arrival is None and on_target:arrival=i
                if i==50:
                    if end==(2,3):a_visits.append(i)
                    if end==(2,5):b_visits.append(i)
                before=after
            row={'start':start,'policy':variant,'first_singleton_step':singleton,
                 'first_history_empty_step':first_empty,'remaining':len(policy.mechanics),
                 'visited_A':bool(a_visits),'visited_B':bool(b_visits),
                 'ACTION2_at_A':a_actions,'ACTION2_at_B':b_actions,'unique_pairs':len(seen),
                 'extra_pair_test_actions':pair_steps,'first_arrival':arrival,
                 'stay_ratio':stayed/subsequent if subsequent else None,'terminal_reward':before['reward'],
                 'terminal_marker':base[end[1]][end[0]],'queries':50,'issued':emitted,'exact':exact,
                 'planning_failure':failure,'same_online_passive_all_steps':True,
                 'candidate_counts':counts,'behavior_digest':digest(trace)}
            writer.append({'event':'episode_summary',**row});results.append(row)
    return {'results':results,'episodes':len(results),'actions':50*len(results),
            'final_head':writer.previous,'scope':'Local exploratory paired post-singleton intervention; no universal coverage or J2 identification'}


SOURCES=('run_d2_pairs.py','run_d2_active.py','run_d2_start.py','history_family_diagnostic.py',
         'run_r3_symmetric.py','run_r2_extended.py','run_p0_greedy.py','policy_contract_controls.py',
         'persistent_goal_pilot.py','prospective_policy_step.py','hidden_mechanics_micro.py','micro_evaluation_evidence.py')


def run(out):
    out=Path(out);out.mkdir(exist_ok=False);(out/'sources').mkdir()
    spec={'format':'D2_POST_SINGLETON_PAIRS_V1','starts':list(STARTS),'agent_seed':0,
          'target':4,'reward_goal':3,'exploration_budget':20,'pair_budget_total_steps':20,
          'horizon':50,'lambda':1,'novelty':'raw grid/action absent previously in episode',
          'family_digest':digest(SYMMETRIC),
          'source_digests':{n:digest(Path(__file__).with_name(n).read_text()) for n in SOURCES}}
    (out/'manifest.json').write_text(json.dumps(spec,indent=2))
    for n in SOURCES:(out/'sources'/n).write_bytes(Path(__file__).with_name(n).read_bytes())
    writer=Writer(out/'events.jsonl')
    try:report=core(writer,spec)
    finally:writer.close()
    (out/'report.json').write_text(json.dumps(report,indent=2));return report


def verify(out):
    out=Path(out);spec=json.loads((out/'manifest.json').read_text())
    if spec['family_digest']!=digest(SYMMETRIC):raise ValueError('FAMILY_MISMATCH')
    for n,expected in spec['source_digests'].items():
        if digest(Path(__file__).with_name(n).read_text())!=expected or digest((out/'sources'/n).read_text())!=expected:
            raise ValueError('SOURCE_MISMATCH')
    writer=CheckingWriter(out/'events.jsonl');report=core(writer,spec);writer.finish()
    if report!=json.loads((out/'report.json').read_text()):raise ValueError('REPORT_MISMATCH')
    return {'status':'LOCAL_ACTIVE_AND_PASSIVE_REPLAY_VERIFIED','episodes':6,'actions':300,
            'authentication':'NOT_ESTABLISHED'}


if __name__=='__main__':
    import sys
    if sys.argv[1]=='verify':
        result=verify(sys.argv[2]);(Path(sys.argv[2])/'verification.json').write_text(json.dumps(result,indent=2))
    else:
        report=run(sys.argv[1]);result=[{k:v for k,v in r.items() if k not in ('candidate_counts','behavior_digest')} for r in report['results']]
    print(json.dumps(result,indent=2))
