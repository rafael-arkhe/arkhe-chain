"""Offline conjunction of transition constraints; local finite-family diagnosis."""
from policy_contract_controls import Policy
from run_r3_symmetric import SYMMETRIC


class HistoryDiagnostic:
    def __init__(self, family=None):
        self.initial = set(SYMMETRIC.values() if family is None else family)
        self.remaining = set(self.initial)
        self.records = []

    def observe(self, base, before, action, after):
        # Filter H0 and the accumulated version space separately.
        def compatible(candidates):
            learner = Policy(reset=False); learner.mechanics = set(candidates)
            pos = next((x, y) for y, row in enumerate(before) for x, c in enumerate(row) if c in (1, 5))
            learner.observe(base, pos, action, after)
            return learner.mechanics
        local = compatible(self.initial)
        self.remaining = compatible(self.remaining)
        record = {'transition_index': len(self.records) + 1,
                  'current_transition_candidates': len(local),
                  'history_candidates': len(self.remaining),
                  'transition_incompatible': not local,
                  'history_incompatible': not self.remaining,
                  'reason': ('NO_CANDIDATE_EXPLAINS_HISTORY' if not self.remaining else 'COMPATIBLE_HISTORY')}
        self.records.append(record)
        return record


def j2_jump_position(base, position, delta):
    """Independent endpoint+intermediate oracle for the controlled two-cell effect."""
    x, y = position; dx, dy = delta
    if abs(dx) + abs(dy) != 2 or (dx != 0 and dy != 0):
        raise ValueError('TWO_CELL_AXIS_JUMP_REQUIRED')
    intermediate = (x + dx // 2, y + dy // 2)
    destination = (x + dx, y + dy)
    height = len(base); width = len(base[0])
    for px, py in (intermediate, destination):
        if not (0 <= px < width and 0 <= py < height) or base[py][px] == 2:
            return position
    return destination
