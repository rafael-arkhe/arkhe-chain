"""One continuous J2 episode, online elimination and passive same-trace check."""
import json
from pathlib import Path
from hidden_mechanics_micro import ACTIONS, advance, render
from history_family_diagnostic import j2_jump_position
from policy_contract_controls import Policy
from persistent_goal_pilot import public_map, plan
from prospective_policy_step import step
from micro_evaluation_evidence import Writer, digest
from run_r2_extended import P2
from run_r3_symmetric import SYMMETRIC
from run_p0_greedy import CheckingWriter


class J2Episode:
    def __init__(self):
        self.base = [[0]*8 for _ in range(8)]; self.base[3][3] = 2
        self.base[0][0] = 3; self.base[7][7] = 4
        self.pos = (1,1); self.steps = 0

    def observe(self):
        return {'grid': render(self.base, self.pos), 'available_actions': list(ACTIONS),
                'step': self.steps, 'done': self.steps == 50,
                'reward': int(self.base[self.pos[1]][self.pos[0]] == 3) if self.steps == 50 else None}

    def step(self, action):
        if self.steps >= 50 or action not in ACTIONS:
            raise ValueError('INVALID_STEP')
        self.pos = (j2_jump_position(self.base, self.pos, (2,0)) if action == 'ACTION2'
                    else advance(self.base, self.pos, P2[ACTIONS.index(action)]))
        self.steps += 1
        return self.observe()


def position(grid):
    return next((x,y) for y,row in enumerate(grid) for x,c in enumerate(row) if c in (1,5))


def core(writer, manifest):
    writer.append({'event': 'manifest', 'digest': digest(manifest)})
    env = J2Episode(); before = env.observe(); base, _ = public_map(before)
    learner = Policy(reset=False, seed=manifest['agent_seed']); learner.mechanics = set(SYMMETRIC.values())
    trace = []; local_sets = []; metrics = []
    exploration = 0; disabled = False; failure = None; arrival = None; stayed = subsequent = 0
    first_empty = first_singleton = None; c1 = []; c2 = []; issued = exact = 0
    for i in range(1,51):
        pos = position(before['grid']); mode = 'A1'; route = None
        if len(learner.mechanics) == 1 and not disabled:
            try:
                route = plan(base, pos, manifest['target'], next(iter(learner.mechanics)))
            except ValueError:
                failure = 'UNREACHABLE'; disabled = True
            if route is not None and len(route) > 51-i:
                failure = 'PLAN_TOO_LONG'; disabled = True
            if not disabled:
                h = next(iter(learner.mechanics))
                action = route[0] if route else ACTIONS[h.index((0,0))]
                learner.counts[action] += 1; mode = 'PLAN' if route else 'HOLD'
        if len(learner.mechanics) != 1 or disabled:
            if not disabled and exploration >= manifest['exploration_budget']:
                disabled = True; failure = 'IDENTIFICATION_BUDGET_EXHAUSTED'
            action = learner.choose_discriminative(base, pos)
            if not learner.mechanics:
                mode = 'EMPTY_FALLBACK'
            if not disabled:
                exploration += 1
        prediction = learner.predict(base, pos, action)
        writer.append({'event': 'control_decision', 'step': i, 'mode': mode, 'route': route,
                       'planning_disabled': disabled})
        if action == 'ACTION2' and pos == (2,3): c1.append(i)
        if action == 'ACTION2' and pos == (2,5): c2.append(i)
        after, update = step(writer, learner, env, base, before, action,
                             digest(manifest['source_digests']), 'D2-seed0')
        trace.append({'before': before['grid'], 'action': action, 'after': after['grid'],
                      'online_remaining_digest': digest(sorted(learner.mechanics))})
        # Reference constraint construction does not call Policy.observe.
        compatible = {h for h in SYMMETRIC.values()
                      if render(base, advance(base, pos, h[ACTIONS.index(action)])) == after['grid']}
        local_sets.append(compatible)
        passive = set.intersection(set(SYMMETRIC.values()), *local_sets)
        same = passive == learner.mechanics
        if not same:
            raise ValueError(f'ONLINE_PASSIVE_MISMATCH_{i}')
        row = {'step': i, 'local_candidates': len(compatible), 'history_candidates': len(passive),
               'online_passive_same_set': same, 'history_digest': digest(sorted(passive))}
        metrics.append(row); writer.append({'event': 'history_diagnostic', **row})
        if first_empty is None and not passive: first_empty = i
        if first_singleton is None and len(passive) == 1: first_singleton = i
        emitted = prediction is not None; issued += emitted
        exact += emitted and prediction == after['grid']
        end = position(after['grid']); on_target = base[end[1]][end[0]] == manifest['target']
        if arrival is not None:
            subsequent += 1; stayed += on_target
        if arrival is None and on_target: arrival = i
        before = after
    # Batch replay from recorded frames, not only agreement during live updates.
    batch = set(SYMMETRIC.values())
    for i, transition in enumerate(trace):
        pos = position(transition['before']); action = transition['action']; after = transition['after']
        batch = {h for h in batch if render(base, advance(base, pos, h[ACTIONS.index(action)])) == after}
        if digest(sorted(batch)) != transition['online_remaining_digest']:
            raise ValueError('BATCH_REPLAY_MISMATCH')
    return {'criteria': {'C1_ACTION2_at_A_steps': c1, 'C2_ACTION2_at_B_steps': c2,
        'C3_history_incompatible': first_empty is not None, 'first_history_empty_step': first_empty,
        'C4_same_sets_all_50_steps': True, 'C5_first_arrival': arrival,
        'C6_post_arrival_stay_ratio': stayed/subsequent if subsequent else None,
        'C7_terminal_reward': before['reward']}, 'queries': 50, 'issued': issued, 'exact': exact,
        'remaining_candidates': len(learner.mechanics), 'first_singleton_step': first_singleton,
        'planning_failure': failure, 'diagnostics': metrics, 'final_head': writer.previous,
        'scope': 'One local seed, fixed J2 episode, no J2 identification or coverage guarantee'}


