"""Fail closed on undeclared AKG domain-separation reuse.

Scans every active workspace member for byte literals b"AKG:...\\0". A literal
used by more than one crate must be declared in config/domain-sharing.json with
a reason (same object re-derived, or a known finding). Registered domains in
specs/*/domain-registry.json must have consistent hex/length and must not reuse
a literal for two objects. Unregistered literals are reported, not failed: the
registry is still a candidate and covers only part of the code.
"""
import json
import re
import sys
import tomllib
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LITERAL = re.compile(rb'b"(AKG:[^"\\\n]+)\\0"')
REGISTRIES = ['specs/akg/registry/domain-registry.json', 'specs/release/domain-registry.json']


def scan(root, members):
    uses = defaultdict(set)
    for member in members:
        for base in ['src', 'tests', 'examples', 'benches']:
            folder = root / member / base
            for path in sorted(folder.rglob('*.rs')) if folder.is_dir() else []:
                for match in LITERAL.finditer(path.read_bytes()):
                    uses[match.group(1).decode()].add(member)
    return uses


def registered(root):
    """Normative entries may precede code; entries naming an implementation may not."""
    errors, objects, implemented = [], defaultdict(set), set()
    for relative in REGISTRIES:
        data = json.loads((root / relative).read_text(encoding='utf-8'))
        for entry in data.get('domains', []) + data.get('signature_domains', []):
            literal = entry['ascii_literal']
            if not literal.endswith('\\0'):
                errors.append(f'{relative}: literal without \\0 terminator: {literal}')
                continue
            raw = literal[:-2].encode('ascii') + b'\0'
            if entry['hex'] != raw.hex() or entry['length'] != len(raw):
                errors.append(f'{relative}: hex/length mismatch for {literal}')
            objects[literal[:-2]].add(entry['object'])
            if entry.get('implementation') or data.get('scope', '').startswith('Release'):
                implemented.add(literal[:-2])
    for literal, owners in objects.items():
        if len(owners) > 1:
            errors.append(f'registered domain {literal} names several objects: {sorted(owners)}')
    return errors, set(objects), implemented


def check(root):
    members = tomllib.loads((root / 'Cargo.toml').read_text())['workspace']['members']
    sharing = json.loads((root / 'config/domain-sharing.json').read_text(encoding='utf-8'))['shared']
    declared = {item['domain']: set(item['crates']) for item in sharing}
    uses = scan(root, members)
    errors, known, implemented = registered(root)
    for literal, crates in sorted(uses.items()):
        if len(crates) > 1 and declared.get(literal) != crates:
            errors.append(f'undeclared shared domain {literal}: {sorted(crates)}')
    for literal in declared:
        if len(uses.get(literal, ())) < 2:
            errors.append(f'stale sharing declaration: {literal}')
    for literal in sorted(implemented):
        if literal not in uses:
            errors.append(f'registered as implemented but unused: {literal}')
    return errors, uses, known


def main():
    errors, uses, known = check(ROOT)
    if errors:
        for error in errors:
            print('FAIL ' + error)
        raise SystemExit(1)
    unregistered = len(set(uses) - known)
    print(f'PASS {len(uses)} AKG domain literals; {len(known)} registered, {unregistered} not yet registered; '
          'no undeclared cross-crate reuse')


if __name__ == '__main__':
    main()
