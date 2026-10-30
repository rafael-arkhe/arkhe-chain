"""Goal-only baseline: supplied mechanics and binary reward family, terminal learning."""
import json
from collections import deque
from pathlib import Path
from hidden_mechanics_micro import Episode, RULES, ACTIONS, advance
from micro_evaluation_evidence import Writer, digest


class GoalLearner:
    def __init__(self):
        self.possible = {3, 4}

    def choose(self):
        return min(self.possible)

    def predict_reward(self, marker):
        return sum(marker == goal for goal in self.possible) / len(self.possible)

    def update(self, marker, reward):
        # Off-marker failure cannot distinguish either goal.
        self.possible = {goal for goal in self.possible if int(marker == goal) == reward}
        if not self.possible:
            raise ValueError('INCONSISTENT_REWARD_FAMILY')


def public_map(observation):
    base = [row[:] for row in observation['grid']]
    positions = [(x, y) for y, row in enumerate(base) for x, c in enumerate(row) if c == 1]
    if len(positions) != 1:
        raise ValueError('initial actor must not cover marker')
    x, y = positions[0]
    base[y][x] = 0
    return base, (x, y)


def plan(base, start, target, mechanics):
    queue = deque([(start, [])]); seen = {start}
    while queue:
        pos, path = queue.popleft()
        if base[pos[1]][pos[0]] == target:
            return path
        for action, delta in zip(ACTIONS, mechanics):
            dest = advance(base, pos, delta)
            if dest not in seen:
                seen.add(dest); queue.append((dest, path + [action]))
    raise ValueError('UNREACHABLE_TARGET')


def run(out, rule_ids=tuple(range(20)), episodes=10):
    out = Path(out); out.mkdir(exist_ok=False)
    manifest = {'format': 'LOCAL_PERSISTENT_GOAL_V1', 'rule_ids': list(rule_ids),
        'episodes_per_task': episodes, 'conditions': ['adaptive', 'frozen', 'oracle'],
        'layout_seed': '3000 + episode; paired across tasks and conditions',
        'horizon': 50, 'primary': 'first singleton goal after terminal feedback; final-five success',
        'secondary': 'preterminal reward prediction accuracy and Brier score',
        'supplied': 'Exact action mechanics, static-map BFS, binary goal family {3,4}',
        'scope': 'Known synthetic tasks; no sealed holdout, no LLM, no Arkhe native admission',
        'source_digest': digest(Path(__file__).read_text())}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    writer = Writer(out / 'events.jsonl'); results = []
    try:
        writer.append({'event': 'manifest', 'digest': digest(manifest)})
        for rule_id in rule_ids:
            mechanics, true_goal = RULES[rule_id]  # evaluator-only task assignment
            for condition in manifest['conditions']:
                learner = GoalLearner(); rows = []; acquired = None
                for episode in range(episodes):
                    env = Episode(rule_id, 3000 + episode, 50)
                    base, start = public_map(env.observe())
                    target = true_goal if condition == 'oracle' else learner.choose()
                    path = plan(base, start, target, mechanics)
                    if len(path) > 50:
                        raise ValueError('HORIZON_EXCEEDED')
                    stay = ACTIONS[mechanics.index((0, 0))]
                    actions = path + [stay] * (50 - len(path))
                    for action in actions[:-1]:
                        env.step(action)
                    probability = float(target == true_goal) if condition == 'oracle' else learner.predict_reward(target)
                    commitment = writer.append({'event': 'reward_prediction', 'rule_id': rule_id,
                        'condition': condition, 'episode': episode, 'target': target,
                        'goal_candidates': sorted(learner.possible), 'probability': probability,
                        'actions': actions, 'before_terminal': env.observe(),
                        'mechanics_supplied': mechanics})
                    terminal = env.step(actions[-1]); reward = terminal['reward']
                    # Determine terminal marker using public position and initial visible map.
                    positions = [(x, y) for y, row in enumerate(terminal['grid']) for x, c in enumerate(row) if c in (1, 5)]
                    x, y = positions[0]; marker = base[y][x]
                    row = {'episode': episode + 1, 'reward': reward, 'probability': probability,
                           'brier': (probability - reward) ** 2,
                           'reward_prediction_correct': int(probability >= .5) == reward,
                           'terminal_marker': marker, 'prediction_commitment': commitment}
                    if condition == 'adaptive':
                        learner.update(marker, reward)
                        if len(learner.possible) == 1 and acquired is None:
                            acquired = episode + 1
                    writer.append({'event': 'terminal_feedback', 'rule_id': rule_id,
                                   'condition': condition, **row, 'after_candidates': sorted(learner.possible)})
                    rows.append(row)
                results.append({'rule_id': rule_id, 'condition': condition,
                    'first_singleton_after_episode': acquired,
                    'final_five_all_success': len(rows) >= 5 and all(r['reward'] == 1 for r in rows[-5:]),
                    'successes': sum(r['reward'] for r in rows),
                    'mean_brier': sum(r['brier'] for r in rows) / len(rows), 'episodes': rows})
        head = writer.previous
    finally:
        writer.close()
    summary = {}
    for condition in manifest['conditions']:
        group = [r for r in results if r['condition'] == condition]
        summary[condition] = {'tasks': len(group), 'successes': sum(r['successes'] for r in group),
            'opportunities': len(group) * episodes,
            'final_five_all_success_tasks': sum(r['final_five_all_success'] for r in group),
            'mean_brier': sum(r['mean_brier'] for r in group) / len(group),
            'singleton_episodes': [r['first_singleton_after_episode'] for r in group]}
    report = {'summary': summary, 'results': results, 'local_final_head': head,
              'trust': 'Unsigned local prospective log; no external chronology/completeness proof',
              'limitations': 'Binary deterministic family supplied; task order fixed; shared layouts; no statistical independence or ARC transfer established'}
    (out / 'report.json').write_text(json.dumps(report, indent=2))
    return summary


if __name__ == '__main__':
    import sys
    print(json.dumps(run(sys.argv[1]), indent=2))
