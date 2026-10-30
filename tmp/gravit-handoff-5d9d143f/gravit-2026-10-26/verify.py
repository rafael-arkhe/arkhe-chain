"""Verify frozen bytes, execute Arkhe, and compare all outputs. No network required."""
from pathlib import Path
import hashlib, json, subprocess
ROOT=Path(__file__).resolve().parent
WORKSPACE=ROOT.parents[2]
manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
for item in manifest:
    path=ROOT/item['path']
    if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
        raise SystemExit(f"Hash mismatch: {item['path']}")
run=subprocess.run(['cargo','run','--locked','-q','-p','arkhe-verify-core','--example','gravit_interop','--',str(ROOT/'jobs.json')],cwd=WORKSPACE,check=True,capture_output=True,text=True)
actual=json.loads(run.stdout)
expected=json.loads((ROOT/'expected.json').read_text())
assert len(actual)==len(expected)
assert len({v['id'] for v in actual})==len(actual)
for a,e in zip(actual,expected):
    if a['id']!=e['id'] or a['accepted']!=e['accepted']:
        raise SystemExit(f'Mismatch: {a} expected {e}')
frozen=json.loads((ROOT/'results.json').read_text(encoding='utf-8-sig'))
assert actual==frozen, 'Run differs from frozen outputs'
screen=json.loads((ROOT/'screening.json').read_text())
assert all(v['actual']==v['expected'] for v in screen)
print(f'PASS: {len(actual)} primitive results match expected and frozen outputs; {len(screen)} frozen screening comparisons; {len(manifest)} file hashes')
