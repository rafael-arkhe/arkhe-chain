"""Supplied extended family: 120 permutations plus four fixed P2 jump variants."""
import json
from pathlib import Path
from hidden_mechanics_micro import Episode, ACTIONS, RULES
from policy_contract_controls import Policy, FAMILY
from persistent_goal_pilot import public_map, plan
from prospective_policy_step import step
from micro_evaluation_evidence import Writer, digest
from run_p0_greedy import RULE_IDS, CheckingWriter

P2 = RULES[RULE_IDS[1]][0]
VARIANTS = []
for index in range(4):
    variant = list(P2); dx, dy = variant[index]; variant[index] = (2 * dx, 2 * dy)
    VARIANTS.append(tuple(variant))
EXTENDED = FAMILY + tuple(VARIANTS)
HYPOTHESES = {f'H{i + 1:03}': h for i, h in enumerate(EXTENDED)}
TRUE_CASES = [('P2_CONTROL', P2)] + [(f'JUMP_ACTION{i + 1}', h) for i, h in enumerate(VARIANTS)]


def core(writer, spec):
    writer.append({'event': 'manifest', 'digest': digest(spec)})
    results = []
    for case_index, (name, truth) in enumerate(TRUE_CASES):
        for layout_index, seed in enumerate(spec['layout_seeds']):
            agent_seed = 1000 + 10 * case_index + layout_index
            learner = Policy(reset=False, seed=agent_seed); learner.mechanics = set(EXTENDED)
            env = Episode(RULE_IDS[1], seed, 50)
            # Evaluator installs the real fixed dynamics; never passed to learner.
            env._deltas = truth
            before = env.observe(); base, _ = public_map(before)
            episode = f'{name}-layout{seed}'
            writer.append({'event': 'episode_start', 'episode': episode, 'initial': before,
                           'layout_seed': seed, 'agent_seed': agent_seed,
                           'true_case_evaluator_only': name})
            first_singleton = None; exploration = 0; failure = None; issued = exact = 0
            seen = set(); novel = novel_issued = novel_exact = 0
            arrival = None; after_arrival = stayed = 0; plan_lengths = []
            for i in range(1, 51):
                pos = next((x, y) for y, r in enumerate(before['grid']) for x, c in enumerate(r) if c in (1, 5))
                if len(learner.mechanics) == 1 and failure is None:
                    mechanics = next(iter(learner.mechanics))
                    try:
                        route = plan(base, pos, spec['target'], mechanics)
                    except ValueError:
                        route = None
                    if route is None or len(route) > 51 - i:
                        failure = 'UNREACHABLE' if route is None else 'PLAN_TOO_LONG'
                    else:
                        writer.append({'event': 'plan', 'episode': episode, 'before_step': i,
                                       'target': spec['target'], 'actions': route})
                        plan_lengths.append(len(route))
                        action = route[0] if route else ACTIONS[mechanics.index((0, 0))]
                        learner.counts[action] += 1
                if len(learner.mechanics) != 1 or failure is not None:
                    if failure is None and exploration >= spec['exploration_budget']:
                        failure = 'IDENTIFICATION_BUDGET_EXHAUSTED'
                    action = learner.choose_discriminative(base, pos)
                    if failure is None:
                        exploration += 1
                prediction = learner.predict(base, pos, action)
                key = digest([before['grid'], action]); fresh = key not in seen; seen.add(key)
                after, update = step(writer, learner, env, base, before, action,
                                     digest(spec['source_digests']), episode)
                if first_singleton is None and len(learner.mechanics) == 1:
                    first_singleton = i
                emitted = prediction is not None; correct = emitted and prediction == after['grid']
                issued += emitted; exact += correct
                novel += fresh; novel_issued += fresh and emitted; novel_exact += fresh and correct
                end = next((x, y) for y, r in enumerate(after['grid']) for x, c in enumerate(r) if c in (1, 5))
                marker = base[end[1]][end[0]]
                if arrival is not None:
                    after_arrival += 1; stayed += marker == spec['target']
                if arrival is None and marker == spec['target']:
                    arrival = i
                before = after
            row = {'episode': episode, 'true_case': name, 'layout_seed': seed, 'agent_seed': agent_seed,
                   'first_singleton_step': first_singleton,
                   'singleton_correct': learner.mechanics == {truth},
                   'remaining': len(learner.mechanics),
                   'remaining_ids': [key for key, h in HYPOTHESES.items() if h in learner.mechanics],
                   'issued': issued, 'exact': exact, 'queries': 50,
                   'novel_queries': novel, 'novel_issued': novel_issued, 'novel_exact': novel_exact,
                   'planning_failure': failure, 'first_plan_length': plan_lengths[0] if plan_lengths else None,
                   'arrival': arrival, 'post_arrival_stay_ratio': stayed / after_arrival if after_arrival else None,
                   'terminal_marker': marker, 'terminal_reward': before['reward']}
            writer.append({'event': 'episode_summary', **row}); results.append(row)
    def summarize(group):
        return {'episodes': len(group), 'singleton_correct': sum(r['singleton_correct'] for r in group),
                'singleton_steps': [r['first_singleton_step'] for r in group],
                'planning_failures': sum(r['planning_failure'] is not None for r in group),
                'terminal_on_target': sum(r['terminal_marker'] == spec['target'] for r in group),
                'reward_sum': sum(r['terminal_reward'] for r in group),
                **{k: sum(r[k] for r in group) for k in ('queries', 'issued', 'exact', 'novel_queries', 'novel_issued', 'novel_exact')}}
    return {'results': results, 'summary': summarize(results),
            'jump_cases': summarize([r for r in results if r['true_case'] != 'P2_CONTROL']),
            'controls': summarize([r for r in results if r['true_case'] == 'P2_CONTROL']),
            'final_head': writer.previous,
            'trust': 'Local unsigned supplied-family exploratory identification; no external authentication'}


