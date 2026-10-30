"""Candidate-specific assessments; legacy EPERM/getppid-deny expectations stay intact."""
import hashlib
import json
import struct
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


def control_baseline(oracle):
    """The paired control keeps hardening but runs without the candidate filter."""
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
        # Dynamic rule coverage is evaluated in seccomp_dynamic below.
        return 'UNASSESSED'
    return assess(vector, observation, before, sentinel)


def _observed(report):
    if not isinstance(report, dict) or not isinstance(report.get('cases'), list):
        raise ValueError('invalid dynamic seccomp report')
    result = {}
    for item in report['cases']:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or item['id'] in result:
            raise ValueError('invalid dynamic seccomp case')
        result[item['id']] = item
    return result


def _same_behavior(target, control):
    return ((target['r'] >= 0) == (control['r'] >= 0)
            and target['e'] == control['e'] and target.get('x', 0) == control.get('x', 0)
            and target.get('s', 0) == control.get('s', 0))


def _bpf_action(program, arch, number, operands):
    instructions = [struct.unpack_from('<HBBI', program, offset)
                    for offset in range(0, len(program), 8)]
    data = {0: number & 0xffffffff, 4: arch}
    for index, operand in enumerate(operands):
        data[16 + 8 * index] = operand & 0xffffffff
    accumulator, pc = 0, 0
    for _ in range(10000):
        if not 0 <= pc < len(instructions):
            raise ValueError('BPF program counter escaped')
        code, jump_true, jump_false, value = instructions[pc]
        if code == 0x20:
            accumulator = data.get(value, 0)
        elif code == 0x15:
            pc += (jump_true if accumulator == value else jump_false) + 1
            continue
        elif code == 0x35:
            pc += (jump_true if accumulator >= value else jump_false) + 1
            continue
        elif code == 0x06:
            if value == 0x7fff0000:
                return 'ALLOW', 0
            if value & 0xffff0000 == 0x00050000:
                return 'ERRNO', value & 0xffff
            if value in (0, 0x80000000):
                return 'KILL', 0
            return 'UNKNOWN', value
        else:
            raise ValueError('unsupported BPF opcode')
        pc += 1
    raise ValueError('BPF program did not terminate')


def _case_action(program, case):
    arch = 0x40000003 if case['handling'] == 'i386' else 0xc000003e
    operands = [int(value) for value in case.get('operands', [0] * 6)]
    return _bpf_action(program, arch, case['number'], operands)


def seccomp_dynamic(target, control, cases, rules, load, program):
    """Compare candidate cases with an unconfined control; never emits a seal."""
    observed, oracle_map = _observed(target), _observed(control)
    failures, covered = [], set()
    expected_by_rule = {rule['id']: rule for rule in rules}
    for case in cases:
        identifier, rule_id = case['id'], case['rule_id']
        if identifier not in observed or identifier not in oracle_map:
            failures.append({'case': identifier, 'reason': 'missing target or control result'})
            continue
        candidate, oracle = observed[identifier], oracle_map[identifier]
        try:
            action, errno = _case_action(program, case)
        except ValueError as error:
            failures.append({'case': identifier, 'reason': str(error)})
            continue
        if action == 'ERRNO':
            passed = candidate.get('r') == -1 and candidate.get('e') == errno
        elif action == 'KILL':
            passed = candidate.get('s') == 31 and oracle.get('s') != 31
        elif action == 'ALLOW':
            passed = not candidate.get('s') and _same_behavior(candidate, oracle)
        else:
            passed = False
        if passed:
            covered.add(rule_id)
        else:
            failures.append({'case': identifier, 'rule': rule_id,
                             'target': candidate, 'control': oracle,
                             'filter_action': action, 'filter_errno': errno})
    missing = sorted(set(expected_by_rule) - covered)
    covered_rules = covered & set(expected_by_rule)
    all_rule_cases = {
        'status': 'PASS' if not failures and not missing else 'FAIL',
        'rule_count': len(expected_by_rule),
        'covered_rule_count': len(covered_rules),
        'missing_rules': missing[:32],
        'case_failures': failures[:64],
        'cases_executed': len(observed),
        'filter_attribution': 'offline candidate BPF evaluated for each case; target result must match the action',
    }
    abi_cases = {c['id']: c for c in cases if c['rule_id'] == 'abi'}
    i386 = observed.get('abi-i386-getpid', {})
    i386_control = oracle_map.get('abi-i386-getpid', {})
    x32 = observed.get('abi-x32-getpid', {})
    x32_control = oracle_map.get('abi-x32-getpid', {})
    abi = {
        'status': 'PASS' if (i386.get('s') == 31 and i386_control.get('r', -1) > 0
                             and x32.get('s') == 31 and x32_control.get('r', -1) > 0
                             and observed.get('abi-unknown', {}).get('e') == 38) else 'FAIL',
        'i386_target': i386, 'i386_control': i386_control,
        'x32_target': x32, 'x32_control': x32_control,
        'unknown_number_target': observed.get('abi-unknown'),
        'required_cases': sorted(abi_cases),
    }
    events = load.get('events', []) if isinstance(load, dict) else []
    program_sha256 = hashlib.sha256(program).hexdigest()
    event_sha256 = events[0].get('bpf_sha256') if events and isinstance(events[0], dict) else None
    candidate_load = {
        'status': 'PASS' if (isinstance(load, dict)
                             and load.get('state') == 'CANDIDATE_LOAD_ACCEPTED_OBSERVED'
                             and load.get('candidate_bytes_match') is True
                             and len(events) == 1
                             and load.get('program_sha256') == program_sha256 == event_sha256) else 'FAIL',
        'state': load.get('state') if isinstance(load, dict) else None,
        'candidate_bytes_match': load.get('candidate_bytes_match') if isinstance(load, dict) else None,
        'load_events': len(events),
        'program_sha256': program_sha256,
        'event_bpf_sha256': event_sha256,
    }
    inherited = {
        'status': 'PASS' if (target.get('seccomp') == 2 and target.get('seccomp_filters') == 2
                             and control.get('seccomp') == 2 and control.get('seccomp_filters') == 1
                             and target.get('seccomp_filters') == control.get('seccomp_filters') + 1
                             and target.get('no_new_privs') == 1
                             and target.get('cap_eff') == '0000000000000000'
                             and candidate_load['status'] == 'PASS') else 'FAIL',
        'target_seccomp_mode': target.get('seccomp'),
        'target_filter_count': target.get('seccomp_filters'),
        'target_no_new_privs': target.get('no_new_privs'),
        'target_cap_eff': target.get('cap_eff'),
        'control_seccomp_mode': control.get('seccomp'),
        'control_filter_count': control.get('seccomp_filters'),
        'candidate_load_status': candidate_load['status'],
        'filter_chain_scope': 'runtime baseline present in both target and control; candidate contributes exactly one additional filter whose bytes match the offline artifact; no post-load byte dump',
    }
    verdict = 'PASS' if all(item['status'] == 'PASS' for item in
                            (candidate_load, abi, all_rule_cases, inherited)) else 'FAIL'
    return {'status': verdict, 'candidate_load': candidate_load, 'abi': abi,
            'all_rule_cases': all_rule_cases, 'inherited_filter_review': inherited}
