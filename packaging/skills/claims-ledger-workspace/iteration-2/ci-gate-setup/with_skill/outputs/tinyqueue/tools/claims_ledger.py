#!/usr/bin/env python3
"""claims-ledger: fail-closed checker for a project's claims registry.

A registry (default: claims.json at the project root) lists every promise the
project makes, with its state and the code and tests behind it. This script
refuses any claim the repository cannot back, renders the honesty table, and
flags hard-coded verdicts in UI and docs.

Usage (run from the project root; standard library only, no network):
  python3 scripts/claims_ledger.py check  [--registry claims.json] [--table CLAIMS.md]
  python3 scripts/claims_ledger.py render [--registry claims.json] [--table CLAIMS.md]
  python3 scripts/claims_ledger.py scan   PATH [PATH ...]

check   exits 1 if any claim is unbacked or the table is stale.
render  rewrites the table, but only when check finds no claim errors.
scan    prints lines that state a verdict as a literal (PASS, VERIFIED, ...);
        each hit must be traced to a computed result or removed. Read-only.

Files are only read inside the project root; render writes only the table file.
"""
import argparse
import json
import re
import sys
from pathlib import Path

STATES = {
    'enforced': 'a mechanism and passing tests cover the whole statement',
    'partial': 'a named mechanism covers part of the statement, or all of it without tests; the gap names the rest',
    'absent': 'no mechanism in this repository',
}
LABELS = {'PROVEN', 'LEMMA', 'PROPOSAL', 'CONJECTURE', 'REFUTED'}
ID = re.compile(r'^[A-Z][A-Z0-9]*-[A-Z0-9]+(?:-[A-Z0-9]+)*$')
MAX_SCAN_BYTES = 2_000_000
SCAN_SUFFIXES = {'.md', '.mdx', '.txt', '.html', '.htm', '.js', '.jsx', '.mjs', '.ts', '.tsx',
                 '.vue', '.svelte', '.py', '.rs', '.go', '.json', '.yml', '.yaml'}
SKIP_DIRS = {'.git', 'node_modules', 'dist', 'build', 'target', '.next', 'vendor', '__pycache__', '.venv'}
# Literal verdicts. A hit is a question ("where is this computed?"), not a finding.
# Status words count only in capitals (how UIs print them); absolutes in any case.
VERDICT = re.compile(r'\b(PASS(ED)?|VERIFIED|VALIDATED|SECURE|ATTESTED|CERTIFIED|APPROVED|TAMPER[- ]PROOF)\b')
ABSOLUTE = re.compile(
    r'\b(100\s?%\s?(secure|verified|safe|uptime)|tamper[- ]proof|unhackable|trustless|bank[- ]grade|military[- ]grade'
    r'|always detected|never fails|fully secure|guaranteed)\b',
    re.IGNORECASE,
)


def inside(root, rel):
    """Resolve a registry path; None if it is absolute or escapes the root."""
    if not isinstance(rel, str) or not rel or Path(rel).is_absolute():
        return None
    path = (root / rel).resolve()
    return path if path == root or root in path.parents else None


def audit(root, registry):
    """Every problem that makes a claim unbacked. Empty list means the registry holds."""
    errors = []
    items = registry.get('items')
    if not isinstance(items, list) or not items:
        return ['registry has no items']
    seen = set()
    for n, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f'item {n}: not an object')
            continue
        cid = item.get('id')
        if not isinstance(cid, str) or not ID.match(cid):
            errors.append(f'item {n}: id {cid!r} must look like C-01 or API-AUTH-1')
            continue
        if cid in seen:
            errors.append(f'{cid}: duplicate id')
        seen.add(cid)
        if not isinstance(item.get('statement'), str) or not item['statement'].strip():
            errors.append(f'{cid}: statement is empty')
        label = item.get('label')
        if label is not None and label not in LABELS:
            errors.append(f'{cid}: label {label!r} is not one of {sorted(LABELS)}')
        state = item.get('state')
        if state not in STATES:
            errors.append(f'{cid}: state {state!r} must be one of {sorted(STATES)}')
            continue
        evidence, tests = item.get('evidence', []), item.get('tests', [])
        if not isinstance(evidence, list) or not isinstance(tests, list):
            errors.append(f'{cid}: evidence and tests must be lists of paths')
            continue
        if state != 'enforced' and not item.get('gap'):
            errors.append(f'{cid}: a {state} claim must name its gap')
        if state == 'enforced' and item.get('gap'):
            errors.append(f'{cid}: an enforced claim cannot have a gap; make it partial or close the gap')
        if state == 'absent':
            if evidence or tests or item.get('mechanism'):
                errors.append(f'{cid}: an absent claim cannot list a mechanism, evidence or tests')
            continue
        # Code without tests is still partial (its gap says so); only enforced needs tests.
        if not item.get('mechanism') or not evidence:
            errors.append(f'{cid}: a {state} claim needs mechanism and evidence')
        if state == 'enforced' and not tests:
            errors.append(f'{cid}: an enforced claim needs tests')
        for entry in evidence:
            # A plain path must name the claim id; {"path", "anchor"} must contain the anchor
            # (a symbol name), so a rename or deletion breaks the claim either way.
            rel, anchor = (entry.get('path'), entry.get('anchor')) if isinstance(entry, dict) else (entry, cid)
            path = inside(root, rel)
            if path is None:
                errors.append(f'{cid}: evidence {rel!r} is outside the project')
            elif not isinstance(anchor, str) or len(anchor.strip()) < 3:
                errors.append(f'{cid}: evidence {rel} has an anchor shorter than 3 characters')
            elif not path.is_file():
                errors.append(f'{cid}: evidence {rel} does not exist')
            elif anchor not in path.read_text(encoding='utf-8', errors='replace'):
                hint = '(add a trace comment)' if anchor == cid else f'(anchor {anchor!r} not found)'
                errors.append(f'{cid}: evidence {rel} does not contain {anchor} {hint}')
        for rel in tests:
            path = inside(root, rel)
            if path is None:
                errors.append(f'{cid}: test {rel!r} is outside the project')
            elif not path.is_file():
                errors.append(f'{cid}: test {rel} does not exist')
    return errors


