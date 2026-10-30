"""Local policy step; Writer appends and fsyncs before calling the environment."""
from micro_evaluation_evidence import digest


def step(writer, policy, env, base, before, action, model_digest, episode_id,
         changed_after_first=False):
    pos = next((x, y) for y, row in enumerate(before['grid']) for x, c in enumerate(row) if c in (1, 5))
    prediction = policy.predict(base, pos, action)
    hypothesis_digest = digest({'mechanics': sorted(policy.mechanics), 'goals': sorted(policy.goals)})
    commitment = writer.append({'event': 'prediction_committed', 'episode_id': episode_id,
        'step': before['step'], 'before': before, 'action': action, 'prediction': prediction,
        'hypothesis_digest': hypothesis_digest, 'model_digest': model_digest})
    after = env.step(action)
    writer.append({'event': 'observation_recorded', 'commitment_hash': commitment, 'after': after})
    end = next((x, y) for y, row in enumerate(after['grid']) for x, c in enumerate(row) if c in (1, 5))
    marker = base[end[1]][end[0]]
    signal = bool(changed_after_first and before['step'] == 0)
    result = policy.observe(base, pos, action, after['grid'], marker, after['reward'], signal)
    writer.append({'event': 'policy_updated', 'commitment_hash': commitment,
                   'delivered_change_flag': signal, **result})
    return after, result