def run(out):
    out = Path(out); out.mkdir(exist_ok=False); (out/'sources').mkdir()
    names = ('run_d2_active.py', 'history_family_diagnostic.py', 'run_r3_symmetric.py',
             'run_r2_extended.py', 'run_p0_greedy.py', 'hidden_mechanics_micro.py',
             'policy_contract_controls.py', 'persistent_goal_pilot.py',
             'prospective_policy_step.py', 'micro_evaluation_evidence.py')
    manifest = {'format': 'D2_ACTIVE_J2_V1', 'family_digest': digest(SYMMETRIC),
        'agent_seed': 0, 'environment': 'deterministic, wall(3,3), markers3(0,0),4(7,7), start(1,1)',
        'dynamics': 'P2 unitary except ACTION2 right jump2 requires intermediate and destination free',
        'actions': list(ACTIONS), 'horizon': 50, 'exploration_budget': 20, 'target': 4,
        'memory': 'No reset/reopening; history conjunction over this fixed episode',
        'source_digests': {n: digest(Path(__file__).with_name(n).read_text()) for n in names}}
    (out/'manifest.json').write_text(json.dumps(manifest, indent=2))
    for name in names:
        (out/'sources'/name).write_bytes(Path(__file__).with_name(name).read_bytes())
    writer = Writer(out/'events.jsonl')
    try:
        report = core(writer, manifest)
    finally:
        writer.close()
    (out/'report.json').write_text(json.dumps(report, indent=2))
    return report


def verify(out):
    out = Path(out); manifest = json.loads((out/'manifest.json').read_text())
    if manifest['family_digest'] != digest(SYMMETRIC): raise ValueError('FAMILY_MISMATCH')
    for name, expected in manifest['source_digests'].items():
        if digest(Path(__file__).with_name(name).read_text()) != expected or digest((out/'sources'/name).read_text()) != expected:
            raise ValueError('SOURCE_MISMATCH')
    writer = CheckingWriter(out/'events.jsonl'); report = core(writer, manifest); writer.finish()
    if report != json.loads((out/'report.json').read_text()): raise ValueError('REPORT_MISMATCH')
    return {'status': 'LOCAL_ACTIVE_AND_PASSIVE_REPLAY_VERIFIED', 'actions': 50,
            'same_sets_at_every_step': True, 'authentication': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2]); (Path(sys.argv[2])/'verification.json').write_text(json.dumps(result, indent=2))
    else:
        result = run(sys.argv[1]); result = {k:v for k,v in result.items() if k!='diagnostics'}
    print(json.dumps(result, indent=2))
