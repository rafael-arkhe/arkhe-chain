"""Candidate-specific assessments; legacy EPERM/getppid-deny expectations stay intact."""
import json
from containment_probe import no_duplicates, reject_constant
from containment_mounts import evaluate_cases
from run_containment_trial import assess
from run_resource_trial import LIMITS, assess_resource
from mount_manifest import parse_mountinfo


def inventory_matches(observed, oracle):
    """Only cgroup namespace-relative root is translated; every other field is exact."""
    try:
        inside, outside = parse_mountinfo(observed), parse_mountinfo(oracle['mountinfo'])
        a, b = inside['/sys/fs/cgroup'], outside['/sys/fs/cgroup']
        membership = [line[3:] for line in oracle['membership'].splitlines() if line.startswith('0::')]
        if len(membership) != 1 or a['filesystem'] != 'cgroup2' or b['filesystem'] != 'cgroup2':
            return False
        if a['root'] == '/' and b['root'] == membership[0]:
            a['root'] = b['root']
        return inside == outside
    except (KeyError, ValueError, TypeError):
        return False


def baseline(oracle):
    try:
        fields = dict(line.split(':', 1) for line in oracle['status'].splitlines() if ':' in line)
        return (fields.get('CapEff', '').strip() == '0000000000000000'
            and fields.get('NoNewPrivs', '').strip() == '1'
            and fields.get('Seccomp', '').strip() == '2'
            and oracle['namespaces']['mnt'] != oracle['observer_namespaces']['mnt']
            and oracle['membership'] != oracle['observer_membership']
            and all(oracle['cgroup'].get(k, '').strip() == v for k, v in LIMITS.items()))
    except (KeyError, TypeError, AttributeError):
        return False


def evaluate(vector, observation, before, after, request, sentinel, resource=None):
    if not baseline(before) or not baseline(after):
        return 'FAIL'
    if any(before[k] != after[k] for k in ('container_id', 'host_pid', 'boot_id', 'namespaces', 'membership')):
        return 'ERROR'
    if vector.endswith('-bounded'):
        return assess_resource(vector, before, resource, observation)
    if observation is None or observation.get('state') != 'OBSERVED':
        return 'ERROR'
    if vector == 'mount-inventory':
        return 'PASS' if inventory_matches(observation['observations'], before) else 'FAIL'
    if vector == 'cgroup-enforcement':
        # The probe does not report swap; the external baseline above checks it.
        expected = {k: v for k, v in LIMITS.items() if k != 'memory.swap.max'}
        return 'PASS' if all(k+'='+v in observation['observations'] for k, v in expected.items()) else 'FAIL'
    if vector == 'mount-capability':
        if before['mountinfo'] != after['mountinfo']:
            return 'FAIL'
        return evaluate_cases(observation, expected_errno=133)
    if vector == 'ffi-control':
        try:
            data = json.loads(observation['observations'], object_pairs_hook=no_duplicates, parse_constant=reject_constant)
        except (TypeError, ValueError):
            return 'ERROR'
        keys = {'arch', 'rust_pid', 'libc_pid', 'raw_pid', 'getppid', 'getppid_errno'}
        if not isinstance(data, dict) or set(data) != keys or any(type(data[k]) is not int for k in keys - {'arch'}):
            return 'ERROR'
        # Held init is PID 1; the child probe is a positive FFI control, not PID 1.
        return 'PASS' if (data['arch'] == 'x86_64' and data['rust_pid'] > 1
                          and data['libc_pid'] == data['rust_pid'] == data['raw_pid']
                          and data['getppid'] == 1 and data['getppid_errno'] == 0) else 'FAIL'
    if vector == 'seccomp-inventory':
        # Mode 2 and the candidate load are not dynamic coverage of 360 cases.
        return 'UNASSESSED'
    return assess(vector, observation, before, sentinel)
