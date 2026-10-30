"""Sequential orchestration core. Runtime adapters must supply independent evidence.

This module does not reinterpret historical trial results as unified receipts.
The native observational adapter does not grant production admission.
"""
import secrets
import re
import os
from pathlib import Path
import time
from uuid import uuid4

from runtime_source_snapshot import canonical, sha


class RunJournal:
    """Exclusive, fsync'd hash-linked events. Hash chaining is not a signature."""
    def __init__(self, folder, run_id):
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=False)
        self.run_id, self.ordinal, self.previous = run_id, 0, None

    def __call__(self, event, payload):
        value = {'schema': 1, 'run_id': self.run_id, 'ordinal': self.ordinal,
                 'previous_sha256': self.previous, 'event': event, 'payload': payload}
        data = canonical(value)
        with (self.folder / f'{self.ordinal:04d}.json').open('xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        self.previous = sha(data)
        self.ordinal += 1

VECTORS = (
    'identity', 'cgroup-enforcement', 'mount-inventory',
    'image-read-control', 'writable-control', 'input-read-control', 'input-write',
    'image-write', 'outside-mount-canary', 'traversal-and-symlink', 'tmp-noexec',
    'socket-local-control', 'tcp-egress', 'udp-egress', 'dns-egress',
    'subprocess-control', 'ffi-control', 'mount-capability', 'seccomp-inventory',
    'memory-bounded', 'cpu-bounded', 'pids-bounded',
)
SUBCHECKS = {v: ('observation', 'external-oracle') for v in VECTORS}
SUBCHECKS.update({
    'mount-inventory': ('mounts', 'devices', 'source-bindings', 'masks', 'unchanged'),
    'mount-capability': ('mount', 'umount2', 'pivot_root', 'errno-133', 'unchanged'),
    'seccomp-inventory': ('candidate-load', 'abi', 'all-rule-cases', 'inherited-filter-review'),
    'memory-bounded': ('effective-limits', 'oom-kill-delta', 'exit-137'),
    'cpu-bounded': ('effective-limits', 'bounded-load', 'throttling-delta'),
    'pids-bounded': ('effective-limits', 'eagain', 'pids-event-delta', 'reaped'),
})
for _v in ('tcp-egress', 'udp-egress', 'dns-egress'):
    SUBCHECKS[_v] = ('positive-before', 'blocked-local', 'no-egress-nonce', 'positive-after', 'oracle-continuity')


def make_plan(contract, source_digest, image, probe_digest):
    if contract['target_profile']['memory_bytes'] != 134217728:
        raise ValueError('unsupported candidate resource profile')
    return {'schema': 1, 'kind': 'unified-containment-plan', 'run_id': str(uuid4()),
            'contract_sha256': sha(canonical(contract)), 'source_snapshot_sha256': source_digest,
            'image': image, 'probe_binary_sha256': probe_digest,
            'profile': contract['target_profile'], 'runtime': contract['runtime'],
            'runtime_verified': False, 'sealed': False,
            'requests': [{'vector_id': v, 'ordinal': i, 'nonce': secrets.token_hex(32),
                          'required_subchecks': list(SUBCHECKS[v])} for i, v in enumerate(VECTORS)]}


def context(plan):
    return {k: plan[k] for k in ('run_id', 'contract_sha256', 'source_snapshot_sha256',
                                'image', 'probe_binary_sha256', 'profile', 'runtime')}


def validate_plan(plan):
    if not isinstance(plan.get('run_id'), str) or not re.fullmatch('[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', plan['run_id']):
        raise ValueError('invalid run UUID')
    for field in ('contract_sha256', 'source_snapshot_sha256', 'probe_binary_sha256'):
        if not isinstance(plan.get(field), str) or not re.fullmatch('[0-9a-f]{64}', plan[field]):
            raise ValueError('invalid plan digest: '+field)
    if not isinstance(plan.get('image'), str) or not re.fullmatch('sha256:[0-9a-f]{64}', plan['image']):
        raise ValueError('immutable image required')
    if plan.get('sealed') is not False or plan.get('runtime_verified') is not False:
        raise ValueError('observational plan cannot declare a seal or runtime approval')
    requests = plan.get('requests', [])
    if len(requests) != 22 or [r.get('vector_id') for r in requests] != list(VECTORS):
        raise ValueError('plan must contain the exact ordered 22-vector catalog')
    nonces = set()
    for i, request in enumerate(requests):
        nonce = request.get('nonce')
        if request.get('ordinal') != i or request.get('required_subchecks') != list(SUBCHECKS[VECTORS[i]]):
            raise ValueError('plan sequence or mandatory subchecks changed')
        if not isinstance(nonce, str) or not re.fullmatch('[0-9a-f]{64}', nonce) or nonce in nonces:
            raise ValueError('invalid or duplicate plan nonce')
        nonces.add(nonce)


def validate_receipt(plan, request, receipt):
    if not isinstance(receipt, dict) or receipt.get('context') != context(plan):
        raise ValueError('receipt from another run, source, image, binary, profile or runtime')
    for key in ('vector_id', 'ordinal', 'nonce'):
        if receipt.get(key) != request[key]:
            raise ValueError('receipt replay or sequence mismatch')
    if receipt.get('status') != 'PASS':
        raise ValueError('missing, failing or unassessed vector')
    checks = receipt.get('subchecks')
    if not isinstance(checks, dict) or set(checks) != set(request['required_subchecks']):
        raise ValueError('missing or unexpected subchecks')
    for check in checks.values():
        if not isinstance(check, dict) or check.get('status') != 'PASS':
            raise ValueError('nonpassing subcheck')
        # Adapter has to return the evidence bytes, not a probe-supplied PASS.
        evidence = check.get('evidence')
        if not isinstance(evidence, str) or not evidence or sha(evidence.encode()) != check.get('sha256'):
            raise ValueError('missing or corrupt subcheck evidence')
    if receipt.get('target_removed') is not True:
        raise ValueError('target removal not confirmed')


def collect(plan, receipts, cleanup, sources_unchanged):
    errors = []
    try:
        validate_plan(plan)
    except (ValueError, TypeError, KeyError) as error:
        errors.append(str(error))
    if len(receipts) != len(VECTORS):
        errors.append('expected exactly 22 ordered receipts')
    for request, receipt in zip(plan['requests'], receipts):
        try:
            validate_receipt(plan, request, receipt)
        except (ValueError, TypeError, KeyError) as error:
            errors.append(str(error))
    if sources_unchanged is not True:
        errors.append('source changed or was not revalidated')
    if not isinstance(cleanup, dict) or cleanup.get('context') != context(plan) or any(
        cleanup.get(key) is not True for key in ('targets_removed', 'auxiliaries_removed', 'lease_released', 'tracers_stopped')
    ):
        errors.append('cleanup incomplete or unrelated to this run')
    elif cleanup.get('errors'):
        errors.append('cleanup evidence errors: '+str(cleanup['errors']))
    # Even a complete adapter run is an evidence collection, never an automatic seal.
    return {'schema': 1, 'run_id': plan['run_id'], 'status': 'INCOMPLETE' if errors else 'OBSERVATIONS_COMPLETE',
            'runtime_verified': False, 'sealed': False, 'receipt_count': len(receipts), 'errors': errors,
            'scope': 'adapter receipts require independent semantic review; no automatic runtime approval'}


def orchestrate(plan, adapter, verify_sources, persist, clock=time.monotonic):
    """One target at a time, bounded deadlines, finally cleanup even after a failure.

    adapter.execute must enforce its absolute deadline and kill the exact owned
    target on expiry; a Python timeout alone cannot terminate a remote container.
    persist must write an append-only run journal. No adapter is loaded from user input.
    """
    receipts, cleanup, failures = [], None, []
    deadline = clock() + 900
    unchanged = False
    try:
        validate_plan(plan)
        verify_sources()
        adapter.preflight(plan, deadline - 30)
        persist('preflight', {'run_id': plan['run_id']})
        for request in plan['requests']:
            verify_sources()
            if clock() >= deadline - 30:
                raise TimeoutError('suite deadline; reserve cleanup')
            # Resource load itself is capped at eight seconds by the adapter;
            # its external snapshots, capture and teardown share the vector budget.
            timeout = 90 if request['vector_id'] == 'socket-local-control' else 60 if request['vector_id'] == 'seccomp-inventory' else 30
            receipt = adapter.execute(plan, request, min(deadline - 30, clock() + timeout))
            persist('receipt', receipt)
            receipts.append(receipt)
            validate_receipt(plan, request, receipt)
        verify_sources()
        unchanged = True
    except Exception as error:
        failures.append(str(error))
    finally:
        try:
            cleanup = adapter.cleanup(plan, deadline)
            persist('cleanup', cleanup)
        except Exception as error:
            failures.append('cleanup: ' + str(error))
    result = collect(plan, receipts, cleanup, unchanged)
    result['errors'].extend(failures)
    if result['errors']:
        result['status'] = 'INCOMPLETE'
    persist('result', result)
    return result
