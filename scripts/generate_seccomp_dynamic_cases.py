"""Expand the sealed seccomp rule manifest into fixed, safe dynamic cases.

The table is an input to the containment probe. It never executes syscalls
itself and never grants authority. Every case is a single raw syscall with
fixed operands; children are isolated by the probe.
"""
import argparse
import hashlib
import json
from pathlib import Path

from containment_probe import ROOT

DEFAULT = (2**64 - 1,) * 6
SPECIAL = {
    'exit': ([42, 0, 0, 0, 0, 0], 'exit'),
    'exit_group': ([42, 0, 0, 0, 0, 0], 'exit'),
    'fork': ([0, 0, 0, 0, 0, 0], 'fork'),
    'vfork': ([0, 0, 0, 0, 0, 0], 'fork'),
    'clone': ([17, 0, 0, 0, 0, 0], 'fork'),
    'alarm': ([0, 0, 0, 0, 0, 0], 'raw'),
    'pause': ([0, 0, 0, 0, 0, 0], 'pause'),
    'rt_sigsuspend': ([0, 0, 0, 0, 0, 0], 'rt_sigsuspend'),
    'rt_sigreturn': ([0, 0, 0, 0, 0, 0], 'rt_sigreturn'),
}
RULE_ACTIONS = {'SCMP_ACT_ALLOW': 'ALLOW', 'SCMP_ACT_ERRNO': 'ERRNO'}
DEFAULT_ERRNO = 38


def matches(rule, operands):
    for arg in rule.get('args', []):
        value = operands[arg['index']]
        if arg['op'] == 'SCMP_CMP_EQ' and value != arg['value']:
            return False
        if arg['op'] == 'SCMP_CMP_NE' and value == arg['value']:
            return False
    return True


def expected_for(number, operands, rules):
    candidates = [rule for rule in rules if rule['number'] == number and matches(rule, operands)]
    denied = [rule for rule in candidates if rule['action'] == 'SCMP_ACT_ERRNO']
    if denied:
        return 'ERRNO', denied[0]['errnoRet']
    if candidates:
        return 'ALLOW', 0
    return 'ERRNO', DEFAULT_ERRNO


def case(case_id, rule_id, number, operands, rules, handling='raw', variant=''):
    action, errno = expected_for(number, operands, rules)
    return {'id': case_id, 'rule_id': rule_id, 'number': number, 'expected': action,
            'errno': errno, 'operands': list(operands), 'handling': handling, 'variant': variant}


def base_cases(rules):
    cases = []
    for rule in rules:
        number, name = rule['number'], rule['name']
        operands, handling = SPECIAL.get(name, (DEFAULT, 'raw'))
        if rule.get('args'):
            if name == 'personality':
                continue
            if name == 'socket':
                continue
            raise ValueError('no reviewed operand generator for argument rule: ' + name)
        cases.append(case(rule['id'], rule['id'], number, operands, rules, handling))
    return cases


def personality_cases(rules):
    personality = [rule for rule in rules if rule['name'] == 'personality']
    values = sorted({arg['value'] for rule in personality for arg in rule['args']})
    values += [0, 1, 7, 8, 9, 0x1ffff, 0x20000, 0x20001, 0x20008, 0xffffffff]
    values = sorted(set(values))
    cases = []
    by_value = {arg['value']: rule['id'] for rule in personality for arg in rule['args']}
    for value in values:
        operands = [value, 0, 0, 0, 0, 0]
        rule_id = by_value.get(value, 'personality-complement')
        cases.append(case(f'personality-{value}', rule_id, 135, operands, rules, variant=f'value={value}'))
    return cases


