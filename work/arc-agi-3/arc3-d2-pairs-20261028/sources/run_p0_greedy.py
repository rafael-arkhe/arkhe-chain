"""Exploratory paired P0, known displacement family, no goal-directed control."""
import json
import random
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from hidden_mechanics_micro import Episode, RULES, ACTIONS
from micro_evaluation_evidence import Writer, digest
from persistent_goal_pilot import public_map
from policy_contract_controls import Policy, associate
from prospective_policy_step import step

PERMUTATIONS = (
    ((0, -1), (0, 1), (-1, 0), (1, 0), (0, 0)),
    ((-1, 0), (1, 0), (0, 1), (0, -1), (0, 0)),
    ((0, 1), (0, -1), (1, 0), (-1, 0), (0, 0)),
)
RULE_IDS = tuple(RULES.index((p, 3)) for p in PERMUTATIONS)
CONDITIONS = {'C00': (True, False), 'C01': (True, True),
              'C10': (False, False), 'C11': (False, True)}
SOURCE_NAMES = ('run_p0_greedy.py', 'policy_contract_controls.py',
                'prospective_policy_step.py', 'hidden_mechanics_micro.py',
                'persistent_goal_pilot.py', 'micro_evaluation_evidence.py')


def make_manifest(schedule=(20, 20, 10)):
    return {'format': 'P0_GREEDY_LOCAL_V1', 'schedule': list(schedule),
        'rule_ids': list(RULE_IDS), 'permutations': PERMUTATIONS,
        'action_labels': dict(zip(ACTIONS, ('U', 'D', 'L', 'R', 'S'))),
        'goal': 3, 'layout_seeds': [42, 43, 44], 'horizon': 50, 'window': 3,
        'agent_seed': '1000 + zero-based episode',
        'environment_seed': '2000 + zero-based episode; unused deterministic environment',
        'conditions': CONDITIONS, 'reset': 'selective; generic flag reopens both families',
        'flag': 'only at real boundaries, after first action, not initial episode',
        'novelty': 'raw (grid,action) absent earlier in same episode, before online update; not sealed holdout',
        'trust': 'local unsigned operator-trusted exploratory run, no sandbox or external anchor',
        'source_digests': {name: digest(Path(__file__).with_name(name).read_text()) for name in SOURCE_NAMES}}


def condition_run(writer, manifest, condition, progress=False):
    reset, signal = CONDITIONS[condition]
    policy = Policy(reset=reset, reset_mode='selective')
    writer.append({'event': 'condition_start', 'condition': condition, 'manifest_digest': digest(manifest)})
    episodes, behavior, alarms, changes = [], [], [], []
    global_step = 0; episode_index = 0
    for task_index, count in enumerate(manifest['schedule']):
        for local_episode in range(count):
            boundary = task_index > 0 and local_episode == 0
            if boundary:
                changes.append(global_step)
            policy.start_episode(); policy.rng = random.Random(1000 + episode_index)
            env = Episode(manifest['rule_ids'][task_index], manifest['layout_seeds'][task_index], manifest['horizon'])
            before = env.observe(); base, _ = public_map(before)
            episode_id = f'{condition}-{episode_index + 1}'
            writer.append({'event': 'episode_start', 'episode_id': episode_id,
                           'layout_seed': manifest['layout_seeds'][task_index],
                           'agent_seed': 1000 + episode_index, 'environment_seed_unused': 2000 + episode_index,
                           'task_index_evaluator_only': task_index, 'initial_observation': before})
            seen = set(); issued = correct = novel = novel_issued = novel_correct = resets = 0
            first_singleton = first_goal_singleton = first_correct = None
            for action_index in range(manifest['horizon']):
                pos = next((x, y) for y, row in enumerate(before['grid']) for x, c in enumerate(row) if c in (1, 5))
                action = policy.choose_discriminative(base, pos)
                prediction = policy.predict(base, pos, action)
                key = digest([before['grid'], action]); unseen = key not in seen
                seen.add(key); novel += unseen
                after, result = step(writer, policy, env, base, before, action,
                    digest(manifest['source_digests']), episode_id, boundary and signal)
                emitted = prediction is not None
                exact = emitted and prediction == after['grid']
                issued += emitted; correct += exact
                novel_issued += unseen and emitted; novel_correct += unseen and exact
                resets += result['reset']
                if result['d1'] or result['d2'] or result['d3']:
                    alarms.append(global_step)
                if first_singleton is None and len(policy.mechanics) == 1:
                    first_singleton = action_index + 1
                if first_goal_singleton is None and len(policy.goals) == 1:
                    first_goal_singleton = action_index + 1
                if first_correct is None and exact:
                    first_correct = action_index + 1
                # Flag and condition-specific evidence hashes intentionally excluded.
                behavior.append(digest([before, action, prediction, after, result]))
                before = after; global_step += 1
            row = {'episode': episode_index + 1, 'task': task_index + 1,
                   'queries': manifest['horizon'], 'issued': issued, 'exact': correct,
                   'novel_queries': novel, 'novel_issued': novel_issued, 'novel_exact': novel_correct,
                   'reward': before['reward'], 'resets': resets,
                   'first_singleton_step_in_episode': first_singleton,
                   'first_goal_singleton_step_in_episode': first_goal_singleton,
                   'first_exact_prediction_diagnostic': first_correct,
                   'mechanics_remaining': len(policy.mechanics), 'goals_remaining': len(policy.goals)}
            writer.append({'event': 'episode_summary', **row})
            episodes.append(row); episode_index += 1
            if progress and episode_index % 10 == 0:
                print(f'{condition}: {episode_index}/{sum(manifest["schedule"])} episodes', flush=True)
    totals = {key: sum(row[key] for row in episodes) for key in
              ('queries', 'issued', 'exact', 'novel_queries', 'novel_issued', 'novel_exact', 'reward', 'resets')}
    totals['coverage'] = totals['issued'] / totals['queries']
    totals['novel_conditional_error'] = ((totals['novel_issued'] - totals['novel_exact']) /
                                        totals['novel_issued']) if totals['novel_issued'] else None
    totals['novel_itt_accuracy'] = totals['novel_exact'] / totals['novel_queries']
    return {'condition': condition, 'totals': totals, 'episodes': episodes,
            'alarm_association': associate(changes, alarms, manifest['window']),
            'behavior_digest': digest(behavior), 'final_head': writer.previous}


