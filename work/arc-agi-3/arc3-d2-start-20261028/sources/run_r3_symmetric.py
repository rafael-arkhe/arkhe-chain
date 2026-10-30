"""Paired active runs plus fixed-trajectory analysis, supplied symmetric family."""
import json
from pathlib import Path
from types import FunctionType

import run_r2_extended as r2
from hidden_mechanics_micro import ACTIONS
from micro_evaluation_evidence import Writer, digest
from persistent_goal_pilot import public_map
from policy_contract_controls import FAMILY, Policy
from run_p0_greedy import CheckingWriter


def enumerate_symmetric():
    result = {}
    for i, permutation in enumerate(FAMILY, 1):
        result[f'H{i:03}_0'] = permutation
        variant = 0
        for action_index, (dx, dy) in enumerate(permutation):
            if (dx, dy) == (0, 0):
                continue
            variant += 1
            h = list(permutation); h[action_index] = (2 * dx, 2 * dy)
            result[f'H{i:03}_{variant}'] = tuple(h)
    return result


SYMMETRIC = enumerate_symmetric()
FAMILIES = {'R2_124': r2.HYPOTHESES, 'R3_600': SYMMETRIC}
SOURCES = ('run_r3_symmetric.py', 'run_r2_extended.py', 'run_p0_greedy.py',
           'hidden_mechanics_micro.py', 'policy_contract_controls.py',
           'persistent_goal_pilot.py', 'prospective_policy_step.py', 'micro_evaluation_evidence.py')


def position(grid):
    return next((x, y) for y, row in enumerate(grid) for x, c in enumerate(row) if c in (1, 5))


def filter_transition(family, base, before, action, after):
    learner = Policy(reset=False); learner.mechanics = set(family)
    learner.observe(base, position(before), action, after)
    return learner.mechanics


class Observer:
    """Read-only trace analysis; never supplies diagnostics to acting policy."""
    def __init__(self, sink, family):
        self.sink = sink; self.family = tuple(family); self.traces = {}; self.diagnostics = []

    @property
    def previous(self):
        return self.sink.previous

    def append(self, payload):
        result = self.sink.append(payload)
        if payload['event'] == 'episode_start':
            self.episode = payload['episode']; self.base, _ = public_map(payload['initial'])
            self.current = set(self.family); self.traces[self.episode] = []
            self.first_jump = False; self.first_nonjump = False
        elif payload['event'] == 'prediction_committed':
            self.pending = payload
        elif payload['event'] == 'observation_recorded':
            p = self.pending; before = p['before']['grid']; after = payload['after']['grid']
            self.current = filter_transition(self.current, self.base, before, p['action'], after)
            old, new = position(before), position(after)
            jump = abs(old[0] - new[0]) + abs(old[1] - new[1]) == 2
            if jump and not self.first_jump or not jump and not self.first_nonjump:
                h0 = filter_transition(self.family, self.base, before, p['action'], after)
                self.diagnostics.append({'episode': self.episode, 'step': p['step'] + 1,
                    'kind': 'FIRST_OBSERVED_JUMP' if jump else 'FIRST_NONJUMP',
                    'h0_compatible': len(h0), 'prefix_compatible': len(self.current)})
                if jump:
                    self.first_jump = True
                else:
                    self.first_nonjump = True
            self.traces[self.episode].append({'before': before, 'action': p['action'], 'after': after})
        return result


def active_core(observer, spec, family):
    # Reuse exactly R2's controller bytecode with an isolated dependency namespace.
    # No global mutation of the original runner, preserving old archived verifiers.
    dependencies = dict(r2.core.__globals__)
    dependencies['EXTENDED'] = tuple(family.values())
    dependencies['HYPOTHESES'] = family
    controller = FunctionType(r2.core.__code__, dependencies, 'paired_r2_controller')
    return controller(observer, spec)