def run(out):
    out = Path(out); out.mkdir(exist_ok=False); (out / 'sources').mkdir()
    names = ('run_r2_extended.py', 'run_p0_greedy.py', 'hidden_mechanics_micro.py',
             'policy_contract_controls.py', 'persistent_goal_pilot.py',
             'prospective_policy_step.py', 'micro_evaluation_evidence.py')
    hypotheses = {key: list(h) for key, h in HYPOTHESES.items()}
    spec = {'format': 'R2_EXTENDED_FAMILY_V1', 'hypotheses': hypotheses,
            'collision': 'J1: destination only; out of bounds or wall at destination means stay; intermediate cell ignored',
            'layout_seeds': [42, 43, 44], 'agent_seed': '1000 + 10*case_index + layout_index',
            'horizon': 50, 'exploration_budget': 10, 'target': 4, 'reward_goal': 3,
            'goal_scope': 'Fixed diagnostic target, not goal acquisition',
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
    if spec['hypotheses'] != json.loads(json.dumps(HYPOTHESES)):
        raise ValueError('FAMILY_MISMATCH')
    for name, expected in spec['source_digests'].items():
        if digest(Path(__file__).with_name(name).read_text()) != expected or digest((out / 'sources' / name).read_text()) != expected:
            raise ValueError('SOURCE_MISMATCH')
    writer = CheckingWriter(out / 'events.jsonl'); report = core(writer, spec); writer.finish()
    if report != json.loads((out / 'report.json').read_text()):
        raise ValueError('REPORT_MISMATCH')
    return {'status': 'LOCAL_FULL_REPLAY_VERIFIED', 'episodes': len(report['results']),
            'actions': report['summary']['queries'], 'authentication': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2]); (Path(sys.argv[2]) / 'verification.json').write_text(json.dumps(result, indent=2))
    else:
        report = run(sys.argv[1]); result = {k: report[k] for k in ('summary', 'jump_cases', 'controls')}
    print(json.dumps(result, indent=2))