def socket_cases(rules):
    domains = [0, 1, 15, 16, 17, 39, 40, 41]
    protocols = [0, 8, 9, 10]
    cases = []
    for domain in domains:
        for protocol in protocols:
            operands = [domain, 0, protocol, 0, 0, 0]
            if domain == 40:
                rule_id = 'baseline-31-socket'
            elif domain == 16 and protocol == 9:
                rule_id = 'baseline-32-socket'
            elif domain == 16:
                rule_id = 'baseline-33-socket'
            else:
                rule_id = 'baseline-34-socket'
            cases.append(case(f'socket-{domain}-{protocol}', rule_id, 41, operands, rules,
                              variant=f'domain={domain},protocol={protocol}'))
    return cases


def abi_cases():
    return [
        {'id': 'abi-i386-getpid', 'rule_id': 'abi', 'number': 20, 'expected': 'KILL', 'errno': 0,
         'operands': [0, 0, 0, 0, 0, 0], 'handling': 'i386', 'variant': 'int 0x80'},
        {'id': 'abi-x32-getpid', 'rule_id': 'abi', 'number': 0x40000027, 'expected': 'KILL',
         'errno': 0, 'operands': [0, 0, 0, 0, 0, 0], 'handling': 'x32', 'variant': 'x32 bit'},
        {'id': 'abi-unknown', 'rule_id': 'abi', 'number': 999, 'expected': 'ERRNO', 'errno': 38,
         'operands': [0, 0, 0, 0, 0, 0], 'handling': 'raw', 'variant': 'unlisted number'},
    ]


def render(cases):
    lines = []
    for item in sorted(cases, key=lambda c: c['id']):
        fields = [item['id'], item['rule_id'], str(item['number']), item['expected'], str(item['errno']),
                  *[str(value) for value in item['operands']], item['handling'], item['variant']]
        if any('|' in field or '\n' in field for field in fields):
            raise ValueError('case field cannot contain pipe or newline')
        lines.append('|'.join(fields))
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rules', type=Path, default=ROOT/'config/seccomp/arkhe-unified-x86_64-v1/rules.json')
    parser.add_argument('--output', type=Path, default=ROOT/'config/seccomp/arkhe-unified-x86_64-v1/dynamic-cases.txt')
    args = parser.parse_args()
    rules = json.loads(args.rules.read_text(encoding='utf-8'))['rules']
    cases = base_cases(rules) + personality_cases(rules) + socket_cases(rules) + abi_cases()
    ids = [item['id'] for item in cases]
    if len(ids) != len(set(ids)):
        raise ValueError('duplicate dynamic case id')
    covered = {item['rule_id'] for item in cases}
    names = {rule['name'] for rule in rules}
    covered_names = {item['rule_id'] for item in cases if item['rule_id'] in names}
    missing = sorted(rule['id'] for rule in rules
                     if rule['id'] not in covered and rule['name'] not in covered_names)
    if missing:
        raise ValueError('rules without a dynamic case: ' + ', '.join(missing[:5]))
    for rule in rules:
        if rule.get('args') and rule['name'] == 'personality':
            value = rule['args'][0]['value']
            if not any(item['number'] == rule['number'] and item['operands'][0] == value
                       and item['expected'] == RULE_ACTIONS[rule['action']] for item in cases):
                raise ValueError('personality rule lacks an exact case: ' + rule['id'])
    covered_ids = {rule['id'] for rule in rules
                   if rule['id'] in covered or rule['name'] in covered_names}
    text = render(cases)
    args.output.write_text(text, encoding='utf-8')
    manifest = {
        'schema': 1,
        'state': 'DYNAMIC_CASES_STATIC_NOT_EXECUTED',
        'runtime_verified': False,
        'rules_sha256': hashlib.sha256(args.rules.read_bytes()).hexdigest(),
        'case_file_sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
        'case_count': len(cases),
        'rule_count': len(rules),
        'covered_rule_count': len(covered_ids),
        'abi_case_count': len(abi_cases()),
        'unsupported_rule_cases': [],
    }
    (args.output.with_suffix('.json')).write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(args.output), **manifest}, indent=2))


if __name__ == '__main__':
    main()