class CheckingWriter:
    def __init__(self, path):
        self.rows = iter(Path(path).read_text().splitlines()); self.previous = '0' * 64; self.seq = 0

    def append(self, payload):
        row = json.loads(next(self.rows))
        expected = {'seq': self.seq, 'previous': self.previous, 'payload': payload}
        expected['hash'] = digest(expected)
        if row != expected:
            raise ValueError(f'REPLAY_MISMATCH_AT_{self.seq}')
        self.seq += 1; self.previous = expected['hash']
        return self.previous

    def finish(self):
        if next(self.rows, None) is not None:
            raise ValueError('EXTRA_EVENTS')


def run(out, schedule=(20, 20, 10), progress=True):
    out = Path(out); out.mkdir(exist_ok=False)
    manifest = make_manifest(schedule)
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    (out / 'sources').mkdir()
    for name in SOURCE_NAMES:
        (out / 'sources' / name).write_bytes(Path(__file__).with_name(name).read_bytes())
    def execute(condition):
        writer = Writer(out / f'{condition}.jsonl')
        try:
            return condition_run(writer, manifest, condition, progress)
        finally:
            writer.close()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(execute, CONDITIONS))
    report = {'results': results, 'carry_behavior_identical': results[2]['behavior_digest'] == results[3]['behavior_digest'],
              'scope': manifest['trust']}
    (out / 'report.json').write_text(json.dumps(report, indent=2))
    return report


def verify(out):
    out = Path(out); manifest = json.loads((out / 'manifest.json').read_text())
    for name, expected in manifest['source_digests'].items():
        if digest(Path(__file__).with_name(name).read_text()) != expected:
            raise ValueError('INSTALLED_SOURCE_CHANGED')
        if digest((out / 'sources' / name).read_text()) != expected:
            raise ValueError('SNAPSHOT_SOURCE_CHANGED')
    results = []
    for condition in CONDITIONS:
        writer = CheckingWriter(out / f'{condition}.jsonl')
        results.append(condition_run(writer, manifest, condition)); writer.finish()
    report = json.loads((out / 'report.json').read_text())
    # Normalize tuple/list representation through JSON, matching saved report.
    if json.loads(json.dumps(results)) != report['results']:
        raise ValueError('REPORT_MISMATCH')
    invariant = results[2]['behavior_digest'] == results[3]['behavior_digest']
    if report['carry_behavior_identical'] != invariant:
        raise ValueError('INVARIANCE_REPORT_MISMATCH')
    return {'status': 'LOCAL_FULL_REPLAY_VERIFIED', 'episodes': sum(manifest['schedule']) * 4,
            'actions': sum(r['totals']['queries'] for r in results), 'carry_behavior_identical': invariant,
            'authentication': 'NOT_ESTABLISHED', 'holdout_isolation': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2])
        (Path(sys.argv[2]) / 'verification.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
    else:
        report = run(sys.argv[1])
        print(json.dumps({r['condition']: r['totals'] for r in report['results']}, indent=2))
