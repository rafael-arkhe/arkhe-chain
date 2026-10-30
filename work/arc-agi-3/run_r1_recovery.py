"""Paired local recovery after a single time-conditional anomaly."""
import json
from pathlib import Path
from hidden_mechanics_micro import ACTIONS
from policy_contract_controls import Policy, FAMILY
from persistent_goal_pilot import public_map, plan
from prospective_policy_step import step
from micro_evaluation_evidence import Writer, digest
from run_e1_family import JumpWitness
from run_p0_greedy import RULE_IDS, CheckingWriter
from hidden_mechanics_micro import RULES


class WaitController:
    def __init__(self, delay):
        self.delay = delay; self.waiting = False; self.remaining = None

    def before_action(self):
        if self.waiting and self.remaining == 0:
            self.waiting = False
            return True
        return False

    def after_observation(self, outside):
        if outside:
            self.waiting = True; self.remaining = self.delay
        elif self.waiting and self.remaining is not None:
            self.remaining -= 1


def core(writer, spec):
    writer.append({'event': 'manifest', 'digest': digest(spec)})
    results = []
    for delay in spec['delays']:
        name = 'NEVER' if delay is None else f'W{delay}'
        env = JumpWitness(11); policy = Policy(reset=False, seed=1000)
        before = env.observe(); base, _ = public_map(before)
        timer = WaitController(delay); rows = []; openings = []; anomalies = []
        first_singleton_after = None; recovery_exploration = 0; planning_disabled = False
        first_arrival_after = None; subsequent = stayed = 0; post_seen = set()
        for i in range(1, 51):
            reopened = timer.before_action()
            if reopened:
                policy.mechanics = set(FAMILY); openings.append(i)
                recovery_exploration = 0; planning_disabled = False
                writer.append({'event': 'family_reopened', 'condition': name, 'before_step': i,
                               'forgotten_anomaly_steps': list(anomalies)})
            pos = next((x, y) for y, r in enumerate(before['grid']) for x, c in enumerate(r) if c in (1, 5))
            mode = 'A1'
            if timer.waiting or not policy.mechanics:
                mode = 'WAIT_FALLBACK'; action = policy.fallback()
            elif len(policy.mechanics) == 1 and not planning_disabled:
                mechanics = next(iter(policy.mechanics))
                route = plan(base, pos, spec['target'], mechanics)
                if len(route) <= 51 - i:
                    mode = 'PLAN' if route else 'HOLD'
                    action = route[0] if route else ACTIONS[mechanics.index((0, 0))]
                    policy.counts[action] += 1
                    writer.append({'event': 'plan', 'condition': name, 'before_step': i,
                                   'target': spec['target'], 'actions': route})
                else:
                    planning_disabled = True; mode = 'PLAN_TOO_LONG'; action = policy.choose_discriminative(base, pos)
            else:
                action = policy.choose_discriminative(base, pos)
                if openings and not planning_disabled:
                    recovery_exploration += 1
            prediction = policy.predict(base, pos, action)
            key = digest([before['grid'], action])
            post = bool(openings); unseen = post and key not in post_seen
            if post:
                post_seen.add(key)
            after, update = step(writer, policy, env, base, before, action,
                                 digest(spec['source_digests']), name)
            check = Policy(reset=False); check.mechanics = set(FAMILY)
            check.observe(base, pos, action, after['grid'])
            outside = not check.mechanics
            if outside:
                anomalies.append(i); policy.mechanics = set()
            timer.after_observation(outside)
            if openings and first_singleton_after is None and len(policy.mechanics) == 1:
                first_singleton_after = i
            if openings and recovery_exploration >= spec['exploration_budget'] and len(policy.mechanics) != 1:
                planning_disabled = True
            end = next((x, y) for y, r in enumerate(after['grid']) for x, c in enumerate(r) if c in (1, 5))
            marker = base[end[1]][end[0]]
            if first_arrival_after is not None:
                subsequent += 1; stayed += marker == spec['target']
            if openings and first_arrival_after is None and marker == spec['target']:
                first_arrival_after = i
            row = {'step': i, 'mode': mode, 'action': action, 'outside': outside,
                   'remaining_wait_after': timer.remaining, 'waiting_after': timer.waiting,
                   'hypotheses_after': len(policy.mechanics), 'issued': prediction is not None,
                   'exact': prediction is not None and prediction == after['grid'],
                   'post_reopening': post, 'post_new_pair': bool(unseen),
                   'reopened_before_action': reopened}
            writer.append({'event': 'recovery_diagnostic', 'condition': name, **row})
            rows.append(row); before = after
        post = [r for r in rows if r['post_reopening']]; novel = [r for r in post if r['post_new_pair']]
        def scores(group):
            issued = sum(r['issued'] for r in group); exact = sum(r['exact'] for r in group)
            return {'queries': len(group), 'issued': issued, 'exact': exact,
                    'coverage': issued / len(group) if group else None,
                    'conditional_error': (issued - exact) / issued if issued else None,
                    'itt_accuracy': exact / len(group) if group else None}
        results.append({'condition': name, 'openings_before_steps': openings,
            'anomaly_steps': anomalies, 'first_singleton_after_reopening': first_singleton_after,
            'singleton_correct_at_end': len(policy.mechanics) == 1 and next(iter(policy.mechanics)) == RULES[RULE_IDS[1]][0],
            'arrival_after_reopening': first_arrival_after,
            'post_arrival_stay_ratio': stayed / subsequent if subsequent else None,
            'terminal_reward': before['reward'], 'terminal_marker': marker,
            'post_reopening_all': scores(post), 'post_reopening_new': scores(novel),
            'common_post_anomaly': scores([r for r in rows if r['step'] > 11]), 'rows': rows})
    return {'results': results, 'actions': 200, 'final_head': writer.previous,
            'trust': 'Local unsigned operator-trusted exploratory run; no sandbox or external anchor'}


