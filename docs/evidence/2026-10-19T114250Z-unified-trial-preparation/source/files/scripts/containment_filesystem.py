"""Independent filesystem evidence checks for the bounded rootless trial."""
import hashlib
import json
import os
from pathlib import Path
import stat

from containment_probe import no_duplicates, reject_constant

FILESYSTEM_VECTORS = ['identity', 'cgroup-enforcement', 'image-read-control', 'writable-control',
    'input-read-control', 'input-write', 'image-write', 'outside-mount-canary',
    'traversal-and-symlink', 'tmp-noexec']
CASES = {
    'image-read-control': ['image-read'], 'writable-control': ['tmp-roundtrip', 'work-roundtrip'],
    'input-write': ['input-overwrite', 'input-create', 'input-rename'],
    'image-write': ['etc-create', 'root-create'], 'outside-mount-canary': ['outside-read', 'outside-write'],
    'traversal-and-symlink': ['inside-symlink-control', 'traversal-read', 'outside-symlink-read'],
    'tmp-noexec': ['work-exec-control', 'tmp-exec'],
}


def snapshot(directory):
    result = {}
    for path in directory.iterdir():
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction()):
            raise ValueError('non-regular fixture entry; do not follow it')
        if info.st_size > 1048576:
            raise ValueError('fixture entry exceeds budget')
        result[path.name] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'size': info.st_size, 'inode': info.st_ino, 'mode': info.st_mode, 'mtime_ns': info.st_mtime_ns}
    return result


def mount_options(mountinfo):
    mounts = {}
    for line in mountinfo.splitlines():
        left, sep, right = line.partition(' - ')
        fields = left.split()
        if not sep or len(fields) < 6:
            raise ValueError('invalid mountinfo')
        mounts[fields[4]] = set(fields[5].split(','))
    return mounts


def decode_cases(observation, vector):
    cases = json.loads(observation['observations'], object_pairs_hook=no_duplicates,
                       parse_constant=reject_constant)
    if not isinstance(cases, list) or [c.get('case') for c in cases] != CASES[vector]:
        raise ValueError('missing, reordered, duplicate or unexpected filesystem attempt')
    for case in cases:
        if set(case) != {'case', 'outcome', 'value', 'errno'} or case['outcome'] not in ('ok', 'error'):
            raise ValueError('invalid filesystem attempt')
        if not isinstance(case['value'], str):
            raise ValueError('invalid attempt value')
        if case['outcome'] == 'ok' and case['errno'] is not None:
            raise ValueError('successful operation cannot have errno')
        if case['errno'] is not None and (type(case['errno']) is not int or not 1 <= case['errno'] <= 4095):
            raise ValueError('invalid numeric errno')
    return {case['case']: case for case in cases}


def evaluate(vector, observation, oracle, request, before, after, external_before, external_after, image_bytes):
    if observation['state'] != 'OBSERVED':
        return observation['state']
    # go is a host-created release flag; no other input mutation is permitted.
    expected_after = {**before, 'go': after.get('go')}
    if after != expected_after or after.get('go', {}).get('sha256') != hashlib.sha256(b'release\n').hexdigest():
        return 'FAIL'
    if external_before != external_after:
        return 'FAIL'
    mounts = mount_options(oracle['mountinfo'])
    if 'ro' not in mounts.get('/input', set()) or 'ro' not in mounts.get('/', set()):
        return 'FAIL'
    cases = decode_cases(observation, vector)
    def ok(name, value):
        return cases[name]['outcome'] == 'ok' and cases[name]['value'] == value
    def denied(name, allowed):
        return cases[name]['outcome'] == 'error' and cases[name]['errno'] in allowed
    nonce = request['nonce']
    if vector == 'image-read-control':
        passed = ok('image-read', image_bytes.decode('utf-8'))
    elif vector == 'writable-control':
        passed = ok('tmp-roundtrip', nonce) and ok('work-roundtrip', nonce)
    elif vector == 'input-write':
        passed = all(denied(name, {1,13,30}) for name in CASES[vector])
    elif vector == 'image-write':
        passed = all(denied(name, {1,13,30}) for name in CASES[vector])
    elif vector == 'outside-mount-canary':
        passed = all(denied(name, {2,13}) for name in CASES[vector])
    elif vector == 'traversal-and-symlink':
        expected = request['sentinel_bytes'].decode('utf-8')
        passed = (ok('inside-symlink-control', expected) and denied('traversal-read', {2,13})
                  and denied('outside-symlink-read', {2,13}))
    elif vector == 'tmp-noexec':
        passed = (ok('work-exec-control', 'exit=Some(0)') and denied('tmp-exec', {1,13})
                  and 'noexec' in mounts.get('/tmp', set()) and 'noexec' not in mounts.get('/work', {'noexec'}))
    else:
        raise ValueError('unregistered filesystem evaluator')
    return 'PASS' if passed else 'FAIL'
