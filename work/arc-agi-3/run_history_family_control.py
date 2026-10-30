"""Passive two-transition witness, not a continuous agent-generated episode."""
import json
from pathlib import Path
from hidden_mechanics_micro import render, advance
from history_family_diagnostic import HistoryDiagnostic, j2_jump_position
from micro_evaluation_evidence import Writer, digest
from run_r3_symmetric import SYMMETRIC
from run_p0_greedy import CheckingWriter

SOURCES = ('run_history_family_control.py', 'history_family_diagnostic.py',
           'run_r3_symmetric.py', 'run_r2_extended.py', 'run_p0_greedy.py',
           'policy_contract_controls.py', 'hidden_mechanics_micro.py',
           'persistent_goal_pilot.py', 'prospective_policy_step.py', 'micro_evaluation_evidence.py')


def core(writer, manifest):
    writer.append({'event': 'manifest', 'digest': digest(manifest)})
    base = [[0] * 8 for _ in range(8)]; base[3][3] = 2
    base[0][0] = 3; base[7][7] = 4
    results = {}
    for name in ('J2_WITNESS', 'J1_COMPATIBLE_CONTROL'):
        diagnostic = HistoryDiagnostic(); records = []
        for label, position in (('A', (2, 3)), ('B', (2, 5))):
            destination = (j2_jump_position(base, position, (2, 0)) if name == 'J2_WITNESS'
                           else advance(base, position, (2, 0)))
            before = render(base, position); after = render(base, destination)
            row = diagnostic.observe(base, before, 'ACTION1', after)
            writer.append({'event': 'offline_constraint', 'case': name, 'position_label': label,
                           'base': base, 'before': before, 'action': 'ACTION1', 'after': after,
                           'diagnostic': row})
            records.append(row)
        # Refilter from scratch to independently check incremental conjunction/order.
        reverse = HistoryDiagnostic()
        for position in ((2, 5), (2, 3)):
            destination = (j2_jump_position(base, position, (2, 0)) if name == 'J2_WITNESS'
                           else advance(base, position, (2, 0)))
            reverse.observe(base, render(base, position), 'ACTION1', render(base, destination))
        if reverse.remaining != diagnostic.remaining:
            raise ValueError('ORDER_DEPENDENT_CONJUNCTION')
        results[name] = {'observations': records, 'final_candidates': len(diagnostic.remaining),
                         'reverse_order_same_set': True}
    return {'cases': results, 'constraints': 4, 'environment_actions': 0,
            'final_head': writer.previous,
            'scope': 'Passive constructed observations in two supplied positions; no active navigation or online temporal commitment claim'}


def run(out):
    out = Path(out); out.mkdir(exist_ok=False); (out / 'sources').mkdir()
    manifest = {'format': 'HISTORY_CONJUNCTION_PASSIVE_V1',
        'family_digest': digest(SYMMETRIC), 'family_size': 600,
        'wall': [3, 3], 'A': [2, 3], 'B': [2, 5], 'action': 'ACTION1', 'jump': [2, 0],
        'semantics': 'J2 requires free intermediate and destination; blocked intermediate means stay',
        'scope': 'Controlled positions, no path or agent exploration; one true effect specified, not a whole inferred J2 action mapping',
        'source_digests': {n: digest(Path(__file__).with_name(n).read_text()) for n in SOURCES}}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    for name in SOURCES:
        (out / 'sources' / name).write_bytes(Path(__file__).with_name(name).read_bytes())
    writer = Writer(out / 'events.jsonl')
    try:
        report = core(writer, manifest)
    finally:
        writer.close()
    (out / 'report.json').write_text(json.dumps(report, indent=2))
    return report


def verify(out):
    out = Path(out); manifest = json.loads((out / 'manifest.json').read_text())
    if manifest['family_digest'] != digest(SYMMETRIC):
        raise ValueError('FAMILY_MISMATCH')
    for name, expected in manifest['source_digests'].items():
        if digest(Path(__file__).with_name(name).read_text()) != expected or digest((out / 'sources' / name).read_text()) != expected:
            raise ValueError('SOURCE_MISMATCH')
    writer = CheckingWriter(out / 'events.jsonl'); report = core(writer, manifest); writer.finish()
    if report != json.loads((out / 'report.json').read_text()):
        raise ValueError('REPORT_MISMATCH')
    return {'status': 'LOCAL_PASSIVE_CONSTRAINTS_REPLAY_VERIFIED', 'constraints': 4,
            'environment_actions': 0, 'authentication': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2]); (Path(sys.argv[2]) / 'verification.json').write_text(json.dumps(result, indent=2))
    else:
        result = run(sys.argv[1])
    print(json.dumps(result, indent=2))
