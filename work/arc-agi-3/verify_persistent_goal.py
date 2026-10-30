"""Replay all declared episodes; local consistency only, not attestation."""
import json
from pathlib import Path
from hidden_mechanics_micro import Episode, RULES, ACTIONS
from persistent_goal_pilot import GoalLearner, public_map, plan
from micro_evaluation_evidence import digest


def verify(out):
    out = Path(out)
    manifest = json.loads((out / 'manifest.json').read_text())
    rows = [json.loads(line) for line in (out / 'events.jsonl').read_text().splitlines()]
    previous = '0' * 64
    for seq, row in enumerate(rows):
        body = {k: v for k, v in row.items() if k != 'hash'}
        assert row['seq'] == seq and row['previous'] == previous and digest(body) == row['hash']
        previous = row['hash']
    assert rows[0]['payload'] == {'event': 'manifest', 'digest': digest(manifest)}
    index = 1
    for rule in manifest['rule_ids']:
        mechanics, goal = RULES[rule]
        for condition in manifest['conditions']:
            learner = GoalLearner()
            for episode in range(manifest['episodes_per_task']):
                prediction, feedback = rows[index:index + 2]; index += 2
                p, f = prediction['payload'], feedback['payload']
                assert p['event'] == 'reward_prediction' and f['event'] == 'terminal_feedback'
                assert (p['rule_id'], p['condition'], p['episode']) == (rule, condition, episode)
                assert (f['rule_id'], f['condition'], f['episode']) == (rule, condition, episode + 1)
                assert f['prediction_commitment'] == prediction['hash']
                env = Episode(rule, 3000 + episode, 50)
                base, start = public_map(env.observe())
                target = goal if condition == 'oracle' else learner.choose()
                actions = plan(base, start, target, mechanics)
                actions += [ACTIONS[mechanics.index((0, 0))]] * (50 - len(actions))
                assert p['actions'] == actions and p['target'] == target
                assert p['goal_candidates'] == sorted(learner.possible)
                probability = float(target == goal) if condition == 'oracle' else learner.predict_reward(target)
                assert p['probability'] == probability
                for action in actions[:-1]:
                    env.step(action)
                assert p['before_terminal'] == env.observe()
                reward = env.step(actions[-1])['reward']
                assert f['reward'] == reward and f['brier'] == (probability - reward) ** 2
                assert f['terminal_marker'] == target
                if condition == 'adaptive':
                    learner.update(target, reward)
                assert f['after_candidates'] == sorted(learner.possible)
    assert index == len(rows)
    report = json.loads((out / 'report.json').read_text())
    assert report['local_final_head'] == previous
    # The generated aggregate report is a convenience; replay validates event evidence.
    return {'status': 'LOCAL_CHAIN_AND_EPISODES_REPLAYED', 'events': len(rows),
            'episodes': (len(rows) - 1) // 2, 'authentication': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    print(json.dumps(verify(sys.argv[1]), indent=2))
