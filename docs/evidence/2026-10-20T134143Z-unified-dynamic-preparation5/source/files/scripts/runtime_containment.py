"""Create a non-executing, hash-bound plan for controlled runtime containment probes."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'config/runtime-containment-vectors.json'
SPECIFICATION = ROOT / 'docs/RUNTIME-CONTAINMENT.md'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_catalog(catalog):
    if catalog.get('schema') != 1 or catalog.get('execution_enabled') is not False:
        raise ValueError('this planner must never enable probe execution')
    if catalog.get('state') != 'SPECIFIED_NOT_EXECUTED':
        raise ValueError('catalog cannot claim execution results')
    limits = catalog['suite_limits']
    if limits['parallel_containers'] != 1 or not 1 <= limits['max_suite_seconds'] <= 180:
        raise ValueError('suite budget exceeds the controlled plan')
    if not 1 <= limits['max_probe_output_bytes'] <= 65536:
        raise ValueError('output budget exceeds limit')
    if not 1 <= limits['cleanup_timeout_seconds'] <= 15:
        raise ValueError('cleanup timeout exceeds limit')
    vectors = catalog['vectors']
    if not vectors:
        raise ValueError('missing vectors')
    seen = set()
    for vector in vectors:
        identity = vector['id']
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', identity) or identity in seen:
            raise ValueError('invalid or duplicate vector identity')
        seen.add(identity)
        if vector['profile'] not in ('build-current', 'resource-reduced'):
            raise ValueError('unknown profile')
        if not vector['procedure'] or not vector['oracle'] or not vector['expected']:
            raise ValueError('missing procedure or independent oracle')
        budget = vector['budget']
        if not 1 <= budget['wall_seconds'] <= 10:
            raise ValueError('invalid probe timeout')
        if any(key in budget and not 1 <= budget[key] <= 24 for key in
               ('attempts', 'spawn_attempts', 'children', 'threads', 'queries', 'messages', 'calls')):
            raise ValueError('unbounded process or network budget')
        if vector['profile'] == 'resource-reduced':
            if 'memory_attempt_bytes' in budget and not (
                    budget['memory_limit_bytes'] == 134217728 and
                    budget['swap_limit_bytes'] == 134217728 and
                    134217728 < budget['memory_attempt_bytes'] <= 201326592):
                raise ValueError('invalid memory experiment budget')
            if 'pids_limit' in budget and budget['pids_limit'] != 16:
                raise ValueError('invalid PID experiment budget')
            if 'cpu_limit' in budget and budget['cpu_limit'] != 0.5:
                raise ValueError('invalid CPU experiment budget')
    required_areas = {'preflight', 'network', 'filesystem', 'process', 'syscall', 'resources'}
    if {v['area'] for v in vectors} != required_areas:
        raise ValueError('missing or unknown probe area')
    return vectors


def create_plan(output):
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    vectors = validate_catalog(catalog)
    runtime = (ROOT / catalog['runtime_source']).resolve()
    if not runtime.is_relative_to(ROOT) or not runtime.is_file():
        raise ValueError('runtime source leaves workspace or is absent')
    image = None
    config = ROOT / catalog['image_configuration']
    if config.is_file():
        image = json.loads(config.read_text(encoding='utf-8')).get('image')
        if image is not None and not re.fullmatch('sha256:[0-9a-f]{64}', image):
            raise ValueError('image must be an immutable sha256 ID')
    output = output.resolve()
    if not output.is_relative_to(ROOT / 'docs/evidence'):
        raise ValueError('plans must be written under docs/evidence')
    output.mkdir(parents=True, exist_ok=False)
    plan = {
        'schema': 1, 'status': 'PLANNED', 'runtime_verified': False,
        'created_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'catalog_sha256': digest(CATALOG), 'specification_sha256': digest(SPECIFICATION),
        'runtime_source_sha256': digest(runtime), 'image_configured_not_inspected': image,
        'limits': catalog['suite_limits'],
        'vectors': [{**v, 'status': 'PLANNED'} for v in vectors],
        'pending': ['implement container-only probes and host-owned oracles',
                    'observe engine, mounts, seccomp profile and cgroup capabilities',
                    'execute paired controls and confirm cleanup in the dedicated VM'],
        'scope': 'Planning only. No engine, socket, subprocess or resource probe was executed.',
    }
    (output / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n', encoding='utf-8')
    lines = ['# Runtime containment plan', '', 'Status: PLANNED; runtime_verified=false.', '',
             '| Vector | Area | Profile | Status |', '| --- | --- | --- | --- |']
    lines.extend(f"| {v['id']} | {v['area']} | {v['profile']} | PLANNED |" for v in vectors)
    lines.extend(['', plan['scope']])
    (output / 'PLAN.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    (output / 'SHA256SUMS').write_text(''.join(
        digest(output / name) + '  ' + name + '\n' for name in ('plan.json', 'PLAN.md')), encoding='utf-8')
    print('PLANNED: ' + str(output / 'PLAN.md'))
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan'])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    create_plan(args.output)


if __name__ == '__main__':
    main()
