"""Exploratory composition of learned mechanics and terminal goal feedback."""
import json
import random
from pathlib import Path
from hidden_mechanics_micro import Episode, ACTIONS
from policy_contract_controls import Policy
from persistent_goal_pilot import public_map, plan
from prospective_policy_step import step
from micro_evaluation_evidence import Writer, digest
from run_p0_greedy import RULE_IDS, CheckingWriter

SOURCES = ('run_p1_goal.py', 'run_p0_greedy.py', 'policy_contract_controls.py',
           'persistent_goal_pilot.py', 'prospective_policy_step.py',
           'micro_evaluation_evidence.py', 'hidden_mechanics_micro.py')


def manifest(schedule):
    return {'format': 'P1_GOAL_LOCAL_V1', 'schedule': list(schedule), 'rule_ids': list(RULE_IDS),
            'layout_seeds': [42, 43, 44], 'horizon': 50, 'exploration_budget_per_episode': 10,
            'policy': 'selective reset on contradiction, no flag; goal family {3,4}',
            'target_choice': 'known goal, else G2: odd one-based episode 4, even 3',
            'failure': 'planning disabled after exploration budget or unreachable/overlong plan; A1/fallback continues',
            'prediction': 'consensus retained even if planning failed; no forced false abstention',
            'recovery': 'D1 restores initial mechanics and reuses contradiction; exploration budget shared across recoveries',
            'memory': 'hypotheses persist; RNG and action counts restart each episode',
            'trust': 'local unsigned operator-trusted exploratory run; no sandbox or external anchor',
            'source_digests': {n: digest(Path(__file__).with_name(n).read_text()) for n in SOURCES}}