def cell(text):
    return str(text).replace('|', '\\|').replace('\n', ' ')


def render(registry):
    lines = [
        f"# {registry.get('title', 'Claims ledger')}",
        '',
        '<!-- Generated by claims_ledger.py from the claims registry. Do not edit. -->',
        '',
        f"Source: {registry.get('source', 'not stated')}. States: "
        + '; '.join(f'`{k}` = {v}' for k, v in STATES.items()) + '.',
        '',
        '| ID | Scope | Label | State | Claim | Mechanism | Evidence | Gap |',
        '|---|---|---|---|---|---|---|---|',
    ]
    for item in registry['items']:
        refs = [f"{e['path']}#{e['anchor']}" if isinstance(e, dict) else e for e in item.get('evidence', [])]
        paths = '<br>'.join(f'`{p}`' for p in refs + item.get('tests', []))
        lines.append('| ' + ' | '.join(cell(c) for c in [
            item['id'], item.get('scope', '—'), item.get('label', '—'), item['state'],
            item['statement'], item.get('mechanism') or '—', paths or '—', item.get('gap') or '—',
        ]) + ' |')
    counts = {s: sum(i['state'] == s for i in registry['items']) for s in STATES}
    lines += ['', 'Totals: ' + ', '.join(f'{k} {v}' for k, v in counts.items()) + '.', '']
    return '\n'.join(lines)


def load(root, rel):
    path = inside(root, rel)
    if path is None or not path.is_file():
        sys.exit(f'FAIL registry {rel} not found in {root}')
    try:
        registry = json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as e:
        sys.exit(f'FAIL registry {rel} is not valid JSON: {e}')
    if not isinstance(registry, dict):
        sys.exit(f'FAIL registry {rel} must be a JSON object')
    return registry


def scan(root, targets):
    hits = 0
    for target in targets:
        base = inside(root, target)
        if base is None or not base.exists():
            print(f'SKIP {target}: not inside the project')
            continue
        files = [base] if base.is_file() else sorted(base.rglob('*'))
        for path in files:
            if not path.is_file() or path.suffix.lower() not in SCAN_SUFFIXES:
                continue
            if SKIP_DIRS & set(path.relative_to(root).parts) or path.stat().st_size > MAX_SCAN_BYTES:
                continue
            for n, line in enumerate(path.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
                if VERDICT.search(line) or ABSOLUTE.search(line):
                    hits += 1
                    print(f'{path.relative_to(root).as_posix()}:{n}: {line.strip()[:160]}')
    print(f'{hits} literal verdict(s). Trace each to the code that computes it, or remove it.')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['check', 'render', 'scan'])
    parser.add_argument('paths', nargs='*', help='scan: files or directories to scan')
    parser.add_argument('--registry', default='claims.json')
    parser.add_argument('--table', default='CLAIMS.md')
    parser.add_argument('--root', default='.', help='project root (default: current directory)')
    args = parser.parse_args()
    root = Path(args.root).resolve()

    if args.command == 'scan':
        scan(root, args.paths or ['.'])
        return
    registry = load(root, args.registry)
    errors = audit(root, registry)
    for error in errors:
        print('FAIL ' + error)
    if errors:
        sys.exit(1)
    table = inside(root, args.table)
    if table is None:
        sys.exit(f'FAIL table {args.table} is outside the project')
    text = render(registry)
    if args.command == 'render':
        table.write_text(text, encoding='utf-8', newline='\n')
        print(f'wrote {args.table}')
        return
    if not table.is_file() or table.read_text(encoding='utf-8').replace('\r\n', '\n') != text:
        sys.exit(f'FAIL {args.table} is stale; run: python3 scripts/claims_ledger.py render')
    counts = {s: sum(i['state'] == s for i in registry['items']) for s in STATES}
    print('OK ' + ', '.join(f'{k} {v}' for k, v in counts.items()))


if __name__ == '__main__':
    main()