def run(out):
    out = Path(out); out.mkdir(exist_ok=False); (out / 'sources').mkdir()
    names = ('run_r1_recovery.py', 'run_e1_family.py', 'run_p0_greedy.py',
             'hidden_mechanics_micro.py', 'policy_contract_controls.py',
             'persistent_goal_pilot.py', 'prospective_policy_step.py', 'micro_evaluation_evidence.py')
    spec = {'format': 'R1_FIXED_WAIT_V1', 'delays': [None, 3, 5, 10], 'anomaly_step': 11,
            'horizon': 50, 'target': 4, 'true_reward_goal': 3, 'exploration_budget': 10,
            'target_scope': 'Fixed diagnostic navigation target supplied to every condition, not goal acquisition',
            'reopening': 'Before t+W+1 after W fallback actions; anomaly not reused; new anomalies restart timer',
            'source_digests': {n: digest(Path(__file__).with_name(n).read_text()) for n in names}}
    (out / 'manifest.json').write_text(json.dumps(spec, indent=2))
    for name in names:
        (out / 'sources' / name).write_bytes(Path(__file__).with_name(name).read_bytes())
    writer = Writer(out / 'events.jsonl')
    try:
        report = core(writer, spec)
    finally:
        writer.close()
    (out / 'report.json').write_text(json.dumps(report, indent=2))
    return report


def verify(out):
    out = Path(out); spec = json.loads((out / 'manifest.json').read_text())
    for name, expected in spec['source_digests'].items():
        if digest(Path(__file__).with_name(name).read_text()) != expected or digest((out / 'sources' / name).read_text()) != expected:
            raise ValueError('SOURCE_MISMATCH')
    writer = CheckingWriter(out / 'events.jsonl'); report = core(writer, spec); writer.finish()
    if report != json.loads((out / 'report.json').read_text()):
        raise ValueError('REPORT_MISMATCH')
    return {'status': 'LOCAL_FULL_REPLAY_VERIFIED', 'actions': 200, 'conditions': 4,
            'authentication': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2]); (Path(sys.argv[2]) / 'verification.json').write_text(json.dumps(result, indent=2))
    else:
        result = [{k: v for k, v in r.items() if k != 'rows'} for r in run(sys.argv[1])['results']]
    print(json.dumps(result, indent=2))