def core(writer, spec):
    writer.append({'event': 'manifest_committed', 'manifest_digest': digest(spec)})
    learner = Policy(reset=True, reset_mode='selective')
    rows = []; episode_index = 0
    for task_index, count in enumerate(spec['schedule']):
        for _ in range(count):
            episode_index += 1
            learner.start_episode(); learner.rng = random.Random(999 + episode_index)
            env = Episode(spec['rule_ids'][task_index], spec['layout_seeds'][task_index], spec['horizon'])
            before = env.observe(); base, _ = public_map(before)
            inherited = len(learner.mechanics) == 1
            row = {'episode': episode_index, 'task': task_index + 1,
                   'inherited_singleton': inherited, 'identification_events': [],
                   'target': None, 'target_reason': None, 'plans': [], 'exploration_actions': 0,
                   'planning_failure': None, 'contradictions': 0, 'issued': 0, 'exact': 0,
                   'first_target_arrival': None, 'post_arrival_steps': 0, 'post_arrival_on_target': 0}
            writer.append({'event': 'episode_start', 'episode': episode_index,
                           'task_evaluator_only': task_index + 1, 'initial': before,
                           'inherited_singleton': inherited, 'agent_seed': 999 + episode_index})
            had_contradiction = False; planning_disabled = False
            for action_index in range(spec['horizon']):
                pos = next((x, y) for y, r in enumerate(before['grid']) for x, c in enumerate(r) if c in (1, 5))
                singleton = len(learner.mechanics) == 1
                if singleton and row['target'] is None and not planning_disabled:
                    target = min(learner.goals) if len(learner.goals) == 1 else (4 if episode_index % 2 else 3)
                    row['target'] = target
                    row['target_reason'] = 'LEARNED_GOAL' if len(learner.goals) == 1 else 'G2_PARITY'
                    writer.append({'event': 'target_selected', 'episode': episode_index,
                                   'target': target, 'reason': row['target_reason'],
                                   'goal_candidates': sorted(learner.goals)})
                if singleton and not planning_disabled:
                    mechanics = next(iter(learner.mechanics))
                    try:
                        route = plan(base, pos, row['target'], mechanics)
                    except ValueError:
                        route = None
                    if route is None or len(route) > spec['horizon'] - action_index:
                        row['planning_failure'] = 'UNREACHABLE' if route is None else 'PLAN_TOO_LONG'
                        planning_disabled = True
                    else:
                        # Receding horizon; preserve every proposed route before execution.
                        proposal = {'at_step': action_index, 'length': len(route), 'actions': route}
                        row['plans'].append(proposal)
                        writer.append({'event': 'plan_proposed', 'episode': episode_index,
                                       'target': row['target'], **proposal})
                        action = route[0] if route else ACTIONS[mechanics.index((0, 0))]
                        learner.counts[action] += 1
                if not singleton or planning_disabled:
                    if not planning_disabled and row['exploration_actions'] >= spec['exploration_budget_per_episode']:
                        planning_disabled = True; row['planning_failure'] = 'IDENTIFICATION_BUDGET_EXHAUSTED'
                    action = learner.choose_discriminative(base, pos)
                    if not planning_disabled:
                        row['exploration_actions'] += 1
                prediction = learner.predict(base, pos, action)
                previous_count = len(learner.mechanics)
                after, result = step(writer, learner, env, base, before, action,
                                     digest(spec['source_digests']), str(episode_index))
                if result['d1']:
                    row['contradictions'] += 1; had_contradiction = True
                if previous_count != 1 and len(learner.mechanics) == 1 or result['d1'] and len(learner.mechanics) == 1:
                    label = 'RELEARNED' if had_contradiction else 'INITIAL_IDENTIFIED'
                    event = {'step': action_index + 1, 'label': label}
                    row['identification_events'].append(event)
                    writer.append({'event': 'mechanics_identified', 'episode': episode_index, **event})
                emitted = prediction is not None
                row['issued'] += emitted; row['exact'] += emitted and prediction == after['grid']
                end = next((x, y) for y, r in enumerate(after['grid']) for x, c in enumerate(r) if c in (1, 5))
                marker = base[end[1]][end[0]]
                on_target = row['target'] is not None and marker == row['target']
                if row['first_target_arrival'] is not None:
                    row['post_arrival_steps'] += 1
                    row['post_arrival_on_target'] += on_target
                if on_target and row['first_target_arrival'] is None:
                    row['first_target_arrival'] = action_index + 1
                if after['done']:
                    row.update({'terminal_marker': marker, 'reward': after['reward'],
                                'goal_candidates_after': sorted(learner.goals),
                                'mechanics_remaining': len(learner.mechanics),
                                'terminal_on_selected_target': bool(on_target),
                                'terminal_discriminative': marker in (3, 4),
                                'queries': action_index + 1})
                before = after
            writer.append({'event': 'episode_summary', **row}); rows.append(row)
    # Cross-episode checks are censored at the last episode, not scored as failure.
    confirmations = []
    for i, row in enumerate(rows):
        next_row = rows[i + 1] if i + 1 < len(rows) else None
        known = row['goal_candidates_after']
        confirm = None if next_row is None else bool(len(known) == 1 and next_row['target'] == known[0]
                                                     and next_row['target_reason'] == 'LEARNED_GOAL')
        execution_chain = bool(row['plans'] and row['terminal_on_selected_target'] and row['terminal_discriminative'])
        acquisition_chain = bool(row['identification_events'] and execution_chain)
        confirmations.append({'episode': row['episode'], 'execution_chain': execution_chain,
                              'acquisition_chain': acquisition_chain, 'next_choice_confirmation': confirm})
    return {'episodes': rows, 'chains': confirmations, 'summary': {
        'episodes': len(rows), 'actions': sum(r['queries'] for r in rows),
        'successes': sum(r['reward'] for r in rows),
        'terminal_discriminative': sum(r['terminal_discriminative'] for r in rows),
        'terminal_on_selected_target': sum(r['terminal_on_selected_target'] for r in rows),
        'planning_failures': sum(r['planning_failure'] is not None for r in rows),
        'contradictions': sum(r['contradictions'] for r in rows),
        'issued': sum(r['issued'] for r in rows), 'exact': sum(r['exact'] for r in rows),
        'acquisition_chains': sum(c['acquisition_chain'] for c in confirmations),
        'execution_chains': sum(c['execution_chain'] for c in confirmations),
        'next_choice_confirmed': sum(c['next_choice_confirmation'] is True for c in confirmations),
        'next_choice_evaluable': sum(c['next_choice_confirmation'] is not None for c in confirmations)},
        'final_head': writer.previous, 'trust': spec['trust']}


def run(out, schedule=(20, 20, 10)):
    out = Path(out); out.mkdir(exist_ok=False)
    spec = manifest(schedule)
    (out / 'manifest.json').write_text(json.dumps(spec, indent=2))
    (out / 'sources').mkdir()
    for name in SOURCES:
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
    writer = CheckingWriter(out / 'events.jsonl')
    report = core(writer, spec); writer.finish()
    if report != json.loads((out / 'report.json').read_text()):
        raise ValueError('REPORT_MISMATCH')
    return {'status': 'LOCAL_FULL_REPLAY_VERIFIED', **report['summary'],
            'authentication': 'NOT_ESTABLISHED', 'holdout_isolation': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2])
        (Path(sys.argv[2]) / 'verification.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
    else:
        print(json.dumps(run(sys.argv[1])['summary'], indent=2))
