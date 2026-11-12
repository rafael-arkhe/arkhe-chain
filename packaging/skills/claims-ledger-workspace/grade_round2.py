"""Mechanical checks for the round-2 cases. Prints JSON per run; works on copies.

Usage: python grade_round2.py <iteration-dir>
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

WS = Path(__file__).resolve().parent
CHECKER = WS.parent / 'claims-ledger' / 'scripts' / 'claims_ledger.py'
EVALS = WS / 'evals'


def run(cmd, cwd):
    r = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True, timeout=120)
    return r.returncode, (r.stdout + r.stderr)[-600:]


def drift(run_dir):
    repo = run_dir / 'outputs' / 'pricekit'
    original = json.loads((EVALS / 'drift-after-refactor/files/pricekit/claims.json').read_text(encoding='utf-8'))
    out = {}
    try:
        reg = json.loads((repo / 'claims.json').read_text(encoding='utf-8'))
    except Exception as e:
        return {'error': f'claims.json unreadable: {e}'}
    items = {i.get('id'): i for i in reg.get('items', [])}
    code, log = run(f'"{sys.executable}" "{CHECKER}" check', repo)
    out['checker_exit'] = code
    out['checker_log'] = log.strip()[-300:]
    out['states'] = {k: v.get('state') for k, v in items.items()}
    c1 = json.dumps(items.get('C-01', {}).get('evidence', []))
    out['c01_evidence'] = c1
    out['c01_mentions_old_name'] = 'roundHalfEven' in c1
    out['statements_preserved'] = all(items.get(i['id'], {}).get('statement') == i['statement'] for i in original['items'])
    out['readme_unchanged'] = (repo / 'README.md').read_bytes() == (EVALS / 'drift-after-refactor/files/pricekit/README.md').read_bytes()
    return out


def ci_gate(run_dir):
    repo = run_dir / 'outputs' / 'tinyqueue'
    base = (EVALS / 'ci-gate-setup/files/tinyqueue/.github/workflows/ci.yml').read_text(encoding='utf-8')
    base_runs = set(re.findall(r'run:\s*(.+)', base))
    cmds, workflows = [], sorted((repo / '.github' / 'workflows').glob('*.y*ml'))
    for wf in workflows:
        text = wf.read_text(encoding='utf-8')
        # single-line `run:` steps added beyond the original workflow
        cmds += [c.strip() for c in re.findall(r'run:\s*([^|>\n].*)', text) if c.strip() not in base_runs and 'pip install' not in c]
        # multi-line `run: |` blocks
        for block in re.findall(r'run:\s*\|\s*\n((?:\s{8,}.*\n?)+)', text):
            lines = [l.strip() for l in block.splitlines() if l.strip()]
            cmds.append(' && '.join(lines))
    out = {'workflows': [w.name for w in workflows], 'added_commands': cmds}
    outside = [c for c in cmds if re.search(r'(skills|\.claude|D:\\|/d/arkhe|~/)', c)]
    out['uses_outside_paths'] = outside
    if not cmds:
        out['error'] = 'no added CI command found'
        return out
    gate = ' && '.join(cmds).replace('python3 ', f'"{sys.executable}" ').replace('python ', f'"{sys.executable}" ')
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / 'repo'
        shutil.copytree(repo, copy)
        out['exit_now'], out['log_now'] = run(gate, copy)
        (copy / 'tinyqueue' / 'retry.py').unlink()
        out['exit_after_delete'], out['log_after_delete'] = run(gate, copy)
    return out


if __name__ == '__main__':
    it = Path(sys.argv[1])
    for case, fn in [('drift-after-refactor', drift), ('ci-gate-setup', ci_gate)]:
        for cfg in ('with_skill', 'without_skill'):
            d = it / case / cfg
            if (d / 'outputs').exists():
                print(f'== {case}/{cfg}')
                print(json.dumps(fn(d), indent=1))
