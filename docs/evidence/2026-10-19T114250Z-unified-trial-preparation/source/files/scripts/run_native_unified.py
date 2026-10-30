"""Run the native candidate observational adapter against an existing dedicated machine.

The draft contract is not promoted, and a trial stops at any unassessed gate.
"""
import argparse
import json
import time
import os
from pathlib import Path

from containment_probe import ROOT, write_json, manifest
from prepare_unified_runner import load
from runtime_containment import digest
from runtime_source_snapshot import verify
from unified_containment_runner import orchestrate, collect, RunJournal, validate_plan
from native_unified_adapter import NativeAdapter
from run_syscall_trial import provision


def claim_plan(plan, directory):
    validate_plan(plan)
    directory.mkdir(parents=True, exist_ok=True)
    with (directory/(plan['run_id']+'.json')).open('xb') as stream:
        stream.write((json.dumps({'run_id':plan['run_id'], 'source_snapshot_sha256':plan['source_snapshot_sha256']})+'\n').encode())
        stream.flush()
        os.fsync(stream.fileno())


def run(preparation, output, machine, mode):
    preparation, output = preparation.resolve(), output.resolve()
    if (not preparation.is_relative_to(ROOT/'docs/evidence') or not output.is_relative_to(ROOT/'docs/evidence')
            or output.exists()):
        raise ValueError('workspace preparation and new evidence output required')
    plan = load(preparation/'plan.json')
    validate_plan(plan)
    snapshot = preparation/'source/snapshot.json'
    if digest(snapshot) != plan['source_snapshot_sha256']:
        raise ValueError('snapshot binding mismatch')
    verify_sources = lambda: verify(ROOT, snapshot)
    verify_sources()
    # Constructor rejects non-dedicated names before provision can touch cgroups.
    adapter = NativeAdapter(output, machine, plan['image'])
    claim_plan(plan, ROOT/'ops/local/containment-vm/execution-claims')
    journal = RunJournal(output/'journal', plan['run_id'])
    if mode == 'trial':
        # Provisioning is inside the try/finally lifecycle below via a fixed adapter.
        original = adapter.preflight
        def preflight(p, deadline):
            provision(machine)
            return original(p, deadline)
        adapter.preflight = preflight
        result = orchestrate(plan, adapter, verify_sources, journal)
    else:
        receipts, cleanup, errors = [], None, []
        deadline = time.monotonic()+180
        unchanged = False
        try:
            provision(machine)
            adapter.preflight(plan, deadline-30)
            journal('preflight', {'mode': 'identity-smoke', 'run_id': plan['run_id']})
            verify_sources()
            receipt = adapter.execute(plan, plan['requests'][0], min(deadline-30, time.monotonic()+30))
            receipts.append(receipt)
            journal('receipt', receipt)
            verify_sources()
            unchanged = True
        except Exception as error:
            errors.append(str(error))
        finally:
            try:
                cleanup = adapter.cleanup(plan, deadline)
                journal('cleanup', cleanup)
            except Exception as error:
                errors.append('cleanup: '+str(error))
        result = collect(plan, receipts, cleanup, unchanged)
        result['errors'].extend(errors)
        result.update(mode='identity-smoke', identity_status=receipts[0]['status'] if receipts else 'ERROR')
        journal('result', result)
    result['native_trial'] = 'results.json'
    write_json(output/'unified-results.json', result)
    # Trial.finish wrote a lifecycle report; add a separate orchestration report.
    (output/'UNIFIED-REPORT.md').write_text(
        '# Adaptador nativo unificado\n\n'
        f"Modo: {mode}. Estado: {result['status']}. Receipts: {result['receipt_count']}/22.\n\n"
        'sealed=false; runtime_verified=false. Cobertura dinâmica completa do Seccomp '
        'e revisão dos filtros herdados permanecem obrigatórias.\n\n'
        + '\n'.join('- '+e for e in result['errors'])+'\n', encoding='utf-8')
    manifest(output)
    print(json.dumps(result, indent=2))
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--preparation', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--machine', default='arkhe-containment')
    p.add_argument('--mode', choices=('smoke', 'trial'), default='smoke')
    a = p.parse_args()
    result = run(a.preparation, a.output, a.machine, a.mode)
    # A smoke can succeed as a smoke without representing completion of the suite.
    return 0 if a.mode == 'smoke' and result.get('identity_status') == 'PASS' and len(result['errors']) == 1 else 1


if __name__ == '__main__':
    raise SystemExit(main())
