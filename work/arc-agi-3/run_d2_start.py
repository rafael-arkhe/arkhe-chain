"""Paired exploratory start intervention; no evaluator targets supplied to A1."""
import json
from pathlib import Path
from types import FunctionType
import run_d2_active as d2
from micro_evaluation_evidence import Writer, digest
from run_r3_symmetric import SYMMETRIC
from run_p0_greedy import CheckingWriter

STARTS = ((1,1), (2,2), (0,3))
SOURCES = ('run_d2_start.py', 'run_d2_active.py', 'history_family_diagnostic.py',
           'run_r3_symmetric.py', 'run_r2_extended.py', 'run_p0_greedy.py',
           'hidden_mechanics_micro.py', 'policy_contract_controls.py',
           'persistent_goal_pilot.py', 'prospective_policy_step.py', 'micro_evaluation_evidence.py')


class VisitObserver:
    def __init__(self, sink):
        self.sink = sink; self.visits = {}; self.action2_origins = []

    @property
    def previous(self):
        return self.sink.previous

    def append(self, payload):
        result = self.sink.append(payload)
        if payload['event'] == 'prediction_committed':
            observation = payload['before']; pos = d2.position(observation['grid'])
            self.visits.setdefault(pos, observation['step'])
            if payload['action'] == 'ACTION2':
                self.action2_origins.append({'before_step': observation['step'] + 1, 'position': list(pos)})
        elif payload['event'] == 'observation_recorded':
            observation = payload['after']; pos = d2.position(observation['grid'])
            self.visits.setdefault(pos, observation['step'])
        return result


def execute(out, manifest, checking=False):
    results = []
    for start in manifest['starts']:
        spec = dict(manifest, start=start)
        def make_environment():
            env = d2.J2Episode(); env.pos = tuple(start)
            return env
        dependencies = dict(d2.core.__globals__); dependencies['J2Episode'] = make_environment
        controller = FunctionType(d2.core.__code__, dependencies, 'paired_d2_controller')
        path = out / f'start-{start[0]}-{start[1]}.jsonl'
        sink = CheckingWriter(path) if checking else Writer(path)
        observer = VisitObserver(sink)
        try:
            report = controller(observer, spec)
        finally:
            if not checking:
                sink.close()
        if checking:
            sink.finish()
        results.append({'start': start, 'active_report': report,
            'visitation': {'V_A': (2,3) in observer.visits, 'V_B': (2,5) in observer.visits,
                          'first_visit_A': observer.visits.get((2,3)), 'first_visit_B': observer.visits.get((2,5)),
                          'distinct_positions': len(observer.visits)},
            'ACTION2_origins': observer.action2_origins})
    return {'results': results, 'episodes': len(results), 'actions': 50 * len(results),
            'scope': 'Exploratory fixed-policy seed-0 start comparison; no universal cause attribution or J2 identification'}


def run(out):
    out = Path(out); out.mkdir(exist_ok=False); (out/'sources').mkdir()
    manifest = {'format': 'D2_START_PAIRED_V1', 'starts': list(STARTS), 'agent_seed': 0,
        'target': 4, 'reward_goal': 3, 'horizon': 50, 'exploration_budget': 20,
        'family_digest': digest(SYMMETRIC), 'control': 'Same D2-A1 controller; environment start only changes',
        'source_digests': {n: digest(Path(__file__).with_name(n).read_text()) for n in SOURCES}}
    (out/'manifest.json').write_text(json.dumps(manifest, indent=2))
    for name in SOURCES:
        (out/'sources'/name).write_bytes(Path(__file__).with_name(name).read_bytes())
    report = execute(out, manifest)
    (out/'report.json').write_text(json.dumps(report, indent=2))
    return report


def verify(out):
    out = Path(out); manifest = json.loads((out/'manifest.json').read_text())
    if manifest['family_digest'] != digest(SYMMETRIC): raise ValueError('FAMILY_MISMATCH')
    for name, expected in manifest['source_digests'].items():
        if digest(Path(__file__).with_name(name).read_text()) != expected or digest((out/'sources'/name).read_text()) != expected:
            raise ValueError('SOURCE_MISMATCH')
    report = execute(out, manifest, checking=True)
    if report != json.loads((out/'report.json').read_text()): raise ValueError('REPORT_MISMATCH')
    return {'status': 'LOCAL_ACTIVE_AND_PASSIVE_REPLAY_VERIFIED', 'episodes': 3, 'actions': 150,
            'authentication': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2]); (Path(sys.argv[2])/'verification.json').write_text(json.dumps(result, indent=2))
    else:
        report = run(sys.argv[1]); result = [{'start': r['start'], 'visitation': r['visitation'],
            'criteria': r['active_report']['criteria'], 'remaining': r['active_report']['remaining_candidates']}
            for r in report['results']]
    print(json.dumps(result, indent=2))
