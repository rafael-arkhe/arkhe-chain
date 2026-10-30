"""Freeze an explicit source closure; a content digest is not an execution seal."""
import hashlib
import json
from pathlib import Path

from containment_probe import no_duplicates, reject_constant, write_json

PATTERNS = (
    'scripts/*.py', 'scripts/*.mjs', 'scripts/tests/*.py',
    'packaging/sandbox/containment-probe/*.rs',
    'apps/arkhe-intra/lib/sandbox-policy.mjs',
    'apps/arkhe-intra/lib/development.mjs',
    'ops/local/intra/development.json',
    'config/runtime-*.json', 'config/seccomp/arkhe-unified-x86_64-v1/*',
    'ops/local/containment-vm/strace-tool.json',
)
MAX_BYTES = 32 * 1024 * 1024


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inventory(root):
    root = Path(root).resolve()
    paths = sorted({p for pattern in PATTERNS for p in root.glob(pattern) if p.is_file()})
    if not paths:
        raise ValueError('empty source closure')
    result = []
    total = 0
    for path in paths:
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError('source link or path escape')
        # Reject linked parent directories as well as linked files.
        if any(parent.is_symlink() for parent in path.parents if parent != root and parent.is_relative_to(root)):
            raise ValueError('linked source directory')
        data = path.read_bytes()
        total += len(data)
        if total > MAX_BYTES:
            raise ValueError('source closure exceeds size limit')
        result.append({'path': path.relative_to(root).as_posix(), 'size': len(data), 'sha256': sha(data)})
    return result


def freeze(root, output):
    root, output = Path(root).resolve(), Path(output)
    before = inventory(root)
    output.mkdir(parents=True, exist_ok=False)
    for entry in before:
        data = (root / entry['path']).read_bytes()
        if sha(data) != entry['sha256']:
            raise ValueError('source changed while copying')
        target = output / 'files' / entry['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    if inventory(root) != before:
        raise ValueError('source closure changed while freezing')
    value = {'schema': 1, 'kind': 'runtime-source-snapshot', 'patterns': list(PATTERNS),
             'entries': before, 'closure_sha256': sha(canonical(before)),
             'sealed': False, 'runtime_verified': False,
             'excludes': ['generated evidence', 'detached binding file to avoid digest cycles', 'credentials']}
    write_json(output / 'snapshot.json', value)
    return value


def verify(root, snapshot):
    snapshot = Path(snapshot)
    value = json.loads(snapshot.read_text(encoding='utf-8'), object_pairs_hook=no_duplicates, parse_constant=reject_constant)
    entries = value.get('entries')
    if value.get('schema') != 1 or value.get('patterns') != list(PATTERNS) or not isinstance(entries, list):
        raise ValueError('invalid snapshot schema or closure policy')
    if sha(canonical(entries)) != value.get('closure_sha256') or inventory(root) != entries:
        raise ValueError('source snapshot mismatch (modified, missing or newly added source)')
    for entry in entries:
        relative = Path(entry['path'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('snapshot path escape')
        path = snapshot.parent / 'files' / relative
        if path.is_symlink() or not path.is_file() or sha(path.read_bytes()) != entry['sha256']:
            raise ValueError('frozen source copy mismatch')
    return value
