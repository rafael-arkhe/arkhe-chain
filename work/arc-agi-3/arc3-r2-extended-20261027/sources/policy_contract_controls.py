"""Offline policy-contract controls, not a confirmatory adaptation experiment."""
import itertools
import random
from hidden_mechanics_micro import ACTIONS, DELTAS, advance, render

FAMILY = tuple(itertools.permutations(DELTAS))


class Policy:
    def __init__(self, reset=True, seed=0, reset_mode='total'):
        if reset_mode not in ('total', 'selective'):
            raise ValueError('INVALID_RESET_MODE')
        self.reset_mode = reset_mode
        self.reset_policy = reset
        self.rng = random.Random(seed)
        self.mechanics = set(FAMILY)
        self.goals = {3, 4}
        self.counts = dict.fromkeys(ACTIONS, 0)

    def start_episode(self):
        self.counts = dict.fromkeys(ACTIONS, 0)

    def fallback(self):
        minimum = min(self.counts.values())
        action = self.rng.choice([a for a in ACTIONS if self.counts[a] == minimum])
        self.counts[action] += 1
        return action

    def predict(self, base, pos, action):
        predictions = {tuple(map(tuple, render(base, advance(base, pos, h[ACTIONS.index(action)]))))
                       for h in self.mechanics}
        return list(map(list, next(iter(predictions)))) if len(predictions) == 1 else None

    def choose_discriminative(self, base, pos):
        """Uniform surviving hypotheses; one-step expected remaining count, not navigation."""
        if not self.mechanics:
            return self.fallback()
        scores = {}
        for action in ACTIONS:
            groups = {}
            for hypothesis in self.mechanics:
                output = tuple(map(tuple, render(base, advance(base, pos, hypothesis[ACTIONS.index(action)]))))
                groups[output] = groups.get(output, 0) + 1
            scores[action] = sum(n * n for n in groups.values()) / len(self.mechanics)
        best = min(scores.values())
        choices = [a for a in ACTIONS if scores[a] == best]
        minimum = min(self.counts[a] for a in choices)
        action = self.rng.choice([a for a in choices if self.counts[a] == minimum])
        self.counts[action] += 1
        return action

    def observe(self, base, pos, action, after, marker=0, reward=None, changed=False):
        def mechanics_filter(hypotheses):
            return {h for h in hypotheses if render(base, advance(base, pos, h[ACTIONS.index(action)])) == after}
        def goal_filter(hypotheses):
            if reward is None:
                return set(hypotheses)
            if reward not in (0, 1):
                raise ValueError('BINARY_REWARD_REQUIRED')
            return {g for g in hypotheses if int(marker == g) == reward}
        filtered_m = mechanics_filter(self.mechanics)
        filtered_g = goal_filter(self.goals)
        d1 = bool(self.mechanics) and not filtered_m
        d2 = reward is not None and bool(self.goals) and not filtered_g
        # P-carry ignores signal, including its diagnostic detector output.
        d3 = bool(changed) if self.reset_policy else False
        reset = self.reset_policy and (d1 or d2 or d3)
        if reset:
            # A generic task-change flag does not say which component changed.
            if self.reset_mode == 'total' or d1 or d3:
                filtered_m = mechanics_filter(set(FAMILY))
            if self.reset_mode == 'total' or d2 or d3:
                filtered_g = goal_filter({3, 4})
        self.mechanics, self.goals = filtered_m, filtered_g
        return {'d1': d1, 'd2': d2, 'd3': d3, 'reset': bool(reset),
                'mechanics_remaining': len(filtered_m), 'goals_remaining': len(filtered_g)}


def associate(changes, alarms, window):
    """Causal, latest preceding change; duplicates never match future changes."""
    if window < 0 or len(set(changes)) != len(changes):
        raise ValueError('INVALID_WINDOW_OR_CHANGES')
    matched, duplicates, false = {}, [], []
    for alarm in sorted(alarms):
        candidates = [change for change in changes if change <= alarm <= change + window]
        if not candidates:
            false.append(alarm)
            continue
        change = max(candidates)
        if change in matched:
            duplicates.append(alarm)
        else:
            matched[change] = alarm - change
    return {'delays': matched, 'duplicates': duplicates, 'false_alarms': false,
            'missed_changes': [c for c in changes if c not in matched]}
