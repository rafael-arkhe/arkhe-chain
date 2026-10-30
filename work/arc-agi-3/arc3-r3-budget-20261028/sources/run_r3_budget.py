"""Post-result exploratory budget comparison; original R3 sources unchanged."""
import json
from pathlib import Path
from run_r3_symmetric import SYMMETRIC, Observer, active_core
from run_p0_greedy import CheckingWriter
from micro_evaluation_evidence import Writer, digest

SOURCES = ('run_r3_budget.py', 'run_r3_symmetric.py', 'run_r2_extended.py',
           'run_p0_greedy.py', 'hidden_mechanics_micro.py', 'policy_contract_controls.py',
           'persistent_goal_pilot.py', 'prospective_policy_step.py', 'micro_evaluation_evidence.py')


def execute(out, manifest, checking=False):
    results = {}
    for budget in manifest['budgets']:
        spec = dict(manifest, exploration_budget=budget)
        path = out / f'budget-{budget}.jsonl'
        sink = CheckingWriter(path) if checking else Writer(path)
        observer = Observer(sink, SYMMETRIC.values())
        try:
            results[str(budget)] = active_core(observer, spec, SYMMETRIC)
        finally:
            if not checking:
                sink.close()
        if checking:
            sink.finish()
    pairs = []
    for a, b in zip(results['10']['results'], results['20']['results']):
        if a['episode'] != b['episode']:
            raise ValueError('UNPAIRED_EPISODES')
        pairs.append({'episode': a['episode'], 'singleton_step_10': a['first_singleton_step'],
                      'singleton_step_20': b['first_singleton_step'],
                      'failure_10': a['planning_failure'], 'failure_20': b['planning_failure'],
                      'terminal_marker_10': a['terminal_marker'], 'terminal_marker_20': b['terminal_marker'],
                      'arrival_10': a['arrival'], 'arrival_20': b['arrival'],
                      'stay_ratio_10': a['post_arrival_stay_ratio'], 'stay_ratio_20': b['post_arrival_stay_ratio']})
    return {'results': results, 'pairs': pairs,
            'scope': 'Budget 20 chosen after inspecting prior R3; local exploratory comparison, no external authentication'}


def run(out, layouts=(42, 43, 44)):
    out = Path(out); out.mkdir(exist_ok=False); (out / 'sources').mkdir()
    manifest = {'format': 'R3_BUDGET_EXPLORATORY_V1', 'budgets': [10, 20],
        'hypotheses': SYMMETRIC, 'layout_seeds': list(layouts),
        'horizon': 50, 'target': 4, 'reward_goal': 3, 'prior': 'uniform over surviving candidates',
        'seeds': '1000+10*case_index+layout_index, paired between budgets',
        'selection': 'Budget 20 selected after JUMP_ACTION2/layout42 failed budget 10 in prior R3',
        'source_digests': {n: digest(Path(__file__).with_name(n).read_text()) for n in SOURCES}}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    for name in SOURCES:
        (out / 'sources' / name).write_bytes(Path(__file__).with_name(name).read_bytes())
    report = execute(out, manifest)
    (out / 'report.json').write_text(json.dumps(report, indent=2))
    return report


def verify(out):
    out = Path(out); manifest = json.loads((out / 'manifest.json').read_text())
    if manifest['hypotheses'] != json.loads(json.dumps(SYMMETRIC)):
        raise ValueError('FAMILY_MISMATCH')
    for name, expected in manifest['source_digests'].items():
        if digest(Path(__file__).with_name(name).read_text()) != expected or digest((out / 'sources' / name).read_text()) != expected:
            raise ValueError('SOURCE_MISMATCH')
    report = execute(out, manifest, checking=True)
    if report != json.loads((out / 'report.json').read_text()):
        raise ValueError('REPORT_MISMATCH')
    return {'status': 'LOCAL_FULL_REPLAY_VERIFIED',
            'episodes': sum(r['summary']['episodes'] for r in report['results'].values()),
            'actions': sum(r['summary']['queries'] for r in report['results'].values()),
            'authentication': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2]); (Path(sys.argv[2]) / 'verification.json').write_text(json.dumps(result, indent=2))
    else:
        report = run(sys.argv[1]); result = {k: v['summary'] for k, v in report['results'].items()}
    print(json.dumps(result, indent=2))