def fixed_replay(traces, family):
    result = []
    for episode, transitions in traces.items():
        base, _ = public_map({'grid': transitions[0]['before']})
        learner = Policy(reset=False); learner.mechanics = set(family.values())
        issued = exact = 0; singleton = None; jump_metrics = None
        for i, transition in enumerate(transitions, 1):
            before, action, after = (transition[k] for k in ('before', 'action', 'after'))
            prediction = learner.predict(base, position(before), action)
            issued += prediction is not None; exact += prediction is not None and prediction == after
            learner.observe(base, position(before), action, after)
            if singleton is None and len(learner.mechanics) == 1:
                singleton = i
            a, b = position(before), position(after)
            if jump_metrics is None and abs(a[0] - b[0]) + abs(a[1] - b[1]) == 2:
                jump_metrics = {'step': i, 'h0_compatible': len(filter_transition(family.values(), base, before, action, after)),
                                'prefix_compatible': len(learner.mechanics)}
        result.append({'episode': episode, 'queries': len(transitions), 'issued': issued, 'exact': exact,
                       'first_singleton_step': singleton, 'remaining': len(learner.mechanics),
                       'first_jump': jump_metrics})
    return result


def execute(out, spec, checking=False):
    active = {}; diagnostics = {}; traces = {}
    for label, family in FAMILIES.items():
        path = out / f'{label}.jsonl'
        sink = CheckingWriter(path) if checking else Writer(path)
        observer = Observer(sink, family.values())
        try:
            active[label] = active_core(observer, spec, family)
        finally:
            if not checking:
                sink.close()
        if checking:
            sink.finish()
        diagnostics[label] = observer.diagnostics; traces[label] = observer.traces
    fixed = {trajectory: {label: fixed_replay(trace, family) for label, family in FAMILIES.items()}
             for trajectory, trace in traces.items()}
    return {'active': active, 'first_observation_diagnostics': diagnostics,
            'fixed_trajectory_analysis': fixed,
            'scope': 'Local paired exploratory supplied-family runs; no primitive synthesis or external authentication'}


def run(out):
    out = Path(out); out.mkdir(exist_ok=False); (out / 'sources').mkdir()
    spec = {'format': 'R3_SYMMETRIC_PAIRED_V1',
        'families': {label: family for label, family in FAMILIES.items()},
        'collision': 'J1 destination only', 'prior': 'uniform over surviving candidates',
        'layout_seeds': [42, 43, 44], 'agent_seed': '1000+10*case_index+layout_index, same as R2',
        'horizon': 50, 'exploration_budget': 10, 'target': 4, 'reward_goal': 3,
        'true_cases': [name for name, _ in r2.TRUE_CASES],
        'population': '15 active episodes per family; no extra seed repetitions; fixed analyses reuse both recorded trajectories',
        'source_digests': {n: digest(Path(__file__).with_name(n).read_text()) for n in SOURCES}}
    (out / 'manifest.json').write_text(json.dumps(spec, indent=2))
    for name in SOURCES:
        (out / 'sources' / name).write_bytes(Path(__file__).with_name(name).read_bytes())
    report = execute(out, spec)
    (out / 'report.json').write_text(json.dumps(report, indent=2))
    return report


def verify(out):
    out = Path(out); spec = json.loads((out / 'manifest.json').read_text())
    expected_families = json.loads(json.dumps(FAMILIES))
    if spec['families'] != expected_families:
        raise ValueError('FAMILY_MISMATCH')
    for name, expected in spec['source_digests'].items():
        if digest(Path(__file__).with_name(name).read_text()) != expected or digest((out / 'sources' / name).read_text()) != expected:
            raise ValueError('SOURCE_MISMATCH')
    report = execute(out, spec, checking=True)
    if report != json.loads((out / 'report.json').read_text()):
        raise ValueError('REPORT_MISMATCH')
    return {'status': 'LOCAL_FULL_REPLAY_VERIFIED', 'active_episodes': 30, 'environment_actions': 1500,
            'fixed_trajectory_family_analyses': 60, 'authentication': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2]); (Path(sys.argv[2]) / 'verification.json').write_text(json.dumps(result, indent=2))
    else:
        report = run(sys.argv[1]); result = {k: v['summary'] for k, v in report['active'].items()}
    print(json.dumps(result, indent=2))
